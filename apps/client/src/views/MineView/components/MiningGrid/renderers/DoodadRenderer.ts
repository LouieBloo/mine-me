import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import {
  BLOCK_SCALE,
  DoodadBodyIndex,
  DoodadReactionSystem,
  REACTION_MIN_SPEED,
  bodySpeed,
  createWander,
  doodadPhase,
  doodadSizeChoices,
  evaluateDoodadMotion,
  getAssetUrl,
  layoutDoodad,
  layoutDoodadParts,
  stepWander,
  wanderOffset,
  wanderSeed,
  type DoodadClientDefinition,
  type DoodadEntry,
  type DoodadShatterWire,
  type FallingDoodadWire,
  type DoodadField,
  type DoodadLayout,
  type DoodadPartLayout,
  type DoodadPose,
  type DoodadPuff,
  type ReactiveDoodad,
  type WanderState,
  type WanderSubject,
  type WanderTerrain,
} from '@mine-me/shared';
import { DoodadBodyTracker, type BodySample } from '../systems/DoodadBodies';
import { TILE_SIZE } from './MiningTileRenderer';

/** How long a doodad takes to fade away when its block is mined, in seconds. */
export const DOODAD_FADE_SECONDS = 0.25;
/** Seconds a doodad takes to fade out of (or back into) the weather it hides in. */
export const DOODAD_WEATHER_FADE_SECONDS = 1.5;
/** How much bigger a fading doodad gets (a small pop). */
export const DOODAD_POP_SCALE = 0.25;
/** How long a hurt doodad stays tinted, in seconds (ticket 143). */
export const DOODAD_HIT_FLASH_SECONDS = 0.18;
/** The tint of a hurt doodad. */
export const DOODAD_HIT_TINT = 0xff7a7a;
/** How quickly a falling doodad's picture catches up with the server's position (per second): about one server tick behind. */
export const FALLING_CATCH_UP_PER_SECOND = 40;
/** Cells around the camera that still get a sprite, so doodads do not pop in at the edge of the screen. */
export const DOODAD_VIEW_MARGIN_CELLS = 3;
/** How many pixels of a doodad's own picture make one cell, when a doodad has no picture yet (its placeholder). Offsets (light, particles) are in picture pixels. */
export const PLACEHOLDER_PIXELS_PER_CELL = 64;

/** How near, in cells, a body has to come to scare a bug that has no reaction radius of its own (2 original blocks). */
export const DOODAD_SPOOK_RADIUS = 2 * BLOCK_SCALE;

export type DoodadTextureLoader = (url: string) => Promise<Texture | null>;
const defaultLoadTexture: DoodadTextureLoader = (url) => Assets.load<Texture>(getAssetUrl(url)).catch(() => null);

/** A rectangle of cells, inclusive: what the camera sees. */
export interface CellRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A colour for a doodad that has no picture, from its key (the same doodad is always the same colour). */
export function doodadPlaceholderColor(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return hslToHex(((h >>> 0) % 360) / 360, 0.55, 0.52);
}

function hslToHex(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const channel = (v: number) => Math.round(v * 255);
  return (channel(f(0)) << 16) | (channel(f(8)) << 8) | channel(f(4));
}

const lighten = (color: number, amount: number): number => {
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return (mix((color >> 16) & 255) << 16) | (mix((color >> 8) & 255) << 8) | mix(color & 255);
};

/**
 * Draws the stand-in for a doodad with no picture, in a box `w` x `h` pixels whose anchored edge is at the origin: a mushroom on
 * the floor, a stalactite from the ceiling, a patch of moss on a wall, a glowing dot in the air. Clearly a placeholder, but
 * you can tell what it is meant to be.
 */
export function drawDoodadPlaceholder(g: Graphics, definition: Pick<DoodadClientDefinition, 'key' | 'anchor'>, w: number, h: number): void {
  const color = doodadPlaceholderColor(definition.key);
  const light = lighten(color, 0.35);
  g.clear();
  switch (definition.anchor) {
    case 'FLOOR':
      g.rect(-w * 0.09, -h * 0.55, w * 0.18, h * 0.55).fill(lighten(color, 0.6));
      g.ellipse(0, -h * 0.58, w * 0.44, h * 0.38).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
      g.circle(-w * 0.16, -h * 0.66, Math.max(1, w * 0.07)).fill(light);
      g.circle(w * 0.14, -h * 0.55, Math.max(1, w * 0.05)).fill(light);
      break;
    case 'CEILING':
      g.poly([-w * 0.32, 0, w * 0.32, 0, w * 0.08, h * 0.78, 0, h * 0.95, -w * 0.1, h * 0.7]).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
      g.rect(-w * 0.4, 0, w * 0.8, Math.max(1, h * 0.08)).fill(light);
      break;
    case 'WALL':
      g.roundRect(0, -h * 0.45, w * 0.5, h * 0.9, Math.min(w, h) * 0.2).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
      g.circle(w * 0.18, -h * 0.2, Math.max(1, Math.min(w, h) * 0.12)).fill(light);
      g.circle(w * 0.3, h * 0.15, Math.max(1, Math.min(w, h) * 0.09)).fill(light);
      break;
    case 'AIR': {
      const r = Math.min(w, h) * 0.3;
      g.circle(0, 0, r * 1.8).fill({ color, alpha: 0.25 });
      g.circle(0, 0, r).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
      g.circle(-r * 0.3, -r * 0.3, r * 0.35).fill(light);
      break;
    }
  }
}

/** One doodad on screen: its drawing, and where it is. Pooled and reused for other doodads. */
class DoodadView {
  /** At the doodad's base point; everything else hangs off it. */
  public readonly root = new Container();
  /** Turns, swells and bobs about the base point (the whole-doodad motion). */
  public readonly body = new Container();
  public readonly placeholder = new Graphics();
  /** The falling drop of a placeholder `drip`. */
  public readonly drop = new Graphics();
  public entry: DoodadEntry | null = null;
  public layout: DoodadLayout | null = null;
  /** Draw pixels per pixel of the doodad's own picture. */
  public artScale = 1;
  public phase = 0;
  /** Where the doodad is, as its cell: the same key the reactions and effects use. */
  public key = '';
  /** Whether it reacts to bodies or wanders, so the renderer knows when bodies are worth gathering. */
  public reactive = false;
  /** A wandering doodad's walk (ticket 106), or null. */
  public wander: WanderState | null = null;
  /** The way a wandering bug is heading, -1 or 1, as a flip of its picture. */
  public facing: 1 | -1 = 1;
  /** Seconds the fade has run, or null while the doodad is standing. */
  public fade: number | null = null;
  /** Seconds of the hit tint left (ticket 143). */
  public hitLeft = 0;
  /** How hidden it is by the weather, 0 (shown) to 1 (gone): birds leave the sky in a storm (ticket 135). */
  public hide = 0;
  /** The server says it was killed, so its fade is a death and not a broken hold. */
  public killed = false;
  /** Bumped on every reuse, so a texture that arrives late for the old doodad is ignored. */
  public generation = 0;
  public art: Sprite | null = null;
  public partSprites: { sprite: Sprite; layout: DoodadPartLayout; baseScaleX: number; baseScaleY: number }[] = [];

  constructor() {
    this.root.addChild(this.body);
    this.body.addChild(this.placeholder);
    this.body.addChild(this.drop);
  }

  public clearArt(): void {
    if (this.art) {
      this.art.destroy();
      this.art = null;
    }
    for (const p of this.partSprites) p.sprite.destroy();
    this.partSprites = [];
  }
}

/** A ceiling doodad in the air: its view, where it started hanging and where it is drawn (cells). */
interface FallingView {
  view: DoodadView;
  x0: number;
  y0: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

/** The part of a view the effects (lights, particles) need. */
export interface DoodadViewInfo {
  entry: DoodadEntry;
  /** The base point in world pixels. */
  anchorX: number;
  anchorY: number;
  /** Draw pixels per pixel of the doodad's own picture. */
  artScale: number;
  mirror: 1 | -1;
  phase: number;
}

/**
 * Draws the doodads (ticket 102): scenery between the back wall and the bodies. Only the doodads near the camera have a
 * sprite; they come from a pool and go back to it when they scroll off, and one that loses its block fades away. A doodad with
 * no picture (or one that failed to load) is drawn as a coloured placeholder for its anchor. Motion (ticket 103) is a pure
 * function of time, evaluated here once a frame for the doodads on screen.
 */
export class DoodadRenderer {
  private readonly container: Container;
  private readonly field: DoodadField;
  private readonly loadTexture: DoodadTextureLoader;
  private readonly tileSize: number;
  private readonly active = new Map<DoodadEntry, DoodadView>();
  private readonly pool: DoodadView[] = [];
  private lastVersion = -1;
  private lastKey = '';
  private timeSeconds = 0;
  private destroyed = false;
  /** Pictures already loaded (null: failed, so the placeholder stays). */
  private readonly textures = new Map<string, Texture | null>();
  private removedListener: ((info: DoodadViewInfo) => void) | null = null;
  private readonly hitListeners = new Set<(info: DoodadViewInfo) => void>();
  private readonly deathListeners = new Set<(info: DoodadViewInfo) => void>();
  private readonly falling = new Map<number, FallingView>();
  private puffListener: ((info: DoodadViewInfo, effectId: string) => void) | null = null;
  /** Tells how bodies move, and finds those near a doodad (tickets 104, 106). */
  private readonly bodies = new DoodadBodyTracker();
  private readonly reactions = new DoodadReactionSystem();
  private terrain: WanderTerrain | null = null;
  /** The ground surface row: doodads standing above it are the surface props, which feel the wind and the weather (ticket 135). */
  private surfaceRow = Number.NEGATIVE_INFINITY;
  /** The weather now, and how much stronger than usual the surface doodads sway in its wind. */
  private weatherType = 'clear';
  private windSway = 1;
  /** How many of the doodads with a sprite react or wander. */
  private reactiveCount = 0;
  private readonly byKey = new Map<string, DoodadView>();

  constructor(container: Container, field: DoodadField, loadTexture: DoodadTextureLoader = defaultLoadTexture, tileSize: number = TILE_SIZE) {
    this.container = container;
    this.container.sortableChildren = true;
    this.field = field;
    this.loadTexture = loadTexture;
    this.tileSize = tileSize;
  }

  /** How many doodads have a sprite right now (including fading ones). */
  public get count(): number {
    return this.active.size;
  }

  /** Called when a doodad on screen loses its block, just as it starts to fade. */
  public setRemovedListener(listener: ((info: DoodadViewInfo) => void) | null): void {
    this.removedListener = listener;
  }

  /** Called when a doodad on screen is hurt but survives (ticket 143). Returns the function that stops listening. */
  public addHitListener(listener: (info: DoodadViewInfo) => void): () => void {
    this.hitListeners.add(listener);
    return () => this.hitListeners.delete(listener);
  }

  /** Called when a doodad on screen is killed, as it starts to fade, and when a falling one lands and shatters. Returns the function that stops listening. */
  public addDeathListener(listener: (info: DoodadViewInfo) => void): () => void {
    this.deathListeners.add(listener);
    return () => this.deathListeners.delete(listener);
  }

  /** Flashes the doodad that starts at a cell, as the server says it was hurt. A doodad that is not on screen is ignored. */
  public flashHit(x: number, y: number): void {
    const view = this.byKey.get(`${x},${y}`);
    if (!view?.layout || view.fade !== null) return;
    view.hitLeft = DOODAD_HIT_FLASH_SECONDS;
    for (const listener of this.hitListeners) listener(DoodadRenderer.info(view));
  }

  /** Notes that the doodad that starts at a cell was killed, so its fade (when the removal arrives) is a death and not a lost hold. */
  public markKilled(x: number, y: number): void {
    const view = this.byKey.get(`${x},${y}`);
    if (view) view.killed = true;
  }

  /**
   * Brings the ceiling doodads in the air up to date (ticket 143): the list is everything the server says is falling near
   * the player this tick. New ones get a view, ones that are still falling are drawn toward their new place, and ones that
   * left the list are retired (a landing also arrives as a shatter).
   */
  public setFalling(wires: readonly FallingDoodadWire[]): void {
    if (this.destroyed) return;
    const seen = new Set<number>();
    for (const [id, typeIndex, variant, flip, x, y] of wires) {
      const definition = this.field.definitions[typeIndex];
      if (!definition) continue;
      seen.add(id);
      const existing = this.falling.get(id);
      if (existing) {
        existing.targetX = x;
        existing.targetY = y;
        continue;
      }
      const size = doodadSizeChoices(definition)[variant] ?? { width: definition.width, height: definition.height };
      const entry: DoodadEntry = { typeIndex, definition, x: Math.round(x), y: Math.round(y), width: size.width, height: size.height, variant, flip: flip === 1 };
      const view = this.bindFalling(entry);
      this.falling.set(id, { view, x0: entry.x, y0: entry.y, x, y, targetX: x, targetY: y });
    }
    for (const [id, item] of [...this.falling]) {
      if (seen.has(id)) continue;
      this.falling.delete(id);
      this.retireFalling(item.view);
    }
  }

  /** The number of ceiling doodads drawn in the air. */
  public get fallingCount(): number {
    return this.falling.size;
  }

  /** A falling doodad landed and broke up: its death effect and sound play where it came down. */
  public shatter(wire: DoodadShatterWire): void {
    if (this.destroyed) return;
    const [typeIndex, variant, flip, x, y] = wire;
    const definition = this.field.definitions[typeIndex];
    if (!definition) return;
    const size = doodadSizeChoices(definition)[variant] ?? { width: definition.width, height: definition.height };
    const entry: DoodadEntry = { typeIndex, definition, x, y, width: size.width, height: size.height, variant, flip: flip === 1 };
    const box = { width: size.width * this.tileSize, height: size.height * this.tileSize };
    const layout = layoutDoodad(definition.anchor, this.footprint(entry), box, entry.flip, this.tileSize);
    const info: DoodadViewInfo = { entry, anchorX: layout.anchorX, anchorY: layout.anchorY, artScale: this.tileSize / PLACEHOLDER_PIXELS_PER_CELL, mirror: layout.mirror, phase: 0 };
    for (const listener of this.deathListeners) listener(info);
  }

  /** Called when a brushed doodad gives off its puff of spores (ticket 104). */
  public setPuffListener(listener: ((info: DoodadViewInfo, effectId: string) => void) | null): void {
    this.puffListener = listener;
  }

  /** Says which cells block a wandering bug (ticket 106). Without it bugs stay where they were placed. */
  public setTerrain(terrain: WanderTerrain | null): void {
    this.terrain = terrain;
  }

  public get hasTerrain(): boolean {
    return this.terrain !== null;
  }

  /** Whether any doodad on screen reacts or wanders, so the caller only gathers the bodies when they matter. */
  public get needsBodies(): boolean {
    return this.reactiveCount > 0 || this.reactions.activeCount > 0;
  }

  /** Tells the renderer where the ground is, so it knows which doodads are surface props. */
  public setSurfaceRow(row: number): void {
    this.surfaceRow = row;
  }

  /** The weather now (ticket 135): its kind hides the doodads that hide in it, and `windSway` multiplies the sway of the surface doodads. */
  public setWeather(type: string, windSway: number): void {
    this.weatherType = type;
    this.windSway = Number.isFinite(windSway) && windSway > 0 ? windSway : 1;
  }

  /** How strongly the wind sways a surface doodad (1 = its own sway). */
  public get currentWindSway(): number {
    return this.windSway;
  }

  /** The doodads on screen and where they stand, for the effects. Fading ones are left out. */
  public visible(): DoodadViewInfo[] {
    const out: DoodadViewInfo[] = [];
    for (const view of this.active.values()) if (view.fade === null && view.layout) out.push(DoodadRenderer.info(view));
    return out;
  }

  /**
   * Brings the sprites up to date: creates and retires them for the doodads in `rect` (the camera in cells), then poses each one
   * at `timeSeconds`. Cheap when nothing moved: the set of sprites is only recomputed when a doodad came or went or the camera
   * crossed into another cell.
   */
  public update(timeSeconds: number, rect: CellRect, dtSeconds: number, samples?: readonly BodySample[]): void {
    if (this.destroyed) return;
    this.timeSeconds = timeSeconds;
    const key = `${rect.x0},${rect.y0},${rect.x1},${rect.y1}`;
    if (this.field.version !== this.lastVersion || key !== this.lastKey) {
      this.lastVersion = this.field.version;
      this.lastKey = key;
      this.syncViews(rect);
    }
    const bodies = this.bodies.update(dtSeconds, this.reactiveCount > 0 || this.reactions.activeCount > 0 ? (samples ?? []) : []);
    this.reactToBodies(dtSeconds, bodies);
    for (const [entry, view] of this.active) {
      if (view.fade !== null) {
        view.fade += dtSeconds;
        if (view.fade >= DOODAD_FADE_SECONDS) {
          this.release(entry, view);
          continue;
        }
        const t = view.fade / DOODAD_FADE_SECONDS;
        view.body.alpha = 1 - t;
        view.body.scale.set(view.layout?.mirror === -1 ? -(1 + DOODAD_POP_SCALE * t) : 1 + DOODAD_POP_SCALE * t, 1 + DOODAD_POP_SCALE * t);
        continue;
      }
      if (view.wander) this.wanderStep(view, dtSeconds, bodies);
      this.pose(view);
      this.tintHit(view, dtSeconds);
      this.weatherHide(view, dtSeconds);
    }
    this.moveFalling(dtSeconds);
  }

  /** Fades a doodad that hides in the current weather out, and back in when it clears (birds in a storm). */
  private weatherHide(view: DoodadView, dtSeconds: number): void {
    const hides = view.entry!.definition.hiddenInWeather;
    if (!hides && view.hide === 0) return;
    const target = hides?.includes(this.weatherType) ? 1 : 0;
    if (view.hide !== target) {
      const step = dtSeconds / DOODAD_WEATHER_FADE_SECONDS;
      view.hide = target > view.hide ? Math.min(target, view.hide + step) : Math.max(target, view.hide - step);
      view.root.alpha = 1 - view.hide;
      view.root.visible = view.hide < 0.999;
    }
  }

  /** Whether a doodad stands above the ground (a tree, a bush, a bird), where the wind blows. */
  private onSurface(entry: DoodadEntry): boolean {
    return entry.y + entry.height <= this.surfaceRow;
  }

  /** The pose with the wind's extra sway on it, for a surface doodad. */
  private windy(pose: DoodadPose, entry: DoodadEntry): DoodadPose {
    if (this.windSway === 1 || !this.onSurface(entry)) return pose;
    return { ...pose, rotation: pose.rotation * this.windSway, x: pose.x * this.windSway };
  }

  /** Tints a hurt doodad for a moment, then back to normal. */
  private tintHit(view: DoodadView, dtSeconds: number): void {
    if (view.hitLeft > 0) {
      view.hitLeft = Math.max(0, view.hitLeft - dtSeconds);
      view.body.tint = view.hitLeft > 0 ? DOODAD_HIT_TINT : 0xffffff;
    }
  }

  /** Draws each falling doodad a little nearer to where the server last said it was. */
  private moveFalling(dtSeconds: number): void {
    if (this.falling.size === 0) return;
    const k = Math.min(1, dtSeconds * FALLING_CATCH_UP_PER_SECOND);
    for (const item of this.falling.values()) {
      item.x += (item.targetX - item.x) * k;
      item.y += (item.targetY - item.y) * k;
      const layout = item.view.layout;
      if (!layout) continue;
      item.view.root.position.set(layout.anchorX + (item.x - item.x0) * this.tileSize, layout.anchorY + (item.y - item.y0) * this.tileSize);
    }
  }

  /** The doodads that react, as the reaction system sees them. */
  private reactToBodies(dtSeconds: number, bodies: DoodadBodyIndex): void {
    if (bodies.size === 0 && this.reactions.activeCount === 0) return;
    const reactive: ReactiveDoodad[] = [];
    for (const view of this.active.values()) {
      const reacts = view.entry?.definition.reacts;
      if (!reacts || view.fade !== null || !view.layout) continue;
      reactive.push({
        key: view.key,
        x: view.root.x / this.tileSize,
        y: view.root.y / this.tileSize,
        anchor: view.entry!.definition.anchor,
        mirror: view.layout.mirror,
        reacts,
      });
    }
    const puffs: DoodadPuff[] = this.reactions.update(dtSeconds, reactive, bodies);
    for (const puff of puffs) {
      const view = this.byKey.get(puff.key);
      if (view?.layout) this.puffListener?.(DoodadRenderer.info(view), puff.effectId);
    }
  }

  /** Walks a wandering doodad on a frame, scattering it from a body that comes near. */
  private wanderStep(view: DoodadView, dtSeconds: number, bodies: DoodadBodyIndex): void {
    const entry = view.entry;
    const wander = entry?.definition.wander;
    const state = view.wander;
    if (!entry || !wander || !state || !this.terrain) return;
    const x = view.root.x / this.tileSize;
    const y = view.root.y / this.tileSize;
    const radius = entry.definition.reacts?.radius ?? DOODAD_SPOOK_RADIUS;
    let spook: { x: number; y: number } | null = null;
    let closest = Infinity;
    for (const body of bodies.near(x, y, radius)) {
      const distance = Math.hypot(body.x - x, body.y - y);
      // A body that is moving scares it from the edge of the reach; one standing still only when it is right on top of it
      if ((bodySpeed(body) >= REACTION_MIN_SPEED || distance <= radius * 0.5) && distance < closest) {
        closest = distance;
        spook = { x: body.x, y: body.y };
      }
    }
    const subject: WanderSubject = { anchor: entry.definition.anchor, x: entry.x, y: entry.y, width: entry.width, height: entry.height, flip: entry.flip };
    stepWander(state, wander, subject, this.terrain, dtSeconds, spook);
    view.facing = state.facing;
  }

  private syncViews(rect: CellRect): void {
    const m = DOODAD_VIEW_MARGIN_CELLS;
    const wanted = new Set(this.field.inRect(rect.x0 - m, rect.y0 - m, rect.x1 + m, rect.y1 + m));
    for (const [entry, view] of [...this.active]) {
      if (view.fade !== null || wanted.has(entry)) continue;
      const stillThere = this.field.at(entry.x, entry.y) === entry;
      if (stillThere) {
        this.release(entry, view); // scrolled away
      } else if (view.layout) {
        // Its block went while it was on screen: a short fade, and the listener (the break sound) hears of it
        const info = DoodadRenderer.info(view);
        if (view.killed) for (const listener of this.deathListeners) listener(info);
        else this.removedListener?.(info);
        // A ceiling doodad that loses its hold falls (the server sends it in the air), so it does not also fade where it hung
        if (entry.definition.anchor === 'CEILING') {
          this.release(entry, view);
          continue;
        }
        view.fade = 0;
      } else {
        this.release(entry, view);
      }
    }
    for (const entry of wanted) if (!this.active.has(entry)) this.bind(entry);
  }

  private bind(entry: DoodadEntry): void {
    const view = this.pool.pop() ?? new DoodadView();
    view.generation++;
    view.entry = entry;
    view.fade = null;
    view.hitLeft = 0;
    view.hide = 0;
    view.killed = false;
    view.body.tint = 0xffffff;
    view.phase = doodadPhase(entry.x, entry.y);
    view.key = `${entry.x},${entry.y}`;
    view.reactive = Boolean(entry.definition.reacts || entry.definition.wander);
    view.wander = entry.definition.wander ? createWander(wanderSeed(entry.x, entry.y)) : null;
    view.facing = view.wander?.facing ?? 1;
    if (view.reactive) this.reactiveCount++;
    this.byKey.set(view.key, view);
    view.clearArt();
    view.body.alpha = 1;
    view.body.rotation = 0;
    view.body.position.set(0, 0);
    view.root.visible = true;
    view.root.alpha = 1;
    view.root.zIndex = entry.definition.zOffset;
    this.container.addChild(view.root);
    this.active.set(entry, view);
    this.drawPlaceholder(view);
    void this.loadArt(view);
  }

  /** A view for a doodad that is in the air: not part of the field, never reacts, wanders or fades. */
  private bindFalling(entry: DoodadEntry): DoodadView {
    const view = this.pool.pop() ?? new DoodadView();
    view.generation++;
    view.entry = entry;
    view.fade = null;
    view.hitLeft = 0;
    view.killed = false;
    view.phase = 0;
    view.key = '';
    view.reactive = false;
    view.wander = null;
    view.clearArt();
    view.body.alpha = 1;
    view.body.rotation = 0;
    view.body.tint = 0xffffff;
    view.body.position.set(0, 0);
    view.root.visible = true;
    view.root.zIndex = entry.definition.zOffset + 1;
    this.container.addChild(view.root);
    this.drawPlaceholder(view);
    void this.loadArt(view);
    return view;
  }

  private retireFalling(view: DoodadView): void {
    view.entry = null;
    view.layout = null;
    view.generation++;
    view.clearArt();
    view.root.visible = false;
    if (view.root.parent) view.root.parent.removeChild(view.root);
    this.pool.push(view);
  }

  private release(entry: DoodadEntry, view: DoodadView): void {
    this.active.delete(entry);
    if (view.reactive) this.reactiveCount--;
    view.reactive = false;
    view.wander = null;
    this.byKey.delete(view.key);
    this.reactions.forget(view.key);
    view.entry = null;
    view.layout = null;
    view.generation++;
    view.clearArt();
    view.root.visible = false;
    if (view.root.parent) view.root.parent.removeChild(view.root);
    this.pool.push(view);
  }

  private footprint(entry: DoodadEntry) {
    return { x: entry.x, y: entry.y, width: entry.width, height: entry.height };
  }

  /** The picture to use for this placement: its size variant's own, else the doodad's. */
  private textureUrlOf(entry: DoodadEntry): string | null {
    const choice = doodadSizeChoices(entry.definition)[entry.variant];
    return choice?.textureUrl ?? entry.definition.textureUrl ?? null;
  }

  private drawPlaceholder(view: DoodadView): void {
    const entry = view.entry!;
    const box = { width: entry.width * this.tileSize, height: entry.height * this.tileSize };
    const layout = layoutDoodad(entry.definition.anchor, this.footprint(entry), box, entry.flip, this.tileSize);
    view.layout = layout;
    view.artScale = this.tileSize / PLACEHOLDER_PIXELS_PER_CELL;
    view.root.position.set(layout.anchorX, layout.anchorY);
    view.body.scale.set(layout.mirror, 1);
    view.placeholder.visible = true;
    view.drop.visible = false;
    drawDoodadPlaceholder(view.placeholder, entry.definition, box.width, box.height);
  }

  private async load(url: string): Promise<Texture | null> {
    if (this.textures.has(url)) return this.textures.get(url) ?? null;
    const texture = await this.loadTexture(url);
    this.textures.set(url, texture);
    return texture;
  }

  /** Swaps the placeholder for the real picture (or pictures, for a doodad in parts) once it has loaded. */
  private async loadArt(view: DoodadView): Promise<void> {
    const entry = view.entry;
    if (!entry) return;
    const generation = view.generation;
    const parts = entry.definition.parts;
    if (parts && parts.length > 0) {
      const textures = await Promise.all(parts.map((p) => this.load(p.file)));
      if (this.destroyed || view.generation !== generation || textures.some((t) => !t)) return;
      this.showParts(view, textures as Texture[]);
      return;
    }
    const url = this.textureUrlOf(entry);
    if (!url) return;
    const texture = await this.load(url);
    if (this.destroyed || view.generation !== generation || !texture) return;
    this.showArt(view, texture);
  }

  private showArt(view: DoodadView, texture: Texture): void {
    const entry = view.entry!;
    const layout = layoutDoodad(entry.definition.anchor, this.footprint(entry), { width: texture.width, height: texture.height }, entry.flip, this.tileSize);
    view.layout = layout;
    view.artScale = layout.drawWidth / Math.max(1, texture.width);
    view.root.position.set(layout.anchorX, layout.anchorY);
    view.body.scale.set(layout.mirror, 1);
    const sprite = new Sprite(texture);
    sprite.anchor.set(layout.originX, layout.originY);
    sprite.width = layout.drawWidth;
    sprite.height = layout.drawHeight;
    view.body.addChildAt(sprite, 0);
    view.art = sprite;
    view.placeholder.visible = false;
    view.drop.visible = false;
  }

  private showParts(view: DoodadView, textures: Texture[]): void {
    const entry = view.entry!;
    const parts = entry.definition.parts!;
    const placed = layoutDoodadParts(entry.definition.anchor, this.footprint(entry), parts, entry.flip, this.tileSize);
    view.layout = placed.layout;
    view.artScale = placed.scale;
    view.root.position.set(placed.layout.anchorX, placed.layout.anchorY);
    // Each part is posed on its own, so the whole body stays put (apart from facing the right way)
    view.body.scale.set(1, 1);
    placed.parts.forEach((part, i) => {
      const sprite = new Sprite(textures[i]);
      sprite.anchor.set(part.pivotX, part.pivotY);
      sprite.width = part.width;
      sprite.height = part.height;
      const baseScaleX = sprite.scale.x;
      const baseScaleY = sprite.scale.y;
      sprite.scale.x = baseScaleX * placed.layout.mirror;
      sprite.zIndex = part.zIndex;
      sprite.position.set(part.x - placed.layout.anchorX, part.y - placed.layout.anchorY);
      view.partSprites.push({ sprite, layout: part, baseScaleX, baseScaleY });
    });
    view.body.sortableChildren = true;
    for (const p of view.partSprites) view.body.addChild(p.sprite);
    view.placeholder.visible = false;
    view.drop.visible = false;
  }

  /** Poses one doodad at the current time. */
  private pose(view: DoodadView): void {
    const entry = view.entry;
    const layout = view.layout;
    if (!entry || !layout) return;
    const motion = entry.definition.motion;
    // A wandering doodad is carried to where it has walked
    if (view.wander) this.moveToWanderSpot(view, layout);
    if (view.partSprites.length > 0) {
      // The lean from a brush turns the whole body about the base, over what each part does
      view.body.rotation = this.reactions.angleOf(view.key);
      for (const p of view.partSprites) {
        const pose = this.windy(evaluateDoodadMotion(motion, this.timeSeconds, view.phase, p.layout.name), entry);
        p.sprite.rotation = pose.rotation * layout.mirror;
        p.sprite.position.set(p.layout.x - layout.anchorX + pose.x * layout.drawWidth * layout.mirror, p.layout.y - layout.anchorY + pose.y * layout.drawHeight);
        p.sprite.scale.set(p.baseScaleX * layout.mirror * pose.scaleX, p.baseScaleY * pose.scaleY);
        p.sprite.alpha = pose.alpha;
      }
      return;
    }
    const pose = this.windy(evaluateDoodadMotion(motion, this.timeSeconds, view.phase), entry);
    this.applyBodyPose(view, pose, layout);
    if (view.wander) this.applyWander(view, layout);
    // A placeholder drip draws its own drop
    if (view.placeholder.visible && motion?.preset === 'drip') this.drawDrop(view, pose.drop, layout);
    else view.drop.visible = false;
  }

  /** Moves the base point to where a wandering doodad has walked (cells from its placed spot). */
  private moveToWanderSpot(view: DoodadView, layout: DoodadLayout): void {
    const offset = wanderOffset(view.wander!);
    view.root.position.set(layout.anchorX + offset.x * this.tileSize, layout.anchorY + offset.y * this.tileSize);
  }

  /** A bug faces the way it is walking (a wall bug climbs, so it keeps its side). */
  private applyWander(view: DoodadView, layout: DoodadLayout): void {
    if (view.entry!.definition.anchor === 'WALL') return;
    view.body.scale.x = Math.abs(view.body.scale.x) * view.facing * layout.mirror;
  }

  private applyBodyPose(view: DoodadView, pose: DoodadPose, layout: DoodadLayout): void {
    view.body.rotation = pose.rotation * layout.mirror + this.reactions.angleOf(view.key);
    view.body.position.set(pose.x * layout.drawWidth * layout.mirror, pose.y * layout.drawHeight);
    view.body.scale.set(layout.mirror * pose.scaleX, pose.scaleY);
    view.body.alpha = pose.alpha;
  }

  private drawDrop(view: DoodadView, progress: number, layout: DoodadLayout): void {
    const g = view.drop;
    if (progress < 0) {
      g.visible = false;
      return;
    }
    const h = view.entry!.height * this.tileSize;
    const r = Math.max(1, Math.min(layout.drawWidth, h) * 0.09);
    g.clear();
    g.ellipse(0, 0, r * 0.8, r * 1.2).fill({ color: 0xbfe3ff, alpha: 0.9 });
    // From the tip of the doodad, falling a footprint's height
    const startY = view.entry!.definition.anchor === 'CEILING' ? h * 0.9 : 0;
    g.position.set(0, startY + progress * h);
    g.alpha = 1 - progress * progress;
    g.visible = true;
  }

  private static info(view: DoodadView): DoodadViewInfo {
    return { entry: view.entry!, anchorX: view.root.x, anchorY: view.root.y, artScale: view.artScale, mirror: view.layout!.mirror, phase: view.phase };
  }

  public destroy(): void {
    this.destroyed = true;
    for (const view of [...this.active.values(), ...this.pool]) {
      view.clearArt();
      view.root.destroy({ children: true });
    }
    for (const item of this.falling.values()) {
      item.view.clearArt();
      item.view.root.destroy({ children: true });
    }
    this.falling.clear();
    this.active.clear();
    this.pool.length = 0;
  }
}
