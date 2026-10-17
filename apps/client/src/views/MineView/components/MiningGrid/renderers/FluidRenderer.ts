import { Container, Graphics } from 'pixi.js';
import {
  DEFAULT_FLUID_APPEARANCE, FluidDisplay, FluidField, FluidLayout, MINING_CONFIG, fallHurry, darkenColor, lightenColor, parseHexColor, bandBelowLine, fluidBodyBands, fluidDepthShade, fluidSurfaceWave,
  type FluidAppearance, type FluidClientDefinition, type FluidEnvironment, type ItemLightConfig, type FluidShape, type FluidSoundEffectsConfig, type FluidWireCell,
  type SolidSampler,
} from '@mine-me/shared';

/** What a burning cell of a fluid looks like: its flames and its light (either may be missing). */
export type FlameLook = NonNullable<FluidClientDefinition['flame']>;
import { TILE_SIZE } from './MiningTileRenderer';

/** Seconds between fluid simulation steps on the server: how long falling fluid takes to slide down one cell. */
export const FLUID_STEP_SECONDS = MINING_CONFIG.FLUID_STEP_TICKS / MINING_CONFIG.SERVER_TICK_RATE;

/** Cells per chunk side. Only chunks whose cells changed are redrawn. */
export const FLUID_CHUNK_SIZE = 8;
/** Thickness of the light line along a fluid's surface, as a fraction of a tile. */
const SURFACE_LINE_TILE = 1 / 32;
/** The soft glow under the surface line: this many bands, each this many tiles deeper than the last. */
const GLOW_BANDS = 3;
const GLOW_BAND_TILE = 1 / 32;
/** Opacity each glow band adds, at full highlight. They stack, so the glow is strongest at the surface. */
const GLOW_BAND_ALPHA = 0.1;

export { parseHexColor, lightenColor, darkenColor };

interface FluidLook {
  color: number;
  /** The colour of the highlight along the surface. */
  surface: number;
  opacity: number;
  appearance: FluidAppearance;
}

/** One chunk: the fluid body (redrawn when cells change) and its surfaces (redrawn every frame while they wave). */
interface ChunkView {
  root: Container;
  body: Graphics;
  surfaces: Graphics;
  shapes: FluidShape[];
  /** True when some surface has waves, so the surfaces must be redrawn as time passes. */
  animated: boolean;
}

/** The longest time step the easing takes in one go (a frame after a stall should not jump everything). */
const MAX_EASE_STEP_SECONDS = 0.1;

/**
 * Draws the fluid the server has revealed. Holds the client's copy of the fluid grid (`field`, exact: bodies,
 * sounds and fire read it), applies the server's changed cells to it, and draws an eased copy (`display`) so the
 * fluid flows between the server's steps instead of jumping. Only the chunks whose drawing changed are redrawn.
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
  private solid: SolidSampler | undefined;
  private time = 0;
  private lastUpdate: number | null = null;
  /** When the current step's falling fluid started sliding down (renderer time), or null before any fell. */
  private slideStart: number | null = null;
  private slideStartPending = false;
  /** Cells (as y * width + x) fluid fell into in the last step: redrawn every frame while it slides. */
  private readonly sliding = new Set<number>();
  /** The layout of what is drawn, kept until the drawn fluid or the terrain changes (drawing and fire share it). */
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

  /** Tells the renderer which cells are solid terrain, so it can tell falling fluid (drawn as a stream) from fluid in a shaft. */
  public setSolidSampler(solid: SolidSampler | undefined): void {
    this.solid = solid;
    this.layout = null;
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
   * Applies changed cells to the exact copy. With `smooth` the drawing eases to them over the next frames (the
   * fluid flowing); without, it shows them at once (the first snapshot, or fluid that just came into view).
   */
  public apply(cells: readonly FluidWireCell[], smooth = false): void {
    const fellInto: Array<[number, number]> = [];
    const changed = this.field.apply(cells);
    for (const [x, y] of changed) {
      const fluidId = this.field.getFluidId(x, y);
      const level = this.field.getLevel(x, y);
      const falling = this.field.getFalling(x, y);
      if (smooth) {
        this.display.setTarget(x, y, fluidId, level, falling);
        if (falling > 0) fellInto.push([x, y]);
      } else if (this.display.setNow(x, y, fluidId, level, falling)) {
        this.markAround(x, y);
      }
    }
    if (!smooth || changed.length === 0) return;
    // Fluid in free fall is drawn sliding down from the cell above over the next step, not faded out of one cell and into
    // the next (that smears it over both): both cells ease to where it is now almost at once, and the slide starts over
    this.sliding.clear();
    for (const [x, y] of fellInto) {
      const quick = fallHurry(this.field, x, y, this.solid);
      if (quick <= 0) continue;
      this.display.hurry(x, y, quick);
      this.display.hurry(x, y - 1, quick);
      this.sliding.add(y * this.field.width + x);
    }
    this.slideStartPending = true;
  }

  /** How far through the current step falling fluid has slid, 0 (just arrived) to 1 (in its cell). */
  public get fallProgress(): number {
    if (this.slideStart === null) return 1;
    return Math.min(1, Math.max(0, (this.time - this.slideStart) / FLUID_STEP_SECONDS));
  }

  /** Redraws what is sliding (the cells fluid fell into, and the cells it came from), while the slide lasts. */
  private markSliding(): void {
    for (const i of this.sliding) {
      const x = i % this.field.width;
      const y = Math.floor(i / this.field.width);
      this.markAround(x, y);
      if (y > 0) this.markAround(x, y - 1);
    }
  }

  /**
   * Marks for redraw everything a drawn cell's change can affect. A column's fluid is drawn as bodies packed onto
   * their floor, so the whole run of fluid it is part of moves; the columns beside it join its surface and decide
   * whether it is a stream.
   */
  private markAround(x: number, y: number): void {
    this.layout = null;
    const has = (yy: number) => this.display.getFluidId(x, yy) !== 0;
    // A fall is laid out as one jet down its column and steps over one-cell gaps (the beats it falls in), so the
    // redraw follows the fluid across such a gap too
    let top = y - 1;
    while (top > 0 && (has(top) || has(top - 1))) top--;
    let bottom = y + 1;
    while (bottom < this.field.height - 1 && (has(bottom) || has(bottom + 1))) bottom++;
    for (let cx = Math.max(0, x - 1); cx <= Math.min(this.field.width - 1, x + 1); cx++) {
      for (let cy = Math.max(0, top); cy <= Math.min(this.field.height - 1, bottom); cy++) this.dirty.add(this.chunkKey(cx, cy));
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
    this.layout ??= new FluidLayout(this.display, this.tileSize, this.solid, { fallProgress: this.fallProgress });
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
   * Once per frame: eases the drawn fluid towards the server's levels (redrawing what moved) and moves the waves on
   * to `timeSec`. Chunks whose fluid is still are not redrawn; their surfaces are, only while they wave.
   */
  public update(timeSec: number): void {
    const dt = this.lastUpdate === null ? 0 : Math.min(MAX_EASE_STEP_SECONDS, Math.max(0, timeSec - this.lastUpdate));
    this.lastUpdate = timeSec;
    const progressBefore = this.fallProgress;
    this.time = timeSec;
    if (this.slideStartPending) {
      this.slideStart = timeSec;
      this.slideStartPending = false;
    }
    // Falling fluid moves every frame until it has slid into its cell (one last redraw puts it exactly there)
    if (this.sliding.size > 0 && (this.fallProgress < 1 || progressBefore < 1)) this.markSliding();
    for (const [x, y] of this.display.step(dt)) this.markAround(x, y);
    const redrawn = new Set(this.dirty);
    this.render();
    for (const [key, chunk] of this.chunks) if (chunk.animated && !redrawn.has(key)) this.drawSurfaces(chunk);
  }

  private viewOf(key: number): ChunkView {
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const root = new Container();
      const body = new Graphics();
      const surfaces = new Graphics();
      root.addChild(body, surfaces);
      this.container.addChild(root);
      chunk = { root, body, surfaces, shapes: [], animated: false };
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
    for (let cy = chunkY; cy < Math.min(chunkY + FLUID_CHUNK_SIZE, this.field.height); cy++) {
      for (let cx = chunkX; cx < Math.min(chunkX + FLUID_CHUNK_SIZE, this.field.width); cx++) {
        for (const shape of layout.shapesAt(cx, cy)) {
          const look = this.definitions.get(shape.fluidId);
          if (!look) continue;
          this.drawBody(chunk.body, shape, look);
          chunk.shapes.push(shape);
          if (shape.surface && look.appearance.waveAmplitude > 0 && look.appearance.waveSpeed > 0) chunk.animated = true;
        }
      }
    }
    this.drawSurfaces(chunk);
    chunk.root.visible = chunk.shapes.length > 0;
  }

  /** The fluid below its surface: shaded slices, darker and more opaque the deeper they are. */
  private drawBody(graphics: Graphics, shape: FluidShape, look: FluidLook): void {
    for (const band of fluidBodyBands(shape, this.tileSize, look.appearance)) {
      const shade = fluidDepthShade(look.opacity, look.appearance, band.depth);
      graphics.poly(band.points).fill({ color: darkenColor(look.color, shade.darken), alpha: shade.opacity });
    }
    if (shape.spillEdge && look.appearance.highlight > 0) {
      // The pool's surface line carries on over the lip and down into the fall
      graphics.poly(shape.spillEdge, false).stroke({
        width: Math.max(1, SURFACE_LINE_TILE * this.tileSize),
        color: look.surface,
        alpha: look.opacity * Math.min(1, look.appearance.highlight * 1.2),
      });
    }
    if (shape.stream) {
      // A sheen down one side of the stream, so it reads as a rounded jet and not a flat bar
      graphics.rect(shape.x + shape.width * 0.15, shape.top, shape.width * 0.2, shape.bottom - shape.top);
      graphics.fill({ color: look.surface, alpha: look.opacity * look.appearance.highlight * 0.5 });
    }
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
        graphics.poly(wave.fill).fill({ color: darkenColor(look.color, shade.darken), alpha: shade.opacity });
      }
      const strength = look.appearance.highlight;
      if (strength <= 0) continue;
      for (let band = GLOW_BANDS; band >= 1; band--) {
        graphics.poly(bandBelowLine(wave.line, band * GLOW_BAND_TILE * this.tileSize, shape.bodyBottom)).fill({
          color: look.surface,
          alpha: look.opacity * strength * GLOW_BAND_ALPHA,
        });
      }
      graphics.poly(wave.line, false).stroke({
        width: Math.max(1, SURFACE_LINE_TILE * this.tileSize),
        color: look.surface,
        alpha: look.opacity * Math.min(1, strength * 1.2),
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
