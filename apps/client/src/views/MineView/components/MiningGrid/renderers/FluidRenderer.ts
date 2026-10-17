import { Container, Graphics } from 'pixi.js';
import {
  DEFAULT_FLUID_APPEARANCE, FluidDisplay, FluidField, FluidLayout, darkenColor, lightenColor, parseHexColor, bandBelowLine, fluidBodyBands, fluidDepthShade, fluidFlowStreaks, fluidSurfaceWave,
  type FluidAppearance, type FluidClientDefinition, type FluidEnvironment, type ItemLightConfig, type FluidShape, type FluidSoundEffectsConfig, type FluidWireCell,
} from '@mine-me/shared';

/** What a burning cell of a fluid looks like: its flames and its light (either may be missing). */
export type FlameLook = NonNullable<FluidClientDefinition['flame']>;
import { TILE_SIZE } from './MiningTileRenderer';

/** Cells per chunk side. Only chunks whose cells changed are redrawn. */
export const FLUID_CHUNK_SIZE = 8;
/** Thickness of the light line along a fluid's surface, as a fraction of a tile. */
const SURFACE_LINE_TILE = 1 / 32;
/** The soft glow under the surface line: this many bands, each this many tiles deeper than the last. */
const GLOW_BANDS = 3;
const GLOW_BAND_TILE = 1 / 32;
/** Opacity each glow band adds, at full highlight. They stack, so the glow is strongest at the surface. */
const GLOW_BAND_ALPHA = 0.1;
/** How bright the streaks running down a fall are, at full strength (a fraction of the fluid's opacity). */
const FLOW_STREAK_ALPHA = 0.7;

export { parseHexColor, lightenColor, darkenColor };

interface FluidLook {
  color: number;
  /** The colour of the highlight along the surface. */
  surface: number;
  opacity: number;
  appearance: FluidAppearance;
}

/** One chunk: the fluid body (redrawn when cells change), its surfaces (redrawn every frame while they wave) and the streaks running down falls (redrawn every frame while anything falls). */
interface ChunkView {
  root: Container;
  body: Graphics;
  flow: Graphics;
  surfaces: Graphics;
  shapes: FluidShape[];
  /** True when some surface has waves, so the surfaces must be redrawn as time passes. */
  animated: boolean;
  /** True when some fluid in the chunk is falling with streaks, so they must be redrawn as time passes. */
  flowing: boolean;
}

/** The longest time step the easing takes in one go (a frame after a stall should not jump everything). */
const MAX_EASE_STEP_SECONDS = 0.1;

/**
 * Draws the fluid the server has revealed. Holds the client's copy of the fluid grid (`field`, exact: bodies,
 * sounds and fire read it), applies the server's changed cells to it, and draws an eased copy (`display`) so resting
 * fluid settles between the server's steps instead of jumping. Falling fluid is drawn as it is told (a full-width
 * column) with light streaks running down it. Only the chunks whose drawing changed are redrawn.
 */
export class FluidRenderer {
  public readonly field: FluidField;
  /** The levels as drawn: eased towards `field`. */
  public readonly display: FluidDisplay;
  /** The fluid as bodies feel it (viscosity and density by cell id), for the player's predicted movement. */
  public readonly environment: FluidEnvironment;
  private readonly definitions = new Map<number, FluidLook>();
  private readonly properties = new Map<number, { viscosity: number; density: number }>();
  private readonly flames = new Map<number, FlameLook>();
  private readonly glows = new Map<number, ItemLightConfig>();
  private readonly sounds = new Map<number, FluidSoundEffectsConfig>();
  private readonly chunks = new Map<number, ChunkView>();
  private readonly dirty = new Set<number>();
  private readonly chunksAcross: number;
  private readonly container: Container;
  private readonly tileSize: number;
  private time = 0;
  private lastUpdate: number | null = null;
  /** The layout of what is drawn, kept until the drawn fluid changes (drawing and fire share it). */
  private layout: FluidLayout | null = null;

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
    this.display = new FluidDisplay(width, height);
    this.environment = { sampler: this.field, propertiesOf: (id) => this.properties.get(id) };
    this.chunksAcross = Math.ceil(width / FLUID_CHUNK_SIZE);
    this.setDefinitions(definitions);
  }

  /** Replaces how each fluid looks and redraws everything that is showing. */
  public setDefinitions(definitions: readonly FluidClientDefinition[]): void {
    this.definitions.clear();
    this.properties.clear();
    this.flames.clear();
    this.glows.clear();
    this.sounds.clear();
    for (const def of definitions) {
      this.properties.set(def.id, { viscosity: def.viscosity, density: def.density });
      if (def.flame) this.flames.set(def.id, def.flame);
      if (def.light) this.glows.set(def.id, def.light);
      if (def.sounds) this.sounds.set(def.id, def.sounds);
      const color = parseHexColor(def.color);
      this.definitions.set(def.id, {
        color,
        surface: lightenColor(color, 0.45),
        opacity: Math.min(1, Math.max(0, def.opacity)),
        appearance: def.appearance ?? DEFAULT_FLUID_APPEARANCE,
      });
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

  /** The light this fluid always gives off, or undefined if it does not glow. */
  public glowOf(fluidId: number): ItemLightConfig | undefined {
    return this.glows.get(fluidId);
  }

  /** Whether any fluid in this run glows (lets the glow skip its scan when none does). */
  public get hasGlow(): boolean {
    return this.glows.size > 0;
  }

  /** How a burning cell of this fluid looks, or undefined if it draws nothing. */
  public flameOf(fluidId: number): FlameLook | undefined {
    return this.flames.get(fluidId);
  }

  /**
   * Applies changed cells to the exact copy. With `smooth` the drawing eases to them over the next frames (resting
   * fluid settling); without, it shows them at once (the first snapshot, or fluid that just came into view). Falling
   * fluid is always shown at once.
   */
  public apply(cells: readonly FluidWireCell[], smooth = false): void {
    const changed = this.field.apply(cells);
    for (const [x, y] of changed) {
      const fluidId = this.field.getFluidId(x, y);
      const level = this.field.getLevel(x, y);
      const falling = this.field.getFalling(x, y);
      const shown = smooth ? this.display.setTarget(x, y, fluidId, level, falling) : this.display.setNow(x, y, fluidId, level, falling);
      if (shown) this.markAround(x, y);
    }
  }

  /**
   * Marks for redraw everything a drawn cell's change can affect: the cell and its neighbours (their corners meet at
   * its edges), the cells below it in its column (what is above them decides how tall and how deep they are), and the
   * fluid stacked above it (it rests on this cell's surface, so it moves with it).
   */
  private markAround(x: number, y: number): void {
    this.layout = null;
    let bottom = y + 1;
    while (bottom < this.field.height - 1 && this.display.getFluidId(x, bottom) !== 0) bottom++;
    // Only a different fluid above rests on this cell's surface (and is moved by it); the same fluid above is part of it
    let top = y - 1;
    const here = this.display.getFluidId(x, y);
    const above = y > 0 ? this.display.getFluidId(x, y - 1) : 0;
    if (above !== 0 && above !== here) while (top > 0 && this.display.getFluidId(x, top) !== 0) top--;
    for (let cx = Math.max(0, x - 1); cx <= Math.min(this.field.width - 1, x + 1); cx++) {
      const first = cx === x ? top : y - 1;
      const last = cx === x ? bottom : y + 1;
      for (let cy = Math.max(0, first); cy <= Math.min(this.field.height - 1, last); cy++) this.dirty.add(this.chunkKey(cx, cy));
    }
  }

  /**
   * A tile was mined, placed or blown up. What is beside, above and below it decides whether fluid there rests or
   * falls, and whether neighbouring surfaces join, so the fluid around it is redrawn.
   */
  public onTileChanged(x: number, y: number): void {
    for (const [nx, ny] of [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx >= 0 && ny >= 0 && nx < this.field.width && ny < this.field.height) this.markAround(nx, ny);
    }
  }

  private currentLayout(): FluidLayout {
    this.layout ??= new FluidLayout(this.display, this.tileSize);
    return this.layout;
  }

  /**
   * Where the drawn surface of the fluid in a cell is, in pixels: the top of the body it is part of (fluid is drawn
   * packed onto its floor, so this can be lower than the cell's own level suggests), or the top of a stream. Null
   * if nothing is drawn there. Fire uses it so flames rise from the fluid you see.
   */
  public drawnSurfaceY(x: number, y: number): number | null {
    return this.currentLayout().surfaceAt(x, y);
  }

  /** Redraws the chunks that changed. Cheap when nothing did. Returns how many were redrawn. */
  public render(): number {
    if (this.dirty.size === 0) return 0;
    const layout = this.currentLayout();
    let redrawn = 0;
    for (const key of this.dirty) {
      this.drawChunk(key, layout);
      redrawn++;
    }
    this.dirty.clear();
    return redrawn;
  }

  /**
   * Once per frame: eases the drawn fluid towards the server's levels (redrawing what moved) and moves the waves and
   * the streaks down the falls on to `timeSec`. Chunks whose fluid is still are not redrawn; their surfaces and
   * streaks are, only while they wave or fall.
   */
  public update(timeSec: number): void {
    const dt = this.lastUpdate === null ? 0 : Math.min(MAX_EASE_STEP_SECONDS, Math.max(0, timeSec - this.lastUpdate));
    this.lastUpdate = timeSec;
    this.time = timeSec;
    for (const [x, y] of this.display.step(dt)) this.markAround(x, y);
    const redrawn = new Set(this.dirty);
    this.render();
    for (const [key, chunk] of this.chunks) {
      if (redrawn.has(key)) continue;
      if (chunk.animated) this.drawSurfaces(chunk);
      if (chunk.flowing) this.drawFlow(chunk);
    }
  }

  private viewOf(key: number): ChunkView {
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const root = new Container();
      const body = new Graphics();
      const flow = new Graphics();
      const surfaces = new Graphics();
      root.addChild(body, flow, surfaces);
      this.container.addChild(root);
      chunk = { root, body, flow, surfaces, shapes: [], animated: false, flowing: false };
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  private drawChunk(key: number, layout: FluidLayout): void {
    const chunkX = (key % this.chunksAcross) * FLUID_CHUNK_SIZE;
    const chunkY = Math.floor(key / this.chunksAcross) * FLUID_CHUNK_SIZE;
    const chunk = this.viewOf(key);
    chunk.body.clear();
    chunk.shapes = [];
    chunk.animated = false;
    chunk.flowing = false;
    for (let cy = chunkY; cy < Math.min(chunkY + FLUID_CHUNK_SIZE, this.field.height); cy++) {
      for (let cx = chunkX; cx < Math.min(chunkX + FLUID_CHUNK_SIZE, this.field.width); cx++) {
        for (const shape of layout.shapesAt(cx, cy)) {
          const look = this.definitions.get(shape.fluidId);
          if (!look) continue;
          this.drawBody(chunk.body, shape, look);
          chunk.shapes.push(shape);
          if (shape.surface && look.appearance.waveAmplitude > 0 && look.appearance.waveSpeed > 0) chunk.animated = true;
          if (shape.falling && look.appearance.flowSpeed > 0 && look.appearance.flowStreaks > 0) chunk.flowing = true;
        }
      }
    }
    this.drawFlow(chunk);
    this.drawSurfaces(chunk);
    chunk.root.visible = chunk.shapes.length > 0;
  }

  /** The fluid below its surface: shaded slices, darker and more opaque the deeper they are (a thin fall is fainter). */
  private drawBody(graphics: Graphics, shape: FluidShape, look: FluidLook): void {
    for (const band of fluidBodyBands(shape, this.tileSize, look.appearance)) {
      const shade = fluidDepthShade(look.opacity, look.appearance, band.depth);
      graphics.poly(band.points).fill({ color: darkenColor(look.color, shade.darken), alpha: shade.opacity * shape.strength });
    }
  }

  /** The light streaks running down the falls in a chunk. They are the only thing that moves in a fall: its shape stands still. */
  private drawFlow(chunk: ChunkView): void {
    const graphics = chunk.flow;
    graphics.clear();
    for (const shape of chunk.shapes) {
      if (!shape.falling) continue;
      const look = this.definitions.get(shape.fluidId);
      if (!look) continue;
      const alpha = look.opacity * look.appearance.flowStreaks * shape.strength * FLOW_STREAK_ALPHA;
      for (const streak of fluidFlowStreaks(shape.cx, shape.cy, this.tileSize, this.time, look.appearance, shape.surface ? shape.topMid : shape.top)) {
        graphics.rect(streak.x, streak.y, streak.width, streak.height);
      }
      graphics.fill({ color: look.surface, alpha });
    }
    graphics.visible = chunk.flowing;
  }

  /** The tops of the pools: the waving fill, a soft glow below the surface line, and the line itself. */
  private drawSurfaces(chunk: ChunkView): void {
    const graphics = chunk.surfaces;
    graphics.clear();
    for (const shape of chunk.shapes) {
      if (!shape.surface) continue;
      const look = this.definitions.get(shape.fluidId);
      if (!look) continue;
      const wave = fluidSurfaceWave(shape, this.tileSize, this.time, look.appearance);
      if (!wave) continue;
      const shade = fluidDepthShade(look.opacity, look.appearance, shape.depth + 0.125);
      if (wave.fill.length > 0) {
        graphics.poly(wave.fill).fill({ color: darkenColor(look.color, shade.darken), alpha: shade.opacity * shape.strength });
      }
      const strength = look.appearance.highlight;
      if (strength <= 0) continue;
      for (let band = GLOW_BANDS; band >= 1; band--) {
        graphics.poly(bandBelowLine(wave.line, band * GLOW_BAND_TILE * this.tileSize, shape.bodyBottom)).fill({
          color: look.surface,
          alpha: look.opacity * strength * GLOW_BAND_ALPHA * shape.strength,
        });
      }
      graphics.poly(wave.line, false).stroke({
        width: Math.max(1, SURFACE_LINE_TILE * this.tileSize),
        color: look.surface,
        alpha: look.opacity * Math.min(1, strength * 1.2) * shape.strength,
      });
    }
    graphics.visible = chunk.shapes.length > 0;
  }

  public destroy(): void {
    for (const chunk of this.chunks.values()) chunk.root.destroy({ children: true });
    this.chunks.clear();
    this.dirty.clear();
  }
}
