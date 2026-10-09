import type {
  MiningActiveDynamite,
  MiningActiveMob,
  MiningActiveProjectile,
  MiningDynamiteDynamic,
  MiningMobDynamic,
  MiningProjectileDynamic,
  MiningRemotePlayer,
  MiningRemotePlayerDynamic,
  MiningSpawnedEntities,
} from '@mine-me/shared';
import type { MiningDynamiteEntity } from './physics/MiningDynamiteEntity';
import type { MiningProjectileEntity } from './physics/MiningProjectileEntity';
import type { MiningActiveMobSession } from './subsystems/MiningMobSubsystem';
import type { MiningPlayerSession } from './subsystems/MiningPlayerManager';

/**
 * Entity descriptions split by how often they change.
 *
 * Every tick carries only an entity's dynamic fields (position, health, animation state...). Its
 * static description (sprites, animation manifests, physics config, gear...) is sent once to each
 * client in the tick's `spawned` block, and again only if it changes (a player's gear). The server
 * remembers what each session has been sent in `KnownEntities`.
 */
export interface KnownEntities {
  mobs: Set<string>;
  /** characterId -> the gear version that was sent. */
  players: Map<string, number>;
  projectiles: Set<string>;
  dynamites: Set<string>;
}

export const createKnownEntities = (): KnownEntities => ({
  mobs: new Set(),
  players: new Map(),
  projectiles: new Set(),
  dynamites: new Set(),
});

const vec = (v: { x: number; y: number }) => ({ x: v.x, y: v.y });

// ---- Mobs -------------------------------------------------------------------------------------

export function mobDynamic(mob: MiningActiveMobSession): MiningMobDynamic {
  return {
    id: mob.id,
    position: vec(mob.mobBody.position),
    velocity: vec(mob.mobBody.velocity),
    health: mob.health,
    isFacingLeft: mob.isFacingLeft,
    isMining: mob.isMining,
    miningTarget: mob.miningTarget ?? undefined,
    animationState: mob.animationState,
  };
}

/** The complete description of a mob (used for spawn blocks and the join snapshot). */
export function toActiveMob(mob: MiningActiveMobSession): MiningActiveMob {
  return {
    ...mobDynamic(mob),
    mobId: mob.mobId,
    name: mob.name,
    maxHealth: mob.maxHealth,
    attack: mob.attack,
    defense: mob.defense,
    animations: mob.animations,
    spriteUrl: mob.spriteUrl,
    colliderWidth: mob.colliderWidth,
    colliderHeight: mob.colliderHeight,
    showHealthBar: mob.showHealthBar,
  };
}

// ---- Projectiles ------------------------------------------------------------------------------

export function projectileDynamic(p: MiningProjectileEntity): MiningProjectileDynamic {
  return { id: p.id, position: vec(p.position), velocity: vec(p.velocity), angle: p.angle };
}

export function projectileDefinition(p: MiningProjectileEntity): MiningActiveProjectile {
  return {
    ...projectileDynamic(p),
    characterId: p.characterId,
    itemId: p.itemId,
    weaponItemId: p.weaponItemId,
    damage: p.damage,
    spriteUrl: p.spriteUrl,
    inGameScale: p.inGameScale,
  };
}

// ---- Dynamites --------------------------------------------------------------------------------

export function dynamiteDynamic(d: MiningDynamiteEntity): MiningDynamiteDynamic {
  return {
    id: d.id,
    position: vec(d.position),
    velocity: vec(d.velocity),
    angle: d.angle,
    angularVelocity: d.angularVelocity,
    fuseRemainingSeconds: d.fuseRemainingSeconds,
  };
}

export function dynamiteDefinition(d: MiningDynamiteEntity): MiningActiveDynamite {
  return {
    ...dynamiteDynamic(d),
    physicsConfig: d.physicsConfig,
    explosionRadius: d.explosionRadius,
    itemId: d.itemId,
    soundEffects: d.soundEffects,
    inGameScale: d.inGameScale,
  };
}

// ---- Remote players ---------------------------------------------------------------------------

export function playerDynamic(p: MiningPlayerSession): MiningRemotePlayerDynamic {
  return {
    characterId: p.characterId,
    position: vec(p.playerBody.position),
    velocity: vec(p.playerBody.velocity),
    isMining: p.isMining,
    miningTarget: p.miningTarget ?? undefined,
    isFacingLeft: p.isFacingLeft,
    aimDirection: p.aimDirection,
    flashlightOn: p.flashlightOn,
    animationState: p.animationState,
  };
}

export function toRemotePlayer(p: MiningPlayerSession): MiningRemotePlayer {
  return { ...playerDynamic(p), characterName: p.characterName, gearLayers: p.gearLayers };
}

// ---- Per-session spawn diff -------------------------------------------------------------------

export interface WorldEntities {
  mobs: MiningActiveMobSession[];
  projectiles: MiningProjectileEntity[];
  dynamites: MiningDynamiteEntity[];
  /** The other players in the room (never the recipient). */
  others: MiningPlayerSession[];
}

/**
 * Works out which entity definitions this session still needs, records them as sent, and forgets
 * entities that no longer exist so ids can't leak. Returns undefined when there is nothing new.
 */
export function collectSpawned(known: KnownEntities, world: WorldEntities): MiningSpawnedEntities | undefined {
  const spawned: MiningSpawnedEntities = {};

  const diff = <T extends { id: string }, D>(
    seen: Set<string>,
    current: T[],
    define: (entity: T) => D
  ): D[] | undefined => {
    const fresh: D[] = [];
    const present = new Set<string>();
    for (const entity of current) {
      present.add(entity.id);
      if (!seen.has(entity.id)) {
        seen.add(entity.id);
        fresh.push(define(entity));
      }
    }
    for (const id of seen) if (!present.has(id)) seen.delete(id);
    return fresh.length > 0 ? fresh : undefined;
  };

  const mobs = diff(known.mobs, world.mobs, toActiveMob);
  if (mobs) spawned.mobs = mobs;
  const projectiles = diff(known.projectiles, world.projectiles, projectileDefinition);
  if (projectiles) spawned.projectiles = projectiles;
  const dynamites = diff(known.dynamites, world.dynamites, dynamiteDefinition);
  if (dynamites) spawned.dynamites = dynamites;

  // Players are re-sent when their gear version changes (they can equip gear mid-run)
  const freshPlayers: MiningRemotePlayer[] = [];
  const presentPlayers = new Set<string>();
  for (const other of world.others) {
    presentPlayers.add(other.characterId);
    if (known.players.get(other.characterId) !== other.gearVersion) {
      known.players.set(other.characterId, other.gearVersion);
      freshPlayers.push(toRemotePlayer(other));
    }
  }
  for (const id of known.players.keys()) if (!presentPlayers.has(id)) known.players.delete(id);
  if (freshPlayers.length > 0) spawned.players = freshPlayers;

  return Object.keys(spawned).length > 0 ? spawned : undefined;
}
