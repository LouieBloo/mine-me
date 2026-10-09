import type { MiningActiveMob, MiningRemotePlayer } from '@mine-me/shared';

interface MobListRenderer {
  updateMobs(mobs?: MiningActiveMob[]): void;
}

interface PlayerListRenderer {
  updatePlayers(players?: MiningRemotePlayer[]): void;
}

export interface TickEntityLists {
  mobs?: MiningActiveMob[];
  otherPlayers?: MiningRemotePlayer[];
}

/**
 * Applies the mob / remote-player lists from a server tick to their renderers.
 *
 * A present array — including an empty one — is authoritative and removes anything not in it,
 * so the last mob or last remote player disappears. A missing field means "no information"
 * and leaves the current entities untouched.
 */
export function applyTickEntityLists(
  payload: TickEntityLists,
  renderers: {
    mobRenderer?: MobListRenderer | null;
    remotePlayerRenderer?: PlayerListRenderer | null;
  }
): void {
  if (payload.otherPlayers !== undefined) {
    renderers.remotePlayerRenderer?.updatePlayers(payload.otherPlayers);
  }
  if (payload.mobs !== undefined) {
    renderers.mobRenderer?.updateMobs(payload.mobs);
  }
}
