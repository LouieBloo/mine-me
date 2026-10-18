import { BLOCK_SCALE } from '@mine-me/shared';
import { useEffect } from 'react';
import type { MiningPlayerBody, MiningPlayerDamagedEvent, PlayerPredictor } from '@mine-me/shared';
import type { FloatingTextManager } from '../../../../../components/game/sprites';
import type { CharacterSoundPlayer } from '../systems/CharacterSoundPlayer';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

interface UsePlayerDamageEventsOptions {
  onEvent: (event: 'player_damaged', handler: (payload: MiningPlayerDamagedEvent) => void) => () => void;
  playerBodyRef: React.MutableRefObject<MiningPlayerBody | null>;
  predictorRef?: React.MutableRefObject<{ predictor: PlayerPredictor } | null>;
  /** Where the damage number is shown (the same manager the mob damage numbers use). */
  floatingTextManagerRef?: React.MutableRefObject<FloatingTextManager | null>;
  /** Plays the hurt sound (or the death sound on the killing blow). */
  characterSoundsRef?: React.MutableRefObject<CharacterSoundPlayer>;
}

/** Orange, so damage you take reads differently from the red numbers you deal to mobs. */
export const PLAYER_DAMAGE_COLOR = '#fb923c';
/** How far above the player's center (in tiles) the number appears. */
const DAMAGE_NUMBER_OFFSET_TILES = 0.7 * BLOCK_SCALE;

/** Shows the damage the player just took as a floating number above them. */
export function showPlayerDamageNumber(
  manager: FloatingTextManager | null | undefined,
  body: MiningPlayerBody | null,
  event: MiningPlayerDamagedEvent
): void {
  if (!manager || !body || !Number.isFinite(event.damage) || event.damage <= 0) return;
  manager.spawnDamage(
    body.position.x * TILE_SIZE,
    (body.position.y - DAMAGE_NUMBER_OFFSET_TILES) * TILE_SIZE,
    event.damage,
    { color: PLAYER_DAMAGE_COLOR }
  );
}

/**
 * Applies the server's hit knockback to the locally predicted player, so the player is thrown
 * immediately instead of rubber-banding when the next server position arrives. With a predictor
 * the push is also remembered (with the tick it happened on) so a later correction replays it once.
 * It also shows the damage as a floating number above the player (every source: mobs, falls, rocks...).
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

export function usePlayerDamageEvents({
  onEvent,
  playerBodyRef,
  predictorRef,
  floatingTextManagerRef,
  characterSoundsRef,
}: UsePlayerDamageEventsOptions): void {
  useEffect(() => {
    return onEvent('player_damaged', (event) => {
      showPlayerDamageNumber(floatingTextManagerRef?.current, playerBodyRef.current, event);
      if (event.damage > 0) characterSoundsRef?.current.onDamaged(event.health);
      applyPlayerDamage(playerBodyRef.current, event, predictorRef?.current?.predictor);
    });
  }, [onEvent, playerBodyRef, predictorRef, floatingTextManagerRef, characterSoundsRef]);
}
