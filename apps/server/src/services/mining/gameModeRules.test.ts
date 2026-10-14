import { describe, it, expect } from 'vitest';
import { getGameModeRules, isMiningGameMode, roomIdFor, SANDBOX_ROOM_ID, DEFAULT_MULTIPLAYER_ROOM_ID } from './gameModeRules';

describe('game mode rules', () => {
  it('gives each solo character a private room and everyone else a shared one', () => {
    expect(roomIdFor('singleplayer', 'a')).toBe('solo_a');
    expect(roomIdFor('singleplayer', 'b')).toBe('solo_b');
    expect(roomIdFor('multiplayer', 'a')).toBe(DEFAULT_MULTIPLAYER_ROOM_ID);
    expect(roomIdFor('sandbox', 'a')).toBe(SANDBOX_ROOM_ID);
    expect(roomIdFor('sandbox', 'b')).toBe(SANDBOX_ROOM_ID);
  });

  it('keeps the real modes saving to the character and ending on death', () => {
    for (const mode of ['singleplayer', 'multiplayer'] as const) {
      const rules = getGameModeRules(mode);
      expect(rules.persistsCharacter).toBe(true);
      expect(rules.endsRunOnDeath).toBe(true);
      expect(rules.timeLimited).toBe(true);
    }
  });

  it('makes the sandbox untimed, unsaved and survivable', () => {
    const rules = getGameModeRules('sandbox');
    expect(rules.persistsCharacter).toBe(false);
    expect(rules.endsRunOnDeath).toBe(false);
    expect(rules.timeLimited).toBe(false);
  });

  it('only accepts known modes from the client', () => {
    expect(isMiningGameMode('sandbox')).toBe(true);
    expect(isMiningGameMode('multiplayer')).toBe(true);
    expect(isMiningGameMode('creative')).toBe(false);
    expect(isMiningGameMode('toString')).toBe(false);
    expect(isMiningGameMode(undefined)).toBe(false);
  });
});
