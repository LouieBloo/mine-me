import {
  MINING_CONFIG,
  MiningTileType,
  canPlaceBuildable,
  getTileMineTime,
  isTileMineable,
  type MiningPosition,
} from '@mine-me/shared';
import { getDamageStage, isInBounds, type ServerMiningGrid } from '../../miningMap.service';
import type { MiningPlayerSession } from './MiningPlayerManager';

export interface PendingTileUpdate {
  x: number;
  y: number;
  type: MiningTileType;
  damageStage?: number;
}

export class MiningBlockSubsystem {
  public startMining(
    target: MiningPosition,
    session: MiningPlayerSession | undefined,
    grid: ServerMiningGrid
  ): boolean {
    if (!session) return false;
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return false;
    if (!isInBounds(target.x, target.y)) return false;

    const playerSpeed =
      typeof session.miningSpeed === 'function' ? session.miningSpeed() : session.miningSpeed;
    if (playerSpeed <= 0) return false;

    const canMineStance = session.playerBody.isGrounded || session.playerBody.isOnLadder;
    if (!canMineStance) return false;

    const tile = grid[target.y][target.x];
    if (!isTileMineable(tile.type)) return false;

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
    session.miningTimeMs = getTileMineTime(tile.type);
    session.miningProgressMs = tile.damageMs || 0;

    return true;
  }

  public stopMining(session: MiningPlayerSession | undefined): void {
    if (!session) return;
    session.isMining = false;
    session.miningTarget = null;
    session.miningProgressMs = 0;
  }

  public placeLadder(
    target: MiningPosition | undefined,
    session: MiningPlayerSession | undefined,
    grid: ServerMiningGrid,
    onPendingTile: (update: PendingTileUpdate) => void
  ): boolean {
    if (!session) return false;

    const x = target ? target.x : Math.floor(session.playerBody.position.x);
    const y = target ? target.y : Math.floor(session.playerBody.position.y);

    if (!isInBounds(x, y)) return false;

    if (target && typeof target.x === 'number' && typeof target.y === 'number') {
      const tileCenterX = target.x + 0.5;
      const tileCenterY = target.y + 0.5;
      const dx = Math.abs(tileCenterX - session.playerBody.position.x);
      const dy = Math.abs(tileCenterY - session.playerBody.position.y);
      if (dx > MINING_CONFIG.TORCH_PLACEMENT_REACH || dy > MINING_CONFIG.TORCH_PLACEMENT_REACH)
        return false;
    }

    const tile = grid[y][x];
    if (tile.type === MiningTileType.ENTRANCE) return false;
    if (!canPlaceBuildable(MiningTileType.LADDER, tile.type)) return false;

    tile.type = MiningTileType.LADDER;
    tile.revealed = true;
    tile.damageMs = 0;

    onPendingTile({
      x,
      y,
      type: MiningTileType.LADDER,
      damageStage: 0,
    });

    return true;
  }

  public placeTorch(
    target: MiningPosition,
    session: MiningPlayerSession | undefined,
    grid: ServerMiningGrid,
    onPendingTile: (update: PendingTileUpdate) => void
  ): boolean {
    if (!session) return false;
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
    if (!canPlaceBuildable(MiningTileType.TORCH, tile.type)) return false;

    tile.type = MiningTileType.TORCH;
    tile.revealed = true;
    tile.damageMs = 0;

    onPendingTile({
      x: target.x,
      y: target.y,
      type: MiningTileType.TORCH,
      damageStage: 0,
    });

    return true;
  }

  public updateMiningProgress(
    dt: number,
    players: Iterable<MiningPlayerSession>,
    grid: ServerMiningGrid,
    onStageChanged: (update: PendingTileUpdate) => void,
    onBlockCompleted: (target: MiningPosition, miners: MiningPlayerSession[]) => void
  ): void {
    const playerList = Array.from(players);

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
            this.startMining({ x: target.x, y: target.y }, session, grid);
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

      const prevStage = getDamageStage(tile);

      // Cooperative speed summation
      const totalSpeed = miners.reduce((sum, m) => {
        const sp = typeof m.miningSpeed === 'function' ? m.miningSpeed() : m.miningSpeed;
        return sum + sp;
      }, 0);

      const speedMultiplier = totalSpeed / 100;
      tile.damageMs = (tile.damageMs || 0) + dt * 1000 * speedMultiplier;

      for (const miner of miners) {
        miner.miningProgressMs = tile.damageMs;
      }

      const newStage = getDamageStage(tile);
      if (newStage !== prevStage) {
        onStageChanged({
          x: target.x,
          y: target.y,
          type: tile.type,
          damageStage: newStage,
        });
      }

      const requiredTime = getTileMineTime(tile.type);
      if (tile.damageMs >= requiredTime) {
        onBlockCompleted(target, miners);
      }
    }
  }

  public completeMiningBlock(
    target: MiningPosition,
    miners: MiningPlayerSession[] | undefined,
    grid: ServerMiningGrid,
    onExcavate: (target: MiningPosition, previousType: MiningTileType) => void,
    allPlayers: Iterable<MiningPlayerSession>
  ): void {
    const tile = grid[target.y][target.x];
    if (tile.type === MiningTileType.EMPTY) return;
    const previousType = tile.type;

    grid[target.y][target.x] = { type: MiningTileType.EMPTY, revealed: true };

    onExcavate(target, previousType);

    // Invalidate reveal positions
    for (const p of allPlayers) {
      p.lastRevealGridPos = null;
    }

    // Reset mining state
    const list =
      miners ||
      Array.from(allPlayers).filter(
        (p) => p.isMining && p.miningTarget?.x === target.x && p.miningTarget?.y === target.y
      );
    for (const miner of list) {
      this.stopMining(miner);
    }
  }
}
