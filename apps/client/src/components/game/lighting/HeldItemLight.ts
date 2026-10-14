import type { Container } from 'pixi.js';
import type { HeldLightConfig } from '@mine-me/shared';
import type { LightingEngine } from './LightingEngine';
import type { LightSource } from './LightSource';
import { createItemLight } from './itemLight';

/** The part of a character sprite the held-item light needs. */
export interface HeldLightSource {
  getHeldLight(): HeldLightConfig | null;
  getHeldLightWorldPosition(relativeToContainer: Container): { x: number; y: number } | null;
}

/**
 * Keeps one light on the item a character is holding (the same light config ground items use).
 * Call `sync` every frame: it adds the light when the held item has one, moves it with the item,
 * rebuilds it when the config changes, and removes it on unequip. `tileSize` converts the sprite's
 * pixel position into the tile coordinates lights use.
 */
export class HeldItemLight {
  private id: string;
  private tileSize: number;
  private engine: LightingEngine | null = null;
  private light: LightSource | null = null;
  private configKey: string | null = null;

  constructor(id: string, tileSize: number) {
    this.id = id;
    this.tileSize = tileSize;
  }

  public hasLight(): boolean {
    return this.light !== null;
  }

  public sync(engine: LightingEngine | null | undefined, source: HeldLightSource, space: Container): void {
    if (!engine) {
      this.clear();
      return;
    }
    if (this.engine !== engine) {
      this.clear();
      this.engine = engine;
    }

    const config = source.getHeldLight();
    const pos = config?.enabled ? source.getHeldLightWorldPosition(space) : null;
    if (!config || !pos) {
      this.clear();
      return;
    }

    const x = pos.x / this.tileSize;
    const y = pos.y / this.tileSize;
    const key = JSON.stringify(config);
    if (this.light && this.configKey !== key) this.clear();

    if (!this.light) {
      this.light = createItemLight(this.id, config, x, y);
      this.configKey = key;
      engine.addLight(this.light);
      return;
    }
    this.light.setPosition(x, y);
  }

  public clear(): void {
    if (this.light) this.engine?.removeLight(this.light.id);
    this.light = null;
    this.configKey = null;
  }

  public destroy(): void {
    this.clear();
    this.engine = null;
  }
}
