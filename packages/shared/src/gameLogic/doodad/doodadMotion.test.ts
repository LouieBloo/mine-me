import { describe, it, expect } from 'vitest';
import {
  DOODAD_MOTION_PRESETS,
  DOODAD_MOTION_PRESET_NAMES,
  DRIP_DROP_PART,
  IDENTITY_DOODAD_POSE,
  doodadCycle,
  doodadLightConfig,
  doodadPhase,
  dripLandedBetween,
  dripProgress,
  evaluateDoodadMotion,
  isDoodadMotionPreset,
} from './doodadMotion';
import { validateDoodadMotion } from '../../types/doodad';

describe('the doodad motion registry', () => {
  it('has the five presets of ticket 103, each with a name that matches its key', () => {
    expect([...DOODAD_MOTION_PRESET_NAMES].sort()).toEqual(['bob', 'drip', 'flicker', 'pulse', 'sway']);
    for (const [key, preset] of Object.entries(DOODAD_MOTION_PRESETS)) expect(preset.name).toBe(key);
    expect(isDoodadMotionPreset('sway')).toBe(true);
    expect(isDoodadMotionPreset('toString')).toBe(false); // not an inherited object key
    expect(isDoodadMotionPreset('wiggle')).toBe(false);
  });

  it('is checked by the doodad validation', () => {
    expect(validateDoodadMotion({ preset: 'flicker' })).toEqual([]);
    expect(validateDoodadMotion({ preset: 'wiggle' })[0]).toMatch(/motion.preset must be one of bob, drip, flicker, pulse, sway|motion.preset must be one of/);
  });

  it('gives the same pose for the same time, and a different one at another time', () => {
    for (const preset of DOODAD_MOTION_PRESET_NAMES) {
      const motion = { preset };
      expect(evaluateDoodadMotion(motion, 1.234, 0.3)).toEqual(evaluateDoodadMotion(motion, 1.234, 0.3));
    }
    expect(evaluateDoodadMotion({ preset: 'sway' }, 0.2, 0).rotation).not.toBe(evaluateDoodadMotion({ preset: 'sway' }, 0.6, 0).rotation);
  });

  it('stands still with no motion or an unknown preset', () => {
    expect(evaluateDoodadMotion(null, 3, 0.5)).toEqual(IDENTITY_DOODAD_POSE);
    expect(evaluateDoodadMotion({ preset: 'wiggle' }, 3, 0.5)).toEqual(IDENTITY_DOODAD_POSE);
  });

  it('sway turns about the base within its amplitude, and a part can be kept planted with a weight', () => {
    let peak = 0;
    for (let t = 0; t < 5; t += 0.01) peak = Math.max(peak, Math.abs(evaluateDoodadMotion({ preset: 'sway', amplitude: 0.1, speed: 1 }, t, 0).rotation));
    expect(peak).toBeGreaterThan(0.07);
    expect(peak).toBeLessThanOrEqual(0.1 + 1e-9);
    const motion = { preset: 'sway', amplitude: 0.1, speed: 1, params: { weight_stem: 0 } };
    expect(evaluateDoodadMotion(motion, 0.2, 0, 'stem').rotation).toBe(0);
    expect(evaluateDoodadMotion(motion, 0.2, 0, 'cap').rotation).not.toBe(0);
  });

  it('pulse swells and dims together, bob moves only up and down, flicker only dims', () => {
    const pulse = Array.from({ length: 100 }, (_, i) => evaluateDoodadMotion({ preset: 'pulse', speed: 1 }, i / 100, 0));
    expect(Math.max(...pulse.map((p) => p.scaleX))).toBeGreaterThan(1);
    expect(Math.min(...pulse.map((p) => p.scaleX))).toBeLessThan(1);
    expect(Math.min(...pulse.map((p) => p.alpha))).toBeLessThan(1);
    const bob = evaluateDoodadMotion({ preset: 'bob', speed: 1 }, 0.25, 0);
    expect(bob.y).toBeGreaterThan(0);
    expect(bob.x).toBe(0);
    expect(bob.rotation).toBe(0);
    for (let t = 0; t < 4; t += 0.05) {
      const f = evaluateDoodadMotion({ preset: 'flicker' }, t, 0.1);
      expect(f.alpha).toBeLessThanOrEqual(1);
      expect(f.alpha).toBeGreaterThan(0.4);
      expect(f.rotation).toBe(0);
    }
  });

  it('gives each placed doodad its own phase, so a field does not move in step, unless the motion fixes one', () => {
    expect(doodadPhase(3, 4)).toBe(doodadPhase(3, 4));
    expect(doodadPhase(3, 4)).not.toBe(doodadPhase(4, 3));
    for (let x = 0; x < 50; x++) expect(doodadPhase(x, 7)).toBeGreaterThanOrEqual(0), expect(doodadPhase(x, 7)).toBeLessThan(1);
    const motion = { preset: 'sway' };
    expect(evaluateDoodadMotion(motion, 1, doodadPhase(1, 1)).rotation).not.toBe(evaluateDoodadMotion(motion, 1, doodadPhase(2, 9)).rotation);
    const fixed = { preset: 'sway', phase: 0.25 };
    expect(evaluateDoodadMotion(fixed, 1, 0.1)).toEqual(evaluateDoodadMotion(fixed, 1, 0.9));
    expect(doodadCycle({ preset: 'sway', speed: 2, phase: 0.5 }, 3, 0.9)).toBe(6.5);
  });

  describe('drip', () => {
    it('waits, then falls with a growing speed over its fall share of the cycle', () => {
      expect(dripProgress(0.1)).toBe(-1);
      expect(dripProgress(0.59)).toBe(-1);
      expect(dripProgress(0.6)).toBe(0);
      const half = dripProgress(0.8);
      expect(half).toBeCloseTo(0.25, 6);
      expect(dripProgress(0.99)).toBeGreaterThan(0.9);
      expect(dripProgress(1.1)).toBe(-1); // the next cycle
      expect(dripProgress(0.5, { fallShare: 0.6 })).toBeCloseTo(((0.5 - 0.4) / 0.6) ** 2, 6);
    });

    it('moves only the part named drop, and fades it as it lands', () => {
      const motion = { preset: 'drip', speed: 1, phase: 0 };
      const falling = evaluateDoodadMotion(motion, 0.9, 0, DRIP_DROP_PART);
      expect(falling.y).toBeGreaterThan(0);
      expect(falling.alpha).toBeLessThan(1);
      expect(evaluateDoodadMotion(motion, 0.9, 0, 'rock')).toEqual(IDENTITY_DOODAD_POSE);
      const forming = evaluateDoodadMotion(motion, 0.3, 0, DRIP_DROP_PART);
      expect(forming.drop).toBe(-1);
      expect(forming.scaleX).toBeGreaterThan(0);
      expect(forming.scaleX).toBeLessThan(1);
    });

    it('tells a whole-body doodad how far its drop has fallen', () => {
      expect(evaluateDoodadMotion({ preset: 'drip', speed: 1, phase: 0 }, 0.8, 0).drop).toBeCloseTo(0.25, 6);
      expect(evaluateDoodadMotion({ preset: 'drip', speed: 1, phase: 0 }, 0.2, 0).drop).toBe(-1);
    });

    it('says when a drop landed between two moments, and only for drip', () => {
      const motion = { preset: 'drip', speed: 1, phase: 0 };
      expect(dripLandedBetween(motion, 0.9, 1.1, 0)).toBe(true);
      expect(dripLandedBetween(motion, 1.1, 1.9, 0)).toBe(false);
      expect(dripLandedBetween(motion, 0.1, 3.1, 0)).toBe(true);
      expect(dripLandedBetween({ preset: 'sway', speed: 1 }, 0.9, 1.1, 0)).toBe(false);
      expect(dripLandedBetween(motion, 2, 1, 0)).toBe(false);
    });
  });

  describe('doodadLightConfig', () => {
    const light = { enabled: true, type: 'POINT', effect: 'STATIC', color: '#fff', radius: 4, intensity: 0.5 } as const;
    it('is null with no light or a light that is off', () => {
      expect(doodadLightConfig(null, { preset: 'pulse' })).toBeNull();
      expect(doodadLightConfig({ ...light, enabled: false }, { preset: 'pulse' })).toBeNull();
    });
    it('follows a pulse or flicker motion at its speed, and leaves other lights alone', () => {
      expect(doodadLightConfig(light, { preset: 'pulse', speed: 1 })).toMatchObject({ effect: 'PULSE', pulseSpeed: Math.PI * 2 });
      expect(doodadLightConfig(light, { preset: 'flicker' })).toMatchObject({ effect: 'FLICKER' });
      expect(doodadLightConfig(light, { preset: 'sway' })).toBe(light);
      expect(doodadLightConfig(light, null)).toBe(light);
      const own = { ...light, effect: 'FLICKER' } as const;
      expect(doodadLightConfig(own, { preset: 'pulse' })).toBe(own); // its own effect wins
    });
  });
});
