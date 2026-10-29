import { describe, it, expect } from 'vitest';
import { miningStartEvent } from './miningStartEvent';

describe('miningStartEvent', () => {
  it('sends the picked biomes', () => {
    expect(miningStartEvent('singleplayer', true, ['frozen_caves'])).toEqual({ type: 'mining_start', mode: 'singleplayer', forceNew: true, biomeKeys: ['frozen_caves'] });
  });
  it('sends no biome list for a normal run', () => {
    expect(miningStartEvent('singleplayer', true)).toEqual({ type: 'mining_start', mode: 'singleplayer', forceNew: true });
    expect(miningStartEvent('multiplayer', false, [])).not.toHaveProperty('biomeKeys');
  });
  it('sends the picked mission only when there is one', () => {
    expect(miningStartEvent('singleplayer', true, [], 'm1')).toEqual({ type: 'mining_start', mode: 'singleplayer', forceNew: true, missionId: 'm1' });
    expect(miningStartEvent('multiplayer', false, undefined, '')).not.toHaveProperty('missionId');
  });
});
