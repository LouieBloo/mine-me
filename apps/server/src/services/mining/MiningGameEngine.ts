import { Socket } from 'socket.io';
import {
  MINING_CONFIG,
  MiningTileType,
  canPlaceBuildable,
  getTileMineTime,
  isTileMineable,
  isTileSolid,
  type MiningBackpackItem,
  type MiningDroppedItem,
  type MiningFallingRock,
  type MiningGearLayer,
  type MiningInputState,
  type MiningPosition,
  type MiningRemotePlayer,
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

export interface MiningPlayerSession {
  characterId: string;
  characterName: string;
  socket: Socket;
  playerBody: MiningPlayerBody;
  inputs: MiningInputState;
  miningSpeed: number | (() => number);
  temporaryBackpack: MiningBackpackItem[];
  gearLayers: MiningGearLayer[];
  visionRange: number;
  isMining: boolean;
  miningTarget: MiningPosition | null;
  miningProgressMs: number;
  miningTimeMs: number;
  isFacingLeft: boolean;
  aimDirection: Vector2D;
  flashlightOn: boolean;
  animationState: 'idle' | 'walk' | 'mine' | 'jump' | 'climb';
  lastRevealGridPos?: MiningPosition | null;
  backpackDirty?: boolean;
}

export interface MiningEngineOptions {
  roomId?: string;
  gameMode?: 'singleplayer' | 'multiplayer';
  characterId?: string;
  characterName?: string;
  cityId: string;
  socket?: Socket;
  seed?: number;
  mapConfig?: Partial<import('@mine-me/shared').MiningMapConfigData>;
  miningSpeed?: number | (() => number);
  gearLayers?: MiningGearLayer[];
  maxDurationSeconds?: number;
  onTimeout?: (roomIdOrCharId: string) => void;
  onRoomEmpty?: (roomId: string) => void;
}

export class MiningGameEngine {
  public readonly roomId: string;
  public readonly gameMode: 'singleplayer' | 'multiplayer';
  public readonly cityId: string;
  public readonly seed: number;

  public grid: ServerMiningGrid;
  public activeRocks: MiningRockEntity[] = [];
  private rockCounter = 0;

  public players: Map<string, MiningPlayerSession> = new Map();
  public primaryCharacterId: string = '';

  public droppedItems: MiningDroppedItem[] = [];

  public maxDurationSeconds = MINING_CONFIG.MAX_SESSION_DURATION_SECONDS;
  public elapsedTimeSeconds = 0;
  private onTimeout?: (roomIdOrCharId: string) => void;
  private onRoomEmpty?: (roomId: string) => void;

  private tickCount = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private isStopped = false;
  private pendingRevealedTiles: { x: number; y: number; type: MiningTileType; damageStage?: number }[] = [];
  private droppedItemsDirty: boolean = true;

  constructor(options: MiningEngineOptions) {
    this.roomId = options.roomId ?? (options.characterId ? `solo_${options.characterId}` : `room_${Math.random().toString(36).substring(2, 9)}`);
    this.gameMode = options.gameMode ?? 'singleplayer';
    this.cityId = options.cityId;
    this.seed = options.seed ?? Math.floor(Math.random() * 2147483647);
    this.maxDurationSeconds = options.maxDurationSeconds ?? MINING_CONFIG.MAX_SESSION_DURATION_SECONDS;
    this.onTimeout = options.onTimeout;
    this.onRoomEmpty = options.onRoomEmpty;

    // Generate authoritative grid
    this.grid = generateMiningMap({ seed: this.seed, config: options.mapConfig });

    // If options included an initial character and socket, initialize player session
    if (options.characterId && options.socket) {
      this.addPlayer({
        characterId: options.characterId,
        characterName: options.characterName,
        socket: options.socket,
        miningSpeed: options.miningSpeed,
        gearLayers: options.gearLayers,
      });
    }
  }

  /**
   * Add or re-attach a player to this mine room session.
   */
  public addPlayer(options: {
    characterId: string;
    characterName?: string;
    socket: Socket;
    miningSpeed?: number | (() => number);
    gearLayers?: MiningGearLayer[];
  }): MiningPlayerSession {
    let session = this.players.get(options.characterId);
    if (session) {
      session.socket = options.socket;
      if (options.miningSpeed !== undefined) session.miningSpeed = options.miningSpeed;
      if (options.gearLayers !== undefined) session.gearLayers = options.gearLayers;
      if (options.characterName) session.characterName = options.characterName;
      return session;
    }

    const initialPos = {
      x: MINING_CONFIG.ENTRANCE_X,
      y: MINING_CONFIG.ENTRANCE_Y,
    };
    const playerBody = new MiningPlayerBody(initialPos);

    session = {
      characterId: options.characterId,
      characterName: options.characterName || 'Miner',
      socket: options.socket,
      playerBody,
      inputs: {
        up: false,
        down: false,
        left: false,
        right: false,
        jump: false,
        miningKey: false,
        sequence: 0,
      },
      miningSpeed: options.miningSpeed ?? 0,
      temporaryBackpack: [],
      gearLayers: options.gearLayers || [],
      visionRange: MINING_CONFIG.DEFAULT_VISION_RANGE,
      isMining: false,
      miningTarget: null,
      miningProgressMs: 0,
      miningTimeMs: 0,
      isFacingLeft: false,
      aimDirection: { x: 1, y: 0 },
      flashlightOn: false,
      animationState: 'idle',
      lastRevealGridPos: null,
      backpackDirty: true,
    };

    this.players.set(options.characterId, session);
    if (!this.primaryCharacterId) {
      this.primaryCharacterId = options.characterId;
    }

    // Reveal starting area
    revealTiles(this.grid, { x: MINING_CONFIG.ENTRANCE_X, y: MINING_CONFIG.ENTRANCE_Y }, session.visionRange);

    return session;
  }

  /**
   * Remove a player from this mine room session.
   */
  public removePlayer(characterId: string): { extractedItems: MiningBackpackItem[] } | null {
    const session = this.players.get(characterId);
    if (!session) return null;

    const extractedItems = [...session.temporaryBackpack];
    this.players.delete(characterId);

    if (this.primaryCharacterId === characterId) {
      const nextKey = this.players.keys().next().value;
      this.primaryCharacterId = nextKey ?? '';
    }

    if (this.players.size === 0 && this.onRoomEmpty) {
      this.onRoomEmpty(this.roomId);
    }

    return { extractedItems };
  }

  public getPlayer(characterId: string): MiningPlayerSession | undefined {
    return this.players.get(characterId);
  }

  public get primarySession(): MiningPlayerSession | undefined {
    return (this.primaryCharacterId ? this.players.get(this.primaryCharacterId) : undefined) ?? this.players.values().next().value;
  }

  public get characterId(): string {
    return this.primaryCharacterId;
  }

  public get playerCount(): number {
    return this.players.size;
  }

  // Backwards-compatible accessors targeting primary player
  public get playerBody(): MiningPlayerBody {
    const session = this.primarySession;
    if (!session) {
      return new MiningPlayerBody({ x: MINING_CONFIG.ENTRANCE_X, y: MINING_CONFIG.ENTRANCE_Y });
    }
    return session.playerBody;
  }

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

  public get inputs(): MiningInputState {
    return this.primarySession?.inputs ?? {
      up: false,
      down: false,
      left: false,
      right: false,
      jump: false,
      miningKey: false,
      sequence: 0,
    };
  }

  public set inputs(inp: MiningInputState) {
    if (this.primarySession) {
      this.primarySession.inputs = inp;
    }
  }

  public get temporaryBackpack(): MiningBackpackItem[] {
    return this.primarySession?.temporaryBackpack ?? [];
  }

  public get visionRange(): number {
    return this.primarySession?.visionRange ?? MINING_CONFIG.DEFAULT_VISION_RANGE;
  }

  public set visionRange(val: number) {
    if (this.primarySession) {
      this.primarySession.visionRange = val;
    }
  }

  /**
   * Increases the player's view distance temporarily for this mining session,
   * and immediately reveals newly uncovered tiles around the player.
   */
  public increaseVisionRange(characterId?: string, amount: number = 1): number {
    const session = (characterId ? this.players.get(characterId) : null) ?? this.primarySession;
    if (!session) return MINING_CONFIG.DEFAULT_VISION_RANGE;

    session.visionRange = Math.max(1, Math.min(30, session.visionRange + amount));
    session.lastRevealGridPos = null;

    const currentGridPos = {
      x: Math.max(0, Math.min(MINING_CONFIG.GRID_WIDTH - 1, Math.round(session.playerBody.position.x))),
      y: Math.max(0, Math.min(MINING_CONFIG.GRID_HEIGHT - 1, Math.round(session.playerBody.position.y))),
    };
    this.revealAndTrackTiles(currentGridPos, session.visionRange);
    return session.visionRange;
  }

  public get isMining(): boolean {
    return this.primarySession?.isMining ?? false;
  }

  public set isMining(val: boolean) {
    if (this.primarySession) {
      this.primarySession.isMining = val;
    }
  }

  public get miningTarget(): MiningPosition | null {
    return this.primarySession?.miningTarget ?? null;
  }

  public set miningTarget(t: MiningPosition | null) {
    if (this.primarySession) {
      this.primarySession.miningTarget = t;
    }
  }

  public get miningProgressMs(): number {
    return this.primarySession?.miningProgressMs ?? 0;
  }

  public set miningProgressMs(val: number) {
    if (this.primarySession) {
      this.primarySession.miningProgressMs = val;
    }
  }

  public get miningTimeMs(): number {
    return this.primarySession?.miningTimeMs ?? 0;
  }

  public set miningTimeMs(val: number) {
    if (this.primarySession) {
      this.primarySession.miningTimeMs = val;
    }
  }

  public get miningSpeed(): number {
    const session = this.primarySession;
    if (!session) return 0;
    if (typeof session.miningSpeed === 'function') {
      return session.miningSpeed();
    }
    return session.miningSpeed;
  }

  public setMiningSpeed(speed: number | (() => number), characterId?: string): void {
    const session = characterId ? this.players.get(characterId) : this.primarySession;
    if (session) {
      session.miningSpeed = speed;
      const resolved = typeof speed === 'function' ? speed() : speed;
      if (resolved <= 0 && session.isMining) {
        this.stopMining(session.characterId);
      }
    }
  }

  public setSocket(socket: Socket, characterId?: string): void {
    const session = characterId ? this.players.get(characterId) : this.primarySession;
    if (session) {
      session.socket = socket;
    }
  }

  public start(): void {
    if (this.intervalId || this.isStopped) return;
    const intervalMs = 1000 / MINING_CONFIG.SIMULATION_TICK_RATE_HZ;
    const dt = 1 / MINING_CONFIG.SIMULATION_TICK_RATE_HZ;
    this.intervalId = setInterval(() => this.tick(dt), intervalMs);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isStopped = true;
  }

  public handleInput(characterIdOrInput: string | MiningInputState, maybeInput?: MiningInputState): void {
    let charId: string;
    let input: MiningInputState;

    if (typeof characterIdOrInput === 'string') {
      charId = characterIdOrInput;
      input = maybeInput!;
    } else {
      charId = this.primaryCharacterId;
      input = characterIdOrInput;
    }

    const session = this.players.get(charId);
    if (!session || !input) return;

    session.inputs = { ...input };
    if (input.aimDirection && typeof input.aimDirection.x === 'number' && typeof input.aimDirection.y === 'number') {
      session.aimDirection = { x: input.aimDirection.x, y: input.aimDirection.y };
    }
    if (typeof input.isFacingLeft === 'boolean') {
      session.isFacingLeft = input.isFacingLeft;
    } else if (input.left && !input.right) {
      session.isFacingLeft = true;
    } else if (input.right && !input.left) {
      session.isFacingLeft = false;
    }
    if (typeof input.flashlightOn === 'boolean') {
      session.flashlightOn = input.flashlightOn;
    }
  }

  public startMining(target: MiningPosition, characterId?: string): boolean {
    const session = characterId ? this.players.get(characterId) : this.primarySession;
    if (!session) return false;
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return false;
    if (!isInBounds(target.x, target.y)) return false;

    const playerSpeed = typeof session.miningSpeed === 'function' ? session.miningSpeed() : session.miningSpeed;
    if (playerSpeed <= 0) return false;

    const canMineStance = session.playerBody.isGrounded || session.playerBody.isOnLadder;
    if (!canMineStance) return false;

    const tile = this.grid[target.y][target.x];
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

  public stopMining(characterId?: string): void {
    const session = characterId ? this.players.get(characterId) : this.primarySession;
    if (!session) return;
    session.isMining = false;
    session.miningTarget = null;
    session.miningProgressMs = 0;
  }

  public placeLadder(target?: MiningPosition, characterId?: string): boolean {
    const session = characterId ? this.players.get(characterId) : this.primarySession;
    if (!session) return false;

    const x = target ? target.x : Math.floor(session.playerBody.position.x);
    const y = target ? target.y : Math.floor(session.playerBody.position.y);

    if (!isInBounds(x, y)) return false;

    if (target && typeof target.x === 'number' && typeof target.y === 'number') {
      const tileCenterX = target.x + 0.5;
      const tileCenterY = target.y + 0.5;
      const dx = Math.abs(tileCenterX - session.playerBody.position.x);
      const dy = Math.abs(tileCenterY - session.playerBody.position.y);
      if (dx > MINING_CONFIG.TORCH_PLACEMENT_REACH || dy > MINING_CONFIG.TORCH_PLACEMENT_REACH) return false;
    }

    const tile = this.grid[y][x];
    if (tile.type === MiningTileType.ENTRANCE) return false;
    if (!canPlaceBuildable(MiningTileType.LADDER, tile.type)) return false;

    tile.type = MiningTileType.LADDER;
    tile.revealed = true;
    tile.damageMs = 0;

    this.pendingRevealedTiles.push({
      x,
      y,
      type: MiningTileType.LADDER,
      damageStage: 0,
    });

    return true;
  }

  public placeTorch(target: MiningPosition, characterId?: string): boolean {
    const session = characterId ? this.players.get(characterId) : this.primarySession;
    if (!session) return false;
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return false;
    if (!isInBounds(target.x, target.y)) return false;

    const tileCenterX = target.x + 0.5;
    const tileCenterY = target.y + 0.5;
    const dx = Math.abs(tileCenterX - session.playerBody.position.x);
    const dy = Math.abs(tileCenterY - session.playerBody.position.y);
    if (dx > MINING_CONFIG.TORCH_PLACEMENT_REACH || dy > MINING_CONFIG.TORCH_PLACEMENT_REACH) return false;

    const tile = this.grid[target.y][target.x];
    if (!tile.revealed) return false;
    if (!canPlaceBuildable(MiningTileType.TORCH, tile.type)) return false;

    tile.type = MiningTileType.TORCH;
    tile.revealed = true;
    tile.damageMs = 0;

    this.pendingRevealedTiles.push({
      x: target.x,
      y: target.y,
      type: MiningTileType.TORCH,
      damageStage: 0,
    });

    return true;
  }

  /**
   * Main 30 Hz simulation tick execution.
   */
  private tick(dt: number): void {
    if (this.isStopped) return;
    this.tickCount++;
    this.elapsedTimeSeconds += dt;

    // Check max session duration limit
    if (this.elapsedTimeSeconds >= this.maxDurationSeconds) {
      this.handleSessionTimeout();
      return;
    }

    // 1 & 2. Process physics, animations, and FoW for all players
    for (const session of this.players.values()) {
      session.playerBody.processInputs(session.inputs, this.grid);
      session.playerBody.update(dt, this.grid);

      // Animation state determination
      if (session.isMining) {
        session.animationState = 'mine';
      } else if (session.playerBody.isOnLadder) {
        session.animationState = Math.abs(session.playerBody.velocity.y) > 0.1 ? 'climb' : 'idle';
      } else if (!session.playerBody.isGrounded) {
        session.animationState = 'jump';
      } else if (Math.abs(session.playerBody.velocity.x) > 0.1) {
        session.animationState = 'walk';
      } else {
        session.animationState = 'idle';
      }

      // FoW reveal (skip diamond scan if player has not moved to a new tile)
      const currentGridPos = {
        x: Math.max(0, Math.min(MINING_CONFIG.GRID_WIDTH - 1, Math.round(session.playerBody.position.x))),
        y: Math.max(0, Math.min(MINING_CONFIG.GRID_HEIGHT - 1, Math.round(session.playerBody.position.y))),
      };
      if (
        !session.lastRevealGridPos ||
        session.lastRevealGridPos.x !== currentGridPos.x ||
        session.lastRevealGridPos.y !== currentGridPos.y
      ) {
        session.lastRevealGridPos = { ...currentGridPos };
        this.revealAndTrackTiles(currentGridPos, session.visionRange);
      }

      // Item pickups
      this.checkItemPickupsForPlayer(session);
    }

    // 3. Falling rocks simulation
    this.updateFallingRocks(dt);

    // 4. Validate & trigger mining actions for each player
    for (const session of this.players.values()) {
      const canMineStance = session.playerBody.isGrounded || session.playerBody.isOnLadder;
      const isTargeting = Boolean(session.inputs.miningKey && session.inputs.miningTarget);
      const target = session.inputs.miningTarget;
      const playerSpeed = typeof session.miningSpeed === 'function' ? session.miningSpeed() : session.miningSpeed;

      if (session.isMining && session.miningTarget) {
        const isSameTarget = target ? (session.miningTarget.x === target.x && session.miningTarget.y === target.y) : false;
        const tileCenterX = session.miningTarget.x + 0.5;
        const tileCenterY = session.miningTarget.y + 0.5;
        const dx = Math.abs(tileCenterX - session.playerBody.position.x);
        const dy = Math.abs(tileCenterY - session.playerBody.position.y);
        const inReach = dx <= MINING_CONFIG.PLAYER_MINING_REACH && dy <= MINING_CONFIG.PLAYER_MINING_REACH;

        if (!isTargeting || !isSameTarget || !canMineStance || !inReach) {
          this.stopMining(session.characterId);
        }
      }

      if (!session.isMining && isTargeting && target && canMineStance && playerSpeed > 0) {
        if (isInBounds(target.x, target.y)) {
          const tile = this.grid[target.y][target.x];
          if (isTileMineable(tile.type)) {
            this.startMining({ x: target.x, y: target.y }, session.characterId);
          }
        }
      }
    }

    // 5. Cooperative Mining Progress
    // Group active miners by targeted coordinate
    const targetMap = new Map<string, { target: MiningPosition; miners: MiningPlayerSession[] }>();
    for (const session of this.players.values()) {
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
      const tile = this.grid[target.y][target.x];
      if (!tile || !isTileMineable(tile.type)) {
        for (const miner of miners) {
          this.stopMining(miner.characterId);
        }
        continue;
      }

      const prevStage = getDamageStage(tile);

      // Cooperative speed summation: combine all miners' speeds
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
        this.pendingRevealedTiles.push({
          x: target.x,
          y: target.y,
          type: tile.type,
          damageStage: newStage,
        });
      }

      const requiredTime = getTileMineTime(tile.type);
      if (tile.damageMs >= requiredTime) {
        this.completeMiningBlock(target, miners);
      }
    }

    // 6. Broadcast 30 Hz State Tick
    this.broadcastStateTick();
  }

  /**
   * Update active falling rock entities and settle them back to grid on impact.
   */
  private updateFallingRocks(dt: number): void {
    if (this.activeRocks.length === 0) return;

    this.activeRocks = this.activeRocks.filter((rock) => {
      rock.update(dt, this.grid);

      // Check if rock crushed ANY active player
      for (const session of this.players.values()) {
        const dist = Math.hypot(rock.position.x - session.playerBody.position.x, rock.position.y - session.playerBody.position.y);
        if (dist < 0.6 && rock.velocity.y > 2.0 && rock.totalFallenDistance > 0.5) {
          if (session.socket && session.socket.connected) {
            session.socket.emit('mining_event_result', {
              success: true,
              data: {
                damageTaken: MINING_CONFIG.ROCK_CRUSH_DAMAGE,
                message: 'You were hit by a falling rock!',
              },
            });
          }
        }
      }

      if (rock.hasSettled && rock.settledTile) {
        const { x, y } = rock.settledTile;
        if (isInBounds(x, y)) {
          this.grid[y][x] = { type: MiningTileType.ROCK, revealed: true };
          this.pendingRevealedTiles.push({ x, y, type: MiningTileType.ROCK });
        }
        return false;
      }
      return true;
    });
  }

  /**
   * Check tiles directly above the mined block and trigger falling rock physics if unsupported.
   */
  private checkAndTriggerFallingRocks(clearedX: number, clearedY: number): void {
    for (let y = clearedY - 1; y >= 0; y--) {
      if (this.grid[y][clearedX].type === MiningTileType.ROCK) {
        this.grid[y][clearedX] = { type: MiningTileType.EMPTY, revealed: true };
        this.pendingRevealedTiles.push({ x: clearedX, y, type: MiningTileType.EMPTY, damageStage: 0 });

        this.rockCounter++;
        const rockId = `rock_${clearedX}_${y}_${this.rockCounter}`;
        const rockEntity = new MiningRockEntity(rockId, clearedX, y);
        this.activeRocks.push(rockEntity);
      } else if (isTileSolid(this.grid[y][clearedX].type)) {
        break;
      }
    }
  }

  /**
   * Complete excavation of a tile.
   */
  private completeMiningBlock(target: MiningPosition, miners?: MiningPlayerSession[]): void {
    const tile = this.grid[target.y][target.x];

    // Excavate tile
    this.grid[target.y][target.x] = { type: MiningTileType.EMPTY, revealed: true };
    this.pendingRevealedTiles.push({ x: target.x, y: target.y, type: MiningTileType.EMPTY, damageStage: 0 });

    // Invalidate last reveal positions so line-of-sight updates immediately
    for (const p of this.players.values()) {
      p.lastRevealGridPos = null;
    }

    // Spawn items if Mineral or Chest
    if (tile.type === MiningTileType.MINERAL) {
      this.droppedItems.push({
        position: target,
        itemId: 'copper_ore',
        itemName: 'Copper Ore',
        iconUrl: '/assets/items/copper_ore.png',
        quantity: 1,
      });
      this.droppedItemsDirty = true;
    } else if (tile.type === MiningTileType.CHEST) {
      this.droppedItems.push({
        position: target,
        itemId: 'gold_coin',
        itemName: 'Gold Coins',
        iconUrl: '/assets/items/gold_coin.png',
        quantity: 50,
      });
      this.droppedItemsDirty = true;
    }

    // Trigger dynamic falling rock gravity for rocks directly above
    this.checkAndTriggerFallingRocks(target.x, target.y);

    // Reset mining state for all miners involved
    const list = miners || Array.from(this.players.values()).filter(p => p.isMining && p.miningTarget?.x === target.x && p.miningTarget?.y === target.y);
    for (const miner of list) {
      miner.isMining = false;
      miner.miningTarget = null;
      miner.miningProgressMs = 0;
    }
  }

  /**
   * Pick up items on the ground when player walks over them.
   */
  private checkItemPickupsForPlayer(session: MiningPlayerSession): void {
    if (this.droppedItems.length === 0) return;

    this.droppedItems = this.droppedItems.filter((item) => {
      const dist = Math.hypot(session.playerBody.position.x - item.position.x, session.playerBody.position.y - item.position.y);
      if (dist <= 0.7) {
        const existing = session.temporaryBackpack.find((b) => b.itemId === item.itemId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          session.temporaryBackpack.push({
            itemId: item.itemId,
            itemName: item.itemName,
            iconUrl: item.iconUrl,
            quantity: item.quantity,
          });
        }
        session.backpackDirty = true;
        this.droppedItemsDirty = true;
        return false;
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
    const fallingRocksPayload: MiningFallingRock[] | undefined =
      this.activeRocks.length > 0
        ? this.activeRocks.map((r) => ({
            id: r.id,
            position: { x: r.position.x, y: r.position.y },
            velocity: { x: r.velocity.x, y: r.velocity.y },
          }))
        : undefined;

    const revealedToSend = this.pendingRevealedTiles.length > 0 ? this.pendingRevealedTiles : undefined;

    for (const session of this.players.values()) {
      if (!session.socket || !session.socket.connected) continue;

      const otherPlayers: MiningRemotePlayer[] = [];
      for (const other of this.players.values()) {
        if (other.characterId === session.characterId) continue;
        otherPlayers.push({
          characterId: other.characterId,
          characterName: other.characterName,
          position: { x: other.playerBody.position.x, y: other.playerBody.position.y },
          velocity: { x: other.playerBody.velocity.x, y: other.playerBody.velocity.y },
          isMining: other.isMining,
          miningTarget: other.miningTarget || undefined,
          isFacingLeft: other.isFacingLeft,
          aimDirection: other.aimDirection,
          flashlightOn: other.flashlightOn,
          animationState: other.animationState,
          gearLayers: other.gearLayers,
        });
      }

      const payload: MiningStateTickPayload = {
        tick: this.tickCount,
        position: session.playerBody.position,
        velocity: session.playerBody.velocity,
        isMining: session.isMining,
        miningTarget: session.miningTarget || undefined,
        miningProgressMs: session.isMining ? session.miningProgressMs : undefined,
        temporaryBackpack: session.backpackDirty ? session.temporaryBackpack : undefined,
        droppedItems: this.droppedItemsDirty ? this.droppedItems : undefined,
        fallingRocks: fallingRocksPayload,
        revealedTiles: revealedToSend,
        otherPlayers: otherPlayers.length > 0 ? otherPlayers : undefined,
        visionRange: session.visionRange,
      };

      session.backpackDirty = false;
      session.socket.emit('mining_state_tick', payload);
    }

    // Clear broadcast dirty flags after emitting to all sockets
    this.droppedItemsDirty = false;
    this.pendingRevealedTiles = [];
  }

  /**
   * Handle automatic session timeout when max mining duration is reached.
   */
  private handleSessionTimeout(): void {
    if (this.isStopped) return;
    console.log(`[Mining] Room ${this.roomId} timed out (${this.elapsedTimeSeconds.toFixed(1)}s elapsed)`);

    for (const session of this.players.values()) {
      if (session.socket && session.socket.connected) {
        session.socket.emit('mining_session_timeout', {
          message: 'Your mining expedition has reached its 15-minute time limit and ended.',
        });
      }
    }

    this.stop();

    if (this.onTimeout) {
      this.onTimeout(this.primaryCharacterId || this.roomId);
    }
  }
}
