import { describe, it, expect, beforeEach } from 'vitest';
import { readPersistedGameState } from './GameContext';

describe('readPersistedGameState', () => {
  beforeEach(() => localStorage.clear());

  it('restores player state that belongs to the active character', () => {
    localStorage.setItem('nvg_active_character', JSON.stringify({ id: 'c1' }));
    localStorage.setItem('nvg_player_state', JSON.stringify({ id: 'c1', sol: 5 }));
    expect(readPersistedGameState().playerState).toEqual({ id: 'c1', sol: 5 });
  });

  it('drops player state left over from a different character', () => {
    localStorage.setItem('nvg_active_character', JSON.stringify({ id: 'c2' }));
    localStorage.setItem('nvg_player_state', JSON.stringify({ id: 'c1' }));
    const { character, playerState } = readPersistedGameState();
    expect(character).toEqual({ id: 'c2' });
    expect(playerState).toBeNull();
  });

  it('drops player state when there is no active character', () => {
    localStorage.setItem('nvg_player_state', JSON.stringify({ id: 'c1' }));
    expect(readPersistedGameState().playerState).toBeNull();
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('nvg_active_character', '{nope');
    expect(readPersistedGameState()).toEqual({ character: null, playerState: null });
  });
});
