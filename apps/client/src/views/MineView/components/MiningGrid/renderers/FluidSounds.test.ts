import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { FireField, MINING_SPATIAL_AUDIO_PRESETS, quantizeFluidLevel, type FluidClientDefinition } from '@mine-me/shared';
import { BURN_LOOP_SYNC_INTERVAL_MS, FluidSounds, IGNITE_SOUND_INTERVAL_MS, MAX_BURN_LOOPS } from './FluidSounds';
import { FluidRenderer } from './FluidRenderer';

const q = quantizeFluidLevel;
const sound = (url: string, volume = 1) => ({ url, volume, loop: false });
const OIL: FluidClientDefinition = {
  id: 1, typeKey: 'OIL', name: 'Oil', color: '#000', opacity: 0.9, viscosity: 0.6, density: 0.8,
  sounds: { enter: sound('/assets/sounds/in.mp3', 0.5), exit: sound('/assets/sounds/out.mp3', 0.25), ignite: sound('/assets/sounds/whoosh.mp3', 0.8), burn: { ...sound('/assets/sounds/crackle.mp3', 0.6), loop: true } },
};
const MUTE: FluidClientDefinition = { ...OIL, id: 2, typeKey: 'MUTE', sounds: undefined };

function setup(defs: FluidClientDefinition[] = [OIL, MUTE]) {
  const fluids = new FluidRenderer(new Container(), 40, 40, defs, 64);
  const fire = new FireField(40, 40);
  const sm = {
    playPositionalSfx: vi.fn(),
    playLoopingSfx: vi.fn(),
    updateLoopingSfxPosition: vi.fn(),
    stopLoopingSfx: vi.fn(),
  };
  const sounds = new FluidSounds(sm as any, fluids, fire);
  const burn = (x: number, y: number, fluidId = 1) => {
    fluids.apply([[x, y, fluidId, q(1)]]);
    fire.set(x, y, true);
  };
  let now = 10_000;
  const advance = (ms: number) => (now += ms);
  return { fluids, fire, sm, sounds, burn, now: () => now, advance };
}

describe('FluidSounds: splashes', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it('plays the fluid\'s enter sound where it happened, at the volume set on that fluid, with splash falloff', () => {
    t.sounds.onSplashes([{ kind: 'enter', fluidId: 1, x: 12.5, y: 30 }]);
    expect(t.sm.playPositionalSfx).toHaveBeenCalledWith('/assets/sounds/in.mp3', { x: 12.5, y: 30 }, { volumeScale: 0.5, spatial: MINING_SPATIAL_AUDIO_PRESETS.FLUID_SPLASH });
  });

  it('plays the exit sound for a body climbing out', () => {
    t.sounds.onSplashes([{ kind: 'exit', fluidId: 1, x: 3, y: 4 }]);
    expect(t.sm.playPositionalSfx).toHaveBeenCalledWith('/assets/sounds/out.mp3', { x: 3, y: 4 }, expect.objectContaining({ volumeScale: 0.25 }));
  });

  it('plays one sound per event', () => {
    t.sounds.onSplashes([{ kind: 'enter', fluidId: 1, x: 1, y: 1 }, { kind: 'exit', fluidId: 1, x: 9, y: 9 }, { kind: 'enter', fluidId: 1, x: 5, y: 5 }]);
    expect(t.sm.playPositionalSfx).toHaveBeenCalledTimes(3);
  });

  it('is silent for a fluid with no sounds, an unknown fluid, or a slot with no sound', () => {
    t.sounds.onSplashes([{ kind: 'enter', fluidId: 2, x: 1, y: 1 }, { kind: 'enter', fluidId: 9, x: 1, y: 1 }]);
    const half = setup([{ ...OIL, sounds: { exit: sound('/x.mp3') } }]);
    half.sounds.onSplashes([{ kind: 'enter', fluidId: 1, x: 1, y: 1 }]);
    expect(t.sm.playPositionalSfx).not.toHaveBeenCalled();
    expect(half.sm.playPositionalSfx).not.toHaveBeenCalled();
  });
});

describe('FluidSounds: catching fire', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it('plays the ignite sound at a cell that started burning', () => {
    t.burn(7, 8);
    t.sounds.onFireChanges([[7, 8, 1]], t.now());
    expect(t.sm.playPositionalSfx).toHaveBeenCalledWith('/assets/sounds/whoosh.mp3', { x: 7.5, y: 8.5 }, { volumeScale: 0.8, spatial: MINING_SPATIAL_AUDIO_PRESETS.FIRE_IGNITE });
  });

  it('does not play for a fire going out, or a cell with silent fluid', () => {
    t.burn(7, 8);
    t.sounds.onFireChanges([[7, 8, 0]], t.now());
    t.burn(9, 9, 2);
    t.sounds.onFireChanges([[9, 9, 1]], t.now());
    expect(t.sm.playPositionalSfx).not.toHaveBeenCalled();
  });

  it('plays once for a burst of cells catching at the same moment, and not faster than the interval', () => {
    t.burn(1, 1); t.burn(2, 1); t.burn(3, 1);
    t.sounds.onFireChanges([[1, 1, 1], [2, 1, 1], [3, 1, 1]], t.now());
    expect(t.sm.playPositionalSfx).toHaveBeenCalledTimes(1);
    t.advance(IGNITE_SOUND_INTERVAL_MS / 2);
    t.sounds.onFireChanges([[2, 1, 1]], t.now());
    expect(t.sm.playPositionalSfx).toHaveBeenCalledTimes(1);
    t.advance(IGNITE_SOUND_INTERVAL_MS);
    t.sounds.onFireChanges([[3, 1, 1]], t.now());
    expect(t.sm.playPositionalSfx).toHaveBeenCalledTimes(2);
  });
});

describe('FluidSounds: burning loops', () => {
  let t: ReturnType<typeof setup>;
  const sync = (focus = { x: 5, y: 5 }) => { t.advance(BURN_LOOP_SYNC_INTERVAL_MS + 1); t.sounds.syncLoops(t.now(), focus); };
  beforeEach(() => { t = setup(); });

  it('plays nothing when nothing burns', () => {
    sync();
    expect(t.sm.playLoopingSfx).not.toHaveBeenCalled();
    expect(t.sounds.activeLoops).toBe(0);
  });

  it('starts a positional loop on a burning cell, at the volume set on the fluid', () => {
    t.burn(6, 6);
    sync();
    expect(t.sm.playLoopingSfx).toHaveBeenCalledWith('fluid_burn_0', '/assets/sounds/crackle.mp3', { volumeScale: 0.6, position: { x: 6.5, y: 6.5 }, spatial: MINING_SPATIAL_AUDIO_PRESETS.FIRE_CRACKLE });
  });

  it('plays only a few loops however big the fire is, on the nearest cells', () => {
    for (let x = 0; x < 30; x++) t.burn(x, 10);
    sync({ x: 0, y: 10 });
    expect(t.sm.playLoopingSfx).toHaveBeenCalledTimes(MAX_BURN_LOOPS);
    const cells = t.sm.playLoopingSfx.mock.calls.map((c) => c[2].position.x).sort((a: number, b: number) => a - b);
    expect(cells).toEqual([0.5, 1.5, 2.5, 3.5]);
  });

  it('stops a loop when its fire goes out', () => {
    t.burn(6, 6);
    sync();
    t.fire.set(6, 6, false);
    sync();
    expect(t.sm.stopLoopingSfx).toHaveBeenCalledWith('fluid_burn_0');
    expect(t.sounds.activeLoops).toBe(0);
  });

  it('keeps a loop where it is while its cell is among the nearest, and updates its position', () => {
    t.burn(6, 6);
    sync();
    t.sm.playLoopingSfx.mockClear();
    sync({ x: 6, y: 7 });
    expect(t.sm.playLoopingSfx).not.toHaveBeenCalled();
    expect(t.sm.updateLoopingSfxPosition).toHaveBeenCalledWith('fluid_burn_0', { x: 6.5, y: 6.5 }, MINING_SPATIAL_AUDIO_PRESETS.FIRE_CRACKLE);
  });

  it('hands loops to nearer fire as the player moves, without restarting the ones that stay', () => {
    for (let x = 0; x < 30; x++) t.burn(x, 10);
    sync({ x: 0, y: 10 });
    t.sm.playLoopingSfx.mockClear();
    t.sm.stopLoopingSfx.mockClear();
    sync({ x: 29, y: 10 });
    expect(t.sm.stopLoopingSfx).toHaveBeenCalledTimes(MAX_BURN_LOOPS);
    expect(t.sm.playLoopingSfx).toHaveBeenCalledTimes(MAX_BURN_LOOPS);
    const cells = t.sm.playLoopingSfx.mock.calls.map((c) => c[2].position.x).sort((a: number, b: number) => a - b);
    expect(cells).toEqual([26.5, 27.5, 28.5, 29.5]);
  });

  it('only does its work a few times a second', () => {
    t.burn(6, 6);
    t.sounds.syncLoops(50_000, { x: 5, y: 5 });
    t.burn(7, 6);
    t.sounds.syncLoops(50_000 + BURN_LOOP_SYNC_INTERVAL_MS / 2, { x: 5, y: 5 });
    expect(t.sm.playLoopingSfx).toHaveBeenCalledTimes(1);
  });

  it('is silent for a burning cell of a fluid with no burn sound', () => {
    t.burn(6, 6, 2);
    sync();
    expect(t.sm.playLoopingSfx).not.toHaveBeenCalled();
  });

  it('destroy stops every loop', () => {
    t.burn(6, 6);
    t.burn(7, 6);
    sync();
    t.sounds.destroy();
    expect(t.sm.stopLoopingSfx).toHaveBeenCalledTimes(2);
    expect(t.sounds.activeLoops).toBe(0);
  });
});
