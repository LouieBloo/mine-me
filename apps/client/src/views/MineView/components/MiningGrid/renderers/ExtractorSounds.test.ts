import { describe, it, expect, vi } from 'vitest';
import { ExtractorSounds } from './ExtractorSounds';

const sound = () => ({ playPositionalSfx: vi.fn(), playLoopingSfx: vi.fn(), stopLoopingSfx: vi.fn() }) as any;
const machine = { x: 90, y: 20 };
const item = (id: string) => ({ id, itemId: 'ore', itemName: 'Ore', iconUrl: null, ownerId: 'p', pos: 3 });

describe('ExtractorSounds', () => {
  it('plays the unload sound at each item\'s spot, at the slot\'s own volume', () => {
    const out = sound();
    const sounds = new ExtractorSounds(out, { unload: { url: '/assets/sounds/plink.wav', volume: 0.3 } }, machine);
    sounds.onItemsAdded([item('a'), item('b')], () => ({ x: 91, y: 27 }));
    expect(out.playPositionalSfx).toHaveBeenCalledTimes(2);
    expect(out.playPositionalSfx.mock.calls[0][0]).toBe('/assets/sounds/plink.wav');
    expect(out.playPositionalSfx.mock.calls[0][1]).toEqual({ x: 91, y: 27 });
    expect(out.playPositionalSfx.mock.calls[0][2].volumeScale).toBeCloseTo(0.3);
  });

  it('is silent for a slot with no sound', () => {
    const out = sound();
    const sounds = new ExtractorSounds(out, {}, machine);
    sounds.onItemsAdded([item('a')], () => ({ x: 0, y: 0 }));
    sounds.syncLoop(true);
    expect(out.playPositionalSfx).not.toHaveBeenCalled();
    expect(out.playLoopingSfx).not.toHaveBeenCalled();
    expect(sounds.isLooping).toBe(false);
  });

  it('runs the loop while something is on the belt, once, and stops it when the belt empties', () => {
    const out = sound();
    const sounds = new ExtractorSounds(out, { loop: { url: '/assets/sounds/hum.wav', volume: 0.5 } }, machine);
    sounds.syncLoop(true);
    sounds.syncLoop(true);
    expect(out.playLoopingSfx).toHaveBeenCalledTimes(1);
    expect(sounds.isLooping).toBe(true);
    sounds.syncLoop(false);
    expect(out.stopLoopingSfx).toHaveBeenCalledTimes(1);
    expect(sounds.isLooping).toBe(false);
    sounds.syncLoop(false);
    expect(out.stopLoopingSfx).toHaveBeenCalledTimes(1);
  });

  it('stops its loop when destroyed', () => {
    const out = sound();
    const sounds = new ExtractorSounds(out, { loop: { url: '/assets/sounds/hum.wav' } }, machine);
    sounds.syncLoop(true);
    sounds.destroy();
    expect(out.stopLoopingSfx).toHaveBeenCalled();
  });

  it('plays the break sound where each segment broke, and nothing without the sound', () => {
    const out = sound();
    const sounds = new ExtractorSounds(out, { beltBreak: { url: '/assets/sounds/snap.wav', volume: 0.6 } }, machine);
    sounds.onBeltBroke([{ x: 91, y: 30 }, { x: 91, y: 31 }]);
    expect(out.playPositionalSfx).toHaveBeenCalledTimes(2);
    expect(out.playPositionalSfx.mock.calls[1][1]).toEqual({ x: 91, y: 31 });
    expect(out.playPositionalSfx.mock.calls[0][2].volumeScale).toBeCloseTo(0.6);
    const quiet = sound();
    new ExtractorSounds(quiet, {}, machine).onBeltBroke([{ x: 1, y: 1 }]);
    expect(quiet.playPositionalSfx).not.toHaveBeenCalled();
  });
});
