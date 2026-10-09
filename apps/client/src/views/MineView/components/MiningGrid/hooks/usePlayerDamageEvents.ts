import { useEffect } from 'react';
import type { MiningPlayerBody, MiningPlayerDamagedEvent } from '@mine-me/shared';

interface UsePlayerDamageEventsOptions {
  onEvent: (event: 'player_damaged', handler: (payload: MiningPlayerDamagedEvent) => void) => () => void;
  playerBodyRef: React.MutableRefObject<MiningPlayerBody | null>;
}

/**
 * Applies the server's hit knockback to the locally predicted player body, so the player is
 * thrown immediately instead of rubber-banding when the next server position arrives.
 * (Health itself is shown by the app's health bar via `character_stat_update`.)
 */
export function applyPlayerDamage(body: MiningPlayerBody | null, event: MiningPlayerDamagedEvent): void {
  if (!body || event.knockbackSeconds <= 0) return;
  body.applyKnockback(event.knockback.x, event.knockback.y, event.knockbackSeconds);
}

export function usePlayerDamageEvents({ onEvent, playerBodyRef }: UsePlayerDamageEventsOptions): void {
  useEffect(() => {
    return onEvent('player_damaged', (event) => applyPlayerDamage(playerBodyRef.current, event));
  }, [onEvent, playerBodyRef]);
}
