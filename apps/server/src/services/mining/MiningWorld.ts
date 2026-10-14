import type { MiningMapConfigData, MiningPosition, MiningRigidWorld, MiningTileType } from '@mine-me/shared';
import type { ServerMiningGrid } from '../miningMap.service';
import type { MiningDamageSystem } from './MiningDamageSystem';
import type { MiningBlockSubsystem } from './subsystems/MiningBlockSubsystem';
import type { MiningDataManager } from './subsystems/MiningDataManager';
import type { MiningDropSubsystem } from './subsystems/MiningDropSubsystem';
import type { MiningFluidSubsystem } from './subsystems/MiningFluidSubsystem';
import type { MiningIgnitionSubsystem } from './subsystems/MiningIgnitionSubsystem';
import type { MiningFireSubsystem } from './subsystems/MiningFireSubsystem';
import type { MiningExplosiveSubsystem } from './subsystems/MiningExplosiveSubsystem';
import type { MiningMobSubsystem } from './subsystems/MiningMobSubsystem';
import type { MiningPlayerManager, MiningPlayerSession } from './subsystems/MiningPlayerManager';
import type { MiningProjectileSubsystem } from './subsystems/MiningProjectileSubsystem';
import type { MiningRockSubsystem } from './subsystems/MiningRockSubsystem';

/** A change to one tile that clients must be told about this tick. */
export interface PendingTileUpdate {
  x: number;
  y: number;
  type: MiningTileType;
  damageStage?: number;
}

/**
 * Everything a mining subsystem may reach in the room it belongs to, handed to it once when it is
 * created. Subsystems depend on this interface (not on each other's constructors or the engine),
 * so their methods take only domain arguments, and tests can supply a stand-in world.
 *
 * Reading these goes through getters, so a subsystem always sees the room's current state even
 * though the subsystems are created before the rest of the room exists.
 */
export interface MiningWorld {
  // ---- Shared state ---------------------------------------------------------------------------
  readonly grid: ServerMiningGrid;
  readonly rigidWorld: MiningRigidWorld;
  readonly data: MiningDataManager;
  readonly mapConfig?: Partial<MiningMapConfigData>;
  readonly players: ReadonlyMap<string, MiningPlayerSession>;
  /** Where players start and respawn: the entrance, on the ground surface. */
  readonly spawnPoint: { x: number; y: number };
  /** Simulation time in seconds (advances one fixed step per tick). */
  readonly simTime: number;
  /** Number of simulation ticks run so far. */
  readonly tick: number;

  // ---- Collaborating systems ------------------------------------------------------------------
  readonly playerManager: MiningPlayerManager;
  readonly blocks: MiningBlockSubsystem;
  readonly drops: MiningDropSubsystem;
  readonly rocks: MiningRockSubsystem;
  readonly explosives: MiningExplosiveSubsystem;
  readonly projectiles: MiningProjectileSubsystem;
  readonly mobs: MiningMobSubsystem;
  readonly fluids: MiningFluidSubsystem;
  /** Where fire starts: sparks from items, blasts and (later) fire itself. */
  readonly ignition: MiningIgnitionSubsystem;
  /** Fire burning through the mine's fuel. */
  readonly fire: MiningFireSubsystem;
  /** The one place hits are applied (see MiningDamageSystem). */
  readonly damage: MiningDamageSystem;

  // ---- Effects owned by the room --------------------------------------------------------------
  /** Tells clients a tile changed (broken, cracked, placed...). */
  pushTileUpdate(update: PendingTileUpdate): void;
  /** Reveals fog of war around a position (used when a player moves). */
  revealAround(position: MiningPosition, visionRange: number): void;
  /** A player's health changed; keeps the app's health bar in step. */
  notifyPlayerHealth(characterId: string, health: number, maxHealth: number): void;
  /** A player's health reached 0; their run ends after the current tick. */
  queuePlayerDeath(characterId: string): void;
}
