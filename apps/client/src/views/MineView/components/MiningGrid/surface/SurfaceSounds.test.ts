import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SURFACE_ENVIRONMENT, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { LOOP_FLOOR, RAIN_LOOP_KEY, SurfaceSounds, WIND_LOOP_KEY } from './SurfaceSounds';

const sound = { playSfx: vi.fn(), playLoopingSfx: vi.fn(), stopLoopingSfx: vi.fn() };
const env = (sounds: SurfaceEnvironmentDefinition['sounds'] = {}): SurfaceEnvironmentDefinition => ({ ...DEFAULT_SURFACE_ENVIRONMENT, sounds });
const withAll = env({ rain: { url: '/assets/sounds/rain.mp3', volume: 0.5 }, wind: { url: '/assets/sounds/wind.mp3' }, thunder: { url: '/assets/sounds/thunder.mp3', volume: 0.8 } });
const calm = { rainIntensity: 0, snow: 0, wind: 0 };
const strike = (time: number, distance = 0, thunderDelay = 2) => ({ time, x: 0.5, distance, thunderDelay });

beforeEach(() => {
  sound.playSfx.mockClear();
  sound.playLoopingSfx.mockClear();
  sound.stopLoopingSfx.mockClear();
});

describe('the loops', () => {
  it('plays the rain loop at the slot\'s volume times the rain, and the wind loop with the wind', () => {
    const s = new SurfaceSounds(sound, withAll);
    s.update({ rainIntensity: 0.8, snow: 0, wind: 0.4 }, 1, [], 0);
    expect(sound.playLoopingSfx).toHaveBeenCalledWith(RAIN_LOOP_KEY, '/assets/sounds/rain.mp3', expect.objectContaining({ volumeScale: expect.closeTo(0.5 * 0.8, 5) }));
    expect(sound.playLoopingSfx).toHaveBeenCalledWith(WIND_LOOP_KEY, '/assets/sounds/wind.mp3', expect.objectContaining({ volumeScale: expect.closeTo(0.4, 5) }));
    expect(s.activeLoops).toBe(2);
  });

  it('is silent for an environment with no sounds', () => {
    const s = new SurfaceSounds(sound, env({}));
    s.update({ rainIntensity: 1, snow: 1, wind: 1 }, 1, [strike(0)], 100);
    expect(sound.playLoopingSfx).not.toHaveBeenCalled();
    expect(sound.playSfx).not.toHaveBeenCalled();
  });

  it('stops a loop when its weather ends, and starts it again when it returns', () => {
    const s = new SurfaceSounds(sound, withAll);
    s.update({ rainIntensity: 0.9, snow: 0, wind: 0 }, 1, [], 0);
    s.update(calm, 1, [], 1);
    expect(sound.stopLoopingSfx).toHaveBeenCalledWith(RAIN_LOOP_KEY);
    expect(s.activeLoops).toBe(0);
    s.update({ rainIntensity: 0.9, snow: 0, wind: 0 }, 1, [], 2);
    expect(sound.playLoopingSfx).toHaveBeenCalledTimes(2);
  });

  it('fades with depth: quieter as the camera goes down, stopped underground', () => {
    const s = new SurfaceSounds(sound, withAll);
    s.update({ rainIntensity: 1, snow: 0, wind: 0 }, 1, [], 0);
    s.update({ rainIntensity: 1, snow: 0, wind: 0 }, 0.4, [], 1);
    const scales = sound.playLoopingSfx.mock.calls.filter((c) => c[0] === RAIN_LOOP_KEY).map((c) => c[2].volumeScale);
    expect(scales[1]).toBeLessThan(scales[0]);
    s.update({ rainIntensity: 1, snow: 0, wind: 0 }, 0, [], 2);
    expect(sound.stopLoopingSfx).toHaveBeenCalledWith(RAIN_LOOP_KEY);
  });

  it('does not tell the sound manager again while the volume has not changed enough to hear', () => {
    const s = new SurfaceSounds(sound, withAll);
    s.update({ rainIntensity: 0.6, snow: 0, wind: 0 }, 1, [], 0);
    s.update({ rainIntensity: 0.61, snow: 0, wind: 0 }, 1, [], 1);
    s.update({ rainIntensity: 0.59, snow: 0, wind: 0 }, 1, [], 2);
    expect(sound.playLoopingSfx).toHaveBeenCalledTimes(1);
    s.update({ rainIntensity: 0.9, snow: 0, wind: 0 }, 1, [], 3);
    expect(sound.playLoopingSfx).toHaveBeenCalledTimes(2);
  });

  it('keeps the floor so a barely audible loop is not left running', () => {
    expect(LOOP_FLOOR).toBeGreaterThan(0);
    const s = new SurfaceSounds(sound, withAll);
    s.update({ rainIntensity: 0.01, snow: 0, wind: 0 }, 1, [], 0);
    expect(sound.playLoopingSfx).not.toHaveBeenCalled();
  });
});

describe('thunder', () => {
  it('plays after the flash, delayed by the strike\'s distance, at the slot\'s volume', () => {
    const s = new SurfaceSounds(sound, withAll);
    s.update(calm, 1, [strike(10, 0, 2)], 10);
    expect(sound.playSfx).not.toHaveBeenCalled();
    expect(s.pendingThunder).toBe(1);
    s.update(calm, 1, [], 11.9);
    expect(sound.playSfx).not.toHaveBeenCalled();
    s.update(calm, 1, [], 12.1);
    expect(sound.playSfx).toHaveBeenCalledWith('/assets/sounds/thunder.mp3', expect.objectContaining({ volumeScale: expect.closeTo(0.8, 5) }));
    expect(s.pendingThunder).toBe(0);
  });

  it('is quieter for a far strike', () => {
    const s = new SurfaceSounds(sound, withAll);
    s.update(calm, 1, [strike(0, 0, 1), strike(0, 1, 1)], 5);
    const [near, far] = sound.playSfx.mock.calls.map((c) => c[1].volumeScale);
    expect(far).toBeLessThan(near);
  });

  it('is quieter with depth and silent underground, but still used up', () => {
    const s = new SurfaceSounds(sound, withAll);
    s.update(calm, 0, [strike(0, 0, 1)], 3);
    expect(sound.playSfx).not.toHaveBeenCalled();
    expect(s.pendingThunder).toBe(0);
    s.update(calm, 0.5, [strike(10, 0, 1)], 12);
    expect(sound.playSfx.mock.calls[0][1].volumeScale).toBeCloseTo(0.8 * 0.5);
  });

  it('drops thunder that is long overdue (the tab was in the background)', () => {
    const s = new SurfaceSounds(sound, withAll);
    s.update(calm, 1, [strike(0, 0, 1)], 60);
    expect(sound.playSfx).not.toHaveBeenCalled();
  });
});

describe('changing and stopping', () => {
  it('stops everything when the environment changes, and forgets thunder on its way', () => {
    const s = new SurfaceSounds(sound, withAll);
    s.update({ rainIntensity: 1, snow: 0, wind: 1 }, 1, [strike(0, 0, 5)], 0);
    s.setEnvironment(env({}));
    expect(sound.stopLoopingSfx).toHaveBeenCalledWith(RAIN_LOOP_KEY);
    expect(sound.stopLoopingSfx).toHaveBeenCalledWith(WIND_LOOP_KEY);
    expect(s.activeLoops).toBe(0);
    expect(s.pendingThunder).toBe(0);
  });
});
