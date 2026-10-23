import { describe, it, expect } from 'vitest';
import { DEFAULT_EXTRACTOR } from '@mine-me/shared';
import { PREVIEW_BELT_ROWS, previewCycleSeconds, previewFrame, type ExtractorPreviewSettings } from './previewScene';

const settings = (over: Partial<ExtractorPreviewSettings> = {}): ExtractorPreviewSettings => ({
  width: DEFAULT_EXTRACTOR.width, height: DEFAULT_EXTRACTOR.height, shaftWidth: DEFAULT_EXTRACTOR.shaftWidth,
  landingSeconds: 3, buildSecondsPerSegment: 1, beltSpeed: 6, beltItemSpacing: 1.5, unloadItemsPerSecond: 4, ...over,
});

describe('previewFrame', () => {
  it('starts high in the air with no belt, and lands over the landing time', () => {
    const start = previewFrame(0, settings());
    expect(start.heightFraction).toBe(1);
    expect(start.beltRows).toBe(0);
    const mid = previewFrame(1.5, settings());
    expect(mid.heightFraction).toBeGreaterThan(0);
    expect(mid.heightFraction).toBeLessThan(1);
    expect(previewFrame(3.2, settings()).heightFraction).toBe(0);
  });

  it('lays a segment every build time once landed, up to the preview length', () => {
    const s = settings({ buildSecondsPerSegment: 2 });
    expect(previewFrame(3 + 0.1, s).beltRows).toBe(1);
    expect(previewFrame(3 + 2.1, s).beltRows).toBe(2);
    expect(previewFrame(3 + 2 * 20, s).beltRows).toBeLessThanOrEqual(PREVIEW_BELT_ROWS);
  });

  it('a slower build rate takes longer to dig the same belt', () => {
    expect(previewFrame(8, settings({ buildSecondsPerSegment: 0.5 })).beltRows).toBeGreaterThan(previewFrame(8, settings({ buildSecondsPerSegment: 2 })).beltRows);
  });

  it('puts items on only when the belt is dug, and they never get closer than the spacing', () => {
    const s = settings();
    expect(previewFrame(3 + 2, s).items).toHaveLength(0);
    const frame = previewFrame(3 + PREVIEW_BELT_ROWS * s.buildSecondsPerSegment + 2.5, s);
    expect(frame.items.length).toBeGreaterThan(1);
    const sorted = [...frame.items].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(s.beltItemSpacing - 1e-6);
  });

  it('a faster unload rate or tighter spacing puts more items on the belt', () => {
    const t = 3 + PREVIEW_BELT_ROWS + 3;
    expect(previewFrame(t, settings({ unloadItemsPerSecond: 1 })).items.length).toBeLessThan(previewFrame(t, settings({ unloadItemsPerSecond: 8, beltItemSpacing: 0.8 })).items.length);
    expect(previewFrame(t, settings({ beltItemSpacing: 3 })).items.length).toBeLessThan(previewFrame(t, settings({ beltItemSpacing: 1 })).items.length);
  });

  it('is the same picture for the same time, and loops after one cycle', () => {
    const s = settings();
    expect(previewFrame(9.3, s)).toEqual(previewFrame(9.3, s));
    expect(previewFrame(previewCycleSeconds(s) + 1, s)).toEqual(previewFrame(1, s));
  });
});
