# 027: Reduce ref-passing in useMiningTicker/useMiningStateSync

- **Status:** Done
- **Priority:** P3
- **Area:** client / architecture
- **Source:** Mining game audit

## Problem
`useMiningTicker` takes ~45 options and `useMiningStateSync` ~40 plus a 250-line handler. Hard to test and extend. Several `any` types hide payload mismatches.

## Proposed approach
A single `MiningClientWorld` holding managers/refs, passed to systems; split the tick handler into per-section handlers (tiles, entities, effects).

## Acceptance
- Option lists shrink substantially; handlers individually testable.

## Decisions (2026-10-09)
Owner asked to keep moving; chose a `MiningClientWorld` object (all refs, renderers and engines, grouped as simulation / entity / scene refs) passed to the hooks, and one handler per section of the server tick.

## Implementation notes
- **`systems/MiningClientWorld.ts`**: the shared bag of refs. `MiningGrid` builds it once per render; hooks that run before it is complete (`useMiningActions`, `useMiningInput`, `useMiningAmbientEffects`) take a `Pick<>` of just what they use.
- **Option lists:** `useMiningTicker` 49 -> 5 (`app, world, sessionState, soundManager, miningSwingSpeed`); `useMiningStateSync` 40 -> 9; `useMiningActions` 31 -> 13 (the rest are the torch/ladder/throw props); `useMiningAmbientEffects` 12 -> 3; `useMiningInput` 12 -> 6. `useMiningStateSync` went from 504 to ~100 lines.
- **Tick handlers** (`systems/tickHandlers.ts`): `applySelfState`, `applyEntities`, `applySessionData`, `applyEffects` (gunshots, explosions, block hits), `applyTileUpdates` (+ `syncTileLights`), `getHitPosition`, and `handleStateTick` which runs them in dependency order (explosions are remembered before tiles so a blast does not give every block its own crumble). Pure functions over `(payload, ctx)`; the rate-limit state lives in `TickEffectState`.
- `any` removed where it hid payload shapes: `onEvent` for the tick hook is typed to `mining_state_tick`/`MiningStateTickPayload`; `equippedWeapon` is `GameItem | null`; the world uses real types for the dynamic items and block particle configs.
- **Tests:** 24 handler tests with a fake world (each section alone, ordering, rate limits, lights/emitters, explosion suppression), 2 hook lifecycle tests, the existing ticker/lifecycle tests adapted (the ticker tests keep their flat fixture via a small adapter). Mutation-checked (handler order, sound rate limit, damage-stage rule each fail a test).
- Remaining: `useMiningTicker`'s frame callback is still one ~300-line function (its options are small now; splitting it into frame systems would be a separate, larger change); `useMiningActions` keeps its `any`s for `sendGameEvent` and item lookups.

