import type { MiningGameMode, MiningStartPayload } from '@mine-me/shared';

/**
 * The `mining_start` event for a run. Picked biomes are sent only when there are some (an empty pick is a normal run), and
 * the mission only when one was picked from the offers.
 */
export function miningStartEvent(mode: MiningGameMode, forceNew: boolean, biomeKeys?: string[], missionId?: string): MiningStartPayload {
  return { type: 'mining_start', mode, forceNew, ...(biomeKeys && biomeKeys.length > 0 ? { biomeKeys } : {}), ...(missionId ? { missionId } : {}) };
}
