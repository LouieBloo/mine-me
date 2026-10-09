import {
  DEFAULT_DYNAMITE_PHYSICS_CONFIG,
  MiningTileType,
  SOL_CURRENCY_SUBTYPE,
  findCurrencyItem,
  isThrowableItem,
  type ItemPhysicsConfig,
  type ItemSoundEffectsConfig,
} from '@mine-me/shared';

/** Static game definitions, in the shape the admin tools / Prisma produce. */
export interface GameDefinitions {
  items: any[];
  mobs: any[];
  blocks: any[];
}

const TILE_TYPE_KEYS: Record<number, string> = {
  [MiningTileType.DIRT]: 'DIRT',
  [MiningTileType.ROCK]: 'ROCK',
  [MiningTileType.MINERAL]: 'MINERAL',
  [MiningTileType.CHEST]: 'CHEST',
  [MiningTileType.COPPERIUM]: 'COPPERIUM',
  [MiningTileType.SILVERIUM]: 'SILVERIUM',
};

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

  private readonly items: any[];
  private readonly mobs: any[];
  private readonly blocksByTypeKey = new Map<string, any>();

  private readonly itemsById = new Map<string, any>();
  private readonly itemsByKey = new Map<string, any>();
  private readonly itemsByIdLower = new Map<string, any>();
  private readonly itemsByKeyLower = new Map<string, any>();
  private readonly itemsByNameLower = new Map<string, any>();

  private readonly mobsById = new Map<string, any>();
  private readonly mobsByNameLower = new Map<string, any>();

  constructor(definitions: GameDefinitions) {
    this.items = definitions.items;
    this.mobs = definitions.mobs;

    for (const block of definitions.blocks) {
      if (block?.typeKey && !this.blocksByTypeKey.has(block.typeKey)) {
        this.blocksByTypeKey.set(block.typeKey, block);
      }
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

  private static putFirst(map: Map<string, any>, key: unknown, value: any): void {
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

  /**
   * Helper to retrieve block configuration by tile type.
   */
  public getBlockConfig(tileType: MiningTileType): any {
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
    return 100;
  }

  /**
   * Pick power a tool needs to damage this block type (0 = anything can mine it).
   */
  public getBlockRequiredPickPower(tileType: MiningTileType): number {
    const required = this.getBlockConfig(tileType)?.requiredPickPower;
    return typeof required === 'number' && required > 0 ? required : 0;
  }

  /**
   * All item definitions.
   */
  public getItems(): any[] {
    return this.items;
  }

  /**
   * Item definition by ID, itemKey, or name (exact matches first, then case-insensitive).
   */
  public getItemData(itemId: string): any {
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
    return this.getItemData(itemId)?.physicsConfig;
  }

  /**
   * The item used when a throw does not say what is being thrown: the first throwable item in
   * the item table.
   */
  public getDefaultThrowable(): any {
    return this.items.find((item: any) => isThrowableItem(item));
  }

  /**
   * Physics for throwables that do not define their own: those of the first throwable item that
   * has any, otherwise the built-in defaults.
   */
  public getDynamiteItemPhysicsConfig(): ItemPhysicsConfig {
    const throwable = this.items.find((item: any) => isThrowableItem(item) && item.physicsConfig);
    return (throwable?.physicsConfig as ItemPhysicsConfig | undefined) ?? DEFAULT_DYNAMITE_PHYSICS_CONFIG;
  }

  /** The currency item with this subType (Sol by default), looked up by category, not by id or name. */
  public getCurrencyItem(subType: string = SOL_CURRENCY_SUBTYPE): any {
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
        (ie: any) => ie.effect?.explodes === true && ie.value > 0
      );
      if (explodeEffect) {
        return Number(explodeEffect.value);
      }
    }
    if (item.physicsConfig && typeof item.physicsConfig.explosionRadius === 'number') {
      return item.physicsConfig.explosionRadius;
    }
    return undefined;
  }

  /**
   * Helper to retrieve configured soundEffects for any item.
   */
  public getItemSoundEffects(itemId: string): ItemSoundEffectsConfig | undefined {
    return this.getItemData(itemId)?.soundEffects;
  }

  /**
   * Mob definition by ID or (case-insensitive) name.
   */
  public getMobData(mobId: string): any {
    if (typeof mobId !== 'string') return undefined;
    return this.mobsById.get(mobId) ?? this.mobsByNameLower.get(mobId.toLowerCase());
  }
}
