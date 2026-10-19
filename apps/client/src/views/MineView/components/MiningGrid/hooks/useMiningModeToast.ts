import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { FloatingTextManager } from '../../../../../components/game/sprites';
import type { MiningPlayerBody } from '@mine-me/shared';
import type { MiningMouseController } from '../input/MiningMouseController';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';
import { BLOCK_SCALE } from '@mine-me/shared';

/** What pops up over the player when Ctrl switches the pickaxe's targeting. */
export const AUTO_TARGETING_TEXT = 'Auto Targeting';
export const SINGLE_TARGETING_TEXT = 'Single Targeting';
const MODE_TEXT_COLOR = '#ffffff';
/** How far above the player's center (in tiles) the text appears. */
const MODE_TEXT_OFFSET_TILES = 0.7 * BLOCK_SCALE;

/** Pops the new targeting mode up above the player with the damage text popup. */
export function showTargetingModeText(
  manager: FloatingTextManager | null | undefined,
  body: Pick<MiningPlayerBody, 'position'> | null | undefined,
  precise: boolean
): void {
  if (!manager || !body) return;
  manager.spawnStatus(
    body.position.x * TILE_SIZE,
    (body.position.y - MODE_TEXT_OFFSET_TILES) * TILE_SIZE,
    precise ? SINGLE_TARGETING_TEXT : AUTO_TARGETING_TEXT,
    MODE_TEXT_COLOR
  );
}

export function useMiningModeToast(
  mouseControllerRef: MutableRefObject<MiningMouseController>,
  playerBodyRef: MutableRefObject<MiningPlayerBody | null>,
  floatingTextManagerRef: MutableRefObject<FloatingTextManager | null>
): void {
  useEffect(() => {
    return mouseControllerRef.current.onPreciseModeChange((precise) =>
      showTargetingModeText(floatingTextManagerRef.current, playerBodyRef.current, precise)
    );
  }, [mouseControllerRef, playerBodyRef, floatingTextManagerRef]);
}
