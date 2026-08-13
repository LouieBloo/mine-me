import { Socket } from 'socket.io';
import {
  MINING_CONFIG,
  MiningTileType,
  type MiningBackpackItem,
  type MiningDroppedItem,
  type MiningInputState,
  type MiningPosition,
  type MiningStateTickPayload,
  type Vector2D,
} from '@mine-me/shared';
import {
  generateMiningMap,
  getDamageStage,
  isInBounds,
  resolveGravity,
  revealTiles,
  type ServerMiningGrid,
} from '../miningMap.service';


export interface MiningEngineOptions {
  characterId: string;
  cityId: string;
  seed?: number;
  socket: Socket;
}

export class MiningGameEngine {
  public readonly characterId: string;
  public readonly cityId: string;
  public readonly seed: number;
  private socket: Socket;

  public grid: ServerMiningGrid;
  public position: Vector2D;
  public velocity: Vector2D = { x: 0, y: 0 };
  public inputs: MiningInputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    miningKey: false,
    sequence: 0,
  };

  public temporaryBackpack: MiningBackpackItem[] = [];
  public droppedItems: MiningDroppedItem[] = [];
  public visionRange = MINING_CONFIG.DEFAULT_VISION_RANGE;

  public isMining = false;
  public miningTarget: MiningPosition | null = null;
  public miningProgressMs = 0;
  public miningTimeMs = 0;

  private tickCount = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private isStopped = false;
  private pendingRevealedTiles: { x: number; y: number; type: MiningTileType; damageStage?: number }[] = [];


  constructor(options: MiningEngineOptions) {
    this.characterId = options.characterId;
    this.cityId = options.cityId;
    this.socket = options.socket;
    this.seed = options.seed ?? Math.floor(Math.random() * 2147483647);

    // Generate authoritative grid
    this.grid = generateMiningMap({ seed: this.seed });

    // Initial position floating point at entrance
    this.position = {
      x: MINING_CONFIG.ENTRANCE_X,
      y: MINING_CONFIG.ENTRANCE_Y,
    };

    // Reveal starting area
    revealTiles(this.grid, { x: MINING_CONFIG.ENTRANCE_X, y: MINING_CONFIG.ENTRANCE_Y }, this.visionRange);
  }

  /**
   * Start the 30 Hz simulation loop.
   */
  public start(): void {
    if (this.intervalId) return;
    const tickRateMs = Math.floor(1000 / MINING_CONFIG.SIMULATION_TICK_RATE_HZ);
    this.intervalId = setInterval(() => {
      this.tick(tickRateMs / 1000);
    }, tickRateMs);
  }

  /**
   * Update client socket reference on reconnect.
   */
  public setSocket(socket: Socket): void {
    this.socket = socket;
  }

  /**
   * Stop the simulation loop.
   */
  public stop(): void {
    this.isStopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Receive new input state from client.
   */
  public handleInput(input: MiningInputState): void {
    this.inputs = input;
  }

  /**
   * Start mining a block.
   */
  public startMining(target: MiningPosition): boolean {
    if (this.isMining) return false;
    if (!isInBounds(target.x, target.y)) return false;

    const tile = this.grid[target.y][target.x];
    if (tile.type === MiningTileType.EMPTY || tile.type === MiningTileType.ENTRANCE) {
      return false;
    }

    // Distance check to target tile center
    const tileCenterX = target.x + 0.5;
    const tileCenterY = target.y + 0.5;
    const dist = Math.hypot(this.position.x - tileCenterX, this.position.y - tileCenterY);
    if (dist > 1.5) return false;

    let timeMs: number = MINING_CONFIG.DIRT_MINE_TIME_MS;
    if (tile.type === MiningTileType.MINERAL) timeMs = MINING_CONFIG.MINERAL_MINE_TIME_MS;
    if (tile.type === MiningTileType.CHEST) timeMs = MINING_CONFIG.CHEST_MINE_TIME_MS;
    if (tile.type === MiningTileType.ROCK) return false; // Rocks are indestructible

    this.isMining = true;
    this.miningTarget = target;
    this.miningTimeMs = timeMs;
    this.miningProgressMs = tile.damageMs || 0;
    return true;
  }

  public facing: Vector2D = { x: 0, y: 1 };

  /**
   * Main 30 Hz simulation tick execution.
   */
  private tick(dt: number): void {
    if (this.isStopped) return;
    this.tickCount++;

    // 1. Calculate Velocity from inputs
    let dx = 0;
    let dy = 0;
    if (this.inputs.left) dx -= 1;
    if (this.inputs.right) dx += 1;
    if (this.inputs.up) dy -= 1;
    if (this.inputs.down) dy += 1;

    if (dx !== 0 || dy !== 0) {
      // Strictly cardinal facing vector (up, down, left, right)
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.facing = { x: Math.sign(dx), y: 0 };
      } else {
        this.facing = { x: 0, y: Math.sign(dy) };
      }
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy);
      dx *= invLen;
      dy *= invLen;
    }

    const moveSpeed = MINING_CONFIG.MOVE_SPEED;
    this.velocity = { x: dx * moveSpeed, y: dy * moveSpeed };

    // 2. Physics & Collision Handling
    const radius = MINING_CONFIG.PLAYER_RADIUS / MINING_CONFIG.TILE_SIZE; // Player radius in tile units (~0.375)

    let targetX = this.position.x + this.velocity.x * dt;
    let targetY = this.position.y + this.velocity.y * dt;

    targetX = Math.max(radius, Math.min(MINING_CONFIG.GRID_WIDTH - 1 - radius, targetX));
    targetY = Math.max(radius, Math.min(MINING_CONFIG.GRID_HEIGHT - 1 - radius, targetY));

    let collisionX = false;
    let collisionY = false;

    // Axis X Movement test
    if (!this.checkTileCollision(targetX, this.position.y, radius)) {
      this.position.x = targetX;
    } else {
      collisionX = true;
      this.velocity.x = 0;
    }

    // Axis Y Movement test
    if (!this.checkTileCollision(this.position.x, targetY, radius)) {
      this.position.y = targetY;
    } else {
      collisionY = true;
      this.velocity.y = 0;
    }

    // 3. Reveal Fog of War — track newly revealed tiles for client
    const currentGridPos = {
      x: Math.max(0, Math.min(MINING_CONFIG.GRID_WIDTH - 1, Math.round(this.position.x))),
      y: Math.max(0, Math.min(MINING_CONFIG.GRID_HEIGHT - 1, Math.round(this.position.y))),
    };
    this.revealAndTrackTiles(currentGridPos, this.visionRange);

    // 4. Item Pickup check
    this.checkItemPickups();

    // 5. Auto-mine: when player bumps into a block while holding a direction, mine the adjacent cardinal block
    if (!this.isMining && (collisionX || collisionY) && (dx !== 0 || dy !== 0)) {
      const playerTileX = Math.floor(this.position.x);
      const playerTileY = Math.floor(this.position.y);

      const targetTileX = playerTileX + this.facing.x;
      const targetTileY = playerTileY + this.facing.y;

      if (isInBounds(targetTileX, targetTileY)) {
        const tile = this.grid[targetTileY][targetTileX];
        if (
          tile.type === MiningTileType.DIRT ||
          tile.type === MiningTileType.MINERAL ||
          tile.type === MiningTileType.CHEST
        ) {
          this.startMining({ x: targetTileX, y: targetTileY });
        }
      }
    }

    // 6. Mining Progress Tick
    if (this.isMining && this.miningTarget) {
      const tile = this.grid[this.miningTarget.y][this.miningTarget.x];
      const tileCenterX = this.miningTarget.x + 0.5;
      const tileCenterY = this.miningTarget.y + 0.5;
      const dist = Math.hypot(this.position.x - tileCenterX, this.position.y - tileCenterY);
      if (dist > 1.5) {
        // Player walked away from target, cancel mining but keep accumulated tile damage!
        this.isMining = false;
        this.miningTarget = null;
        this.miningProgressMs = 0;
      } else {
        const prevStage = getDamageStage(tile);
        tile.damageMs = (tile.damageMs || 0) + dt * 1000;
        this.miningProgressMs = tile.damageMs;

        const newStage = getDamageStage(tile);
        if (newStage !== prevStage) {
          this.pendingRevealedTiles.push({
            x: this.miningTarget.x,
            y: this.miningTarget.y,
            type: tile.type,
            damageStage: newStage,
          });
        }

        if (tile.damageMs >= this.miningTimeMs) {
          this.completeMiningBlock(this.miningTarget);
        }
      }
    }


    // 7. Broadcast 30 Hz State Tick
    this.broadcastStateTick();
  }

  /**
   * Collision check against solid unmined tiles.
   */
  private checkTileCollision(x: number, y: number, radius: number): boolean {
    const minTileX = Math.max(0, Math.floor(x - radius));
    const maxTileX = Math.min(MINING_CONFIG.GRID_WIDTH - 1, Math.floor(x + radius));
    const minTileY = Math.max(0, Math.floor(y - radius));
    const maxTileY = Math.min(MINING_CONFIG.GRID_HEIGHT - 1, Math.floor(y + radius));

    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        if (!isInBounds(tx, ty)) return true;
        const tile = this.grid[ty][tx];
        if (tile.type !== MiningTileType.EMPTY && tile.type !== MiningTileType.ENTRANCE) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Complete excavation of a tile.
   */
  private completeMiningBlock(target: MiningPosition): void {
    const tile = this.grid[target.y][target.x];

    // Excavate tile
    this.grid[target.y][target.x] = { type: MiningTileType.EMPTY, revealed: true };

    // Notify client that this tile changed type
    this.pendingRevealedTiles.push({ x: target.x, y: target.y, type: MiningTileType.EMPTY });

    // Spawn items if Mineral or Chest
    if (tile.type === MiningTileType.MINERAL) {
      this.droppedItems.push({
        position: target,
        itemId: 'copper_ore',
        itemName: 'Copper Ore',
        iconUrl: '/assets/items/copper_ore.png',
        quantity: 1,
      });
    } else if (tile.type === MiningTileType.CHEST) {
      this.droppedItems.push({
        position: target,
        itemId: 'gold_coin',
        itemName: 'Gold Coins',
        iconUrl: '/assets/items/gold_coin.png',
        quantity: 50,
      });
    }

    // Resolve falling rock gravity
    const gravityResult = resolveGravity(this.grid, { x: Math.round(this.position.x), y: Math.round(this.position.y) });
    for (const move of gravityResult.moves) {
      this.pendingRevealedTiles.push({ x: move.from.x, y: move.from.y, type: MiningTileType.EMPTY });
      this.pendingRevealedTiles.push({ x: move.to.x, y: move.to.y, type: MiningTileType.ROCK });
    }

    // Reset mining state
    this.isMining = false;
    this.miningTarget = null;
    this.miningProgressMs = 0;
  }

  /**
   * Pick up items on the ground when player walks over them.
   */
  private checkItemPickups(): void {
    if (this.droppedItems.length === 0) return;

    this.droppedItems = this.droppedItems.filter((item) => {
      const dist = Math.hypot(this.position.x - item.position.x, this.position.y - item.position.y);
      if (dist <= 0.7) {
        // Collect into temporary backpack
        const existing = this.temporaryBackpack.find((b) => b.itemId === item.itemId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          this.temporaryBackpack.push({
            itemId: item.itemId,
            itemName: item.itemName,
            iconUrl: item.iconUrl,
            quantity: item.quantity,
          });
        }
        return false; // Remove item from ground
      }
      return true;
    });
  }

  /**
   * Emit 30 Hz snapshot broadcast to client socket room.
   */
  /**
   * Reveal tiles and track newly revealed ones for the client.
   */
  private revealAndTrackTiles(position: MiningPosition, visionRange: number): void {
    for (let dy = -visionRange; dy <= visionRange; dy++) {
      for (let dx = -visionRange; dx <= visionRange; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > visionRange) continue;
        const nx = position.x + dx;
        const ny = position.y + dy;
        if (isInBounds(nx, ny) && !this.grid[ny][nx].revealed) {
          this.grid[ny][nx].revealed = true;
          this.pendingRevealedTiles.push({
            x: nx,
            y: ny,
            type: this.grid[ny][nx].type,
            damageStage: getDamageStage(this.grid[ny][nx]),
          });
        }
      }
    }
  }


  private broadcastStateTick(): void {
    if (!this.socket || !this.socket.connected) return;

    const payload: MiningStateTickPayload = {
      tick: this.tickCount,
      position: this.position,
      velocity: this.velocity,
      isMining: this.isMining,
      miningTarget: this.miningTarget || undefined,
      miningProgressMs: this.isMining ? this.miningProgressMs : undefined,
      temporaryBackpack: this.temporaryBackpack,
      droppedItems: this.droppedItems,
      revealedTiles: this.pendingRevealedTiles.length > 0 ? this.pendingRevealedTiles : undefined,
    };

    // Clear pending tiles after sending
    this.pendingRevealedTiles = [];

    this.socket.emit('mining_state_tick', payload);
  }
}
