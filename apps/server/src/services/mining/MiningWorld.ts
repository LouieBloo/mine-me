import type { BiomeField, MiningMapConfigData, MiningPosition, MiningRigidWorld, MiningTileType, PieceOffset } from '@mine-me/shared';
import type { ServerMiningGrid } from '../miningMap.service';
import type { MiningDamageSystem } from './MiningDamageSystem';
import type { MiningBlockSubsystem } from './subsystems/MiningBlockSubsystem';
import type { MiningDataManager } from './subsystems/MiningDataManager';
import type { MiningDropSubsystem } from './subsystems/MiningDropSubsystem';
import type { MiningDoodadSubsystem } from './subsystems/MiningDoodadSubsystem';
import type { MiningFluidSubsystem } from './subsystems/MiningFluidSubsystem';
import type { MiningBurningSubsystem } from './subsystems/MiningBurningSubsystem';
import type { MiningBeltSubsystem } from './subsystems/MiningBeltSubsystem';
import type { MiningExtractorSubsystem } from './subsystems/MiningExtractorSubsystem';
import type { MiningGasSubsystem } from './subsystems/MiningGasSubsystem';
import type { MiningGasExplosionSubsystem } from './subsystems/MiningGasExplosionSubsystem';
import type { MiningIgnitionSubsystem } from './subsystems/MiningIgnitionSubsystem';
import type { MiningFireSubsystem } from './subsystems/MiningFireSubsystem';
import type { MiningExplosiveSubsystem } from './subsystems/MiningExplosiveSubsystem';
import type { MiningMobSubsystem } from './subsystems/MiningMobSubsystem';
import type { MiningPlayerManager, MiningPlayerSession } from './subsystems/MiningPlayerManager';
import type { MiningProjectileSubsystem } from './subsystems/MiningProjectileSubsystem';
import type { MiningRockSubsystem } from './subsystems/MiningRockSubsystem';
import type { MissionTracker } from './missions/MissionTracker';

/** A change to one tile that clients must be told about this tick. */
export interface PendingTileUpdate {
  x: number;
  y: number;
  type: MiningTileType;
  damageStage?: number;
  /** Set when the cell is part of a multi-cell piece: [column, row] inside it. */
  piece?: PieceOffset;
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
  /** Follows the run's mission (absent: the run has none). */
  readonly missions: MissionTracker | null;
  readonly grid: ServerMiningGrid;
  readonly rigidWorld: MiningRigidWorld;
  readonly data: MiningDataManager;
  readonly mapConfig?: Partial<MiningMapConfigData>;
  readonly players: ReadonlyMap<string, MiningPlayerSession>;
  /** First ground row: rows above it are open sky. Depths (mob spawning, the entrance zone) are counted from here. */
  readonly surfaceRow: number;
  /** Which biome each cell is in (absent: the whole mine is the default biome). Rows are rows of the whole map, sky included. */
  readonly biomeField?: BiomeField | null;
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
  /** Gases drifting through the mine (hydrogen, nitrogen...). */
  readonly gases: MiningGasSubsystem;
  /** Explosive gas going off as a front. */
  readonly gasExplosions: MiningGasExplosionSubsystem;
  /** Where fire starts: sparks from items, blasts and (later) fire itself. */
  readonly ignition: MiningIgnitionSubsystem;
  /** Fire burning through the mine's fuel. */
  readonly fire: MiningFireSubsystem;
  /** Fire hurting bodies (and the belt). */
  readonly burning: MiningBurningSubsystem;
  /** The scenery: doodads, their reveal and removal. */
  readonly doodads: MiningDoodadSubsystem;
  /** The conveyor belt going down from the extractor; absent in modes without an extractor. */
  readonly belt: MiningBeltSubsystem | null;
  /** The extractor on the surface; absent in modes without one. */
  readonly extractor: MiningExtractorSubsystem | null;
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
