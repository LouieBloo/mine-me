# 031 - Slim tick payloads for drops, and greedy asset/sound preload

**Priority:** P2 - **Status:** Done (2026-10-09)

## Tick payloads
Dropped items were resent in full (names, icon and sprite urls, light/particle config...) on every tick in which any item moved. That is now the same split mobs already use:
- `spawned.droppedItems` carries an item's full description once per client.
- `droppedItems` on a tick is `{ id, position }` only (position to 1/100 tile), still only sent when something moved, appeared or was picked up. ~65 bytes per item instead of ~425.
- Client: `EntityDefinitionCache.hydrateDroppedItems` merges them; the join snapshot seeds the cache.

## Preload (greedy, optimise later)
- Server: `GET /api/public/assets/manifest` lists every image and sound under the assets folder (not `cities/`, not background music), cached 60 s. (`assetManifest.service.ts`)
- Client: while the loading screen is up, `MiningAssetPreloader` loads the manifest plus every image/sound url found anywhere in the item and block data (generic walk, so new fields are picked up). Images go into Pixi's texture cache (8 at a time); sounds go through the new `SoundManager.preloadSfx`, decoded and cached so the first shot/explosion plays instantly. It waits at most 20 s, never throws, and failures just load on first use as before.

## Not done
- Looping sounds are created per use and not cached, so only the browser's HTTP cache helps them.
- Mobs, remote players and fallingRocks are still sent for the whole room every tick (dynamic fields only). Interest management (only what is near the player) is the next big saving.
- Everything is held decoded in memory (about 25 MB of art and sound files on disk); trim to what a run needs when optimising.
- The loading screen shows no progress.

## Part 2 (2026-10-09): interest management and a loading bar
- **Interest management.** Each tick, a client is only told about entities inside a box around its player (`INTEREST_RADIUS_X/Y` = 28 x 20 tiles, `INTEREST_HYSTERESIS` = 6 extra tiles for ones it already knows, so nothing flickers at the edge): mobs, other players, projectiles, thrown dynamite, falling rocks, dropped items, explosions and gunshots. An entity entering view is described in `spawned`; leaving view makes the client forget it (it is described again on return). The dropped-item list is also sent when the set in view changes, not only when something moved. (`inView`, `droppedListChanged` in `MiningEntitySync`; `isInInterest` in shared.) Note the default map is only 45x45, so on it this mostly trims the far corners; it pays off on bigger maps and with more players.
- **Smaller numbers.** Other entities' positions/velocities/angles are rounded to hundredths on the wire (a player's own position is never rounded - prediction depends on it).
- **Ammo only on change.** `weaponAmmo` is sent when it differs from what that client last got, not every tick.
- **Loading bar.** `MiningLoadingScreen` takes `progress` (0-1): 5% scene, 10% block data, 15% item data, then the preload fills the rest per file (images and sounds); it never goes backwards and hits 100% when the scene is ready.
- Tests: `MiningGameEngine.interest.test.ts` (mutation-checked), `interest.test.ts`, preloader progress, loading bar.

### Still open
- Mobs far from every player are still simulated at full rate (only the sending is trimmed).
- Tile reveals and block-damage updates are not interest-filtered.
