import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import { DoodadField, MINING_SPATIAL_AUDIO_PRESETS, MiningTileType, type DoodadClientDefinition } from '@mine-me/shared';
import { DoodadRenderer } from '../renderers/DoodadRenderer';
import {
  DOODAD_BREAK_INTERVAL_MS,
  DOODAD_ONE_SHOT_MAX_SECONDS,
  DOODAD_SOUND_SYNC_MS,
  DoodadSounds,
  MAX_DOODAD_LOOPS,
  MAX_DOODAD_ONE_SHOTS_PER_SYNC,
} from './DoodadSounds';

const T = 21;
const VIEW = { x0: 0, y0: 0, x1: 300, y1: 60 };
const def = (sounds: DoodadClientDefinition['sounds']): DoodadClientDefinition => ({ index: 0, key: 'd', name: 'd', anchor: 'FLOOR', width: 1, height: 1, zOffset: 0, sounds });

function setup(sounds: DoodadClientDefinition['sounds'], placements: Array<[number, number]>) {
  const field = new DoodadField([def(sounds)], placements.map(([x, y]) => [0, x, y, 0]));
  const renderer = new DoodadRenderer(new Container(), field, () => Promise.resolve(null), T);
  renderer.update(0, VIEW, 0.016);
  const sound = {
    playPositionalSfx: vi.fn(),
    playLoopingSfx: vi.fn(),
    updateLoopingSfxPosition: vi.fn(),
    stopLoopingSfx: vi.fn(),
  };
  const sounds_ = new DoodadSounds(sound, renderer, T);
  let now = 100_000;
  const sync = (focus = { x: 5, y: 5 }, advance = DOODAD_SOUND_SYNC_MS + 1) => {
    now += advance;
    sounds_.sync(now, focus);
  };
  return { field, renderer, sound, sounds: sounds_, sync, clock: () => now };
}

describe('DoodadSounds ambient loops', () => {
  const ambient = { ambient: { url: '/assets/sounds/hum.mp3', loop: true, volume: 0.4 } };

  it('loops the sound at each nearby doodad, at the volume of its slot and the doodad spatial preset', () => {
    const t = setup(ambient, [[6, 5]]);
    t.sync();
    expect(t.sound.playLoopingSfx).toHaveBeenCalledTimes(1);
    const [id, url, options] = t.sound.playLoopingSfx.mock.calls[0];
    expect(id).toBe('doodad_loop_0');
    expect(url).toBe('/assets/sounds/hum.mp3');
    expect(options.volumeScale).toBeCloseTo(0.4);
    expect(options.spatial).toBe(MINING_SPATIAL_AUDIO_PRESETS.DOODAD);
    expect(options.position).toEqual({ x: 6.5, y: 6 });
  });

  it('keeps the loop going where it is instead of restarting it', () => {
    const t = setup(ambient, [[6, 5]]);
    t.sync();
    t.sync();
    expect(t.sound.playLoopingSfx).toHaveBeenCalledTimes(1);
    expect(t.sound.updateLoopingSfxPosition).toHaveBeenCalled();
  });

  it(`never plays more than ${MAX_DOODAD_LOOPS} at once, and gives them to the nearest`, () => {
    const t = setup(ambient, Array.from({ length: 10 }, (_, i) => [5 + i, 5] as [number, number]));
    t.sync({ x: 5, y: 5 });
    expect(t.sound.playLoopingSfx).toHaveBeenCalledTimes(MAX_DOODAD_LOOPS);
    expect(t.sounds.activeLoops).toBe(MAX_DOODAD_LOOPS);
    const xs = t.sound.playLoopingSfx.mock.calls.map((c) => c[2].position.x).sort((a, b) => a - b);
    expect(xs).toEqual([5.5, 6.5, 7.5, 8.5]);
  });

  it('plays nothing for doodads too far to hear, or with no sound', () => {
    const far = setup(ambient, [[250, 5]]);
    far.sync({ x: 5, y: 5 });
    expect(far.sound.playLoopingSfx).not.toHaveBeenCalled();
    const silent = setup(undefined, [[6, 5]]);
    silent.sync();
    expect(silent.sound.playLoopingSfx).not.toHaveBeenCalled();
    expect(silent.sound.playPositionalSfx).not.toHaveBeenCalled();
  });

  it('stops the loop when the player walks away, and everything on destroy', () => {
    const t = setup(ambient, [[6, 5]]);
    t.sync();
    t.sync({ x: 250, y: 5 });
    expect(t.sound.stopLoopingSfx).toHaveBeenCalledWith('doodad_loop_0');
    t.sync();
    t.sounds.destroy();
    expect(t.sound.stopLoopingSfx).toHaveBeenCalledWith('doodad_loop_0');
  });

  it('only does its work a few times a second', () => {
    const t = setup(ambient, [[6, 5]]);
    t.sync();
    t.sync({ x: 5, y: 5 }, 10);
    expect(t.sound.updateLoopingSfxPosition).not.toHaveBeenCalled();
  });
});

describe('DoodadSounds one-off ambient sounds', () => {
  const chirp = { ambient: { url: '/assets/sounds/chirp.mp3', loop: false, volume: 0.7 } };

  it('plays now and then, out of step, not on the first look', () => {
    const t = setup(chirp, [[6, 5]]);
    t.sync();
    expect(t.sound.playPositionalSfx).not.toHaveBeenCalled(); // it waits a while first
    for (let i = 0; i < 40; i++) t.sync();
    expect(t.sound.playPositionalSfx).toHaveBeenCalled();
    const [url, position, options] = t.sound.playPositionalSfx.mock.calls[0];
    expect(url).toBe('/assets/sounds/chirp.mp3');
    expect(position).toEqual({ x: 6.5, y: 6 });
    expect(options.volumeScale).toBeCloseTo(0.7);
  });

  it('waits several seconds between two sounds of one doodad', () => {
    const t = setup(chirp, [[6, 5]]);
    for (let i = 0; i < 400; i++) t.sync(); // ~100 s
    const plays = t.sound.playPositionalSfx.mock.calls.length;
    expect(plays).toBeGreaterThan(5);
    expect(plays).toBeLessThanOrEqual(Math.ceil(100 / 3) + 1);
  });

  it(`lets at most ${MAX_DOODAD_ONE_SHOTS_PER_SYNC} doodads speak in one go`, () => {
    const t = setup(chirp, Array.from({ length: 12 }, (_, i) => [5 + i, 5] as [number, number]));
    t.sync();
    const before = t.sound.playPositionalSfx.mock.calls.length;
    t.sync({ x: 5, y: 5 }, DOODAD_ONE_SHOT_MAX_SECONDS * 1000 + 1); // every wait is over at once
    expect(t.sound.playPositionalSfx.mock.calls.length - before).toBe(MAX_DOODAD_ONE_SHOTS_PER_SYNC);
  });
});

describe('DoodadSounds break', () => {
  const breaks = { break: { url: '/assets/sounds/crunch.mp3', volume: 0.9 } };

  it('plays the break sound where a doodad on screen lost its block', () => {
    const t = setup(breaks, [[6, 5]]);
    t.field.onTileChanged(6, 6, MiningTileType.EMPTY);
    t.renderer.update(1, VIEW, 0.016);
    expect(t.sound.playPositionalSfx).toHaveBeenCalledTimes(1);
    const [url, position, options] = t.sound.playPositionalSfx.mock.calls[0];
    expect(url).toBe('/assets/sounds/crunch.mp3');
    expect(position).toEqual({ x: 6.5, y: 6 });
    expect(options.volumeScale).toBeCloseTo(0.9);
  });

  it('plays nothing when the doodad has no break sound, and spaces a blast of them out', () => {
    const quiet = setup(undefined, [[6, 5]]);
    quiet.field.onTileChanged(6, 6, MiningTileType.EMPTY);
    quiet.renderer.update(1, VIEW, 0.016);
    expect(quiet.sound.playPositionalSfx).not.toHaveBeenCalled();

    const t = setup(breaks, [[6, 5], [9, 5], [12, 5]]);
    for (const x of [6, 9, 12]) t.field.onTileChanged(x, 6, MiningTileType.EMPTY);
    t.renderer.update(1, VIEW, 0.016);
    expect(t.sound.playPositionalSfx).toHaveBeenCalledTimes(1);
    expect(DOODAD_BREAK_INTERVAL_MS).toBeGreaterThan(0);
  });
});
