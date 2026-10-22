# 085 - Small blocks (3 per original): engine constants, units and rendering

**Priority:** P1 - **Status:** Done in code at 3x (2026-10-17; the dev DB is already at 3x) - **Part of:** small blocks epic (085-090) - **Branch:** `world-scale-3x-spike` (the 2x work is saved as `refs/snapshots/half-size-2x`) - **Phase 1: playable feel test (085-087)**

> **Decision (2026-10-17): the game goes to 3x.** The owner played 2x, then 3x, and chose 3. Each original 64px block is now 3x3 small blocks; the character is about 3.3 blocks tall. 2x was an intermediate step: where this ticket and its notes below say "2x", "half-size" or "doubles", read 3x, "a third of the size" and "triples". The code is written as `<original value> * BLOCK_SCALE`, so the number is in one place.

## Problem
A block was as tall as the character, so caves and mountains looked chunky and could not have curves. Blocks are now a third of the original size: every original block becomes 3x3 blocks, the character is about 3 blocks tall (the Terraria ratio), and the world covers the same area with 9x the cells (135x135).

## Plan for the epic
- **Phase 1 (085, 086, 087), playable feel test: done and chosen.** Constants and units, data, and step-up.
- **Phase 2 (088, 089, 090): next.** World systems and profiling at 135x135, 3x3 placeables, mob pathing for tall bodies.
- **Then (not ticketed yet):** make the tests and seed data 3x (see "Cleanup before merging" below), autotiling and edge art for the curves, a mining-pace pass (block health or tool damage; a passage is now 3x3 = 9 hits), and a loot rebalance (9x the blocks per area).

## Design
**The rule:** a *tile* is one grid cell (the small block). Anything measured in tiles that describes the world (distance, speed, acceleration, radius, depth) is its original value times `BLOCK_SCALE`. Times (seconds, ms, Hz, tick rates), percentages, chances and counts do not change. Damage per unit of speed divides by the scale (so the same impact does the same damage). Anything that is a *character, mob or item size on screen* stays the same size on screen.

- **One scale.** `BLOCK_SCALE = 3` in `packages/shared/src/types/mining.ts`. `MINING_TILE_PIXELS = round(64 / BLOCK_SCALE)` = **21px** (the block size on screen, for server, client and admin). Removed: shared `TILE_SIZE`, `TILE_WORLD_PIXELS`, `MINING_TILE_WORLD_PIXELS`.
- **Base cell size (decision).** 64 / 3 is 21.33, so the block is 21px. The character art then reads as 3.3 blocks tall (a 69px sprite) and the world is 135 x 21 = 2835px wide (1.6% smaller than the exact ratio; nothing depends on the exactness). The original 64px block textures are drawn at 21px, which is a non-integer scale (some blur or seams). **Revisit the pixel size, 21 vs 24 vs 32, when the new tile art is made (autotiling ticket)**; changing `MINING_TILE_PIXELS` is a one-line change because colliders are defined in pixels and divided by it.
- **Player collider** is defined in pixels again (40 x 56) and divided by the tile size: `PLAYER_COLLIDER_WIDTH_TILES` 1.90, `PLAYER_COLLIDER_HEIGHT_TILES` 2.67. The character is drawn `CHARACTER_HEIGHT_TILES` = 69.12px / tile size = 3.29 tiles tall. Mob sprites are sized from their collider (`MOB_DRAW_HEIGHT_FACTOR`, `MOB_DEFAULT_DRAW_COLLIDER_HEIGHT` = 1.25 x scale).
- **Fixed-pixel sprites:** dropped items and dynamite are drawn 32px across, bullets 35 x 15px, whatever the tile size (`ITEM_SPRITE_PX`, `BULLET_SPRITE_PX`); item rigid bodies are 32px (`16 / MINING_TILE_PIXELS` half-extent).
- **`MINING_CONFIG` values (original -> at 3x):**

| Group | Values |
|---|---|
| Grid | `GRID_WIDTH/HEIGHT` 45 -> 135, `ENTRANCE_X` 22 -> 66, exit target `ENTRANCE_EXIT_RADIUS` = ceil(scale / 2) = 2 |
| Vision | `DEFAULT_VISION_RANGE` 18 -> 54, `MAX_VISION_RANGE` 40 -> 120 |
| Movement | `MOVE_SPEED` 4.5 -> 13.5, `GRAVITY` 28 -> 84, `JUMP_FORCE` 8.5 -> 25.5 (3.9 blocks high), `TERMINAL_FALL_SPEED` 20 -> 60, `MAX_ENTITY_SPEED` 60 -> 180, `CLIMB_SPEED` 3.5 -> 10.5, `LADDER_GRAB_WIDTH` 0.55 -> 1.65 |
| Reach | `PLAYER_MINING_REACH` and `TORCH_PLACEMENT_REACH` 1.85 -> 5.55, `PLACEMENT_LAG_SLACK` 0.6 -> 1.8 |
| Combat | melee shoulder/weapon offsets, hit size, body margin, gun muzzle reach and deviation, explosion and hit knockback: all x scale |
| Mob defaults | move speed, jump force, climb speed, aggro/attack/mine range, dodge margin, separation speed: all x scale |
| Network / sound | `INTEREST_RADIUS_X/Y`, `INTEREST_HYSTERESIS`, `BLOCK_HIT_HEARING_RANGE`, and every spatial-audio distance: x scale |
| Light | `SUNLIGHT_MAX_DEPTH` 8 -> 24, `FLASHLIGHT_RADIUS` 11 -> 33, aura 3.2 -> 9.6, `TORCH_RADIUS` 3.8 -> 11.4. `SUNLIGHT_LATERAL_FALLOFF` = 0.6^(1/scale) so the penumbra spans the same distance. |

`MAX_STEP_DISPLACEMENT` (0.4) stays (it only needs to be under the smallest collider half-extent). `MAX_STEP_UP_TILES` stays 1 block (see 087).
- **Rendering.** Block textures are drawn at the tile size (nearest-neighbour); texture files and block rows are unchanged. Camera zoom stays 1.5, so the screen shows the same world area as the original game (3x the cells across).
- **Lighting and fog** work per tile, so they cost 9x. Measure frame time at 135x135 in 088.

## Decisions (2026-10-17)
- **3x** is the scale the game uses (chosen after playing 2x and 3x). The scale is one constant; the migration script scales the data to it.
- Block art: texture files untouched, just drawn smaller. Autotiling and new art are later work.
- Mining stays one block per hit for now: a passage the character fits through is 3x3 = 9 hits. A mining pass (dig brush, block health, tool damage) is the next thing to design.
- Drops are left alone (each small block drops what a big one did), so about 9x the loot per area until rebalanced.
- Chests are ignored (they stay a block type, now one small cell).

## Tests
- Update every test that asserts a tile-unit number to the 3x value. Don't loosen tests, change the expected values (and rebuild scenes that assumed a body smaller than a cell).
- The player collider is 1.90 x 2.67 tiles and the character is drawn 3.29 tiles tall; a jump clears 3 blocks but not 4.
- An item collider of 32px is 32px on screen at any scale.
- Mutation check: put the old `JUMP_FORCE` back, the jump test fails. Tests should read `BLOCK_SCALE` (or the config) rather than hard-code 3, so a change of scale needs no test edits.

## Cleanup before merging (done 2026-10-17 except the rename)
1. **Tests at 3x: done.** All four suites pass with `BLOCK_SCALE = 3` (shared 776, server 1340, client 849, admin 419). Expectations read the scale (`BLOCK_SCALE`, `MINING_CONFIG`, `SANDBOX_BLOCK_SCALE`, `MINING_TILE_PIXELS`) instead of hard-coding numbers, so changing the scale needs few test edits. Scenes that assumed a body smaller than a cell were rebuilt for the 1.9 x 2.7 body (rooms, shafts, reach distances, a pool deep enough for a fast fall).
2. **Seed JSON: done.** `packages/shared/src/data/*.json` are converted to 3x (`migrateSeedRows` with a factor of 1.5 from the 2x files).
3. **Prisma defaults:** set to the 3x values by hand; check them against `DEFAULT_MINING_MAP_CONFIG` if the scale changes.
4. **Rename** the branch and the "half-size" names (files, `migrate-half-size-blocks.ts`): still open, optional.
5. Found while converting: gas pockets nearly never generated at 3x (pocket sizes triple but the number of placement tries did not), so the generator now tries `BLOCK_SCALE^2` times as often; the server test timeout is 30 s (the world has 9x the cells); a few tests had been relying on generated fluid or gas happening to be absent from the test area and now clear it.

## Notes for the implementer
- Code and data change together: the migration script scales the database from the scale in the `DataMigration` ledger to `BLOCK_SCALE`.
- `TILE_SIZE` is imported in ~147 client places. Most are positions (`x * TILE_SIZE`) and need no change; every *size* use (`TILE_SIZE * k`) is either a cell (shrinks with the scale) or a body/sprite (fixed pixels).
- The admin renders with the same tile size (`MINING_TILE_PIXELS`).
- Run `npx tsc` in `packages/shared` after editing it. Typecheck client and admin with `npx tsc --noEmit -p tsconfig.app.json` and the server with `npx tsc --noEmit`.

## Implementation notes (2026-10-17)
- **One pixel scale:** `MINING_TILE_PIXELS = 32` in `packages/shared/src/types/mining.ts` (not `TILE_PIXELS`). The client `TILE_SIZE` is that value. Removed `MINING_CONFIG.TILE_SIZE`, `TILE_WORLD_PIXELS` and `MINING_TILE_WORLD_PIXELS`. `MiningRigidWorld` converts pixel colliders with it, so dynamite, bullets and dropped items keep their on-screen size. Dropped items and dynamite are now a full tile (32px) across, so the item rigid body is 1x1 (was 0.5x0.5).
- **New `MINING_CONFIG` values:** `PLAYER_COLLIDER_WIDTH_TILES` 1.25, `PLAYER_COLLIDER_HEIGHT_TILES` 1.75 (replace the pixel versions), `CHARACTER_HEIGHT_TILES` 2.16, `MOB_DRAW_HEIGHT_FACTOR` 1.05, `MOB_DEFAULT_DRAW_COLLIDER_HEIGHT` 2.5, `MOB_DEFAULT_CLIMB_SPEED` 6, `ENTRANCE_EXIT_RADIUS` 1 (with `isOnEntrance()`: the exit is now a 3x3-cell target, used by the server's `canExtract` and the client), `MAX_STEP_UP_TILES` 1 (ticket 087). All the doubled values in the table above are in. `SUNLIGHT_LATERAL_FALLOFF` is 0.775.
- **Also doubled, beyond the table:** sound distances (`DEFAULT_SPATIAL_AUDIO_CONFIG` and every `MINING_SPATIAL_AUDIO_PRESETS` entry: max/min distance and pan range), `DEFAULT_MELEE_KNOCKBACK` (45 -> 90), the shared mob AI defaults and look-aheads (`ChaseAndMineAI`, `PatrolAI`), the throw maths (`calculateThrowVelocity`), `PlayerPredictor` tolerances (0.04 tile, 0.5 tiles/s, snap at 3 tiles), pickup reach, drop spread and launch speeds, rock crush speed/fall distance and knockback, projectile hit/muzzle sizes, held-item ignition radius, damage-number height, the flashlight offset, and the admin ranges and presets (see 086).
- **Map generator** (`miningMap.service.ts`): a tunnel is now a square brush `tunnelWidth` cells wide AND tall (it was one row high, which a 1.75-tall character cannot walk), up to 6; ore clusters are 4x bigger in cells (`ORE_CLUSTER_AREA_SCALE`) so veins keep their world size; the entrance clear zone is +-2 cells; copperium starts at row 4.
- **Mob spawn:** cavern mobs spawn only where a default-sized body fits (`bodyFitsAt`): before this, 4-5 of 6 started inside solid ground.
- **Sandbox:** the layout stays drawn in old-size blocks and `scaleSandboxLayout()` redraws it at 2x (`SANDBOX_BLOCK_SCALE`), so it is the same world, 180x60 under 24 sky rows. (This was planned for 088; it was needed to keep the sandbox usable.)
- **Tests:** every tile-unit expectation was changed to the new value, not loosened; scenes that relied on a body smaller than a cell (rooms 3 rows high, a mob 0.8 tiles from the player) were rebuilt with the 1.25 x 1.75 body. Drop physics: an item step now costs about 2.5x what it did (see 088). New: mob spawn room test, step-up (087), migration (086).
- **Resting items:** at gravity 56 Box2D never puts a resting item to sleep (it keeps a steady 0.3 tiles/s push-out and sinks 0.02 into the floor, past its sleep limits), so every dropped item would have been simulated for ever. `MiningDropSubsystem` now puts an item to sleep after 10 ticks under 0.6 tiles/s; Box2D wakes it when its floor is removed (tests for both).
- **Seed data in tests:** the engine tests read the converted seed JSON, so gas/explosion/light expectations moved to the doubled values (frontSpeed 6, light radius 6).
- **Not verified:** nothing was run in a browser. The look (texture scaling, light costs, camera) is for the owner to judge.
- **Known rough edges for the playtest:** mobs still path as one cell (090); ladders, torches and bridges are one cell (089); one block per hit means a passage the character fits through is 2x2 cells = 4 hits; loot is per block (about 4x per area); fluids, fire and gas move about half as fast in the world (088).

## 3x spike (2026-10-17, branch `world-scale-3x-spike`)
The owner wanted to feel 3 blocks per original block before committing to 2. To make that cheap, the scale became one number and everything block-sized is now written as its original value times it:
- **`BLOCK_SCALE`** in `packages/shared/src/types/mining.ts` (3 on this branch). `MINING_TILE_PIXELS = round(64 / BLOCK_SCALE)` (21px at 3). The player collider and character height are defined in pixels again (40 x 56, 69px) and divided by the tile size. Sprites that are a fixed number of pixels (dropped items, dynamite, bullets) no longer depend on the tile size.
- Everything that was doubled by hand is now `<original> * BLOCK_SCALE` (shared config, AI, physics, sound distances, server subsystems, map generator, sandbox, admin validation, client offsets, admin ranges and presets). Setting it back to 2 should reproduce the 2x game; the exact 2x work (literals and updated tests) is saved as `refs/snapshots/half-size-2x`.
- **Data:** `prisma/migrate-half-size-blocks.ts` now scales from whatever the ledger says (empty = original game) to `BLOCK_SCALE`, or to `--scale=N`. The dev DB was never migrated to 2x, so it went straight 1x -> 3x (applied). Back to the original: `--scale=1 --apply`; the old rows are also in `prisma/backup-before-block-scale-spike.json`.
- **Not done on the spike:** the tests (many still expect the 2x numbers), the seed JSON (still 2x), and the notes above. Step-up stays one block (a third of an old block at 3x).
