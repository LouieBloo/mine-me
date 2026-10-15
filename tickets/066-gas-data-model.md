# 066 - Gas data model

**Priority:** P1 - **Status:** Done (2026-10-14); script `--apply` waiting for the owner's OK - **Depends on:** 051 (pattern)

## Problem
The game has fluids but no gases. Gases must be data (rows in Postgres, edited in the admin), never hard-coded, so a new gas needs no new code. Spawning, spreading, exploding and rendering all read this one definition.

## Design
- Prisma `Gas` model, modelled on `Fluid`: `typeKey` (unique open key, e.g. HYDROGEN), `name`, `description`, `color`, `opacity`, `density` (relative to air = 1; below 1 rises, above 1 sinks), `diffusionRate` (share of a cell's gas shared with open neighbours per step, 0-1), `minConcentration` (a cell below this is dropped), `ventLifetime` (seconds a gas lingers and fades in open-to-sky cells before despawning), `appearance` (Json, shared look shape, null = defaults), `flammability` (Json, the shared `Flammability` shape extended by 070; null = inert), `generation` (Json, shared `GasGeneration` shape from 068; null = never generated), `soundEffects` (Json, slots in `GAS_SOUND_SLOTS`, each with its own volume).
- Shared `GasDefinition` type, `GasAppearance`, `GasGeneration` placeholder types and `GAS_SOUND_SLOTS` in `packages/shared`; run `npx tsc` there.
- Loader in `definitionLoaders` and reload after admin save (ticket 036 path), like fluids. `GasRegistry` (typeKey to a 1..255 cell id, assigned in typeKey order so ids are stable), mirroring `FluidRegistry`.
- A dry-run-by-default script (pattern: `add-oil-fluid.ts`, `migrate-sound-library.ts`) adds **hydrogen** (density about 0.07, flammable/explosive in 070) and **nitrogen** (density 1.15, inert, the harmless test gas). Ask before `--apply`. Never `prisma db seed`.
- Admin REST CRUD (`gas.controller.ts`, routes, validation) like `fluid.controller.ts`, plus the sound slot controller like `fluidSound.controller.ts`. Sound usage service lists gas slots like fluids.

## Decisions (owner, 2026-10-14)
- A cell holds **one gas** (id + concentration). No per-cell mixing in v1.
- Gas and fluid in one cell: the fluid wins and the gas is pushed to a neighbour (handled in 067).
- Gas in open-to-sky cells keeps rising for a while and fades out over `ventLifetime`; it does not vanish instantly.
- Non-flammable gas has no effect on players or mobs for now; the gas is still defined in game for testing.

## Tests
Schema/loader round trip, registry id stability, validation rejects bad density/rates, controller CRUD with a temp `SHARED_ROOT`, reload applies edits, script dry-run writes nothing and `--apply` is idempotent. Mutation-check: drop the validation, confirm a test fails.

## Checklist (new content)
Schema, shared type, loader, wire format (070 and 069 consume it), admin UI (071), client use (069), tests.

## Implementation notes
- **Schema:** new `Gas` table and a `GAS` value in the `SoundCategory` enum (additive `db push`, applied to the dev DB; no reset). Fields as in the Design, with defaults (`opacity` 0.5, `density` 1, `diffusionRate` 0.25, `minConcentration` 0.02, `ventLifetime` 6).
- **Shared:** `types/gas.ts` (`GasDefinition`, `GasGeneration`, `GasAppearance` with `resolveGasAppearance`, `validateGas`, `validateGasGeneration`, `validateGasAppearance`), `GasRegistry` and `NO_GAS`, `sound/GasSoundProfile.ts` (`GAS_SOUND_SLOTS`: enter, exit, ignite, explode, vent; the triggers come in 073/070), `data/gases.json` dev mirror. `FluidRegistry` and `GasRegistry` now both extend a new generic `CellIdRegistry` (same ids and behaviour as before, one implementation). `Flammability` is reused as is; 070 adds the explosion part. `GasGeneration` reuses the fluid pocket rules plus an optional `concentration`; 068 may extend it.
- **Server:** the loader and reloader read the table (empty is fine), `attachGasSounds` resolves slot sounds, `MiningDataManager.getGases()/getGas(keyOrId)` (first duplicate key wins, rows without a key skipped), admin API `GET/POST /gases`, `GET/PUT/DELETE /gases/:id`, `PATCH /gases/:id/sound-effects/:slot` (`gas.controller.ts`, `gasSound.controller.ts`), `/gases` added to the live-reload prefixes, gas slots listed in the sound usage index, saves mirror to `gases.json`.
- **Admin app:** only the `GAS` sound category (library filter, upload modal option, picker label). The Gases page is 071.
- **Data:** `prisma/add-test-gases.ts` (dry run by default, idempotent, never touches an existing row). Dry run against the dev DB: both "will be created". **Not applied yet** (ask first).
- **Nitrogen density:** 1.15 rather than the real 0.97, so the test gas visibly sinks (a real-world nitrogen would creep upward). It is tunable in the admin.
- **Tests:** shared `gas.test.ts` (validation, appearance, generation, registry) and `GasSoundProfile.test.ts`; server `admin.gas.test.ts`, `admin.gasSound.test.ts`, `soundUsageGas.test.ts`, `add-test-gases.test.ts`, gas cases in `definitionLoaders.test.ts`. Mutation-checked: dropping the `ventLifetime` rule, the duplicate-key guard and the update validation each fail a test.
- **Pre-existing failures, not from this ticket:** 3 tests in `MiningGameEngine.fallDamage.test.ts` fail on a clean checkout too.
