# 069 - Gas wire format and client rendering

**Priority:** P1 - **Status:** Done (2026-10-14); judge the look in the game - **Depends on:** 066, 067 (pattern: 054)

## Problem
Gas state must reach clients and be drawn so players can see it spread, rise and thin out.

## Design
- Static data (gas definitions: color, opacity, appearance, sound ids) is sent **once** with the entity descriptions, never per tick. Per-cell state goes as **deltas of changed cells** (`{x, y, gasId, concentration}`), and **only for fog-revealed cells** (`takeVisibleChanges`, `visibleSnapshot` for joiners and newly revealed cells), exactly like fluids.
- `MiningClientWorld` gets a client gas grid (plain cell store, not the sim); `tickHandlers` applies deltas.
- `GasRenderer` (Pixi v8, in `renderers/`): a soft tinted layer per cell, alpha scaled by concentration and the gas's `opacity`, smoothed between cells (blurred sprite layer or cheap shader, not hard squares), with a slow drift so it reads as a gas. Pixi draws it; any UI stays DOM.
- `body.gasEnvironment` (the gas twin of `fluidEnvironment`): set on the server and in client prediction from the gas at the body's cell. It has **no gameplay effect yet** (non-flammable gas is harmless); it exists so suffocation or slowdown can be added later and so tests can assert it.
- Gas sounds use `GAS_SOUND_SLOTS` with a per-slot `volume` (resolve ids to `/assets/...` URLs at load; preload generically). A new play site must pass the slot's volume via `withVolume`.

## Tests
Delta contains only changed, revealed cells; snapshot on join; unrevealed cells never leak gas info; client applies and clears cells; renderer alpha follows concentration; `gasEnvironment` matches on server and prediction; error handling on the socket path surfaces to the user. Mutation-check: send unrevealed cells, confirm the leak test fails.

## Implementation notes
- **Shared:** `gameLogic/gas/gasWire.ts` (`GasWireCell` = `[x, y, gasId, concentration 0-255]`, `quantizeGasConcentration`, `GasClientDefinition`, `GasField` = the client's exact copy) and `gasEnvironment.ts` (`GasEnvironment`, `GasContact`, `sampleGasContact`: concentration weighted by how much of the body is in each cell, thickest gas wins). `MiningPhysicsBody` gets `gasEnvironment`, `gasContact` and `updateGasContact()`, refreshed every `update()`; nothing reads it yet, so a body in gas moves exactly as before (tested).
- **Server:** `MiningGasSubsystem` now has `environment`, `takeVisibleChanges()` (revealed cells only), `wireContentsAt`, `visibleSnapshot()`, `clientDefinitions()` (id, key, name, colour, opacity, density, appearance with defaults filled in, resolved sounds). Wired into the tick payload (`gasCells`), `revealedTiles[].gas`, and the joining client's session state (`gases`, `gasCells`). Players' and mobs' bodies get `gasEnvironment` every tick. The unrevealed-gas rule matches fluids: a cell's gas goes out when the tile is revealed, never before.
- **Client:** `GasRenderer` (Pixi v8, `renderers/GasRenderer.ts`): an exact `field` plus a drawn copy eased towards it (cloud thickens and thins smoothly; new gas or a different gas shows at once), chunks of 8x8 redrawn only when they change. Each cell is a few stacked soft circles (widest faintest), radius from `softness` (a hard square at softness 0), opacity = gas opacity x concentration, drifting by `driftSpeed`/`driftAmount` with a per-cell phase, redrawn about 15 times a second only where gas is. Gas under 0.03 is not drawn (the dead-end traces from 067). Drawn in front of the characters, behind projectiles and particles. `applyGasUpdates` in the tick handlers; the player's predicted body senses the client's gas.
- **Not done here (by design):** sound triggers (073), explosion visuals (070), a blur filter (the stacked circles were enough; revisit after seeing it in the game).
- **Tests:** shared `gasWire.test.ts` (15), server `MiningGameEngine.gasWire.test.ts` (9), client `GasRenderer.test.ts` (15) and `applyGasUpdates` cases in `tickHandlers.test.ts` (5); two mocked-scene tests got a `gasRendererRef`. Mutation-checked: sending unrevealed cells, a snapshot that ignores the fog, leaving the handler out of the tick, ignoring concentration in the alpha, and dropping the easing each fail a test.
