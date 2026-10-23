import type { MiningGameMode } from '@mine-me/shared';

/**
 * How a mining room behaves in each game mode. The engine and session manager read these switches
 * instead of testing the mode by name, so a new mode is one entry here (and its map source).
 */
export interface GameModeRules {
  /** Fixed id of the one room everyone in this mode shares, or null for a private room per character. */
  readonly sharedRoomId: string | null;
  /** The run ends after the session time limit. */
  readonly timeLimited: boolean;
  /** What happens in the mine is saved to the character (loot, health, consumed items). */
  readonly persistsCharacter: boolean;
  /** Dying ends the run (backpack lost); otherwise the player respawns at the entrance. */
  readonly endsRunOnDeath: boolean;
  /** Starting a new run in the same mode throws the old room away (private rooms only). */
  readonly restartsOnEntry: boolean;
  /** An extractor lands on the surface and takes the player's loot (tickets 119-125). */
  readonly hasExtractor: boolean;
  /** The test tools (pour fluid, spawn mobs, god mode, reset...) are available. */
  readonly hasSandboxTools: boolean;
}

export const DEFAULT_MULTIPLAYER_ROOM_ID = 'lobby_multiplayer_default';
export const SANDBOX_ROOM_ID = 'sandbox_shared';

const RULES: Readonly<Record<MiningGameMode, GameModeRules>> = {
  singleplayer: {
    sharedRoomId: null,
    timeLimited: true,
    persistsCharacter: true,
    endsRunOnDeath: true,
    restartsOnEntry: true,
    hasSandboxTools: false,
    hasExtractor: true,
  },
  multiplayer: {
    sharedRoomId: DEFAULT_MULTIPLAYER_ROOM_ID,
    timeLimited: true,
    persistsCharacter: true,
    endsRunOnDeath: true,
    restartsOnEntry: false,
    hasSandboxTools: false,
    hasExtractor: true,
  },
  sandbox: {
    sharedRoomId: SANDBOX_ROOM_ID,
    timeLimited: false,
    persistsCharacter: false,
    endsRunOnDeath: false,
    restartsOnEntry: false,
    hasSandboxTools: true,
    hasExtractor: false,
  },
};

export function getGameModeRules(mode: MiningGameMode): GameModeRules {
  return RULES[mode];
}

/** The room a character joins for a mode. */
export function roomIdFor(mode: MiningGameMode, characterId: string): string {
  return getGameModeRules(mode).sharedRoomId ?? `solo_${characterId}`;
}

/** Untrusted input check: is this one of the known modes? */
export function isMiningGameMode(value: unknown): value is MiningGameMode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RULES, value);
}
