import { Socket } from 'socket.io';
import {
  MINING_CONFIG,
  MiningTileType,
  type MiningBackpackItem,
  type MiningDroppedItem,
  type MiningFallingRock,
  type MiningInputState,
  type MiningPosition,
  type MiningStateTickPayload,
  type Vector2D,
} from '@mine-me/shared';
import {
  generateMiningMap,
  getDamageStage,
  isInBounds,
  revealTiles,
  type ServerMiningGrid,
} from '../miningMap.service';
import { MiningPlayerBody } from './physics/MiningPlayerBody';
import { MiningRockEntity } from './physics/MiningRockEntity';

export interface MiningEngineOptions {
  characterId: string;
  cityId: string;
  socket: Socket;
  seed?: number;
  maxDurationSeconds?: number;
  onTimeout?: (characterId: string) => void;
}

export class MiningGameEngine {
  public readonly characterId: string;
  public readonly cityId: string;
  public readonly seed: number;
  private socket: Socket;

  public grid: ServerMiningGrid;
  public playerBody: MiningPlayerBody;
  public activeRocks: MiningRockEntity[] = [];
  private rockCounter = 0;

  public get position(): Vector2D {
    return this.playerBody.position;
  }

  public set position(pos: Vector2D) {
    this.playerBody.position = { ...pos };
  }

  public get velocity(): Vector2D {
    return this.playerBody.velocity;
  }

  public set velocity(vel: Vector2D) {
    this.playerBody.velocity = { ...vel };
  }

  public get facing(): Vector2D {
    return this.playerBody.facing;
  }

  public set facing(f: Vector2D) {
    this.playerBody.facing = { ...f };
  }

  public inputs: MiningInputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    jump: false,
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

  public maxDurationSeconds = MINING_CONFIG.MAX_SESSION_DURATION_SECONDS;
  public elapsedTimeSeconds = 0;
  private onTimeout?: (characterId: string) => void;

  private tickCount = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private isStopped = false;
  private pendingRevealedTiles: { x: number; y: number; type: MiningTileType; damageStage?: number }[] = [];

  constructor(options: MiningEngineOptions) {
    this.characterId = options.characterId;
    this.cityId = options.cityId;
    this.socket = options.socket;
    this.seed = options.seed ?? Math.floor(Math.random() * 2147483647);
    this.maxDurationSeconds = options.maxDurationSeconds ?? MINING_CONFIG.MAX_SESSION_DURATION_SECONDS;
    this.onTimeout = options.onTimeout;

    // Generate authoritative grid
    this.grid = generateMiningMap({ seed: this.seed });

    // Initial position floating point at entrance
    const initialPos = {
      x: MINING_CONFIG.ENTRANCE_X,
      y: MINING_CONFIG.ENTRANCE_Y,
    };
    this.playerBody = new MiningPlayerBody(initialPos);

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
    if (!this.playerBody.isGrounded) return false;
    if (!isInBounds(target.x, target.y)) return false;

    const tile = this.grid[target.y][target.x];
    if (tile.type === MiningTileType.EMPTY || tile.type === MiningTileType.ENTRANCE) {
      return false;
    }

    // Distance check to target tile center (blocks are 1.0 unit wide, adjacent center distance ~1.0)
    const tileCenterX = target.x + 0.5;
    const tileCenterY = target.y + 0.5;
    const dist = Math.hypot(this.playerBody.position.x - tileCenterX, this.playerBody.position.y - tileCenterY);
    if (dist > 1.15) return false;

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

  /**
   * Stop mining the current block (preserves accumulated tile damage on the grid).
   */
  public stopMining(): void {
    this.isMining = false;
    this.miningTarget = null;
    this.miningProgressMs = 0;
  }

  /**
   * Main 30 Hz simulation tick execution.
   */
  private tick(dt: number): void {
    if (this.isStopped) return;
    this.tickCount++;
    this.elapsedTimeSeconds += dt;

    // Check max session duration limit (e.g. 15 minutes)
    if (this.elapsedTimeSeconds >= this.maxDurationSeconds) {
      this.handleSessionTimeout();
      return;
    }

    // 1. Process player input velocity
    this.playerBody.processInputs(this.inputs);

    // 2. Physics & Collision Handling for Player
    this.playerBody.update(dt, this.grid);

    // 3. Physics & Collision Handling for Falling Rocks
    this.updateFallingRocks(dt);

    // 4. Reveal Fog of War — track newly revealed tiles for client
    const currentGridPos = {
      x: Math.max(0, Math.min(MINING_CONFIG.GRID_WIDTH - 1, Math.round(this.playerBody.position.x))),
      y: Math.max(0, Math.min(MINING_CONFIG.GRID_HEIGHT - 1, Math.round(this.playerBody.position.y))),
    };
    this.revealAndTrackTiles(currentGridPos, this.visionRange);

    // 5. Item Pickup check
    this.checkItemPickups();

    // 6. Mining logic & Auto-mine:
    // Direction input and grounded stance are required to mine.
    const hasDirectionInput = this.inputs.left || this.inputs.right || this.inputs.up || this.inputs.down;

    const playerTileX = Math.floor(this.playerBody.position.x);
    const playerTileY = Math.floor(this.playerBody.position.y);
    const desiredTargetX = playerTileX + this.playerBody.facing.x;
    const desiredTargetY = playerTileY + this.playerBody.facing.y;

    if (this.isMining && this.miningTarget) {
      // If player released input, faces a different target, moves out of range, or becomes airborne (jumping/falling), stop mining
      const isFacingCurrentTarget = hasDirectionInput && this.miningTarget.x === desiredTargetX && this.miningTarget.y === desiredTargetY;
      const tileCenterX = this.miningTarget.x + 0.5;
      const tileCenterY = this.miningTarget.y + 0.5;
      const dist = Math.hypot(this.playerBody.position.x - tileCenterX, this.playerBody.position.y - tileCenterY);

      if (!isFacingCurrentTarget || dist > 1.25 || !this.playerBody.isGrounded) {
        this.stopMining();
      }
    }

    // If not currently mining, player has direction input, and player is grounded, check if we should start mining the target block
    if (!this.isMining && hasDirectionInput && this.playerBody.isGrounded) {
      if (isInBounds(desiredTargetX, desiredTargetY)) {
        const tile = this.grid[desiredTargetY][desiredTargetX];
        if (
          tile.type === MiningTileType.DIRT ||
          tile.type === MiningTileType.MINERAL ||
          tile.type === MiningTileType.CHEST
        ) {
          this.startMining({ x: desiredTargetX, y: desiredTargetY });
        }
      }
    }

    // 7. Mining Progress Tick
    if (this.isMining && this.miningTarget) {
      const tile = this.grid[this.miningTarget.y][this.miningTarget.x];
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

    // 8. Broadcast 30 Hz State Tick
    this.broadcastStateTick();
  }

  /**
   * Update active falling rock entities and settle them back to grid on impact.
   */
  private updateFallingRocks(dt: number): void {
    if (this.activeRocks.length === 0) return;

    this.activeRocks = this.activeRocks.filter((rock) => {
      rock.update(dt, this.grid);

      // Check if rock crushed the player
      const dist = Math.hypot(rock.position.x - this.playerBody.position.x, rock.position.y - this.playerBody.position.y);
      if (dist < 0.6 && rock.velocity.y > 2.0 && rock.totalFallenDistance > 0.5) {
        // Falling rock hit player
        this.socket.emit('mining_event_result', {
          success: true,
          data: {
            damageTaken: MINING_CONFIG.ROCK_CRUSH_DAMAGE,
            message: 'You were hit by a falling rock!',
          },
        });
      }

      if (rock.hasSettled && rock.settledTile) {
        const { x, y } = rock.settledTile;
        if (isInBounds(x, y)) {
          this.grid[y][x] = { type: MiningTileType.ROCK, revealed: true };
          this.pendingRevealedTiles.push({ x, y, type: MiningTileType.ROCK });
        }
        return false; // Remove from active falling rocks
      }
      return true;
    });
  }

  /**
   * Check tiles directly above the mined block and trigger falling rock physics if unsupported.
   */
  private checkAndTriggerFallingRocks(clearedX: number, clearedY: number): void {
    // Scan upward in the column above cleared tile
    for (let y = clearedY - 1; y >= 0; y--) {
      if (this.grid[y][clearedX].type === MiningTileType.ROCK) {
        // Convert static rock tile to dynamic falling rock entity
        this.grid[y][clearedX] = { type: MiningTileType.EMPTY, revealed: true };
        this.pendingRevealedTiles.push({ x: clearedX, y, type: MiningTileType.EMPTY });

        this.rockCounter++;
        const rockId = `rock_${clearedX}_${y}_${this.rockCounter}`;
        const rockEntity = new MiningRockEntity(rockId, clearedX, y);
        this.activeRocks.push(rockEntity);
      } else if (
        this.grid[y][clearedX].type !== MiningTileType.EMPTY &&
        this.grid[y][clearedX].type !== MiningTileType.ENTRANCE
      ) {
        // Another solid block (dirt, mineral, chest) supports whatever is above it
        break;
      }
    }
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

    // Trigger dynamic falling rock gravity for rocks directly above
    this.checkAndTriggerFallingRocks(target.x, target.y);

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
      const dist = Math.hypot(this.playerBody.position.x - item.position.x, this.playerBody.position.y - item.position.y);
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

    const fallingRocksPayload: MiningFallingRock[] | undefined =
      this.activeRocks.length > 0
        ? this.activeRocks.map((r) => ({
            id: r.id,
            position: { x: r.position.x, y: r.position.y },
            velocity: { x: r.velocity.x, y: r.velocity.y },
          }))
        : undefined;

    const payload: MiningStateTickPayload = {
      tick: this.tickCount,
      position: this.playerBody.position,
      velocity: this.playerBody.velocity,
      isMining: this.isMining,
      miningTarget: this.miningTarget || undefined,
      miningProgressMs: this.isMining ? this.miningProgressMs : undefined,
      temporaryBackpack: this.temporaryBackpack,
      droppedItems: this.droppedItems,
      fallingRocks: fallingRocksPayload,
      revealedTiles: this.pendingRevealedTiles.length > 0 ? this.pendingRevealedTiles : undefined,
    };

    // Clear pending tiles after sending
    this.pendingRevealedTiles = [];

    this.socket.emit('mining_state_tick', payload);
  }

  /**
   * Handle automatic session timeout when max mining duration is reached.
   */
  private handleSessionTimeout(): void {
    if (this.isStopped) return;
    console.log(`[Mining] Session timed out for character ${this.characterId} (${this.elapsedTimeSeconds.toFixed(1)}s elapsed)`);

    if (this.socket && this.socket.connected) {
      this.socket.emit('mining_session_timeout', {
        message: 'Your mining expedition has reached its 15-minute time limit and ended.',
      });
    }

    this.stop();

    if (this.onTimeout) {
      this.onTimeout(this.characterId);
    }
  }
}

