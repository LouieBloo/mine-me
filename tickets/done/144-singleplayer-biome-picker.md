# 144 - Choose biomes for a Single Player run

**Priority:** P2 - **Status:** Done (verified by the owner 2026-10-28) - **Depends on:** 095-098, 142

## Problem
Biomes only show up through the map's weights and depth windows, so to look at one (say magma depths) you have to dig for minutes and hope it appears. The owner wants to test biomes in the real game.

## Decisions (2026-10-26, from the owner)
- **Everyone sees it**, as an optional step: after clicking Single Player there is a biome step. "All biomes (normal)" is selected by default; the list of biomes comes from the server's loaded biome definitions (no hard-coded names).
- **Picked biomes are the only ones**: the default biome does not stay unless it is picked. Pick one and the whole mine is that biome; pick several and they share the map by their noise regions with soft borders. Equal weights.
- **Depth windows are ignored** for picked biomes: they fill the whole depth.
- **Normal run**: same saving and rewards, no test flags. Single Player only; multiplayer and the sandbox are unchanged. With nothing picked the map is generated exactly as before.

## Design
- Shared pure helpers (`gameLogic/biome/runBiomes.ts`): `sanitizeBiomeKeys` (the client's list, never trusted) and `pickRunBiomes(biomes, keys)` (filters to the picked biomes, weight 1, depth window cleared, the first by key becomes the default so the field always has an answer; unknown keys are ignored; nothing valid = the list unchanged).
- `mining_start` carries `biomeKeys`; only used for `singleplayer`. It is a per-run option on the engine (never stored in the map config). The engine swaps the biome list for `pickRunBiomes` and ignores the map config's `biomeWeights` for that run.
- `GET /api/game/biomes` (authenticated) lists `{ key, name, description }` of the loaded biomes.
- Client: a biome step in `ExpeditionModeModal` (own component `BiomePicker`) with the shared loading spinner and an error with retry.

## Tests
Helper unit tests; engine test that a picked biome gives a map whose `primaryGrid` holds only that biome, several share it, unknown keys fall back, the sandbox/multiplayer ignore it, and the map config's biomeWeights are ignored; handler/route tests; client tests for the picker and the modal flow. Mutation checks: stop clearing depth windows, stop dropping unpicked biomes.

## Built (2026-10-26)
- **Shared:** `gameLogic/biome/runBiomes.ts` with `sanitizeBiomeKeys`, `pickRunBiomes` and `listPickableBiomes` (unit tested, mutation-checked: keeping the depth window, or keeping the default biome, each fails tests).
- **Server:** `mining_start` carries `biomeKeys` (`MiningStartPayload`); the handler passes it only for `singleplayer`, through `createSession` into the engine option `biomeKeys` (`engine.runBiomeKeys`, never stored). `rebuildWorld` swaps the biome list for `pickRunBiomes` and clears the map config's `biomeWeights` for that run (mutation-checked); keys that name no biome are ignored, so nothing valid = the normal map exactly as before. Multiplayer and the sandbox ignore it. `GET /api/game/biomes` (authenticated) lists `{ key, name, description }`.
- **Client:** `BiomePicker` (own folder; shared spinner, inline error with Retry, "All biomes (normal)" default, checkbox per biome) as the second step of `ExpeditionModeModal` after Single Player (Back / Start); `miningStartEvent` builds the event. The picked biomes' ambient look follows the player as usual, since the client only hears about the biomes in the map.
- **Tests:** `runBiomes.test.ts`, `MiningGameEngine.runBiomes.test.ts` (a picked biome makes the whole `primaryGrid` that biome, several share it, default dropped, weights ignored, multiplayer/sandbox ignore), `startHealth.test.ts` (handler), `tests/game.biomes.test.ts` (route), `BiomePicker.test.tsx`, `ExpeditionModeModal.test.tsx`, `miningStartEvent.test.ts`, and `MineViewLifecycle.test.tsx` updated for the extra step.
- Not done: the "Biome test: <names>" HUD label (optional in the decisions). Not tried in a browser.

## Decisions (assumed)
- The first picked biome by key is made the field's default (it needs exactly one); with several picks this only matters as a tie-break, since every biome has no depth limit.
- An empty or all-unknown pick is a normal run, silently.
