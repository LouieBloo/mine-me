import type {
  MiningActiveDynamite,
  MiningActiveMob,
  MiningActiveProjectile,
  MiningDynamiteDynamic,
  MiningMobDynamic,
  MiningProjectileDynamic,
  MiningRemotePlayer,
  MiningRemotePlayerDynamic,
  MiningSessionClientState,
  MiningSpawnedEntities,
} from '@mine-me/shared';

// Fields that change every tick. They are not kept in a stored definition: a tick that omits one
// (JSON drops `undefined`, e.g. a mob that stopped mining) must not inherit a stale value.
const MOB_DYNAMIC_KEYS = ['position', 'velocity', 'health', 'isFacingLeft', 'isMining', 'miningTarget', 'animationState'] as const;
const PLAYER_DYNAMIC_KEYS = ['position', 'velocity', 'isMining', 'miningTarget', 'isFacingLeft', 'aimDirection', 'flashlightOn', 'animationState'] as const;
const PROJECTILE_DYNAMIC_KEYS = ['position', 'velocity', 'angle'] as const;
const DYNAMITE_DYNAMIC_KEYS = ['position', 'velocity', 'angle', 'angularVelocity', 'fuseRemainingSeconds'] as const;

function staticPart<T>(entity: T, dynamicKeys: readonly string[]): T {
  const copy = { ...entity } as Record<string, unknown>;
  for (const key of dynamicKeys) delete copy[key];
  return copy as T;
}

/**
 * Entities are described to the client once (in the join snapshot, or a tick's `spawned` block);
 * every tick after that carries only the fields that change. This cache keeps the static part and
 * merges it back with each tick's dynamic part, so the rest of the client keeps working with full
 * entities.
 */
export class EntityDefinitionCache {
  private readonly mobs = new Map<string, MiningActiveMob>();
  private readonly players = new Map<string, MiningRemotePlayer>();
  private readonly projectiles = new Map<string, MiningActiveProjectile>();
  private readonly dynamites = new Map<string, MiningActiveDynamite>();
  private readonly warned = new Set<string>();

  /** Records everything the join snapshot describes. */
  public seedFromSnapshot(state?: Pick<MiningSessionClientState, 'mobs' | 'otherPlayers' | 'activeDynamites'>): void {
    if (!state) return;
    this.applySpawned({ mobs: state.mobs, players: state.otherPlayers, dynamites: state.activeDynamites });
  }

  /** Records (or replaces) definitions the server just sent. Call before hydrating the same tick. */
  public applySpawned(spawned?: MiningSpawnedEntities): void {
    if (!spawned) return;
    spawned.mobs?.forEach((m) => this.mobs.set(m.id, staticPart(m, MOB_DYNAMIC_KEYS)));
    spawned.players?.forEach((p) => this.players.set(p.characterId, staticPart(p, PLAYER_DYNAMIC_KEYS)));
    spawned.projectiles?.forEach((p) => this.projectiles.set(p.id, staticPart(p, PROJECTILE_DYNAMIC_KEYS)));
    spawned.dynamites?.forEach((d) => this.dynamites.set(d.id, staticPart(d, DYNAMITE_DYNAMIC_KEYS)));
  }

  /**
   * Merges a tick's dynamic entries with their definitions, and forgets definitions of entities
   * that are no longer present. Entries whose definition is missing are skipped (and reported once).
   * `undefined` means "no information this tick": nothing is merged or forgotten.
   */
  public hydrateMobs(dynamic: MiningMobDynamic[] | undefined): MiningActiveMob[] | undefined {
    return this.hydrate('mob', this.mobs, dynamic, (d) => d.id);
  }

  public hydratePlayers(dynamic: MiningRemotePlayerDynamic[] | undefined): MiningRemotePlayer[] | undefined {
    return this.hydrate('player', this.players, dynamic, (d) => d.characterId);
  }

  public hydrateProjectiles(dynamic: MiningProjectileDynamic[] | undefined): MiningActiveProjectile[] | undefined {
    return this.hydrate('projectile', this.projectiles, dynamic, (d) => d.id);
  }

  public hydrateDynamites(dynamic: MiningDynamiteDynamic[] | undefined): MiningActiveDynamite[] | undefined {
    return this.hydrate('dynamite', this.dynamites, dynamic, (d) => d.id);
  }

  private hydrate<D, F>(
    kind: string,
    definitions: Map<string, F>,
    dynamic: D[] | undefined,
    idOf: (d: D) => string
  ): F[] | undefined {
    if (!dynamic) return undefined;

    const present = new Set<string>();
    const result: F[] = [];
    for (const entry of dynamic) {
      const id = idOf(entry);
      present.add(id);
      const definition = definitions.get(id);
      if (definition) {
        result.push({ ...definition, ...entry });
      } else if (!this.warned.has(`${kind}:${id}`)) {
        this.warned.add(`${kind}:${id}`);
        console.warn(`[EntityDefinitionCache] No definition for ${kind} ${id}; skipping until it is described`);
      }
    }

    for (const id of definitions.keys()) {
      if (!present.has(id)) {
        definitions.delete(id);
        this.warned.delete(`${kind}:${id}`);
      }
    }
    return result;
  }

  public clear(): void {
    this.mobs.clear();
    this.players.clear();
    this.projectiles.clear();
    this.dynamites.clear();
    this.warned.clear();
  }
}
