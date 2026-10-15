import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { MINING_SPATIAL_AUDIO_PRESETS, type GasClientDefinition } from '@mine-me/shared';
import { EXPLODE_SOUND_INTERVAL_MS, GasSounds } from './GasSounds';
import { GasRenderer } from './GasRenderer';

const sound = (url: string, volume = 1) => ({ url, volume, loop: false });
const HYDROGEN: GasClientDefinition = {
  id: 1, typeKey: 'HYDROGEN', name: 'Hydrogen', color: '#dff1ff', opacity: 0.4, density: 0.07,
  sounds: {
    enter: sound('/assets/sounds/in.mp3', 0.5), exit: sound('/assets/sounds/out.mp3', 0.25), ignite: sound('/assets/sounds/whoosh.mp3', 0.8),
    explode: sound('/assets/sounds/boom.mp3', 0.9), vent: sound('/assets/sounds/hiss.mp3', 0.6),
  },
};
const MUTE: GasClientDefinition = { ...HYDROGEN, id: 2, typeKey: 'MUTE', sounds: undefined };

function setup() {
  const gases = new GasRenderer(new Container(), 40, 40, [HYDROGEN, MUTE], 64);
  const sm = { playPositionalSfx: vi.fn() };
  return { sm, sounds: new GasSounds(sm as any, gases) };
}

describe('GasSounds: events', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it('plays the gas\'s own sound for each kind of event, where it happened, at the volume set on that gas', () => {
    t.sounds.onEvents([
      { kind: 'enter', gasId: 1, x: 12.5, y: 30 },
      { kind: 'exit', gasId: 1, x: 14.5, y: 30 },
      { kind: 'ignite', gasId: 1, x: 3.5, y: 4.5 },
      { kind: 'vent', gasId: 1, x: 7.5, y: 2.5 },
    ]);
    expect(t.sm.playPositionalSfx.mock.calls).toEqual([
      ['/assets/sounds/in.mp3', { x: 12.5, y: 30 }, { volumeScale: 0.5, spatial: MINING_SPATIAL_AUDIO_PRESETS.GAS_ENTER }],
      ['/assets/sounds/out.mp3', { x: 14.5, y: 30 }, { volumeScale: 0.25, spatial: MINING_SPATIAL_AUDIO_PRESETS.GAS_ENTER }],
      ['/assets/sounds/whoosh.mp3', { x: 3.5, y: 4.5 }, { volumeScale: 0.8, spatial: MINING_SPATIAL_AUDIO_PRESETS.GAS_IGNITE }],
      ['/assets/sounds/hiss.mp3', { x: 7.5, y: 2.5 }, { volumeScale: 0.6, spatial: MINING_SPATIAL_AUDIO_PRESETS.GAS_VENT }],
    ]);
  });

  it('is silent for a gas with no sounds, an unknown gas, and an empty slot', () => {
    t.sounds.onEvents([{ kind: 'enter', gasId: 2, x: 1, y: 1 }, { kind: 'enter', gasId: 9, x: 1, y: 1 }]);
    expect(t.sm.playPositionalSfx).not.toHaveBeenCalled();
    const partial = new GasSounds(t.sm as any, new GasRenderer(new Container(), 40, 40, [{ ...HYDROGEN, sounds: { vent: sound('/assets/sounds/hiss.mp3') } }], 64));
    partial.onEvents([{ kind: 'enter', gasId: 1, x: 1, y: 1 }]);
    expect(t.sm.playPositionalSfx).not.toHaveBeenCalled();
    partial.onEvents([{ kind: 'vent', gasId: 1, x: 1, y: 1 }]);
    expect(t.sm.playPositionalSfx).toHaveBeenCalledTimes(1);
  });

  it('plays a full volume sound when the slot has no volume set', () => {
    const noVolume = new GasSounds(t.sm as any, new GasRenderer(new Container(), 40, 40, [{ ...HYDROGEN, sounds: { vent: { url: '/assets/sounds/hiss.mp3' } } }], 64));
    noVolume.onEvents([{ kind: 'vent', gasId: 1, x: 1, y: 1 }]);
    expect(t.sm.playPositionalSfx.mock.calls[0][2]).toMatchObject({ volumeScale: 1 });
  });
});

describe('GasSounds: explosions', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it('booms once for a batch of detonated cells, from the middle of it', () => {
    t.sounds.onExplosions([[10, 5, 1], [11, 5, 1], [12, 5, 1]], 1000);
    expect(t.sm.playPositionalSfx).toHaveBeenCalledTimes(1);
    expect(t.sm.playPositionalSfx).toHaveBeenCalledWith('/assets/sounds/boom.mp3', { x: 11.5, y: 5.5 }, { volumeScale: 0.9, spatial: MINING_SPATIAL_AUDIO_PRESETS.GAS_EXPLOSION });
  });

  it('does not boom faster than the interval, then booms again once it has passed', () => {
    t.sounds.onExplosions([[10, 5, 1]], 1000);
    t.sounds.onExplosions([[11, 5, 1]], 1000 + EXPLODE_SOUND_INTERVAL_MS - 1);
    expect(t.sm.playPositionalSfx).toHaveBeenCalledTimes(1);
    t.sounds.onExplosions([[12, 5, 1]], 1000 + EXPLODE_SOUND_INTERVAL_MS);
    expect(t.sm.playPositionalSfx).toHaveBeenCalledTimes(2);
  });

  it('a silent gas does not use up the interval, and an empty batch does nothing', () => {
    t.sounds.onExplosions([[10, 5, 2]], 1000);
    t.sounds.onExplosions([], 1000);
    expect(t.sm.playPositionalSfx).not.toHaveBeenCalled();
    t.sounds.onExplosions([[10, 5, 1]], 1001);
    expect(t.sm.playPositionalSfx).toHaveBeenCalledTimes(1);
  });
});
