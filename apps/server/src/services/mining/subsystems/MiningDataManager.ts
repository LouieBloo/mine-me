import fs from 'fs';
import path from 'path';
import {
  DEFAULT_DYNAMITE_PHYSICS_CONFIG,
  MiningTileType,
  type ItemPhysicsConfig,
  type ItemSoundEffectsConfig,
} from '@mine-me/shared';

/**
 * MiningDataManager manages access and caching for static game definitions (items, blocks, mobs).
 * Decouples disk I/O and JSON parsing from the simulation engine.
 */
export class MiningDataManager {
  private static instance: MiningDataManager | null = null;

  private blocksCache: any[] | null = null;
  private itemsCache: any[] | null = null;
  private itemsCacheMtime: number = 0;
  private mobsCache: any[] | null = null;

  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir =
      dataDir || path.join(__dirname, '../../../../../../packages/shared/src/data');
  }

  public static getInstance(): MiningDataManager {
    if (!MiningDataManager.instance) {
      MiningDataManager.instance = new MiningDataManager();
    }
    return MiningDataManager.instance;
  }

  public clearCache(): void {
    this.blocksCache = null;
    this.itemsCache = null;
    this.itemsCacheMtime = 0;
    this.mobsCache = null;
  }

  /**
   * Helper to retrieve block configuration from blocks.json.
   */
  public getBlockConfig(tileType: MiningTileType): any {
    try {
      if (!this.blocksCache) {
        const blocksPath = path.join(this.dataDir, 'blocks.json');
        if (fs.existsSync(blocksPath)) {
          this.blocksCache = JSON.parse(fs.readFileSync(blocksPath, 'utf-8'));
        }
      }
      const typeKeyMap: Record<number, string> = {
        [MiningTileType.DIRT]: 'DIRT',
        [MiningTileType.ROCK]: 'ROCK',
        [MiningTileType.MINERAL]: 'MINERAL',
        [MiningTileType.CHEST]: 'CHEST',
        [MiningTileType.COPPERIUM]: 'COPPERIUM',
        [MiningTileType.SILVERIUM]: 'SILVERIUM',
      };
      const key = typeKeyMap[tileType];
      if (key && this.blocksCache) {
        return this.blocksCache.find((b: any) => b.typeKey === key);
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  /**
   * Helper to retrieve all items or item definition from items.json.
   */
  public getItems(): any[] {
    try {
      const itemsPath = path.join(this.dataDir, 'items.json');
      if (fs.existsSync(itemsPath)) {
        const mtime = fs.statSync(itemsPath).mtimeMs;
        if (!this.itemsCache || mtime !== this.itemsCacheMtime) {
          this.itemsCache = JSON.parse(fs.readFileSync(itemsPath, 'utf-8'));
          this.itemsCacheMtime = mtime;
        }
      }
    } catch {
      // ignore
    }
    return this.itemsCache || [];
  }

  /**
   * Helper to retrieve item definition from items.json by ID, itemKey, or name.
   */
  public getItemData(itemId: string): any {
    const items = this.getItems();
    const query = itemId.toLowerCase();
    return items.find(
      (i: any) =>
        i.id === itemId ||
        i.itemKey === itemId ||
        i.id?.toLowerCase() === query ||
        i.itemKey?.toLowerCase() === query ||
        i.name?.toLowerCase() === query
    );
  }

  /**
   * Helper to retrieve configured item physics from items.json for any item.
   */
  public getItemPhysicsConfig(itemId: string): ItemPhysicsConfig | undefined {
    return this.getItemData(itemId)?.physicsConfig;
  }

  /**
   * Helper to retrieve configured dynamite item physics from items.json or defaults.
   */
  public getDynamiteItemPhysicsConfig(): ItemPhysicsConfig {
    const items = this.getItems();
    const dynamiteItem = items.find((item: any) => item.subType === 'DYNAMITE');
    if (dynamiteItem?.physicsConfig) {
      return dynamiteItem.physicsConfig as ItemPhysicsConfig;
    }
    return DEFAULT_DYNAMITE_PHYSICS_CONFIG;
  }

  /**
   * Helper to retrieve configured explosion radius from items.json for any item based on effect.explodes === true.
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
   * Helper to retrieve configured soundEffects from items.json for any item.
   */
  public getItemSoundEffects(itemId: string): ItemSoundEffectsConfig | undefined {
    return this.getItemData(itemId)?.soundEffects;
  }

  /**
   * Helper to retrieve mob definition from mobs.json.
   */
  public getMobData(mobId: string): any {
    try {
      if (!this.mobsCache) {
        const mobsPath = path.join(this.dataDir, 'mobs.json');
        if (fs.existsSync(mobsPath)) {
          this.mobsCache = JSON.parse(fs.readFileSync(mobsPath, 'utf-8'));
        }
      }
      if (this.mobsCache) {
        return this.mobsCache.find((m: any) => m.id === mobId || m.name?.toLowerCase() === mobId.toLowerCase());
      }
    } catch {
      // ignore
    }
    return undefined;
  }
}
