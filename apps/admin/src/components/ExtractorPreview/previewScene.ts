import { landingHeightFraction, landingProgress } from '@mine-me/shared';

/** The numbers the preview plays back; the same ones the game reads from the extractor. */
export interface ExtractorPreviewSettings {
  width: number;
  height: number;
  shaftWidth: number;
  landingSeconds: number;
  buildSecondsPerSegment: number;
  beltSpeed: number;
  beltItemSpacing: number;
  unloadItemsPerSecond: number;
}

/** Segments the preview digs before it starts over. */
export const PREVIEW_BELT_ROWS = 8;
/** Seconds the finished belt runs before the preview restarts. */
export const PREVIEW_RUN_SECONDS = 5;
const STEP = 1 / 30;
/** Where on the belt the pretend player stands to unload (cells from the top, capped by the belt's length). */
const UNLOAD_DEPTH = PREVIEW_BELT_ROWS - 0.5;

export interface PreviewFrame {
  /** 0 just started, 1 landed. */
  landingProgress: number;
  /** How far above its resting place the machine is, as a fraction of the start height (0 once down). */
  heightFraction: number;
  /** Segments laid so far. */
  beltRows: number;
  /** Distance of each item from the top of the belt, in cells. */
  items: number[];
}

/** How long one run of the preview takes before it loops. */
export function previewCycleSeconds(s: Pick<ExtractorPreviewSettings, 'landingSeconds' | 'buildSecondsPerSegment'>): number {
  return s.landingSeconds + s.buildSecondsPerSegment * PREVIEW_BELT_ROWS + PREVIEW_RUN_SECONDS;
}

/**
 * What the picture shows `timeSeconds` into a run: the machine comes down over `landingSeconds`, the belt then lays a
 * segment every `buildSecondsPerSegment`, and a pretend player standing on it loads an item every
 * `1 / unloadItemsPerSecond` seconds, but only where the belt has room (`beltItemSpacing`); items ride up at `beltSpeed`.
 * It is played forward in small steps from the start, so the same time always gives the same picture, and the
 * numbers behave exactly as they do in the game (a slow unload rate or a wide spacing visibly thins the line).
 */
export function previewFrame(timeSeconds: number, s: ExtractorPreviewSettings): PreviewFrame {
  const t = Math.max(0, timeSeconds % previewCycleSeconds(s));
  const progress = landingProgress(t, s.landingSeconds);
  const buildStart = s.landingSeconds;
  const beltRows = t < buildStart ? 0 : Math.min(PREVIEW_BELT_ROWS, Math.floor((t - buildStart) / s.buildSecondsPerSegment) + 1);

  let items: number[] = [];
  let carry = 0;
  for (let time = 0; time < t; time += STEP) {
    const rows = time < buildStart ? 0 : Math.min(PREVIEW_BELT_ROWS, Math.floor((time - buildStart) / s.buildSecondsPerSegment) + 1);
    items = items.map((pos) => pos - s.beltSpeed * STEP).filter((pos) => pos > 0);
    if (rows < PREVIEW_BELT_ROWS) {
      carry = 0;
      continue;
    }
    carry = Math.min(1 + s.unloadItemsPerSecond * STEP, carry + s.unloadItemsPerSecond * STEP);
    while (carry >= 1) {
      if (items.some((pos) => Math.abs(pos - UNLOAD_DEPTH) < s.beltItemSpacing)) break;
      items.push(UNLOAD_DEPTH);
      carry -= 1;
    }
  }
  return { landingProgress: progress, heightFraction: landingHeightFraction(progress), beltRows, items };
}
