import {
  MINING_CONFIG,
  MiningTileType,
  canBreakBlock,
  bodyOverlapsCell,
  canPlaceBuildable,
  isTileMineable,
  isTileSolid,
  isWithinMiningReach,
  findPieceAnchor,
  selectMiningTargets,
  getTileFootprint,
  pieceFootprint,
  pieceAnchorOf,
  pieceCells,
  pieceCentre,
  pieceCentreCell,
  type MiningPosition,
  type MiningBlockHitEvent,
  type DamageEvent,
} from '@mine-me/shared';
import { isInBounds } from '../../miningMap.service';
import type { MiningPlayerSession } from './MiningPlayerManager';
import type { MiningWorld, PendingTileUpdate } from '../MiningWorld';

export type { PendingTileUpdate };

/** Why a buildable was refused. */
export type PlacementProblem = 'no_player' | 'out_of_bounds' | 'out_of_reach' | 'hidden' | 'occupied' | 'body_in_way';

export class MiningBlockSubsystem {
  private pendingBlockHits: MiningBlockHitEvent[] = [];

  constructor(private readonly world: MiningWorld) {}

  /** Called when a player tries to break a block their tool is too weak for. */
  public onToolTooWeak?: (session: MiningPlayerSession, blockName: string) => void;

  /** True if the player's tool can damage this tile; otherwise tells them why (throttled by the callback). */
  private checkPickPower(session: MiningPlayerSession, tile: { type: MiningTileType }): boolean {
    const data = this.world.data;
    const required = data.getBlockRequiredPickPower(tile.type);
    if (canBreakBlock(session.pickPower, required)) return true;
    this.onToolTooWeak?.(session, data.getBlockConfig(tile.type)?.name ?? 'this block');
    return false;
  }

  /** Queues a block hit event produced outside this subsystem (e.g. a mob digging). */
  public queueBlockHit(hit: MiningBlockHitEvent): void {
    this.pendingBlockHits.push(hit);
  }

  public consumePendingBlockHits(): MiningBlockHitEvent[] {
    const hits = this.pendingBlockHits;
    this.pendingBlockHits = [];
    return hits;
  }

  public startMining(session: MiningPlayerSession | undefined, target: MiningPosition): boolean {
    if (!session) return false;
    const grid = this.world.grid;
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return false;
    if (!isInBounds(target.x, target.y, this.world.grid)) return false;

    const playerSpeed =
      typeof session.miningSpeed === 'function' ? session.miningSpeed() : session.miningSpeed;
    if (playerSpeed <= 0) return false;

    const tile = grid[target.y][target.x];
    if (!isTileMineable(tile.type)) return false;
    if (!this.checkPickPower(session, tile)) return false;

    // Check reach distance
    const tileCenterX = target.x + 0.5;
    const tileCenterY = target.y + 0.5;
    const dx = Math.abs(tileCenterX - session.playerBody.position.x);
    const dy = Math.abs(tileCenterY - session.playerBody.position.y);
    if (!isWithinMiningReach(dx, dy)) {
      return false;
    }

    session.isMining = true;
    session.miningTarget = { x: target.x, y: target.y };
    const maxHealth = this.world.data.getBlockMaxHealth(tile.type);
    session.targetMaxHealth = maxHealth;
    session.miningTotal = maxHealth;
    session.miningProgress = tile.damage ?? 0;
    // Swing timing lives in MiningPlayerManager.advanceSwings (shared with melee), and persists
    // across clicks, so tapping can't swing faster than holding.
    return true;
  }

  public stopMining(session: MiningPlayerSession | undefined): void {
    if (!session) return;
    session.isMining = false;
    session.miningTarget = null;
    session.miningProgress = 0;
  }

  /**
   * Where a piece of `type` would go if the player points at `cursor`, or why it cannot go there. A piece covers
   * several cells (getTileFootprint); the cursor is its middle and it is nudged to the nearest spot that fits.
   * Every cell must be on the map, uncovered (not in fog), empty, and, for solid pieces, free of bodies. Reach is
   * measured to the middle of the piece. The server allows a little extra reach (PLACEMENT_LAG_SLACK) because while
   * the player runs, their position here trails what their own screen shows, so a target that was in reach when
   * clicked would otherwise be refused.
   */
  public piecePlacement(
    type: MiningTileType,
    session: MiningPlayerSession | undefined,
    cursor: MiningPosition | undefined
  ): { anchor: MiningPosition } | { problem: PlacementProblem } {
    if (!session) return { problem: 'no_player' };
    const at = cursor ?? { x: Math.floor(session.playerBody.position.x), y: Math.floor(session.playerBody.position.y) };
    if (typeof at.x !== 'number' || typeof at.y !== 'number' || !isInBounds(at.x, at.y, this.world.grid)) {
      return { problem: 'out_of_bounds' };
    }

    const footprint = getTileFootprint(type);
    const solid = isTileSolid(type);
    // Why one cell cannot take the piece, or null if it can
    const cellProblem = (x: number, y: number): PlacementProblem | null => {
      if (!isInBounds(x, y, this.world.grid)) return 'out_of_bounds';
      const tile = this.world.grid[y][x];
      if (!tile.revealed) return 'hidden';
      if (!canPlaceBuildable(type, tile.type)) return 'occupied';
      if (solid && this.bodyOverlapsCell(x, y)) return 'body_in_way';
      return null;
    };
    const anchor = findPieceAnchor(at, footprint, (x, y) => cellProblem(x, y) === null);
    if (!anchor) {
      // Every spot that could hold the piece covers the cursor cell, so that cell's problem is the one to report
      return { problem: cellProblem(at.x, at.y) ?? 'occupied' };
    }

    const centre = pieceCentre(anchor, footprint);
    const reach = MINING_CONFIG.TORCH_PLACEMENT_REACH + MINING_CONFIG.PLACEMENT_LAG_SLACK;
    if (Math.abs(centre.x - session.playerBody.position.x) > reach || Math.abs(centre.y - session.playerBody.position.y) > reach) {
      return { problem: 'out_of_reach' };
    }
    return { anchor };
  }

  /** Writes a piece into the grid: every cell gets the type and its offset, solid pieces get colliders, clients are told. */
  private placePiece(type: MiningTileType, anchor: MiningPosition): void {
    const solid = isTileSolid(type);
    for (const cell of pieceCells(anchor, getTileFootprint(type))) {
      this.world.grid[cell.y][cell.x] = { type, revealed: true, damage: 0, piece: cell.offset };
      if (solid) this.world.rigidWorld.addTileCollider(cell.x, cell.y);
      this.world.pushTileUpdate({ x: cell.x, y: cell.y, type, damageStage: 0, piece: cell.offset });
    }
  }

  /** Returns the top-left cell a ladder would be placed at, or null if placement is not allowed. */
  public validateLadderPlacement(
    session: MiningPlayerSession | undefined,
    target: MiningPosition | undefined
  ): MiningPosition | null {
    const result = this.piecePlacement(MiningTileType.LADDER, session, target);
    return 'anchor' in result ? result.anchor : null;
  }

  public placeLadder(session: MiningPlayerSession | undefined, target: MiningPosition | undefined): boolean {
    const anchor = this.validateLadderPlacement(session, target);
    if (!anchor) return false;
    this.placePiece(MiningTileType.LADDER, anchor);
    return true;
  }

  /** Why a torch cannot go at target, or null if it can (see piecePlacement). */
  public torchPlacementProblem(session: MiningPlayerSession | undefined, target: MiningPosition): PlacementProblem | null {
    const result = this.piecePlacement(MiningTileType.TORCH, session, target);
    return 'problem' in result ? result.problem : null;
  }

  /** Returns true if a torch can currently be placed at target. */
  public validateTorchPlacement(session: MiningPlayerSession | undefined, target: MiningPosition): boolean {
    return this.torchPlacementProblem(session, target) === null;
  }

  /**
   * `itemId` is the torch item used; its Ignites effect (if any) is what lets the placed torch light oil. The torch
   * is one light and one ignition source, in the middle cell of its piece.
   */
  public placeTorch(session: MiningPlayerSession | undefined, target: MiningPosition, itemId?: string): boolean {
    const result = this.piecePlacement(MiningTileType.TORCH, session, target);
    if (!('anchor' in result)) return false;
    this.placePiece(MiningTileType.TORCH, result.anchor);
    if (itemId) {
      const centre = pieceCentreCell(result.anchor, getTileFootprint(MiningTileType.TORCH));
      this.world.ignition.addTorch(centre.x, centre.y, itemId);
    }
    return true;
  }

  /** Why a bridge cannot go at target, or null if it can: the buildable rules, plus no player or mob inside any of its cells (a solid tile placed on a body would trap it). */
  public bridgePlacementProblem(session: MiningPlayerSession | undefined, target: MiningPosition): PlacementProblem | null {
    const result = this.piecePlacement(MiningTileType.BRIDGE, session, target);
    return 'problem' in result ? result.problem : null;
  }

  public validateBridgePlacement(session: MiningPlayerSession | undefined, target: MiningPosition): boolean {
    return this.bridgePlacementProblem(session, target) === null;
  }

  /** Places a bridge: solid cells with physics colliders. Returns false (changing nothing) if it cannot go there. */
  public placeBridge(session: MiningPlayerSession | undefined, target: MiningPosition): boolean {
    const result = this.piecePlacement(MiningTileType.BRIDGE, session, target);
    if (!('anchor' in result)) return false;
    this.placePiece(MiningTileType.BRIDGE, result.anchor);
    return true;
  }

  /** The other cells of the piece that (x, y) belongs to, still in the grid as that piece. Empty for ordinary tiles. */
  public pieceSiblings(x: number, y: number): MiningPosition[] {
    const tile = this.world.grid[y]?.[x];
    if (!tile?.piece) return [];
    const anchor = pieceAnchorOf(x, y, tile.piece);
    return pieceCells(anchor, pieceFootprint(tile.type, tile.piece))
      .filter((c) => (c.x !== x || c.y !== y) && this.world.grid[c.y]?.[c.x]?.type === tile.type)
      .filter((c) => {
        const other = this.world.grid[c.y][c.x].piece;
        return other !== undefined && other[0] === c.offset[0] && other[1] === c.offset[1];
      })
      .map(({ x: cx, y: cy }) => ({ x: cx, y: cy }));
  }

  /** The key of the piece (x, y) belongs to ("anchorX,anchorY"), or null for an ordinary tile. */
  public pieceKey(x: number, y: number): string | null {
    const tile = this.world.grid[y]?.[x];
    if (!tile?.piece) return null;
    const anchor = pieceAnchorOf(x, y, tile.piece);
    return `${anchor.x},${anchor.y}`;
  }

  /** Clears the rest of the piece (x, y) belongs to, so a piece is never left half there. Call before clearing (x, y) itself. */
  public clearPieceSiblings(x: number, y: number): void {
    for (const cell of this.pieceSiblings(x, y)) {
      this.world.grid[cell.y][cell.x] = { type: MiningTileType.EMPTY, revealed: true };
      this.world.rigidWorld.removeTileCollider(cell.x, cell.y);
      this.world.pushTileUpdate({ x: cell.x, y: cell.y, type: MiningTileType.EMPTY, damageStage: 0 });
      this.world.rocks.checkAndTriggerFallingRocks(cell.x, cell.y);
    }
  }

  /** Whether any living player or mob body overlaps the tile cell (x, y). */
  private bodyOverlapsCell(x: number, y: number): boolean {
    const overlaps = (b: { position: { x: number; y: number }; halfWidth: number; halfHeight: number }) =>
      bodyOverlapsCell(b.position, b.halfWidth, b.halfHeight, x, y);
    for (const p of this.world.players.values()) if (!p.isDead && overlaps(p.playerBody)) return true;
    for (const m of this.world.mobs.activeMobs.values()) if (m.health > 0 && overlaps(m.mobBody)) return true;
    return false;
  }

  /** The blocks this player's pickaxe has lined up right now, nearest first; empty unless they are holding the mine button. */
  public miningQueue(session: MiningPlayerSession): MiningPosition[] {
    const cursor = session.inputs.miningTarget;
    if (!session.inputs.miningKey || !cursor) return [];
    return selectMiningTargets(this.world.grid, session.playerBody.position, cursor, { precise: session.inputs.preciseMining, keep: session.isMining ? session.miningTarget : null });
  }

  public updateMiningProgress(_dt: number): void {
    const grid = this.world.grid;
    const playerList = Array.from(this.world.players.values());

    // 1. Validate & trigger mining actions for each player
    for (const session of playerList) {
      // The client sends the cell under its cursor; which block that means is decided here, by the same rule the
      // client's reticle uses (see selectMiningTargets): the next block along the line toward the cursor, or the
      // cursor's own block while Ctrl is held
      const target = this.miningQueue(session)[0] ?? null;
      const isTargeting = Boolean(session.inputs.miningKey && target);
      const playerSpeed =
        typeof session.miningSpeed === 'function' ? session.miningSpeed() : session.miningSpeed;

      if (session.isMining && session.miningTarget) {
        const isSameTarget = target
          ? session.miningTarget.x === target.x && session.miningTarget.y === target.y
          : false;
        const tileCenterX = session.miningTarget.x + 0.5;
        const tileCenterY = session.miningTarget.y + 0.5;
        const dx = Math.abs(tileCenterX - session.playerBody.position.x);
        const dy = Math.abs(tileCenterY - session.playerBody.position.y);
        const inReach = isWithinMiningReach(dx, dy);

        if (!isTargeting || !isSameTarget || !inReach) {
          this.stopMining(session);
        }
      }

      if (!session.isMining && isTargeting && target && playerSpeed > 0) {
        if (isInBounds(target.x, target.y, this.world.grid)) {
          const tile = grid[target.y][target.x];
          if (isTileMineable(tile.type)) {
            this.startMining(session, { x: target.x, y: target.y });
          }
        }
      }
    }

    // 2. Cooperative Mining Progress (group active miners by targeted coordinate)
    const targetMap = new Map<string, { target: MiningPosition; miners: MiningPlayerSession[] }>();
    for (const session of playerList) {
      if (session.isMining && session.miningTarget) {
        const key = `${session.miningTarget.x},${session.miningTarget.y}`;
        let group = targetMap.get(key);
        if (!group) {
          group = { target: session.miningTarget, miners: [] };
          targetMap.set(key, group);
        }
        group.miners.push(session);
      }
    }

    for (const { target, miners } of targetMap.values()) {
      const tile = grid[target.y][target.x];
      if (!tile || !isTileMineable(tile.type)) {
        for (const miner of miners) {
          this.stopMining(miner);
        }
        continue;
      }

      // Discrete per-swing damage: a miner deals their tool damage on the tick their swing fires
      // (see MiningPlayerManager.advanceSwings), so tapping and holding deal identical damage per
      // swing. Dirt (100 HP) takes 4 swings at baseline (25 damage). Miners hitting the same block
      // on the same tick combine into one hit.
      let damageDealt = 0;
      for (const miner of miners) {
        if (!miner.swungThisTick || miner.toolDamage <= 0) continue;
        // Tool swapped mid-mine for one that is too weak for this block
        if (!this.checkPickPower(miner, tile)) {
          this.stopMining(miner);
          continue;
        }
        damageDealt += miner.toolDamage;
      }

      if (damageDealt > 0) {
        const tileType = tile.type;
        // Cooperating miners hit together; the first miner is credited as the source
        const event: DamageEvent = {
          amount: damageDealt,
          type: 'mining',
          source: {
            kind: 'player',
            id: miners[0].characterId,
            name: miners[0].characterName,
            itemId: miners[0].equippedWeaponId ?? undefined,
            position: { x: miners[0].playerBody.position.x, y: miners[0].playerBody.position.y },
          },
        };
        const result = this.world.damage.damageTile(target.x, target.y, event, miners);

        if (result.applied) {
          if (!result.destroyed) {
            for (const miner of miners) {
              miner.miningProgress = result.tileDamage;
            }
          }
          this.pendingBlockHits.push({
            x: target.x,
            y: target.y,
            tileType,
            damage: damageDealt,
          });
        }
      }
    }
  }

  /**
   * A block has burned out. It becomes the block it burns into (`burnsInto`, a block type key) when that names
   * one, otherwise it simply goes: no loot, rocks resting on it start to fall, clients are told.
   */
  public burnBlock(x: number, y: number, burnsInto?: string | null): void {
    const { grid, rigidWorld } = this.world;
    if (grid[y]?.[x]?.type === undefined || grid[y][x].type === MiningTileType.EMPTY) return;
    const into = burnsInto ? MiningTileType[burnsInto as keyof typeof MiningTileType] : undefined;
    if (into !== undefined && into !== MiningTileType.EMPTY) {
      this.clearPieceSiblings(x, y);
      grid[y][x] = { type: into, revealed: true };
      rigidWorld.removeTileCollider(x, y);
      if (isTileSolid(into)) rigidWorld.addTileCollider(x, y);
      this.world.pushTileUpdate({ x, y, type: into, damageStage: 0 });
      return;
    }
    this.completeMiningBlock({ x, y }, undefined, { dropItems: false });
  }

  /**
   * A fluid reaction hardened the cell at (x, y) into the block `typeKey` (water cooling lava into lavarock). Whatever
   * non-solid tile was there (empty, a ladder, a torch) is replaced; a solid tile is never overwritten. Clients are only
   * told when the player could have seen the cell. Returns whether the block was placed.
   */
  public placeBlockFromReaction(x: number, y: number, typeKey: string): boolean {
    const { grid, rigidWorld } = this.world;
    const tile = grid[y]?.[x];
    const into = MiningTileType[typeKey as keyof typeof MiningTileType];
    if (!tile || into === undefined || into === MiningTileType.EMPTY || isTileSolid(tile.type)) return false;
    this.clearPieceSiblings(x, y);
    grid[y][x] = { type: into, revealed: tile.revealed };
    rigidWorld.removeTileCollider(x, y);
    if (isTileSolid(into)) rigidWorld.addTileCollider(x, y);
    if (tile.revealed) {
      this.world.pushTileUpdate({ x, y, type: into, damageStage: 0 });
    } else {
      // Not on any client's map yet, so nothing is sent, but fluid and gas still have to learn the cell is solid now
      this.world.fluids.onTileChanged(x, y);
      this.world.gases.onTileChanged(x, y);
    }
    return true;
  }

  /**
   * The single path for a block being mined through (players, projectiles, mobs, explosions' leftovers).
   * Removes the collider, tells clients, optionally drops loot, may start rocks falling, and stops
   * everyone who was mining it (`miners` when known, otherwise whoever targets that tile).
   */
  public completeMiningBlock(
    target: MiningPosition,
    miners?: MiningPlayerSession[],
    options: { dropItems?: boolean } = {}
  ): void {
    const { grid, rigidWorld } = this.world;
    const tile = grid[target.y][target.x];
    if (tile.type === MiningTileType.EMPTY) return;
    const previousType = tile.type;
    const dropItems = options.dropItems ?? true;

    // A piece goes whole (one drop for all its cells)
    this.clearPieceSiblings(target.x, target.y);

    const players = Array.from(this.world.players.values());

    grid[target.y][target.x] = { type: MiningTileType.EMPTY, revealed: true };

    rigidWorld.removeTileCollider(target.x, target.y);
    this.world.pushTileUpdate({ x: target.x, y: target.y, type: MiningTileType.EMPTY, damageStage: 0 });
    if (dropItems) {
      this.world.drops.spawnBlockDrops(target.x, target.y, previousType);
    }
    this.world.rocks.checkAndTriggerFallingRocks(target.x, target.y);

    // Invalidate reveal positions
    for (const p of players) {
      p.lastRevealGridPos = null;
    }

    // Reset mining state
    const list =
      miners ||
      players.filter(
        (p) => p.isMining && p.miningTarget?.x === target.x && p.miningTarget?.y === target.y
      );
    for (const miner of list) {
      this.stopMining(miner);
    }
  }
}
