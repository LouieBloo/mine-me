import { Socket } from 'socket.io';
import {
  MINING_CONFIG,
  MiningTileType,
  isTileMineable,
  getTileMineTime,
  type MiningBackpackItem,
  type MiningDroppedItem,
  type MiningFallingRock,
  type MiningActiveDynamite,
  type MiningGearLayer,
  type MiningInputState,
  type MiningPosition,
  type MiningRemotePlayer,
  type MiningStateTickPayload,
  type MiningExplosionEvent,
  type MiningActiveProjectile,
  type MiningGunshotEvent,
  type Vector2D,
  MiningRigidWorld,
  type ItemPhysicsConfig,
  type ItemSoundEffectsConfig,
  type MiningActiveMob,
} from '@mine-me/shared';
import * as planck from 'planck';
import {
  generateMiningMap,
  getDamageStage,
  isInBounds,
  revealTiles,
  type ServerMiningGrid,
} from '../miningMap.service';
import { MiningPlayerBody } from './physics/MiningPlayerBody';
import { MiningRockEntity } from './physics/MiningRockEntity';
import { MiningDynamiteEntity } from './physics/MiningDynamiteEntity';
import { MiningProjectileEntity } from './physics/MiningProjectileEntity';

// Subsystems
import { MiningDataManager } from './subsystems/MiningDataManager';
import {
  MiningPlayerManager,
  type MiningPlayerSession,
} from './subsystems/MiningPlayerManager';
import { MiningBlockSubsystem } from './subsystems/MiningBlockSubsystem';
import { MiningDropSubsystem } from './subsystems/MiningDropSubsystem';
import { MiningRockSubsystem } from './subsystems/MiningRockSubsystem';
import { MiningExplosiveSubsystem } from './subsystems/MiningExplosiveSubsystem';
import {
  MiningProjectileSubsystem,
  type PlayerAmmoState,
} from './subsystems/MiningProjectileSubsystem';
import {
  MiningMobSubsystem,
  type MiningActiveMobSession,
} from './subsystems/MiningMobSubsystem';

export type { MiningPlayerSession, MiningActiveMobSession, PlayerAmmoState };

export interface MiningEngineOptions {
  roomId?: string;
  gameMode?: 'singleplayer' | 'multiplayer';
  characterId?: string;
  characterName?: string;
  cityId: string;
  seed?: number;
  socket?: Socket;
  miningSpeed?: number | (() => number);
  miningDamage?: number | (() => number);
  gearLayers?: MiningGearLayer[];
  maxDurationSeconds?: number;
  onTimeout?: (roomIdOrCharId: string) => void;
  onRoomEmpty?: (roomId: string) => void;
  mapConfig?: Partial<import('@mine-me/shared').MiningMapConfigData>;
}

/**
 * Composite MiningGameEngine orchestrating physics, terrain, players, combat, and mobs.
 * Acts as the master coordinator and backward-compatible facade for all mining subsystems.
 */
export class MiningGameEngine {
  public readonly roomId: string;
  public readonly gameMode: 'singleplayer' | 'multiplayer';
  public readonly cityId: string;
  public readonly seed: number;

  public grid: ServerMiningGrid;
  public rigidWorld: MiningRigidWorld;
  public mapConfig?: Partial<import('@mine-me/shared').MiningMapConfigData>;

  public maxDurationSeconds = MINING_CONFIG.MAX_SESSION_DURATION_SECONDS;
  public elapsedTimeSeconds = 0;
  private onTimeout?: (roomIdOrCharId: string) => void;
  private onRoomEmpty?: (roomId: string) => void;

  private tickCount = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private isStopped = false;
  private pendingRevealedTiles: { x: number; y: number; type: MiningTileType; damageStage?: number }[] = [];

  // Dedicated Subsystems
  public readonly dataManager: MiningDataManager;
  public readonly playerManager: MiningPlayerManager;
  public readonly blockSubsystem: MiningBlockSubsystem;
  public readonly dropSubsystem: MiningDropSubsystem;
  public readonly rockSubsystem: MiningRockSubsystem;
  public readonly explosiveSubsystem: MiningExplosiveSubsystem;
  public readonly projectileSubsystem: MiningProjectileSubsystem;
  public readonly mobSubsystem: MiningMobSubsystem;

  constructor(options: MiningEngineOptions) {
    this.roomId =
      options.roomId ??
      (options.characterId ? `solo_${options.characterId}` : `room_${Math.random().toString(36).substring(2, 9)}`);
    this.gameMode = options.gameMode ?? 'singleplayer';
    this.cityId = options.cityId;
    this.seed = options.seed ?? Math.floor(Math.random() * 2147483647);
    this.maxDurationSeconds = options.maxDurationSeconds ?? MINING_CONFIG.MAX_SESSION_DURATION_SECONDS;
    this.onTimeout = options.onTimeout;
    this.onRoomEmpty = options.onRoomEmpty;
    this.mapConfig = options.mapConfig;

    // Generate authoritative grid
    this.grid = generateMiningMap({ seed: this.seed, config: options.mapConfig });

    // Initialize Planck.js rigid body physics world
    this.rigidWorld = new MiningRigidWorld({
      width: options.mapConfig?.gridWidth ?? MINING_CONFIG.GRID_WIDTH,
      height: options.mapConfig?.gridHeight ?? MINING_CONFIG.GRID_HEIGHT,
      gravityEnabled: options.mapConfig?.gravityEnabled ?? true,
      gravity: options.mapConfig?.gravity ?? MINING_CONFIG.GRAVITY,
      dynamiteBounciness: options.mapConfig?.dynamiteBounciness,
      dynamiteFriction: options.mapConfig?.dynamiteFriction,
      dynamiteThrowPower: options.mapConfig?.dynamiteThrowPower,
      rockGravityScale: options.mapConfig?.rockGravityScale,
      rockRestitution: options.mapConfig?.rockRestitution,
    });
    this.rigidWorld.setGrid(this.grid);

    // Initialize subsystems
    this.dataManager = MiningDataManager.getInstance();
    this.playerManager = new MiningPlayerManager(options.characterId || '');
    this.blockSubsystem = new MiningBlockSubsystem();
    this.dropSubsystem = new MiningDropSubsystem();
    this.rockSubsystem = new MiningRockSubsystem();
    this.explosiveSubsystem = new MiningExplosiveSubsystem();
    this.projectileSubsystem = new MiningProjectileSubsystem();
    this.mobSubsystem = new MiningMobSubsystem();

    // Automatically spawn cavern mobs if configured
    this.populateCavernMobs();
    this.spawnSurfaceTargetDummy();

    // If options included an initial character and socket, initialize player session
    if (options.characterId && options.socket) {
      this.addPlayer({
        characterId: options.characterId,
        characterName: options.characterName,
        socket: options.socket,
        miningSpeed: options.miningSpeed,
        miningDamage: options.miningDamage,
        gearLayers: options.gearLayers,
      });
    }
  }

  // ============================================================================
  // Backwards-Compatible Property Accessors
  // ============================================================================

  public get activeRocks(): MiningRockEntity[] {
    return this.rockSubsystem.activeRocks;
  }
  public set activeRocks(val: MiningRockEntity[]) {
    this.rockSubsystem.activeRocks = val;
  }

  public get activeDynamites(): MiningDynamiteEntity[] {
    return this.explosiveSubsystem.activeDynamites;
  }
  public set activeDynamites(val: MiningDynamiteEntity[]) {
    this.explosiveSubsystem.activeDynamites = val;
  }

  public get activeProjectiles(): MiningProjectileEntity[] {
    return this.projectileSubsystem.activeProjectiles;
  }
  public set activeProjectiles(val: MiningProjectileEntity[]) {
    this.projectileSubsystem.activeProjectiles = val;
  }

  public get playerWeaponAmmo(): Map<string, PlayerAmmoState> {
    return this.projectileSubsystem.playerWeaponAmmo;
  }

  public get players(): Map<string, MiningPlayerSession> {
    return this.playerManager.players;
  }

  public get primaryCharacterId(): string {
    return this.playerManager.primaryCharacterId;
  }
  public set primaryCharacterId(val: string) {
    this.playerManager.primaryCharacterId = val;
  }

  public get activeMobs(): Map<string, MiningActiveMobSession> {
    return this.mobSubsystem.activeMobs;
  }

  public get droppedItems(): MiningDroppedItem[] {
    return this.dropSubsystem.droppedItems;
  }
  public set droppedItems(val: MiningDroppedItem[]) {
    this.dropSubsystem.droppedItems = val;
  }

  public get activeItemBodies(): Map<string, planck.Body> {
    return this.dropSubsystem.activeItemBodies;
  }

  public get primarySession(): MiningPlayerSession | undefined {
    return this.playerManager.primarySession;
  }

  public get characterId(): string {
    return this.playerManager.primaryCharacterId;
  }

  public get playerCount(): number {
    return this.playerManager.playerCount;
  }

  public get playerBody(): MiningPlayerBody {
    const s = this.primarySession;
    if (!s) throw new Error('No active primary player session');
    return s.playerBody;
  }

  public get position(): Vector2D {
    return this.primarySession?.playerBody.position ?? { x: MINING_CONFIG.ENTRANCE_X, y: MINING_CONFIG.ENTRANCE_Y };
  }
  public set position(pos: Vector2D) {
    if (this.primarySession) this.primarySession.playerBody.position = { ...pos };
  }

  public get velocity(): Vector2D {
    return this.primarySession?.playerBody.velocity ?? { x: 0, y: 0 };
  }
  public set velocity(vel: Vector2D) {
    if (this.primarySession) this.primarySession.playerBody.velocity = { ...vel };
  }

  public get facing(): Vector2D {
    return this.primarySession?.aimDirection ?? { x: 1, y: 0 };
  }
  public set facing(f: Vector2D) {
    if (this.primarySession) this.primarySession.aimDirection = { ...f };
  }

  public get inputs(): MiningInputState {
    return (
      this.primarySession?.inputs ?? {
        up: false,
        down: false,
        left: false,
        right: false,
        jump: false,
        miningKey: false,
        sequence: 0,
      }
    );
  }
  public set inputs(inp: MiningInputState) {
    if (this.primarySession) this.primarySession.inputs = { ...inp };
  }

  public get temporaryBackpack(): MiningBackpackItem[] {
    return this.primarySession?.temporaryBackpack ?? [];
  }

  public get visionRange(): number {
    return this.primarySession?.visionRange ?? MINING_CONFIG.DEFAULT_VISION_RANGE;
  }
  public set visionRange(val: number) {
    if (this.primarySession) this.primarySession.visionRange = val;
  }

  public get isMining(): boolean {
    return this.primarySession?.isMining ?? false;
  }
  public set isMining(val: boolean) {
    if (this.primarySession) this.primarySession.isMining = val;
  }

  public get miningTarget(): MiningPosition | null {
    return this.primarySession?.miningTarget ?? null;
  }
  public set miningTarget(t: MiningPosition | null) {
    if (this.primarySession) this.primarySession.miningTarget = t;
  }

  public get miningProgressMs(): number {
    return this.primarySession?.miningProgressMs ?? 0;
  }
  public set miningProgressMs(val: number) {
    if (this.primarySession) this.primarySession.miningProgressMs = val;
  }

  public get miningTimeMs(): number {
    return this.primarySession?.miningTimeMs ?? 0;
  }
  public set miningTimeMs(val: number) {
    if (this.primarySession) this.primarySession.miningTimeMs = val;
  }

  public get miningSpeed(): number {
    if (!this.primarySession) return 1.0;
    return typeof this.primarySession.miningSpeed === 'function'
      ? this.primarySession.miningSpeed()
      : this.primarySession.miningSpeed;
  }

  public get isFacingLeft(): boolean {
    return this.primarySession?.isFacingLeft ?? false;
  }

  public get animationState(): 'idle' | 'walk' | 'mine' | 'jump' | 'climb' {
    return this.primarySession?.animationState ?? 'idle';
  }

  // ============================================================================
  // Player Management
  // ============================================================================

  public addPlayer(options: {
    characterId: string;
    characterName?: string;
    socket: Socket;
    miningSpeed?: number | (() => number);
    miningDamage?: number | (() => number);
    gearLayers?: MiningGearLayer[];
  }): MiningPlayerSession {
    const session = this.playerManager.addPlayer(options);
    this.revealAndTrackTiles(session.playerBody.position, session.visionRange);
    return session;
  }

  public removePlayer(characterId: string): { extractedItems: MiningBackpackItem[] } | null {
    const res = this.playerManager.removePlayer(characterId);
    if (this.playerManager.playerCount === 0 && this.onRoomEmpty) {
      this.onRoomEmpty(this.roomId);
    }
    return res;
  }

  public getPlayer(characterId: string): MiningPlayerSession | undefined {
    return this.playerManager.getPlayer(characterId);
  }

  public increaseVisionRange(characterId?: string, amount: number = 1): number {
    return this.playerManager.increaseVisionRange(characterId, amount);
  }

  public setMiningSpeed(speed: number | (() => number), characterId?: string): void {
    this.playerManager.setMiningSpeed(speed, characterId);
  }

  public setSocket(socket: Socket, characterId?: string): void {
    this.playerManager.setSocket(socket, characterId);
  }

  public handleInput(
    characterIdOrInput: string | MiningInputState,
    maybeInput?: MiningInputState
  ): void {
    this.playerManager.handleInput(characterIdOrInput, maybeInput);
  }

  // ============================================================================
  // Simulation Loop Lifecycle
  // ============================================================================

  public start(): void {
    if (this.intervalId) return;
    this.isStopped = false;
    this.intervalId = setInterval(() => {
      this.tick(1 / 30);
    }, 1000 / 30);
  }

  public stop(): void {
    this.isStopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    for (const rock of this.rockSubsystem.activeRocks) {
      if (rock.rigidBody) {
        this.rigidWorld.destroyBody(rock.rigidBody);
      }
    }
    this.rockSubsystem.activeRocks = [];
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

    // 1. Process physics, animations, FoW, and item pickups for all players
    this.playerManager.updatePlayerPhysicsAndFoW(
      dt,
      this.grid,
      (pos, vision) => this.revealAndTrackTiles(pos, vision),
      (session) => this.dropSubsystem.checkItemPickupsForPlayer(session, this.rigidWorld)
    );

    // 2. Step Planck rigid world
    this.rigidWorld.step(dt);

    // 3. Update dropped items physics
    this.dropSubsystem.updateDroppedItemsPhysics();

    // 4. Falling rocks simulation
    this.rockSubsystem.updateFallingRocks(
      dt,
      this.grid,
      this.rigidWorld,
      this.playerManager.players.values(),
      (update) => this.pendingRevealedTiles.push(update)
    );

    // 5. Dynamite continuous physics & fuse countdown simulation
    this.explosiveSubsystem.updateActiveDynamites(dt, (dynamite) => {
      this.explodeDynamite(dynamite);
    });

    // 6. Projectiles continuous physics, collision detection & ammo reloading
    this.projectileSubsystem.updateActiveProjectiles(
      dt,
      this.grid,
      this.activeMobs.values(),
      (mobId, damage) => this.damageMob(mobId, damage),
      (x, y, damage, charId) => {
        const tile = this.grid[y][x];
        if (tile && isTileMineable(tile.type)) {
          tile.damage = (tile.damage || 0) + damage;
          tile.damageMs = tile.damage;
          const newStage = getDamageStage(tile);
          const maxHealth = this.dataManager.getBlockMaxHealth(tile.type);
          if (tile.damage >= maxHealth) {
            const miner = this.players.get(charId);
            this.completeMiningBlock({ x, y }, miner ? [miner] : []);
          } else {
            this.pendingRevealedTiles.push({
              x,
              y,
              type: tile.type,
              damageStage: newStage,
            });
          }
        }
      }
    );

    // 7. Validate & trigger mining actions for each player & cooperative progress
    this.blockSubsystem.updateMiningProgress(
      dt,
      this.playerManager.players.values(),
      this.grid,
      (stageUpdate) => this.pendingRevealedTiles.push(stageUpdate),
      (target, miners) => this.completeMiningBlock(target, miners)
    );

    // 8. Player Melee Attack against Mobs (Terraria-style localized cursor hit scan with obstacle shielding)
    this.playerManager.handleMeleeAttacks(
      this.activeMobs.values(),
      this.grid,
      (mobId, damage, kbX, kbY) => {
        this.damageMob(mobId, damage);
        const mob = this.activeMobs.get(mobId);
        if (mob && mob.mobBody.moveSpeed > 0) {
          mob.mobBody.velocity.x = kbX;
          mob.mobBody.velocity.y = kbY;
          mob.mobBody.isGrounded = false;
        }
      }
    );

    // 9. Update Active Mobs (AI, Physics, Mining, Combat)
    this.mobSubsystem.updateActiveMobs(
      dt,
      this.grid,
      this.playerManager.players,
      this.rigidWorld,
      this.dropSubsystem,
      this.dataManager,
      (update) => this.pendingRevealedTiles.push(update)
    );

    // 10. Broadcast 30 Hz State Tick
    this.broadcastStateTick();
  }

  // ============================================================================
  // Mining Block Excavation & Placement
  // ============================================================================

  public startMining(target: MiningPosition, characterId?: string): boolean {
    const session = characterId ? this.players.get(characterId) : this.primarySession;
    return this.blockSubsystem.startMining(target, session, this.grid);
  }

  public stopMining(characterId?: string): void {
    const session = characterId ? this.players.get(characterId) : this.primarySession;
    this.blockSubsystem.stopMining(session);
  }

  public placeLadder(target?: MiningPosition, characterId?: string): boolean {
    const session = characterId ? this.players.get(characterId) : this.primarySession;
    return this.blockSubsystem.placeLadder(target, session, this.grid, (update) => {
      this.pendingRevealedTiles.push(update);
    });
  }

  public placeTorch(target: MiningPosition, characterId?: string): boolean {
    const session = characterId ? this.players.get(characterId) : this.primarySession;
    return this.blockSubsystem.placeTorch(target, session, this.grid, (update) => {
      this.pendingRevealedTiles.push(update);
    });
  }

  private completeMiningBlock(target: MiningPosition, miners?: MiningPlayerSession[]): void {
    this.blockSubsystem.completeMiningBlock(
      target,
      miners,
      this.grid,
      (pos, prevType) => {
        this.rigidWorld.removeTileCollider(pos.x, pos.y);
        this.pendingRevealedTiles.push({
          x: pos.x,
          y: pos.y,
          type: MiningTileType.EMPTY,
          damageStage: 0,
        });
        this.spawnBlockDrops(pos.x, pos.y, prevType);
        this.rockSubsystem.checkAndTriggerFallingRocks(
          pos.x,
          pos.y,
          this.grid,
          this.rigidWorld,
          (u) => this.pendingRevealedTiles.push(u)
        );
      },
      this.playerManager.players.values()
    );
  }

  public spawnBlockDrops(tx: number, ty: number, tileType: MiningTileType): void {
    this.dropSubsystem.spawnBlockDrops(
      tx,
      ty,
      tileType,
      (t) => this.getBlockConfig(t),
      (id) => this.getItemData(id),
      this.rigidWorld
    );
  }

  public updateDroppedItemsPhysics(): void {
    this.dropSubsystem.updateDroppedItemsPhysics();
  }

  // ============================================================================
  // Data Manager Delegations
  // ============================================================================

  public getBlockConfig(tileType: MiningTileType): any {
    return this.dataManager.getBlockConfig(tileType);
  }

  public getItemData(itemId: string): any {
    return this.dataManager.getItemData(itemId);
  }

  public getItemPhysicsConfig(itemId: string): ItemPhysicsConfig | undefined {
    return this.dataManager.getItemPhysicsConfig(itemId);
  }

  public getDynamiteItemPhysicsConfig(): ItemPhysicsConfig {
    return this.dataManager.getDynamiteItemPhysicsConfig();
  }

  public getItemExplosionRadius(itemId: string): number | undefined {
    return this.dataManager.getItemExplosionRadius(itemId);
  }

  public getItemSoundEffects(itemId: string): ItemSoundEffectsConfig | undefined {
    return this.dataManager.getItemSoundEffects(itemId);
  }

  public getMobData(mobId: string): any {
    return this.dataManager.getMobData(mobId);
  }

  // ============================================================================
  // Explosives & Combat
  // ============================================================================

  public throwDynamite(
    characterId: string,
    target: MiningPosition,
    physicsConfig?: ItemPhysicsConfig,
    forceRatio: number = 1.0,
    explosionRadius?: number,
    itemId?: string,
    soundEffects?: ItemSoundEffectsConfig | null
  ): boolean {
    const session = this.players.get(characterId);
    return this.explosiveSubsystem.throwDynamite(
      session,
      target,
      physicsConfig,
      forceRatio,
      explosionRadius,
      itemId,
      soundEffects,
      this.dataManager,
      this.rigidWorld
    );
  }

  public explodeDynamite(dynamite: MiningDynamiteEntity): void {
    this.explosiveSubsystem.explodeDynamite(
      dynamite,
      this.grid,
      this.rigidWorld,
      this.playerManager.players.values(),
      this.activeMobs.values(),
      (tx, ty, prevType) => this.spawnBlockDrops(tx, ty, prevType),
      (charId) => this.stopMining(charId),
      (mobId, damage) => this.damageMob(mobId, damage),
      (col, highestY) => {
        this.rockSubsystem.checkAndTriggerFallingRocks(
          col,
          highestY,
          this.grid,
          this.rigidWorld,
          (u) => this.pendingRevealedTiles.push(u)
        );
      },
      (u) => this.pendingRevealedTiles.push(u)
    );
  }

  public shootProjectile(
    characterId: string,
    target: Vector2D,
    weaponItemId?: string,
    muzzlePosition?: Vector2D
  ): { success: boolean; error?: string; remainingAmmo?: number; isReloading?: boolean } {
    const session = this.players.get(characterId);
    return this.projectileSubsystem.shootProjectile(
      session,
      target,
      weaponItemId,
      this.dataManager,
      this.rigidWorld,
      muzzlePosition
    );
  }

  public reloadWeapon(
    characterId: string
  ): { success: boolean; error?: string; remainingAmmo?: number; isReloading?: boolean } {
    const session = this.players.get(characterId);
    return this.projectileSubsystem.reloadWeapon(characterId, session, this.dataManager);
  }

  // ============================================================================
  // Mob Subsystem Delegations
  // ============================================================================

  public spawnMob(
    mobData: {
      id?: string;
      name?: string;
      level?: number;
      health?: number;
      attack?: number;
      defense?: number;
      aiType?: string;
      moveSpeed?: number;
      jumpForce?: number;
      miningSpeed?: number;
      aiConfig?: any;
      mineRange?: number;
      animations?: any;
      dropTable?: any;
    },
    position?: Vector2D
  ): MiningActiveMobSession {
    const spawnPos = position || this.findValidCavernSpawnPosition();
    return this.mobSubsystem.spawnMob(mobData, spawnPos);
  }

  public findValidCavernSpawnPosition(minDepth = 5): Vector2D {
    return this.mobSubsystem.findValidCavernSpawnPosition(this.grid, minDepth);
  }

  public populateCavernMobs(options?: { count?: number; minDepth?: number; mobIds?: string[] }): void {
    this.mobSubsystem.populateCavernMobs(this.grid, this.dataManager, this.mapConfig, options);
  }

  public spawnSurfaceTargetDummy(position?: Vector2D): MiningActiveMobSession | null {
    return this.mobSubsystem.spawnSurfaceTargetDummy(this.dataManager, position);
  }

  public updateActiveMobs(dt: number): void {
    this.mobSubsystem.updateActiveMobs(
      dt,
      this.grid,
      this.playerManager.players,
      this.rigidWorld,
      this.dropSubsystem,
      this.dataManager,
      (u) => this.pendingRevealedTiles.push(u)
    );
  }

  public handleMobMining(mob: MiningActiveMobSession, target: MiningPosition, dt: number): void {
    this.mobSubsystem.handleMobMining(
      mob,
      target,
      dt,
      this.grid,
      this.rigidWorld,
      this.dropSubsystem,
      this.dataManager,
      (u) => this.pendingRevealedTiles.push(u)
    );
  }

  public handleMobAttackPlayer(mob: MiningActiveMobSession, player: MiningPlayerSession): void {
    this.mobSubsystem.handleMobAttackPlayer(mob, player);
  }

  public damageMob(instanceId: string, damage: number): void {
    this.mobSubsystem.damageMob(
      instanceId,
      damage,
      this.rigidWorld,
      this.dropSubsystem,
      this.dataManager
    );
  }

  public killMob(mob: MiningActiveMobSession): void {
    this.mobSubsystem.killMob(mob, this.rigidWorld, this.dropSubsystem, this.dataManager);
  }

  public spawnMobDrops(mob: MiningActiveMobSession): void {
    this.mobSubsystem.spawnMobDrops(mob, this.rigidWorld, this.dropSubsystem, this.dataManager);
  }

  public getActiveMobs(): MiningActiveMob[] {
    return this.mobSubsystem.getActiveMobs();
  }

  // ============================================================================
  // FoW Revelation & State Tick Broadcast
  // ============================================================================

  private revealAndTrackTiles(position: MiningPosition, visionRange: number): void {
    const cx = Math.floor(position.x);
    const cy = Math.floor(position.y);
    for (let dy = -visionRange; dy <= visionRange; dy++) {
      for (let dx = -visionRange; dx <= visionRange; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > visionRange) continue;
        const nx = cx + dx;
        const ny = cy + dy;
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
    const fallingRockPayloads: MiningFallingRock[] = this.activeRocks.map((r) => ({
      id: r.id,
      position: { x: r.position.x, y: r.position.y },
      velocity: { x: r.velocity.x, y: r.velocity.y },
      angle: r.angle,
    }));

    const dynamitePayloads: MiningActiveDynamite[] = this.activeDynamites.map((d) => ({
      id: d.id,
      position: { x: d.position.x, y: d.position.y },
      velocity: { x: d.velocity.x, y: d.velocity.y },
      angle: d.angle,
      angularVelocity: d.angularVelocity,
      fuseRemainingSeconds: d.fuseRemainingSeconds,
      physicsConfig: d.physicsConfig,
      itemId: d.itemId,
      soundEffects: d.soundEffects,
      inGameScale: d.inGameScale,
    }));

    const projectilePayloads: MiningActiveProjectile[] = this.activeProjectiles.map((p) => ({
      id: p.id,
      characterId: p.characterId,
      itemId: p.itemId,
      weaponItemId: p.weaponItemId,
      position: { x: p.position.x, y: p.position.y },
      velocity: { x: p.velocity.x, y: p.velocity.y },
      angle: p.angle,
      damage: p.damage,
      spriteUrl: p.spriteUrl,
      inGameScale: p.inGameScale,
    }));

    const activeMobsPayload = this.getActiveMobs();
    const explosionsToSend = this.explosiveSubsystem.consumePendingExplosions();
    const gunshotsToSend = this.projectileSubsystem.consumePendingGunshots();
    const blockHitsToSend = this.blockSubsystem.consumePendingBlockHits();

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
          miningTarget: other.miningTarget ?? undefined,
          isFacingLeft: other.isFacingLeft,
          aimDirection: other.aimDirection,
          flashlightOn: other.flashlightOn,
          animationState: other.animationState,
          gearLayers: other.gearLayers,
        });
      }

      const ammoState = this.playerWeaponAmmo.get(session.characterId);
      const weaponAmmoPayload = ammoState
        ? {
            current: ammoState.currentAmmo,
            max: ammoState.maxAmmo,
            isReloading: ammoState.isReloading,
          }
        : undefined;

      const payload: MiningStateTickPayload = {
        tick: this.tickCount,
        position: { x: session.playerBody.position.x, y: session.playerBody.position.y },
        velocity: { x: session.playerBody.velocity.x, y: session.playerBody.velocity.y },
        isMining: session.isMining,
        miningTarget: session.miningTarget ?? undefined,
        revealedTiles: this.pendingRevealedTiles.length > 0 ? this.pendingRevealedTiles : undefined,
        fallingRocks: fallingRockPayloads.length > 0 ? fallingRockPayloads : undefined,
        activeDynamites: dynamitePayloads.length > 0 ? dynamitePayloads : undefined,
        activeProjectiles: projectilePayloads.length > 0 ? projectilePayloads : undefined,
        mobs: activeMobsPayload.length > 0 ? activeMobsPayload : undefined,
        explosions: explosionsToSend.length > 0 ? explosionsToSend : undefined,
        gunshots: gunshotsToSend.length > 0 ? gunshotsToSend : undefined,
        blockHits: blockHitsToSend.length > 0 ? blockHitsToSend : undefined,
        otherPlayers: otherPlayers.length > 0 ? otherPlayers : undefined,
        weaponAmmo: weaponAmmoPayload,
        droppedItems: this.dropSubsystem.droppedItemsDirty ? this.droppedItems : undefined,
        temporaryBackpack: session.backpackDirty ? session.temporaryBackpack : undefined,
      };

      session.socket.emit('mining_state_tick', payload);
      session.backpackDirty = false;
    }

    this.dropSubsystem.droppedItemsDirty = false;
    this.pendingRevealedTiles = [];
  }

  private handleSessionTimeout(): void {
    console.log(`[Mining] Room ${this.roomId} timed out (${this.elapsedTimeSeconds.toFixed(1)}s elapsed)`);
    this.stop();

    for (const session of this.players.values()) {
      if (session.socket && session.socket.connected) {
        session.socket.emit('mining_session_timeout', {
          extractedItems: session.temporaryBackpack,
          message: 'Your mining session has reached the 15-minute time limit. You have been returned to the surface with your extracted items.',
        });
      }
    }

    if (this.onTimeout) {
      this.onTimeout(this.primaryCharacterId || this.roomId);
    }
  }
}
