import {
  NO_DAMAGE,
  PLACED_ITEM_TILES,
  distanceToBox,
  doodadCellKey,
  doodadFalls,
  doodadHurtBox,
  doodadNeedsSupport,
  doodadRect,
  doodadRectCells,
  doodadSupportCells,
  encodeDoodadPlacement,
  isTileSolid,
  orderDoodads,
  toClientDoodad,
  segmentTouchesBox,
  type DamageResult,
  type DoodadClientDefinition,
  type DoodadDefinition,
  type DoodadHurtBox,
  type DoodadPlacement,
  type DoodadPlacementWire,
  type DoodadRemovalWire,
  type MiningTileType,
} from '@mine-me/shared';
import type { MiningWorld } from '../MiningWorld';
import { MiningFallingDoodads } from './MiningFallingDoodads';

/** One doodad standing in the room, with the cells it depends on worked out once. */
interface PlacedDoodad {
  placement: DoodadPlacement;
  /** Every cell of its footprint (a solid block arriving in one of them removes it). */
  footprint: number[];
  /** The cells it hangs from or stands on (losing one of them removes it). Empty for a free-floating doodad. */
  support: number[];
  /** Whether clients have been told about it. Doodads in unrevealed ground are never sent. */
  sent: boolean;
  /** Hit points left; absent for a doodad that cannot be hurt (no `health` on its definition). */
  health?: number;
  /** Where a hit can land on it (see `doodadHurtBox`). */
  hurtBox?: DoodadHurtBox;
}

/** A doodad a hit could land on, for the sweeps of the damage sources: its id (for `applyHit`) and the middle of its box. */
export interface DoodadHitTarget {
  id: string;
  x: number;
  y: number;
}

/** How a doodad leaves the room: it just goes, or (a ceiling doodad that lost its hold or its health) it falls. */
type DropKind = 'vanish' | 'fall';

/**
 * The scenery in a room (tickets 100, 101, 105): which doodads stand where, which clients have been told about, and which
 * ones go when the block they hang from is mined, blown up or burnt away.
 *
 * Doodads are background, but one with `health` can be hurt and killed (ticket 143) and a ceiling doodad falls when it loses
 * its hold (see `MiningFallingDoodads`). Nothing here touches the grid; the room tells this subsystem when a tile changes
 * (`onTileChanged`, called from `pushTileUpdate`, the one place every change to a tile passes through) or is revealed.
 */
export class MiningDoodadSubsystem {
  /** The doodads the room knows, in the order placements index them (see `orderDoodads`). */
  public readonly definitions: readonly DoodadDefinition[];
  private readonly width: number;
  /** Standing doodads by the cell they start at (top-left of the footprint); unique since doodads never overlap. */
  private readonly byOrigin = new Map<number, PlacedDoodad>();
  /** Standing doodads by every cell of their footprint. */
  private readonly byFootprintCell = new Map<number, PlacedDoodad>();
  /** Standing doodads by each cell that holds them up. */
  private readonly bySupportCell = new Map<number, PlacedDoodad[]>();
  private pendingAdded: DoodadPlacementWire[] = [];
  private pendingRemoved: DoodadRemovalWire[] = [];
  private pendingHit: DoodadRemovalWire[] = [];
  private pendingKilled: DoodadRemovalWire[] = [];
  /** The doodads that can be hurt, so a bullet or a blast looks at those only. */
  private readonly hurtable = new Set<PlacedDoodad>();
  /** Ceiling doodads in the air. */
  public readonly falling: MiningFallingDoodads;

  constructor(private readonly world: MiningWorld, definitions: readonly DoodadDefinition[], placements: readonly DoodadPlacement[] = []) {
    this.definitions = orderDoodads(definitions);
    this.width = world.grid[0]?.length ?? 0;
    this.falling = new MiningFallingDoodads(world, this);
    for (const placement of placements) this.index(placement);
  }

  /** How many doodads stand in the room (for the performance report). */
  public get count(): number {
    return this.byOrigin.size;
  }

  /** Every standing doodad, row by row. */
  public placements(): DoodadPlacement[] {
    return [...this.byOrigin.values()].map((d) => d.placement).sort((a, b) => a.y - b.y || a.x - b.x);
  }

  /** What the client needs to draw each doodad kind, sent once with the map. Undefined when the room has no doodad kinds. */
  public clientDefinitions(): DoodadClientDefinition[] | undefined {
    return this.definitions.length > 0 ? this.definitions.map((d, i) => toClientDoodad(d, i)) : undefined;
  }

  /** The doodads in the part of the mine already revealed, for a client that is just joining. Undefined when there are none. */
  public visibleSnapshot(): DoodadPlacementWire[] | undefined {
    const out: PlacedDoodad[] = [];
    for (const doodad of this.byOrigin.values()) {
      if (!doodad.sent && this.isRevealed(doodad)) doodad.sent = true;
      if (doodad.sent) out.push(doodad);
    }
    // Row by row, so the list does not depend on the order doodads were added in
    out.sort((a, b) => a.placement.y - b.placement.y || a.placement.x - b.placement.x);
    return out.length > 0 ? out.map((d) => encodeDoodadPlacement(d.placement)) : undefined;
  }

  /** Puts a doodad in the room now (the sandbox tool, ticket 107). False if it does not fit the room or overlaps another. */
  public add(placement: DoodadPlacement): boolean {
    const def = this.definitions[placement.typeIndex];
    if (!def) return false;
    const cells = doodadRectCells(doodadRect(def, placement));
    if (cells.some((c) => this.byFootprintCell.has(doodadCellKey(c.x, c.y, this.width)))) return false;
    const entry = this.index(placement);
    if (this.isRevealed(entry)) {
      entry.sent = true;
      this.pendingAdded.push(encodeDoodadPlacement(placement));
    }
    return true;
  }

  /** The doodad whose footprint covers a cell, if any (the sandbox remove tool clicks anywhere on it). */
  public placementCovering(x: number, y: number): DoodadPlacement | undefined {
    return this.byFootprintCell.get(doodadCellKey(x, y, this.width))?.placement;
  }

  /** Takes away the doodad that starts at a cell (the sandbox tool). Tells clients if they knew of it. False if none starts there. */
  public removeAt(x: number, y: number): boolean {
    const entry = this.byOrigin.get(doodadCellKey(x, y, this.width));
    if (!entry) return false;
    this.drop(entry);
    return true;
  }

  /** Lets the doodad that starts at a cell fall, if it is a ceiling doodad (the sandbox tool); else it just goes. False if none starts there. */
  public dropAt(x: number, y: number): boolean {
    const entry = this.byOrigin.get(doodadCellKey(x, y, this.width));
    if (!entry) return false;
    this.drop(entry, doodadFalls(this.definitions[entry.placement.typeIndex]) ? 'fall' : 'vanish');
    return true;
  }

  /** The id a hit uses for the doodad that starts at a cell. */
  public static targetId(x: number, y: number): string {
    return `${x},${y}`;
  }

  /** The hit points left of the doodad covering a cell; undefined if none covers it or it cannot be hurt. */
  public healthAt(x: number, y: number): number | undefined {
    return this.byFootprintCell.get(doodadCellKey(x, y, this.width))?.health;
  }

  /** The doodad covering a cell as a target, if it can be hurt (the sandbox hurt tool). */
  public hurtableCovering(x: number, y: number): DoodadHitTarget | undefined {
    const entry = this.byFootprintCell.get(doodadCellKey(x, y, this.width));
    return entry && this.hurtable.has(entry) ? this.targetOf(entry) : undefined;
  }

  /** A tile in the room was revealed: the doodads standing in it come into view. */
  public onTileRevealed(x: number, y: number): void {
    const entry = this.byFootprintCell.get(doodadCellKey(x, y, this.width));
    if (!entry || entry.sent) return;
    entry.sent = true;
    this.pendingAdded.push(encodeDoodadPlacement(entry.placement));
  }

  /**
   * A tile changed to `type`. Doodads lose their hold when a cell they hang from, or stand on, stops being solid (mined, blown
   * up, burnt into something open); and are crushed when something solid arrives in their footprint (a falling rock, lava turning
   * to rock). A tile an item places (ladder, torch, bridge) never removes one: those are drawn in front of the scenery.
   */
  public onTileChanged(x: number, y: number, type: MiningTileType): void {
    const key = doodadCellKey(x, y, this.width);
    if (!isTileSolid(type)) {
      // A ceiling doodad falls with its block (and hurts what is under it); the others just go
      for (const entry of [...(this.bySupportCell.get(key) ?? [])]) this.drop(entry, doodadFalls(this.definitions[entry.placement.typeIndex]) ? 'fall' : 'vanish');
      return;
    }
    if (PLACED_ITEM_TILES.some((p) => p.tileType === type)) return;
    const crushed = this.byFootprintCell.get(key);
    if (crushed) this.drop(crushed, 'vanish');
  }

  // ---- Hurting doodads (ticket 143) ---------------------------------------------------------------------------------

  /** Every doodad that can be hurt, for a blast to measure its distance to. */
  public hurtableTargets(): DoodadHitTarget[] {
    return [...this.hurtable].map((e) => this.targetOf(e));
  }

  /** The doodads that can be hurt whose box overlaps `box` (a melee swing, a falling rock). */
  public hurtableInBox(box: DoodadHurtBox): DoodadHitTarget[] {
    const out: DoodadHitTarget[] = [];
    for (const entry of this.hurtable) {
      const b = entry.hurtBox!;
      if (b.x0 < box.x1 && b.x1 > box.x0 && b.y0 < box.y1 && b.y1 > box.y0) out.push(this.targetOf(entry));
    }
    return out;
  }

  /** The doodads that can be hurt that a bullet's path touches, nearest first. `t` is how far along the path (0 to 1). */
  public hurtableAlong(from: { x: number; y: number }, to: { x: number; y: number }, radius: number): Array<DoodadHitTarget & { t: number }> {
    const out: Array<DoodadHitTarget & { t: number }> = [];
    for (const entry of this.hurtable) {
      const t = segmentTouchesBox(entry.hurtBox!, from, to, radius);
      if (t !== null) out.push({ ...this.targetOf(entry), t });
    }
    return out.sort((a, b) => a.t - b.t);
  }

  /** The distance from a point to the nearest edge of the doodad's box (for a blast). */
  public distanceTo(id: string, x: number, y: number): number {
    const entry = this.entryOf(id);
    return entry?.hurtBox ? distanceToBox(entry.hurtBox, x, y) : Infinity;
  }

  /**
   * A hit on a doodad (through `MiningDamageSystem`, like every other target). Spares one that cannot be hurt. A hit that does not
   * kill tells the clients that knew of it to flash it; one that kills takes it out of the room: it dies, or (a ceiling doodad) falls.
   */
  public applyHit(id: string, amount: number): DamageResult {
    const entry = this.entryOf(id);
    if (!entry || entry.health === undefined || entry.health <= 0 || !(amount > 0)) return NO_DAMAGE;
    const dealt = Math.min(amount, entry.health);
    entry.health -= amount;
    if (entry.health > 0) {
      if (entry.sent) this.pendingHit.push([entry.placement.x, entry.placement.y]);
      return { applied: true, dealt, killed: false };
    }
    entry.health = 0;
    if (entry.sent) this.pendingKilled.push([entry.placement.x, entry.placement.y]);
    this.drop(entry, doodadFalls(this.definitions[entry.placement.typeIndex]) ? 'fall' : 'vanish');
    return { applied: true, dealt, killed: true };
  }

  private entryOf(id: string): PlacedDoodad | undefined {
    const [x, y] = id.split(',').map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    return this.byOrigin.get(doodadCellKey(x, y, this.width));
  }

  private targetOf(entry: PlacedDoodad): DoodadHitTarget {
    const b = entry.hurtBox!;
    return { id: MiningDoodadSubsystem.targetId(entry.placement.x, entry.placement.y), x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  }

  /** What changed since the last call, to send to every client in the room. A client applies the additions first, then the removals. */
  public takeChanges(): { added: DoodadPlacementWire[]; removed: DoodadRemovalWire[]; hit: DoodadRemovalWire[]; killed: DoodadRemovalWire[] } {
    const changes = { added: this.pendingAdded, removed: this.pendingRemoved, hit: this.pendingHit, killed: this.pendingKilled };
    this.pendingAdded = [];
    this.pendingRemoved = [];
    this.pendingHit = [];
    this.pendingKilled = [];
    return changes;
  }

  private index(placement: DoodadPlacement): PlacedDoodad {
    const def = this.definitions[placement.typeIndex];
    const rect = doodadRect(def, placement);
    const footprint = doodadRectCells(rect).map((c) => doodadCellKey(c.x, c.y, this.width));
    const support = doodadNeedsSupport(def.anchor) ? doodadSupportCells(def.anchor, rect, placement.flip).map((c) => doodadCellKey(c.x, c.y, this.width)) : [];
    const entry: PlacedDoodad = { placement, footprint, support, sent: false };
    // A doodad with health can be hurt; where a hit lands on it is its footprint (grown by how far a bug may stray)
    if (typeof def.health === 'number' && def.health > 0) {
      entry.health = def.health;
      entry.hurtBox = doodadHurtBox(rect, def.wander);
      this.hurtable.add(entry);
    }
    this.byOrigin.set(doodadCellKey(placement.x, placement.y, this.width), entry);
    for (const key of footprint) this.byFootprintCell.set(key, entry);
    for (const key of support) {
      const list = this.bySupportCell.get(key);
      if (list) list.push(entry);
      else this.bySupportCell.set(key, [entry]);
    }
    return entry;
  }

  private drop(entry: PlacedDoodad, how: DropKind = 'vanish'): void {
    this.hurtable.delete(entry);
    this.byOrigin.delete(doodadCellKey(entry.placement.x, entry.placement.y, this.width));
    for (const key of entry.footprint) this.byFootprintCell.delete(key);
    for (const key of entry.support) {
      const list = this.bySupportCell.get(key);
      if (!list) continue;
      const rest = list.filter((e) => e !== entry);
      if (rest.length > 0) this.bySupportCell.set(key, rest);
      else this.bySupportCell.delete(key);
    }
    // Only a doodad clients were told about needs telling that it is gone
    if (entry.sent) this.pendingRemoved.push([entry.placement.x, entry.placement.y]);
    else this.pendingAdded = this.pendingAdded.filter((w) => !(w[1] === entry.placement.x && w[2] === entry.placement.y));
    if (how === 'fall') this.falling.release(entry.placement, this.definitions[entry.placement.typeIndex]);
  }

  private isRevealed(entry: PlacedDoodad): boolean {
    return entry.footprint.some((key) => this.world.grid[Math.floor(key / this.width)][key % this.width].revealed);
  }
}
