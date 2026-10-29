/**
 * How the surface scenery sits on the screen (ticket 130). Pure maths so the game, the admin preview and the tests agree.
 * Positions are in world pixels (a small block is `MINING_TILE_PIXELS`).
 */

/** Blocks below the horizon at which the surface effects (weather light, loops) have faded to nothing. */
export const SURFACE_FADE_BLOCKS = 14;
/** Blocks of grace below the horizon where they are still at full strength (standing in the entrance, a shallow dig). */
export const SURFACE_FADE_START_BLOCKS = 2;

/**
 * Where a scenery layer's picture starts, so that it moves `parallaxFactor` of the way with the camera: 0 sticks to the
 * terrain, 1 stays put on the screen. `viewLeft` is the camera's left edge in world pixels.
 */
export function layerTileOffset(viewLeft: number, parallaxFactor: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(parallaxFactor) ? parallaxFactor : 0));
  return -viewLeft * (1 - p);
}

/** How strong the surface's weather effects are for a camera at `cameraY` (world pixels): 1 above and at the horizon, 0 deep underground. */
export function surfaceFade(cameraY: number, surfaceY: number, tileSize: number): number {
  const below = (cameraY - surfaceY) / tileSize;
  if (below <= SURFACE_FADE_START_BLOCKS) return 1;
  if (below >= SURFACE_FADE_BLOCKS) return 0;
  return 1 - (below - SURFACE_FADE_START_BLOCKS) / (SURFACE_FADE_BLOCKS - SURFACE_FADE_START_BLOCKS);
}

/** Whether any sky can be on screen: only when the top of the view is above the horizon. Underground nothing is built or drawn. */
export function skyInView(viewTop: number, surfaceY: number): boolean {
  return viewTop < surfaceY;
}

/** The part of the sky on screen, as the world-pixel rows from the view's top down to the horizon (null when none). */
export function visibleSkyBand(viewTop: number, surfaceY: number): { top: number; bottom: number } | null {
  return skyInView(viewTop, surfaceY) ? { top: viewTop, bottom: surfaceY } : null;
}
