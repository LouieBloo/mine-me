import {
  DEFAULT_DYNAMITE_PHYSICS_CONFIG,
  MiningTileType,
  SOL_CURRENCY_SUBTYPE,
  findCurrencyItem,
  isThrowableItem,
  type BiomeDefinition,
  type SurfaceEnvironmentDefinition,
  type DoodadDefinition,
  type MissionDefinition,
  type CharacterSoundEffectsConfig,
  type FluidDefinition,
  type ExtractorDefinition,
  type GasDefinition,
  pickDefaultExtractor,
  type GameItem,
  type Mob,
  type MiningBlockConfig,
  type ParticleEffect,
  type ItemPhysicsConfig,
  type ItemSoundEffectsConfig,
  PLACED_ITEM_TILES,
  getTileDefinition,
} from '@mine-me/shared';

/** Static game definitions, in the shape the admin tools / Prisma produce. */
export interface GameDefinitions {
  items: GameItem[];
  mobs: Mob[];
  blocks: MiningBlockConfig[];
  /** Fluids (oil...). Absent means none are defined. */
  fluids?: FluidDefinition[];
  /** Gases (hydrogen...). Absent means none are defined. */
  gases?: GasDefinition[];
  /** Biomes. Absent means none are defined (the generator uses a built-in default biome everywhere). */
  biomes?: BiomeDefinition[];
  /** Doodads (mushrooms, drips...). Absent means none are defined: the mine has no decoration. */
  doodads?: DoodadDefinition[];
  /** Missions (ticket 108). Absent means none are defined: runs have no mission. */
  missions?: MissionDefinition[];
  /** Surface environments: the sky, scenery and weather above the ground (ticket 129). Absent means none are defined (a built-in plain day is used). */
  surfaceEnvironments?: SurfaceEnvironmentDefinition[];
  /** Extractors. Absent means none are defined (the built-in default is used). */
  extractors?: ExtractorDefinition[];
  /** The particle effect library, so fluids and fire can name an effect by id. Absent means none. */
  particleEffects?: ParticleEffect[];
  /** The player character's resolved sounds (hurt, jump...). Missing means none are set. */
  characterSounds?: CharacterSoundEffectsConfig;
}

const TILE_TYPE_KEYS: Record<number, string> = {
  [MiningTileType.DIRT]: 'DIRT',
  [MiningTileType.ROCK]: 'ROCK',
  [MiningTileType.COPPERIUM]: 'COPPERIUM',
  [MiningTileType.SILVERIUM]: 'SILVERIUM',
  [MiningTileType.LAVAROCK]: 'LAVAROCK',
  [MiningTileType.STONE]: 'STONE',
  [MiningTileType.CLAY]: 'CLAY',
  [MiningTileType.SANDSTONE]: 'SANDSTONE',
  [MiningTileType.GRAVEL]: 'GRAVEL',
  [MiningTileType.ICE]: 'ICE',
  [MiningTileType.BEDROCK]: 'BEDROCK',
};

/** The block key of a tile type (e.g. 'DIRT'), or undefined when the tile type is not a block with a definition. */
export function blockKeyForTileType(type: MiningTileType): string | undefined {
  return TILE_TYPE_KEYS[type];
}

/** The tile type of a block key (e.g. 'ROCK'), or undefined when no block has that key. */
export function tileTypeForBlockKey(key: string): MiningTileType | undefined {
  const entry = Object.entries(TILE_TYPE_KEYS).find(([, k]) => k === key);
  return entry ? (Number(entry[0]) as MiningTileType) : undefined;
}

/** Every tile type that is a block with a definition (dirt, rock, ores, chests...): new ones are listed automatically. */
export const BLOCK_TILE_TYPES: readonly MiningTileType[] = Object.keys(TILE_TYPE_KEYS).map(Number) as MiningTileType[];

/**
 * MiningDataManager serves static game definitions (items, blocks, mobs) from memory.
 *
 * Definitions are loaded once at startup (from Postgres in the running server, see
 * `definitionLoaders.ts`) and installed with `MiningDataManager.initialize`. Nothing here touches
 * the database or filesystem at runtime, so it is safe to call from inside the 30 Hz tick.
 * There is intentionally no refresh: edits made in the admin app apply after a server restart.
 */
export class MiningDataManager {
  private static instance: MiningDataManager | null = null;

  private readonly items: GameItem[];
  private readonly mobs: Mob[];
  private readonly blocksByTypeKey = new Map<string, MiningBlockConfig>();
  private readonly fluids: FluidDefinition[] = [];
  private readonly fluidsByTypeKey = new Map<string, FluidDefinition>();
  private readonly fluidsById = new Map<string, FluidDefinition>();
  private readonly gases: GasDefinition[] = [];
  private readonly gasesByTypeKey = new Map<string, GasDefinition>();
  private readonly gasesById = new Map<string, GasDefinition>();
  private readonly biomes: BiomeDefinition[] = [];
  private readonly biomesByKey = new Map<string, BiomeDefinition>();
  private readonly biomesById = new Map<string, BiomeDefinition>();
  private readonly doodads: DoodadDefinition[] = [];
  private readonly doodadsByKey = new Map<string, DoodadDefinition>();
  private readonly doodadsById = new Map<string, DoodadDefinition>();
  private readonly missions: MissionDefinition[] = [];
  private readonly missionsById = new Map<string, MissionDefinition>();
  private readonly surfaceEnvironments: SurfaceEnvironmentDefinition[] = [];
  private readonly surfaceEnvironmentsByKey = new Map<string, SurfaceEnvironmentDefinition>();
  private readonly extractors: ExtractorDefinition[] = [];
  private readonly extractorsByKey = new Map<string, ExtractorDefinition>();
  private readonly extractorsById = new Map<string, ExtractorDefinition>();
  private readonly particleEffectsById = new Map<string, ParticleEffect>();

  private readonly itemsById = new Map<string, GameItem>();
  private readonly itemsByKey = new Map<string, GameItem>();
  private readonly itemsByIdLower = new Map<string, GameItem>();
  private readonly itemsByKeyLower = new Map<string, GameItem>();
  private readonly itemsByNameLower = new Map<string, GameItem>();

  private readonly mobsById = new Map<string, Mob>();
  private readonly characterSounds: CharacterSoundEffectsConfig;
  private readonly mobsByNameLower = new Map<string, Mob>();

  constructor(definitions: GameDefinitions) {
    this.characterSounds = definitions.characterSounds ?? {};
    this.items = definitions.items;
    this.mobs = definitions.mobs;

    for (const block of definitions.blocks) {
      if (block?.typeKey && !this.blocksByTypeKey.has(block.typeKey)) {
        this.blocksByTypeKey.set(block.typeKey, block);
      }
    }
    for (const effect of definitions.particleEffects ?? []) {
      if (effect?.id && !this.particleEffectsById.has(effect.id)) this.particleEffectsById.set(effect.id, effect);
    }
    for (const fluid of definitions.fluids ?? []) {
      if (!fluid?.typeKey || this.fluidsByTypeKey.has(fluid.typeKey)) continue;
      this.fluids.push(fluid);
      this.fluidsByTypeKey.set(fluid.typeKey, fluid);
      MiningDataManager.putFirst(this.fluidsById, fluid.id, fluid);
    }
    for (const gas of definitions.gases ?? []) {
      if (!gas?.typeKey || this.gasesByTypeKey.has(gas.typeKey)) continue;
      this.gases.push(gas);
      this.gasesByTypeKey.set(gas.typeKey, gas);
      MiningDataManager.putFirst(this.gasesById, gas.id, gas);
    }
    for (const biome of definitions.biomes ?? []) {
      if (!biome?.key || this.biomesByKey.has(biome.key)) continue;
      this.biomes.push(biome);
      this.biomesByKey.set(biome.key, biome);
      MiningDataManager.putFirst(this.biomesById, biome.id, biome);
    }
    for (const mission of definitions.missions ?? []) {
      if (!mission?.id || this.missionsById.has(mission.id)) continue;
      this.missions.push(mission);
      this.missionsById.set(mission.id, mission);
    }
    for (const env of definitions.surfaceEnvironments ?? []) {
      if (!env?.key || this.surfaceEnvironmentsByKey.has(env.key)) continue;
      this.surfaceEnvironments.push(env);
      this.surfaceEnvironmentsByKey.set(env.key, env);
    }
    for (const doodad of definitions.doodads ?? []) {
      if (!doodad?.key || this.doodadsByKey.has(doodad.key)) continue;
      this.doodads.push(doodad);
      this.doodadsByKey.set(doodad.key, doodad);
      MiningDataManager.putFirst(this.doodadsById, doodad.id, doodad);
    }
    for (const extractor of definitions.extractors ?? []) {
      if (!extractor?.key || this.extractorsByKey.has(extractor.key)) continue;
      this.extractors.push(extractor);
      this.extractorsByKey.set(extractor.key, extractor);
      MiningDataManager.putFirst(this.extractorsById, extractor.id, extractor);
    }
    for (const item of this.items) {
      MiningDataManager.putFirst(this.itemsById, item.id, item);
      MiningDataManager.putFirst(this.itemsByKey, item.itemKey, item);
      MiningDataManager.putFirst(this.itemsByIdLower, item.id?.toLowerCase(), item);
      MiningDataManager.putFirst(this.itemsByKeyLower, item.itemKey?.toLowerCase(), item);
      MiningDataManager.putFirst(this.itemsByNameLower, item.name?.toLowerCase(), item);
    }
    for (const mob of this.mobs) {
      MiningDataManager.putFirst(this.mobsById, mob.id, mob);
      MiningDataManager.putFirst(this.mobsByNameLower, mob.name?.toLowerCase(), mob);
    }
  }

  private static putFirst<T>(map: Map<string, T>, key: unknown, value: T): void {
    if (typeof key === 'string' && key.length > 0 && !map.has(key)) map.set(key, value);
  }

  /** Installs the definitions used by the running process. Call once at startup. */
  public static initialize(definitions: GameDefinitions): MiningDataManager {
    MiningDataManager.instance = new MiningDataManager(definitions);
    return MiningDataManager.instance;
  }

  public static isInitialized(): boolean {
    return MiningDataManager.instance !== null;
  }

  public static getInstance(): MiningDataManager {
    if (!MiningDataManager.instance) {
      throw new Error(
        'MiningDataManager has not been initialized: game definitions must be loaded before the mining engine is used.'
      );
    }
    return MiningDataManager.instance;
  }

  /** Test helper: forget the installed definitions. */
  public static reset(): void {
    MiningDataManager.instance = null;
  }

  /** The player character's sounds, resolved to playable urls (empty if none are set). */
  public getCharacterSounds(): CharacterSoundEffectsConfig {
    return this.characterSounds;
  }

  /**
   * Helper to retrieve block configuration by tile type.
   */
  public getBlockConfig(tileType: MiningTileType): MiningBlockConfig | undefined {
    const key = TILE_TYPE_KEYS[tileType];
    return key ? this.blocksByTypeKey.get(key) : undefined;
  }

  /**
   * Helper to retrieve block max health.
   */
  public getBlockMaxHealth(tileType: MiningTileType): number {
    const config = this.getBlockConfig(tileType);
    if (config && typeof config.health === 'number' && config.health > 0) {
      return config.health;
    }
    // A tile an item places (a bridge) has no block row: its health is the tile's own
    if (PLACED_ITEM_TILES.some((p) => p.tileType === tileType)) {
      const own = getTileDefinition(tileType).health;
      if (own) return own;
    }
    return 100;
  }

  /**
   * Pick power a tool needs to damage this block type (0 = anything can mine it).
   */
  public getBlockRequiredPickPower(tileType: MiningTileType): number {
    const required = this.getBlockConfig(tileType)?.requiredPickPower;
    return typeof required === 'number' && required > 0 ? required : 0;
  }

  /** A particle effect from the library by id (undefined if there is none with that id). */
  public getParticleEffect(id: string | null | undefined): ParticleEffect | undefined {
    return typeof id === 'string' ? this.particleEffectsById.get(id) : undefined;
  }

  /** All fluid definitions, in load order (the first of any duplicated typeKey wins). */
  public getFluids(): FluidDefinition[] {
    return this.fluids;
  }

  /** Fluid definition by typeKey (e.g. 'OIL') or by database id. */
  public getFluid(keyOrId: string): FluidDefinition | undefined {
    if (typeof keyOrId !== 'string') return undefined;
    return this.fluidsByTypeKey.get(keyOrId) ?? this.fluidsById.get(keyOrId);
  }

  /** All extractor definitions, in load order (the first of any duplicated key wins). */
  public getExtractors(): ExtractorDefinition[] {
    return this.extractors;
  }

  /** Extractor definition by key (e.g. 'basic_extractor') or by database id. */
  public getExtractor(keyOrId: string): ExtractorDefinition | undefined {
    if (typeof keyOrId !== 'string') return undefined;
    return this.extractorsByKey.get(keyOrId) ?? this.extractorsById.get(keyOrId);
  }

  /** The extractor a run lands: the one marked default, else the first, else the built-in one. Never undefined. */
  public getDefaultExtractor(): ExtractorDefinition {
    return pickDefaultExtractor(this.extractors);
  }

  /** All biome definitions, in load order (the first of any duplicated key wins). May be empty: see `BiomeField` for the default. */
  public getBiomes(): BiomeDefinition[] {
    return this.biomes;
  }

  /** All surface environments, in load order. May be empty (the sky is then the built-in plain day). */
  public getSurfaceEnvironments(): SurfaceEnvironmentDefinition[] {
    return this.surfaceEnvironments;
  }

  /** Surface environment by key or database id. */
  public getSurfaceEnvironment(keyOrId: string): SurfaceEnvironmentDefinition | undefined {
    return this.surfaceEnvironmentsByKey.get(keyOrId) ?? this.surfaceEnvironments.find((e) => e.id === keyOrId);
  }

  /** All mission definitions, in load order. May be empty. */
  public getMissions(): MissionDefinition[] {
    return this.missions;
  }

  /** Mission definition by database id or key. */
  public getMission(idOrKey: string): MissionDefinition | undefined {
    return this.missionsById.get(idOrKey) ?? this.missions.find((m) => m.key === idOrKey);
  }

  /** Blocks whose drop table can give an item, with the expected quantity of it per block broken (for the mission map guarantees). */
  public getBlocksDropping(itemId: string): { typeKey: string; tileType: MiningTileType; expectedPerBlock: number }[] {
    const out: { typeKey: string; tileType: MiningTileType; expectedPerBlock: number }[] = [];
    for (const [typeKey, config] of this.blocksByTypeKey) {
      const tileType = tileTypeForBlockKey(typeKey);
      if (tileType === undefined) continue;
      const expected = (config.dropTable?.items ?? [])
        .filter((entry) => entry.itemId === itemId)
        .reduce((sum, entry) => sum + (entry.chance / 100) * ((entry.minQuantity + entry.maxQuantity) / 2), 0);
      if (expected > 0) out.push({ typeKey, tileType, expectedPerBlock: expected });
    }
    return out;
  }

  /** All doodad definitions, in load order (the first of any duplicated key wins). May be empty. */
  public getDoodads(): DoodadDefinition[] {
    return this.doodads;
  }

  /** Doodad definition by key (e.g. 'glow_mushroom') or by database id. */
  public getDoodad(keyOrId: string): DoodadDefinition | undefined {
    return this.doodadsByKey.get(keyOrId) ?? this.doodadsById.get(keyOrId);
  }

  /** Biome definition by key (e.g. 'frozen_caves') or by database id. */
  public getBiome(keyOrId: string): BiomeDefinition | undefined {
    if (typeof keyOrId !== 'string') return undefined;
    return this.biomesByKey.get(keyOrId) ?? this.biomesById.get(keyOrId);
  }

  /** All gas definitions, in load order (the first of any duplicated typeKey wins). */
  public getGases(): GasDefinition[] {
    return this.gases;
  }

  /** Gas definition by typeKey (e.g. 'HYDROGEN') or by database id. */
  public getGas(keyOrId: string): GasDefinition | undefined {
    if (typeof keyOrId !== 'string') return undefined;
    return this.gasesByTypeKey.get(keyOrId) ?? this.gasesById.get(keyOrId);
  }

  /**
   * All item definitions.
   */
  public getItems(): GameItem[] {
    return this.items;
  }

  /**
   * Item definition by ID, itemKey, or name (exact matches first, then case-insensitive).
   */
  public getItemData(itemId: string): GameItem | undefined {
    if (typeof itemId !== 'string') return undefined;
    const query = itemId.toLowerCase();
    return (
      this.itemsById.get(itemId) ??
      this.itemsByKey.get(itemId) ??
      this.itemsByIdLower.get(query) ??
      this.itemsByKeyLower.get(query) ??
      this.itemsByNameLower.get(query)
    );
  }

  /**
   * Helper to retrieve configured item physics for any item.
   */
  public getItemPhysicsConfig(itemId: string): ItemPhysicsConfig | undefined {
    return this.getItemData(itemId)?.physicsConfig ?? undefined;
  }

  /**
   * The item used when a throw does not say what is being thrown: the first throwable item in
   * the item table.
   */
  public getDefaultThrowable(): GameItem | undefined {
    return this.items.find((item) => isThrowableItem(item));
  }

  /**
   * Physics for throwables that do not define their own: those of the first throwable item that
   * has any, otherwise the built-in defaults.
   */
  public getDynamiteItemPhysicsConfig(): ItemPhysicsConfig {
    const throwable = this.items.find((item) => isThrowableItem(item) && item.physicsConfig);
    return (throwable?.physicsConfig as ItemPhysicsConfig | undefined) ?? DEFAULT_DYNAMITE_PHYSICS_CONFIG;
  }

  /** The currency item with this subType (Sol by default), looked up by category, not by id or name. */
  public getCurrencyItem(subType: string = SOL_CURRENCY_SUBTYPE): GameItem | undefined {
    return findCurrencyItem(this.items, subType);
  }

  /**
   * Helper to retrieve configured explosion radius for any item based on effect.explodes === true.
   */
  public getItemExplosionRadius(itemId: string): number | undefined {
    const item = this.getItemData(itemId);
    if (!item) return undefined;
    if (item.itemEffects && Array.isArray(item.itemEffects)) {
      const explodeEffect = item.itemEffects.find(
        (ie) => ie.effect?.explodes === true && ie.value > 0
      );
      if (explodeEffect) {
        return Number(explodeEffect.value);
      }
    }
    return undefined;
  }

  /**
   * Helper to retrieve configured soundEffects for any item.
   */
  public getItemSoundEffects(itemId: string): ItemSoundEffectsConfig | undefined {
    return this.getItemData(itemId)?.soundEffects ?? undefined;
  }

  /** All mob definitions, in load order. */
  public getMobs(): Mob[] {
    return this.mobs;
  }

  /**
   * Mob definition by ID or (case-insensitive) name.
   */
  public getMobData(mobId: string): Mob | undefined {
    if (typeof mobId !== 'string') return undefined;
    return this.mobsById.get(mobId) ?? this.mobsByNameLower.get(mobId.toLowerCase());
  }
}
