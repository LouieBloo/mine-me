import {
  NO_DAMAGE,
  bodyOverlapsCell,
  isTileBlastProof,
  nextUnloadIndex,
  MiningTileType,
  type BeltBlockedReason,
  type DamageResult,
  type MiningBeltClientState,
  type MiningBeltItem,
  type MiningBeltItemsUpdate,
  type MiningBeltUpdate,
} from '@mine-me/shared';
import { isInBounds } from '../../miningMap.service';
import type { MiningWorld } from '../MiningWorld';
import type { MiningPlayerSession } from './MiningPlayerManager';

/** Seconds between checks of fire, heat and harmful fluid on the belt (the damage in between is added up). */
export const BELT_HAZARD_SECONDS = 0.25;

/** Every segment of the belt is one row of the shaft, `shaftWidth` cells wide. */
export interface BeltSegment {
  health: number;
}

/**
 * The conveyor belt (tickets 122-124): a shaft going straight down from the extractor. Once the extractor has landed
 * it grows one row every `buildSecondsPerSegment`: it clears the row below its tip (blocks, whole rocks and pieces,
 * through the same removal path as mining, no loot) and lays a segment there. It waits while the next row holds fluid,
 * gas, fire or a falling rock, carries on when that clears, and stops for good at the bottom of the map or at a block
 * that cannot be removed. Its speed is on the extractor definition, never in this class.
 *
 * The shaft is real open space: bodies walk or fall into it. The belt itself is not a tile; it is this list of
 * segments, which the wire sends as a length.
 */
export class MiningBeltSubsystem {
  public readonly shaftX: number;
  public readonly shaftWidth: number;
  public readonly startRow: number;
  /** Laid segments, top to bottom; segment `i` is on row `startRow + i`. A broken one is `null`. */
  public readonly segments: (BeltSegment | null)[] = [];
  public blockedBy: BeltBlockedReason | null = null;
  private buildProgress = 0;
  private pendingUpdate: MiningBeltUpdate | undefined;
  /** Items riding up the belt, in the order they were loaded. */
  public readonly items: MiningBeltItem[] = [];
  private itemCounter = 0;
  private pendingAdded: MiningBeltItem[] = [];
  private pendingRemoved: string[] = [];
  private hazardTimer = 0;
  private pendingBroke: number[] = [];
  private stagesDirty = false;

  constructor(private readonly world: MiningWorld) {
    const extractor = world.extractor!;
    this.shaftX = extractor.placement.shaftX;
    this.shaftWidth = Math.min(extractor.definition.shaftWidth, extractor.placement.width);
    this.startRow = world.surfaceRow;
  }

  /** Segments laid so far. */
  public get rows(): number {
    return this.segments.length;
  }

  /** The row the next segment goes on. */
  public get tipRow(): number {
    return this.startRow + this.segments.length;
  }

  /** Whether (x, y) is inside the shaft's columns and rows laid so far. */
  public coversCell(x: number, y: number): boolean {
    return x >= this.shaftX && x < this.shaftX + this.shaftWidth && y >= this.startRow && y < this.tipRow;
  }

  /** Once per tick: builds towards the next segment while nothing is in the way. */
  public update(dt: number): void {
    const extractor = this.world.extractor;
    if (!extractor || !extractor.isLanded()) return;

    this.updateHazards(dt);
    this.moveItems(dt);
    this.updateUnloading(dt);

    // A broken segment is laid again before the belt goes on (at the same rate as building)
    const gap = this.segments.findIndex((segment) => segment === null);
    const row = gap >= 0 ? this.startRow + gap : this.tipRow;
    const reason = gap >= 0 ? this.rebuildBlockReason(row) : this.blockReason(row);
    this.setBlocked(reason);
    if (reason !== null) return;

    this.buildProgress += dt;
    if (this.buildProgress < extractor.definition.buildSecondsPerSegment) return;
    this.buildProgress = 0;
    if (gap >= 0) this.rebuildSegment(gap);
    else this.layNextSegment();
  }

  /** Why a broken segment cannot be laid again yet: something harmful is in its cells (the shaft is open, nothing to dig). */
  private rebuildBlockReason(row: number): BeltBlockedReason | null {
    for (let x = this.shaftX; x < this.shaftX + this.shaftWidth; x++) {
      if (this.world.fluids.grid.getFluidId(x, row) !== 0) return 'fluid';
      if (this.world.gases.contentsAt(x, row)) return 'gas';
      if (this.world.fire.isBurning(x, row)) return 'fire';
    }
    return this.fallingRockIn(row) ? 'rock' : null;
  }

  private rebuildSegment(index: number): void {
    this.segments[index] = { health: this.world.extractor!.definition.beltSegmentHealth };
    this.stagesDirty = true;
    this.queueUpdate();
  }

  // ---- Damage (ticket 124) -------------------------------------------------------------------------------------------

  /** Damage stage of a segment: 0 whole to 4 nearly gone, -1 for a broken one. */
  public stageOf(index: number): number {
    const segment = this.segments[index];
    if (!segment) return -1;
    const ratio = segment.health / this.world.extractor!.definition.beltSegmentHealth;
    if (ratio >= 0.9) return 0;
    if (ratio >= 0.75) return 1;
    if (ratio >= 0.5) return 2;
    if (ratio >= 0.25) return 3;
    return 4;
  }

  public stages(): number[] {
    return this.segments.map((_, index) => this.stageOf(index));
  }

  /** The row of the first segment that is broken (the line is cut from here down), or null when it is whole. */
  public get firstBrokenRow(): number | null {
    const index = this.segments.findIndex((segment) => segment === null);
    return index < 0 ? null : this.startRow + index;
  }

  /**
   * A hit on segment `index` (from the unified damage pipeline). A segment whose health runs out breaks: the line below it
   * is cut, so everything riding below the break is lost, and the belt lays the segment again by itself over time. The
   * extractor itself is not a target.
   */
  public damageSegment(index: number, amount: number): DamageResult {
    const segment = this.segments[index];
    if (!segment || !(amount > 0)) return NO_DAMAGE;
    const before = this.stageOf(index);
    const dealt = Math.min(segment.health, amount);
    segment.health -= amount;
    let killed = false;
    if (segment.health <= 0) {
      this.segments[index] = null;
      this.pendingBroke.push(index);
      this.loseItemsBelow(index);
      killed = true;
    }
    if (killed || this.stageOf(index) !== before) this.stagesDirty = true;
    if (this.stagesDirty) this.queueUpdate();
    return { applied: true, dealt, killed };
  }

  /** Items riding at or below segment `index` never reach the extractor when the line is cut there. */
  private loseItemsBelow(index: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].pos < index) continue;
      this.pendingRemoved.push(this.items[i].id);
      this.items.splice(i, 1);
    }
  }

  /** Fire, heat and harmful fluid hurt the segments in the shaft (checked a few times a second, the damage added up). */
  private updateHazards(dt: number): void {
    this.hazardTimer += dt;
    if (this.hazardTimer < BELT_HAZARD_SECONDS) return;
    const seconds = this.hazardTimer;
    this.hazardTimer = 0;
    if (this.segments.length === 0) return;
    for (let index = 0; index < this.segments.length; index++) {
      if (!this.segments[index]) continue;
      const box = { x: this.shaftX + this.shaftWidth / 2, y: this.startRow + index + 0.5, halfWidth: this.shaftWidth / 2, halfHeight: 0.5 };
      const rate = this.world.burning.hazardRate(box);
      if (rate > 0) this.world.damage.applyDamage({ kind: 'belt', id: String(index) }, { amount: rate * seconds, type: 'environmental', source: { kind: 'environment', name: 'Fire' } });
    }
  }

  /** Why the next row cannot be built right now, or null when it can. */
  public blockReason(row: number): BeltBlockedReason | null {
    const { grid } = this.world;
    if (row >= grid.length) return 'bottom';
    for (let x = this.shaftX; x < this.shaftX + this.shaftWidth; x++) {
      const tile = grid[row]?.[x];
      if (!tile) return 'bottom';
      if (tile.type !== MiningTileType.EMPTY && isTileBlastProof(tile.type as MiningTileType)) return 'solid';
    }
    for (let x = this.shaftX; x < this.shaftX + this.shaftWidth; x++) {
      if (this.world.fluids.grid.getFluidId(x, row) !== 0) return 'fluid';
    }
    for (let x = this.shaftX; x < this.shaftX + this.shaftWidth; x++) {
      if (this.world.gases.contentsAt(x, row)) return 'gas';
    }
    for (let x = this.shaftX; x < this.shaftX + this.shaftWidth; x++) {
      if (this.world.fire.isBurning(x, row)) return 'fire';
    }
    if (this.fallingRockIn(row)) return 'rock';
    return null;
  }

  private fallingRockIn(row: number): boolean {
    const left = this.shaftX;
    const right = this.shaftX + this.shaftWidth;
    return this.world.rocks.activeRocks.some((rock) => {
      const halfW = rock.cellsWide / 2;
      const halfH = rock.cellsHigh / 2;
      return rock.position.x + halfW > left && rock.position.x - halfW < right && rock.position.y + halfH > row && rock.position.y - halfH < row + 1;
    });
  }

  /**
   * Lays up to `count` segments at once, stopping where the belt would wait (sandbox tool; the real belt takes
   * `buildSecondsPerSegment` for each). Returns how many were laid.
   */
  public buildInstantly(count: number): number {
    let laid = 0;
    while (laid < count && this.blockReason(this.tipRow) === null) {
      this.layNextSegment();
      laid++;
    }
    this.setBlocked(this.blockReason(this.tipRow));
    return laid;
  }

  private layNextSegment(): void {
    const row = this.tipRow;
    for (let x = this.shaftX; x < this.shaftX + this.shaftWidth; x++) {
      if (!isInBounds(x, row, this.world.grid)) continue;
      // A rock or other piece goes whole, with its rest outside the shaft; nothing is dropped
      if (this.world.grid[row][x].type !== MiningTileType.EMPTY) this.world.blocks.completeMiningBlock({ x, y: row }, undefined, { dropItems: false });
    }
    this.segments.push({ health: this.world.extractor!.definition.beltSegmentHealth });
    this.stagesDirty = true;
    this.queueUpdate();
  }

  private setBlocked(reason: BeltBlockedReason | null): void {
    if (reason === this.blockedBy) return;
    this.blockedBy = reason;
    this.queueUpdate();
  }

  private queueUpdate(): void {
    this.pendingUpdate = {
      rows: this.rows,
      blockedBy: this.blockedBy,
      ...(this.stagesDirty ? { stages: this.stages() } : {}),
      ...(this.pendingBroke.length > 0 ? { broke: this.pendingBroke } : {}),
    };
  }

  /** The change to tell clients about this tick, then forgets it. */
  public takeUpdate(): MiningBeltUpdate | undefined {
    const update = this.pendingUpdate;
    this.pendingUpdate = undefined;
    this.stagesDirty = false;
    this.pendingBroke = [];
    return update;
  }

  /** The belt as a client joining the room needs it. */
  public clientState(): MiningBeltClientState {
    return {
      shaftX: this.shaftX,
      shaftWidth: this.shaftWidth,
      startRow: this.startRow,
      rows: this.rows,
      blockedBy: this.blockedBy,
      stages: this.stages(),
      beltSpeed: this.world.extractor!.definition.beltSpeed,
      textureUrl: this.world.extractor!.definition.beltTextureUrl ?? null,
    };
  }

  // ---- Items on the belt (ticket 123) -------------------------------------------------------------------------------

  /** Whether a player's body touches the laid part of the belt. */
  public isTouching(session: MiningPlayerSession): boolean {
    if (this.rows === 0 || session.isDead) return false;
    const b = session.playerBody;
    for (let x = this.shaftX; x < this.shaftX + this.shaftWidth; x++) {
      for (let y = this.startRow; y < this.tipRow; y++) {
        if (bodyOverlapsCell(b.position, b.halfWidth, b.halfHeight, x, y)) return true;
      }
    }
    return false;
  }

  /** Every item rides up at the belt's speed; the ones that reach the top go into their owner's stash. */
  private moveItems(dt: number): void {
    if (this.items.length === 0) return;
    const step = this.world.extractor!.definition.beltSpeed * dt;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.pos -= step;
      if (item.pos > 0) continue;
      this.items.splice(i, 1);
      this.pendingRemoved.push(item.id);
      this.world.extractor!.creditStash(item.ownerId, item, 1);
    }
  }

  /**
   * Standing on the belt hands over the backpack one unit at a time at `unloadItemsPerSecond`, heaviest item first,
   * onto the belt where the player stands. A spot with an item too close refuses, so a busy belt backs the unload up.
   */
  private updateUnloading(dt: number): void {
    const rate = this.world.extractor!.definition.unloadItemsPerSecond;
    for (const session of this.world.players.values()) {
      if (session.temporaryBackpack.length === 0 || !this.isTouching(session)) {
        session.unloadCarry = 0;
        continue;
      }
      session.unloadCarry = Math.min(1 + rate * dt, session.unloadCarry + rate * dt);
      while (session.unloadCarry >= 1) {
        if (!this.unloadOne(session)) break;
        session.unloadCarry -= 1;
      }
    }
  }

  /** Puts one unit of the player's heaviest stack on the belt where they stand. False when there is no room there or nothing to unload. */
  private unloadOne(session: MiningPlayerSession): boolean {
    const spacing = this.world.extractor!.definition.beltItemSpacing;
    const pos = Math.min(this.rows, Math.max(0, session.playerBody.position.y - this.startRow));
    // The line is cut at a broken segment: nothing below it can reach the extractor, so nothing is put there
    const broken = this.firstBrokenRow;
    if (broken !== null && pos >= broken - this.startRow) return false;
    if (this.items.some((other) => Math.abs(other.pos - pos) < spacing)) return false;
    const index = nextUnloadIndex(session.temporaryBackpack, (id) => this.world.data.getItemData(id));
    if (index < 0) return false;
    const stack = session.temporaryBackpack[index];
    stack.quantity -= 1;
    if (stack.quantity <= 0) session.temporaryBackpack.splice(index, 1);
    session.backpackDirty = true;

    const item: MiningBeltItem = {
      id: `belt_${++this.itemCounter}`,
      itemId: stack.itemId,
      itemName: stack.itemName,
      iconUrl: stack.iconUrl,
      ownerId: session.characterId,
      pos,
    };
    this.items.push(item);
    this.pendingAdded.push({ ...item });
    return true;
  }

  /** Items belonging to a player who left (died, timed out, exited): they are lost, they never reached the extractor. */
  public removeItemsOf(characterId: string): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].ownerId !== characterId) continue;
      this.pendingRemoved.push(this.items[i].id);
      this.items.splice(i, 1);
    }
  }

  /** The items that went on or came off the belt this tick, then forgets them. */
  public takeItemChanges(): MiningBeltItemsUpdate | undefined {
    if (this.pendingAdded.length === 0 && this.pendingRemoved.length === 0) return undefined;
    const update: MiningBeltItemsUpdate = {
      ...(this.pendingAdded.length > 0 ? { added: this.pendingAdded } : {}),
      ...(this.pendingRemoved.length > 0 ? { removed: this.pendingRemoved } : {}),
    };
    this.pendingAdded = [];
    this.pendingRemoved = [];
    return update;
  }

  /** What is riding the belt now, for a client joining the room. */
  public itemsSnapshot(): MiningBeltItem[] {
    return this.items.map((item) => ({ ...item }));
  }
}
