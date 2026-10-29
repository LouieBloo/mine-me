import { describe, it, expect } from 'vitest';
import { SurfaceClock } from './SurfaceClock';

describe('SurfaceClock', () => {
  it('reads the seconds since the weather clock started', () => {
    const clock = new SurfaceClock(1_000_000, 1_090_000, 5_000);
    // The server was 90 s into the clock when the message arrived
    expect(clock.seconds(5_000)).toBe(90);
    expect(clock.seconds(15_000)).toBe(100);
  });

  it('corrects for a local clock that is wrong, so two clients with different clocks agree', () => {
    const a = new SurfaceClock(0, 500_000, 10_000);
    const b = new SurfaceClock(0, 500_000, 9_999_000);
    expect(a.seconds(10_000 + 2_000)).toBeCloseTo(502);
    expect(b.seconds(9_999_000 + 2_000)).toBeCloseTo(502);
  });

  it('never goes before the start', () => {
    expect(new SurfaceClock(10_000, 4_000, 0).seconds(0)).toBe(0);
  });
});
