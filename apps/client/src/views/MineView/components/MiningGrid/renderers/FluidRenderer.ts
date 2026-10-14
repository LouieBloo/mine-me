import { Container, Graphics } from 'pixi.js';
import { FluidField, layoutFluidCell, type FluidClientDefinition, type FluidEnvironment, type FluidSoundEffectsConfig, type FluidWireCell } from '@mine-me/shared';

/** What a burning cell of a fluid looks like: its flames and its light (either may be missing). */
export type FlameLook = NonNullable<FluidClientDefinition['flame']>;
import { TILE_SIZE } from './MiningTileRenderer';

/** Cells per chunk side. Only chunks whose cells changed are redrawn. */
export const FLUID_CHUNK_SIZE = 8;
/** Thickness in pixels of the lighter line along a fluid's surface. */
const SURFACE_LINE_PX = 3;

/** '#rrggbb' to a Pixi colour number (black if it cannot be read). */
export function parseHexColor(hex: string): number {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  return match ? parseInt(match[1], 16) : 0x000000;
}

/** The colour lightened toward white by `amount` (0-1), for the surface line. */
export function lightenColor(color: number, amount: number): number {
  const channel = (shift: number) => {
    const c = (color >> shift) & 0xff;
    return Math.round(c + (255 - c) * amount);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * Draws the fluid the server has revealed. Holds the client's copy of the fluid grid (`field`), applies the
 * server's changed cells to it, and redraws only the chunks they touch.
 */
export class FluidRenderer {
  public readonly field: FluidField;
  /** The fluid as bodies feel it (viscosity and density by cell id), for the player's predicted movement. */
  public readonly environment: FluidEnvironment;
  private readonly definitions = new Map<number, { color: number; surface: number; opacity: number }>();
  private readonly properties = new Map<number, { viscosity: number; density: number }>();
  private readonly flames = new Map<number, FlameLook>();
  private readonly sounds = new Map<number, FluidSoundEffectsConfig>();
  private readonly chunks = new Map<number, Graphics>();
  private readonly dirty = new Set<number>();
  private readonly chunksAcross: number;
  private readonly container: Container;
  private readonly tileSize: number;

  constructor(
    container: Container,
    width: number,
    height: number,
    definitions: readonly FluidClientDefinition[] = [],
    tileSize: number = TILE_SIZE
  ) {
    this.container = container;
    this.tileSize = tileSize;
    this.field = new FluidField(width, height);
    this.environment = { sampler: this.field, propertiesOf: (id) => this.properties.get(id) };
    this.chunksAcross = Math.ceil(width / FLUID_CHUNK_SIZE);
    this.setDefinitions(definitions);
  }

  /** Replaces how each fluid looks and redraws everything that is showing. */
  public setDefinitions(definitions: readonly FluidClientDefinition[]): void {
    this.definitions.clear();
    this.properties.clear();
    this.flames.clear();
    this.sounds.clear();
    for (const def of definitions) {
      this.properties.set(def.id, { viscosity: def.viscosity, density: def.density });
      if (def.flame) this.flames.set(def.id, def.flame);
      if (def.sounds) this.sounds.set(def.id, def.sounds);
      const color = parseHexColor(def.color);
      this.definitions.set(def.id, { color, surface: lightenColor(color, 0.35), opacity: Math.min(1, Math.max(0, def.opacity)) });
    }
    for (const key of this.chunks.keys()) this.dirty.add(key);
  }

  private chunkKey(cx: number, cy: number): number {
    return Math.floor(cy / FLUID_CHUNK_SIZE) * this.chunksAcross + Math.floor(cx / FLUID_CHUNK_SIZE);
  }

  /** The fluid's playable sounds, or undefined if it is silent. */
  public soundsOf(fluidId: number): FluidSoundEffectsConfig | undefined {
    return this.sounds.get(fluidId);
  }

  /** How a burning cell of this fluid looks, or undefined if it draws nothing. */
  public flameOf(fluidId: number): FlameLook | undefined {
    return this.flames.get(fluidId);
  }

  /** Applies changed cells (the server's snapshot or a tick's changes) and marks what must be redrawn. */
  public apply(cells: readonly FluidWireCell[]): void {
    for (const cell of this.field.apply(cells)) {
      const [x, y] = cell;
      this.dirty.add(this.chunkKey(x, y));
      // The cell below is drawn full or partial depending on this one, and may be in the next chunk down
      if (y + 1 < this.field.height) this.dirty.add(this.chunkKey(x, y + 1));
    }
  }

  /** Redraws the chunks that changed. Cheap when nothing did. Returns how many were redrawn. */
  public render(): number {
    let redrawn = 0;
    for (const key of this.dirty) {
      this.drawChunk(key);
      redrawn++;
    }
    this.dirty.clear();
    return redrawn;
  }

  private drawChunk(key: number): void {
    const chunkX = (key % this.chunksAcross) * FLUID_CHUNK_SIZE;
    const chunkY = Math.floor(key / this.chunksAcross) * FLUID_CHUNK_SIZE;
    let graphics = this.chunks.get(key);
    if (!graphics) {
      graphics = new Graphics();
      this.chunks.set(key, graphics);
      this.container.addChild(graphics);
    }
    graphics.clear();
    let drew = false;
    for (let cy = chunkY; cy < Math.min(chunkY + FLUID_CHUNK_SIZE, this.field.height); cy++) {
      for (let cx = chunkX; cx < Math.min(chunkX + FLUID_CHUNK_SIZE, this.field.width); cx++) {
        const rect = layoutFluidCell(this.field, cx, cy, this.tileSize);
        const look = rect && this.definitions.get(rect.fluidId);
        if (!rect || !look) continue;
        graphics.rect(rect.x, rect.y, rect.width, rect.height);
        graphics.fill({ color: look.color, alpha: look.opacity });
        if (rect.surface) {
          graphics.rect(rect.x, rect.y, rect.width, Math.min(SURFACE_LINE_PX, rect.height));
          graphics.fill({ color: look.surface, alpha: look.opacity });
        }
        drew = true;
      }
    }
    graphics.visible = drew;
  }

  public destroy(): void {
    for (const graphics of this.chunks.values()) graphics.destroy();
    this.chunks.clear();
    this.dirty.clear();
  }
}
