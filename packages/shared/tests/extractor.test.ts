import { describe, it, expect } from 'vitest';
import {
  BLOCK_SCALE,
  DEFAULT_EXTRACTOR,
  EXTRACTOR_SOUND_SLOTS,
  normalizeExtractorSoundRefs,
  pickDefaultExtractor,
  resolveExtractorSounds,
  validateExtractor,
  type ExtractorDefinition,
} from '../src';

const valid = (over: Partial<ExtractorDefinition> = {}): ExtractorDefinition => ({ ...DEFAULT_EXTRACTOR, id: 'x', ...over });

describe('validateExtractor', () => {
  it('accepts the built-in default', () => {
    expect(validateExtractor(DEFAULT_EXTRACTOR)).toEqual([]);
  });

  it('needs a lower case key and a name', () => {
    expect(validateExtractor(valid({ key: 'Basic' }))).toHaveLength(1);
    expect(validateExtractor(valid({ key: '1abc' }))).toHaveLength(1);
    expect(validateExtractor(valid({ name: '  ' }))).toHaveLength(1);
  });

  it('needs whole sizes of at least 1', () => {
    expect(validateExtractor(valid({ width: 0 }))).toHaveLength(1);
    expect(validateExtractor(valid({ height: 2.5 }))).toHaveLength(1);
    expect(validateExtractor(valid({ shaftWidth: 0 }))).toHaveLength(1);
    expect(validateExtractor(valid({ shaftWidth: 1 }))).toEqual([]);
  });

  it('needs positive rates and health', () => {
    for (const field of ['buildSecondsPerSegment', 'beltSpeed', 'beltItemSpacing', 'depositItemsPerSecond', 'unloadItemsPerSecond', 'beltSegmentHealth', 'health'] as const) {
      expect(validateExtractor(valid({ [field]: 0 })), field).toHaveLength(1);
      expect(validateExtractor(valid({ [field]: -1 })), field).toHaveLength(1);
      expect(validateExtractor(valid({ [field]: Number.NaN })), field).toHaveLength(1);
    }
  });

  it('only accepts an /assets/ texture (or none)', () => {
    expect(validateExtractor(valid({ textureUrl: '/assets/sprites/extractor.png' }))).toEqual([]);
    expect(validateExtractor(valid({ textureUrl: null }))).toEqual([]);
    expect(validateExtractor(valid({ textureUrl: 'https://example.com/x.png' }))).toHaveLength(1);
  });

  it('reports every problem, not just the first', () => {
    expect(validateExtractor({}).length).toBeGreaterThan(5);
  });
});

describe('pickDefaultExtractor', () => {
  it('prefers the one marked default, then the first, then the built-in', () => {
    const a = valid({ id: 'a', isDefault: false });
    const b = valid({ id: 'b', isDefault: true });
    expect(pickDefaultExtractor([a, b]).id).toBe('b');
    expect(pickDefaultExtractor([a]).id).toBe('a');
    expect(pickDefaultExtractor([]).id).toBe(DEFAULT_EXTRACTOR.id);
  });

  it('hands out a copy of the built-in so callers cannot change it', () => {
    pickDefaultExtractor([]).health = 1;
    expect(DEFAULT_EXTRACTOR.health).toBe(500);
  });
});

describe('extractor data follows the block scale', () => {
  it('has a footprint in small blocks', () => {
    expect(DEFAULT_EXTRACTOR.width).toBe(4 * BLOCK_SCALE);
  });
});

describe('extractor sound slots', () => {
  it('offers landing and a toggleable, default-looping running sound', () => {
    expect(EXTRACTOR_SOUND_SLOTS.map((s) => s.slotKey)).toEqual(['landing', 'loop', 'unload', 'beltBreak']);
    expect(EXTRACTOR_SOUND_SLOTS[1].defaultLoop).toBe(true);
  });

  it('keeps only known slots when normalising, with a per-slot volume', () => {
    const refs = normalizeExtractorSoundRefs({ landing: { soundId: 's1', volume: 0.4 }, bogus: { soundId: 's2' } });
    expect(Object.keys(refs)).toEqual(['landing']);
    expect(refs.landing?.volume).toBe(0.4);
  });

  it('resolves to urls from the library and leaves a missing sound silent', () => {
    const library = new Map([['s1', { url: '/assets/sounds/land.wav', isActive: true }]]);
    const resolved = resolveExtractorSounds({ landing: { soundId: 's1', volume: 0.5 }, loop: { soundId: 'gone' } }, library);
    expect(resolved.landing?.url).toBe('/assets/sounds/land.wav');
    expect(resolved.landing?.volume).toBe(0.5);
    expect(resolved.loop?.url ?? null).toBeNull();
  });
});
