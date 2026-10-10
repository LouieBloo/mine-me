import { useEffect } from 'react';
import type { MiningPlayerBody, MiningPlayerDamagedEvent, PlayerPredictor } from '@mine-me/shared';

interface UsePlayerDamageEventsOptions {
  onEvent: (event: 'player_damaged', handler: (payload: MiningPlayerDamagedEvent) => void) => () => void;
  playerBodyRef: React.MutableRefObject<MiningPlayerBody | null>;
  predictorRef?: React.MutableRefObject<{ predictor: PlayerPredictor } | null>;
}

/**
 * Applies the server's hit knockback to the locally predicted player, so the player is thrown
 * immediately instead of rubber-banding when the next server position arrives. With a predictor
 * the push is also remembered (with the tick it happened on) so a later correction replays it once.
 * (Health itself is shown by the app's health bar via `character_stat_update`.)
 */
export function applyPlayerDamage(
  body: MiningPlayerBody | null,
  event: MiningPlayerDamagedEvent,
  predictor?: PlayerPredictor | null
): void {
  if (!body || event.knockbackSeconds <= 0) return;
  if (predictor) {
    predictor.applyKnockback(event.knockback.x, event.knockback.y, event.knockbackSeconds, event.tick);
  } else {
    body.applyKnockback(event.knockback.x, event.knockback.y, event.knockbackSeconds);
  }
}

export function usePlayerDamageEvents({ onEvent, playerBodyRef, predictorRef }: UsePlayerDamageEventsOptions): void {
  useEffect(() => {
    return onEvent('player_damaged', (event) =>
      applyPlayerDamage(playerBodyRef.current, event, predictorRef?.current?.predictor)
    );
  }, [onEvent, playerBodyRef, predictorRef]);
}
