import {
  MINING_CONFIG,
  MiningTileType,
  canBreakBlock,
  canPlaceBuildable,
  isTileMineable,
  type MiningPosition,
  type MiningBlockHitEvent,
  type DamageEvent,
} from '@mine-me/shared';
import { isInBounds } from '../../miningMap.service';
import type { MiningPlayerSession } from './MiningPlayerManager';
import type { MiningWorld, PendingTileUpdate } from '../MiningWorld';

export type { PendingTileUpdate };

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
    if (!isInBounds(target.x, target.y)) return false;

    const playerSpeed =
      typeof session.miningSpeed === 'function' ? session.miningSpeed() : session.miningSpeed;
    if (playerSpeed <= 0) return false;

    const canMineStance = session.playerBody.isGrounded || session.playerBody.isOnLadder;
    if (!canMineStance) return false;

    const tile = grid[target.y][target.x];
    if (!isTileMineable(tile.type)) return false;
    if (!this.checkPickPower(session, tile)) return false;

    // Check reach distance
    const tileCenterX = target.x + 0.5;
    const tileCenterY = target.y + 0.5;
    const dx = Math.abs(tileCenterX - session.playerBody.position.x);
    const dy = Math.abs(tileCenterY - session.playerBody.position.y);
    if (dx > MINING_CONFIG.PLAYER_MINING_REACH || dy > MINING_CONFIG.PLAYER_MINING_REACH) {
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

  /** Returns the tile a ladder would be placed on, or null if placement is not allowed. */
  public validateLadderPlacement(
    session: MiningPlayerSession | undefined,
    target: MiningPosition | undefined
  ): MiningPosition | null {
    if (!session) return null;
    const grid = this.world.grid;

    const x = target ? target.x : Math.floor(session.playerBody.position.x);
    const y = target ? target.y : Math.floor(session.playerBody.position.y);

    if (!isInBounds(x, y)) return null;

    if (target && typeof target.x === 'number' && typeof target.y === 'number') {
      const tileCenterX = target.x + 0.5;
      const tileCenterY = target.y + 0.5;
      const dx = Math.abs(tileCenterX - session.playerBody.position.x);
      const dy = Math.abs(tileCenterY - session.playerBody.position.y);
      if (dx > MINING_CONFIG.TORCH_PLACEMENT_REACH || dy > MINING_CONFIG.TORCH_PLACEMENT_REACH)
        return null;
    }

    const tile = grid[y][x];
    if (tile.type === MiningTileType.ENTRANCE) return null;
    if (!canPlaceBuildable(MiningTileType.LADDER, tile.type)) return null;

    return { x, y };
  }

  public placeLadder(session: MiningPlayerSession | undefined, target: MiningPosition | undefined): boolean {
    const pos = this.validateLadderPlacement(session, target);
    if (!pos) return false;

    const tile = this.world.grid[pos.y][pos.x];
    tile.type = MiningTileType.LADDER;
    tile.revealed = true;
    tile.damage = 0;

    this.world.pushTileUpdate({
      x: pos.x,
      y: pos.y,
      type: MiningTileType.LADDER,
      damageStage: 0,
    });

    return true;
  }

  /** Returns true if a torch can currently be placed at target. */
  public validateTorchPlacement(session: MiningPlayerSession | undefined, target: MiningPosition): boolean {
    if (!session) return false;
    const grid = this.world.grid;
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return false;
    if (!isInBounds(target.x, target.y)) return false;

    const tileCenterX = target.x + 0.5;
    const tileCenterY = target.y + 0.5;
    const dx = Math.abs(tileCenterX - session.playerBody.position.x);
    const dy = Math.abs(tileCenterY - session.playerBody.position.y);
    if (dx > MINING_CONFIG.TORCH_PLACEMENT_REACH || dy > MINING_CONFIG.TORCH_PLACEMENT_REACH)
      return false;

    const tile = grid[target.y][target.x];
    if (!tile.revealed) return false;
    return canPlaceBuildable(MiningTileType.TORCH, tile.type);
  }

  public placeTorch(session: MiningPlayerSession | undefined, target: MiningPosition): boolean {
    if (!this.validateTorchPlacement(session, target)) return false;

    const tile = this.world.grid[target.y][target.x];
    tile.type = MiningTileType.TORCH;
    tile.revealed = true;
    tile.damage = 0;

    this.world.pushTileUpdate({
      x: target.x,
      y: target.y,
      type: MiningTileType.TORCH,
      damageStage: 0,
    });

    return true;
  }

  public updateMiningProgress(_dt: number): void {
    const grid = this.world.grid;
    const playerList = Array.from(this.world.players.values());

    // 1. Validate & trigger mining actions for each player
    for (const session of playerList) {
      const canMineStance = session.playerBody.isGrounded || session.playerBody.isOnLadder;
      const isTargeting = Boolean(session.inputs.miningKey && session.inputs.miningTarget);
      const target = session.inputs.miningTarget;
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
        const inReach =
          dx <= MINING_CONFIG.PLAYER_MINING_REACH && dy <= MINING_CONFIG.PLAYER_MINING_REACH;

        if (!isTargeting || !isSameTarget || !canMineStance || !inReach) {
          this.stopMining(session);
        }
      }

      if (!session.isMining && isTargeting && target && canMineStance && playerSpeed > 0) {
        if (isInBounds(target.x, target.y)) {
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
