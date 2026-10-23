import { Assets, Container, Graphics, TilingSprite, type Texture } from 'pixi.js';
import type { BeltBlockedReason, MiningBeltClientState } from '@mine-me/shared';
import { TILE_SIZE } from './MiningTileRenderer';

/** Stripes per cell of belt length in the placeholder look. */
const STRIPES_PER_CELL = 2;
/** The placeholder is redrawn at most this often while it moves, in seconds. */
const REDRAW_SECONDS = 1 / 20;

/**
 * Where stripe `index` is down a cell (0 at the top edge, up to just under 1) after the belt has run to `phase`. The belt
 * carries things UP to the extractor, so as the phase grows the stripes climb: their position falls and wraps round at the top.
 */
export function stripePosition(index: number, phase: number): number {
  return ((((index - phase) % STRIPES_PER_CELL) + STRIPES_PER_CELL) % STRIPES_PER_CELL) / STRIPES_PER_CELL;
}

/** How far along the repeating stripe pattern the belt is after `seconds` at `speed` cells per second (0 up to 1 stripe, wrapping). */
export function stripePhase(seconds: number, speed: number): number {
  const cycle = (seconds * speed * STRIPES_PER_CELL) % 1;
  return cycle < 0 ? cycle + 1 : cycle;
}

export type BeltTextureLoader = (url: string) => Promise<Texture | null>;
const defaultLoadTexture: BeltTextureLoader = (url) => Assets.load<Texture>(url).catch(() => null);

/**
 * Draws the conveyor belt: one segment per laid row of the shaft, `shaftWidth` cells wide, with stripes that move at the
 * belt's speed so it reads as running. Until the art exists (ticket 128) segments are plain; with a `textureUrl` each
 * segment is a tiling sprite whose texture scrolls the same way. A world graphic only.
 */
export class BeltRenderer {
  public readonly root = new Container();
  private readonly graphics = new Graphics();
  private rows: number;
  private blockedBy: BeltBlockedReason | null;
  /** Seconds the belt has been running (it stands still while it waits), which is how far its stripes or art have moved. */
  private elapsed = 0;
  private sinceRedraw = REDRAW_SECONDS;
  private destroyed = false;
  private art: TilingSprite | null = null;
  /** Damage stage of each segment: 0 whole to 4 nearly gone, -1 broken (drawn as a gap). */
  private stages: number[];
  private readonly state: MiningBeltClientState;

  constructor(container: Container, state: MiningBeltClientState, loadTexture: BeltTextureLoader = defaultLoadTexture) {
    this.state = state;
    this.rows = state.rows;
    this.stages = [...(state.stages ?? [])];
    this.blockedBy = state.blockedBy;
    this.root.addChild(this.graphics);
    container.addChild(this.root);
    this.redraw();
    if (state.textureUrl) {
      void loadTexture(state.textureUrl).then((texture) => {
        if (!texture || this.destroyed) return;
        this.art = new TilingSprite({ texture, width: state.shaftWidth * TILE_SIZE, height: Math.max(1, this.rows) * TILE_SIZE });
        // The picture is drawn at any resolution: scaled so one repeat is exactly the shaft wide
        this.art.tileScale.set((state.shaftWidth * TILE_SIZE) / Math.max(1, texture.width));
        this.art.position.set(state.shaftX * TILE_SIZE, state.startRow * TILE_SIZE);
        // The art goes under the drawing, which from now on only adds what the art does not have: gaps and cracks
        this.root.addChildAt(this.art, 0);
        this.syncArt();
        this.sinceRedraw = REDRAW_SECONDS;
      });
    }
  }

  /** The damage stage of every segment (sent when any changes). */
  public setStages(stages: readonly number[]): void {
    this.stages = [...stages];
    this.sinceRedraw = REDRAW_SECONDS;
  }

  public stageOf(index: number): number {
    return this.stages[index] ?? 0;
  }

  /** The server's latest length and why it is waiting (if it is). */
  public setRows(rows: number, blockedBy: BeltBlockedReason | null): void {
    const changed = rows !== this.rows;
    this.rows = rows;
    this.blockedBy = blockedBy;
    if (changed) {
      this.sinceRedraw = REDRAW_SECONDS;
      this.syncArt();
    }
  }

  public get segmentCount(): number {
    return this.rows;
  }

  public get waitingFor(): BeltBlockedReason | null {
    return this.blockedBy;
  }

  /** Moves the stripes on by `deltaSeconds`. */
  public update(deltaSeconds: number): void {
    if (this.destroyed) return;
    // A belt that is waiting does not move
    if (this.blockedBy === null) this.elapsed += Math.max(0, deltaSeconds);
    this.sinceRedraw += Math.max(0, deltaSeconds);
    // A belt that is waiting does not move; one with nothing laid has nothing to draw
    if (this.rows === 0) return;
    if (this.sinceRedraw >= REDRAW_SECONDS) {
      this.sinceRedraw = 0;
      this.redraw();
      // Up, like the items: a tiling sprite's picture moves down as its offset grows, so the offset runs the other way
      if (this.art) this.art.tilePosition.y = -((this.elapsed * this.state.beltSpeed * TILE_SIZE) % (this.art.texture.height * this.art.tileScale.y));
    }
  }

  public destroy(): void {
    this.destroyed = true;
    this.root.destroy({ children: true });
  }

  private syncArt(): void {
    if (this.art) this.art.height = Math.max(1, this.rows) * TILE_SIZE;
  }

  private redraw(): void {
    const g = this.graphics;
    g.clear();
    if (this.rows === 0) return;
    const { shaftX, shaftWidth, startRow, beltSpeed } = this.state;
    const left = shaftX * TILE_SIZE;
    const width = shaftWidth * TILE_SIZE;
    const phase = stripePhase(this.elapsed, beltSpeed);
    const artMode = this.art !== null;
    for (let i = 0; i < this.rows; i++) {
      const top = (startRow + i) * TILE_SIZE;
      const stage = this.stageOf(i);
      if (stage < 0) {
        // Broken: a gap with the torn edges showing, until the belt lays it again (over the art, which has no gaps of its own)
        if (artMode) g.rect(left, top, width, TILE_SIZE).fill(0x120c08);
        g.rect(left, top, 2, TILE_SIZE * 0.4).fill(0xf59e0b);
        g.rect(left + width - 2, top + TILE_SIZE * 0.6, 2, TILE_SIZE * 0.4).fill(0xf59e0b);
        continue;
      }
      if (!artMode) {
        g.rect(left, top, width, TILE_SIZE).fill(0x1f2937);
        for (let s = 0; s < STRIPES_PER_CELL; s++) {
          const y = top + stripePosition(s, phase) * TILE_SIZE;
          g.rect(left + 2, y, width - 4, Math.max(1, TILE_SIZE * 0.12)).fill(0x6b7280);
        }
        g.rect(left, top, 2, TILE_SIZE).fill(0xf59e0b);
        g.rect(left + width - 2, top, 2, TILE_SIZE).fill(0xf59e0b);
      }
      // Cracks: more of them as the segment gets worse
      for (let c = 0; c < stage; c++) {
        const cx = left + width * ((c + 1) / (stage + 1));
        g.rect(cx, top + TILE_SIZE * 0.1, 1.5, TILE_SIZE * (0.4 + 0.1 * c)).fill(0x0b0f14);
      }
    }
  }
}
