import { describe, it, expect } from 'vitest';
import { FLASH_VISIBLE_SECONDS, LIGHTNING_SLOT_SECONDS, flashOf, lightningAt, strikesBetween } from './lightning';

const stormy = { weather: { storm: 1 } };
const calm = { weather: { clear: 1 } };

describe('strikesBetween', () => {
  it('finds strikes in a storm and none in clear weather', () => {
    expect(strikesBetween(5, stormy, 0, 600).length).toBeGreaterThan(20);
    expect(strikesBetween(5, calm, 0, 600)).toEqual([]);
  });

  it('is the same for the same seed and range, so every player sees the flash together', () => {
    expect(strikesBetween(5, stormy, 0, 300)).toEqual(strikesBetween(5, stormy, 0, 300));
    expect(strikesBetween(5, stormy, 0, 300)).not.toEqual(strikesBetween(6, stormy, 0, 300));
  });

  it('returns each strike once, whichever way the range is cut', () => {
    const whole = strikesBetween(8, stormy, 0, 120);
    const parts = [...strikesBetween(8, stormy, 0, 37), ...strikesBetween(8, stormy, 37, 120)];
    expect(parts).toEqual(whole);
  });

  it('keeps strikes in time order inside their slots, with a thunder delay that grows with distance', () => {
    const strikes = strikesBetween(3, stormy, 0, 300);
    for (let i = 1; i < strikes.length; i++) expect(strikes[i].time).toBeGreaterThanOrEqual(strikes[i - 1].time);
    for (const s of strikes) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(1);
      expect(s.thunderDelay).toBeCloseTo(0.35 + s.distance * 5);
    }
    const near = strikes.reduce((a, b) => (a.distance < b.distance ? a : b));
    const far = strikes.reduce((a, b) => (a.distance > b.distance ? a : b));
    expect(far.thunderDelay).toBeGreaterThan(near.thunderDelay);
  });

  it('adds the strike the sandbox called for', () => {
    const strikes = strikesBetween(1, calm, 0, 100, { strikeAt: 40 });
    expect(strikes).toHaveLength(1);
    expect(strikes[0].time).toBe(40);
    expect(strikesBetween(1, calm, 41, 100, { strikeAt: 40 })).toEqual([]);
  });

  it('lets a forced storm flash even when the seeded weather is clear', () => {
    expect(strikesBetween(1, calm, 0, 300, { weather: 'storm' }).length).toBeGreaterThan(10);
  });

  it('has at most one strike a slot', () => {
    const strikes = strikesBetween(2, stormy, 0, 300);
    const slots = strikes.map((s) => Math.floor(s.time / LIGHTNING_SLOT_SECONDS));
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe('flashOf', () => {
  it('is dark before the strike, brightest at it, and fades with a smaller second pulse', () => {
    expect(flashOf(-0.1)).toBe(0);
    expect(flashOf(0)).toBe(1);
    expect(flashOf(0.1)).toBeLessThan(flashOf(0.02));
    expect(flashOf(0.24)).toBeGreaterThan(flashOf(0.18));
    expect(flashOf(0.24)).toBeLessThan(0.75);
    expect(flashOf(FLASH_VISIBLE_SECONDS + 0.5)).toBeLessThan(0.01);
  });
});

describe('lightningAt', () => {
  it('flashes at the strike time and is dark again soon after', () => {
    const [strike] = strikesBetween(4, stormy, 0, 60);
    expect(lightningAt(4, stormy, strike.time).flash).toBeGreaterThan(0.9);
    expect(lightningAt(4, stormy, strike.time).strike).toEqual(strike);
    expect(lightningAt(4, stormy, strike.time + 1).flash).toBeLessThan(0.05);
    expect(lightningAt(4, stormy, strike.time + 1).strike).toBeNull();
  });

  it('never flashes in clear weather', () => {
    for (let t = 0; t < 200; t += 0.25) expect(lightningAt(4, calm, t).flash).toBe(0);
  });
});
