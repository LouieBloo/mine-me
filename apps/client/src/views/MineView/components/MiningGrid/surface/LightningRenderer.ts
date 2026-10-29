import { Container, Graphics } from 'pixi.js';
import { skyInView, type LightningStrike } from '@mine-me/shared';
import { boltBranch, lightningBolt } from '@mine-me/shared';
import type { SurfaceView } from './SurfaceBackground';

/** The brightest a flash gets when the player asked for fewer flashes (a photosensitivity setting). */
export const REDUCED_FLASH_CAP = 0.25;
/** How white the sky overlay gets at a full flash. */
const OVERLAY_ALPHA = 0.5;

/** A flash capped for the "reduce flashes" setting. */
export function cappedFlash(flash: number, reduce: boolean): number {
  const f = Math.min(1, Math.max(0, flash));
  return reduce ? Math.min(f, REDUCED_FLASH_CAP) : f;
}

/**
 * Lightning (ticket 134): a bolt drawn from the sky down to the horizon and a flash over the sky, at the moments the shared
 * `lightningAt` says (the same for every player). The bolt's shape is seeded from the strike, so it does not flicker around
 * between frames. Only the sky is flashed: below the horizon nothing changes. The flash brightness is also handed back so the
 * lighting engine can flash the surface light.
 */
export class LightningRenderer {
  public readonly root = new Container();
  private readonly flashLayer = new Graphics();
  private readonly bolt = new Graphics();
  private drawnStrike = Number.NaN;
  private drawnX = Number.NaN;
  private level = 0;

  constructor(parent: Container) {
    this.root.label = 'lightning';
    this.root.addChild(this.flashLayer, this.bolt);
    this.root.visible = false;
    parent.addChild(this.root);
  }

  /** The (capped) brightness of the last update, 0 to 1. */
  public get flashLevel(): number {
    return this.level;
  }

  public update(view: SurfaceView, horizonY: number, flash: number, strike: LightningStrike | null, reduceFlashes: boolean): void {
    const level = cappedFlash(flash, reduceFlashes);
    this.level = skyInView(view.top, horizonY) ? level : 0;
    const visible = this.level > 0.01;
    this.root.visible = visible;
    if (!visible) {
      this.drawnStrike = Number.NaN;
      return;
    }
    const height = horizonY - view.top;
    this.flashLayer.clear();
    this.flashLayer.rect(view.left, view.top, view.width, height).fill({ color: 0xffffff, alpha: this.level * OVERLAY_ALPHA });

    const showBolt = strike !== null && flash > 0.2 && !reduceFlashes;
    this.bolt.visible = showBolt;
    if (!showBolt || !strike) return;
    const x = view.left + strike.x * view.width;
    // The shape is drawn once per strike (and again if the view moved a lot), not every frame
    if (this.drawnStrike !== strike.time || Math.abs(this.drawnX - x) > view.width * 0.02) {
      this.drawnStrike = strike.time;
      this.drawnX = x;
      const seed = Math.floor(strike.time * 1000);
      const points = lightningBolt(seed, x, view.top, horizonY - 2, 9, Math.max(14, view.width * 0.03));
      const branchAt = { x: points[8], y: points[9] };
      this.bolt.clear();
      this.bolt.poly(points, false).stroke({ color: 0xbfd4ff, width: 9, alpha: 0.35 });
      this.bolt.poly(points, false).stroke({ color: 0xffffff, width: 3, alpha: 1 });
      this.bolt.poly(boltBranch(seed, branchAt, height * 0.25), false).stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
    }
    this.bolt.alpha = Math.min(1, flash) * (1 - 0.5 * strike.distance);
  }

  public destroy(): void {
    this.root.destroy({ children: true });
  }
}
