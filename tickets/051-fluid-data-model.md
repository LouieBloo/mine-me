# 051 - Fluid data model (Fluid table, shared type, loader)

**Priority:** P1 - **Status:** Done, pending the Oil row (`--apply` not run) - **Part of:** fluids + fire epic (051-061)

## Problem
The game has no fluids. Per the project rules, fluid definitions are game data: Postgres, loaded at server start via `definitionLoaders`, reloaded after every admin save (ticket 036), mirrored to `packages/shared/src/data` as dev seed only.

## Epic decisions (Q&A 2026-10-13)
- Cell-based simulation; **continuous level 0-1** per cell. A block of oil is a full cell (1.0).
- Below the per-fluid **minimum level** the fluid **evaporates**.
- Entities are slowed by fluid (viscosity) and drops/rocks float or sink (density, via Planck forces). No swim/drown yet.
- Only **oil** to start. Everything is data, so water/lava later are rows, not code.
- Mobs get the same fluid/fire effects as players (shared logic; per-mob immunity flags later).
- Fluid/fire state goes to clients as a **delta of changed cells** (quantised), full state once on join, static definition sent once with the description.

## Scope
- Prisma `Fluid` table: name, colour, opacity, density, viscosity (movement slow), flowRate, minLevel, flowThreshold, maxLevel/compression, flammability fields (see 056), light config, sound slots (volume per use), particle effect refs. No entity-specific columns elsewhere.
- Shared `FluidDefinition` type, loader, reload hook, `fluids.json` dev mirror, seed script for Oil (dry-run by default, ask before `--apply`).
- Checklist: schema, shared type, loader, wire format, admin UI (060), client use, tests.

## Decisions (051 Q&A 2026-10-13)
- **Identity:** `Fluid.typeKey` is an open unique string (`OIL`), unlike the closed `MiningBlockTypeKey` union. New fluids are rows, not code. The small numeric id the world grid stores is derived from the key in ticket 052.
- **Scope of the table now:** name, typeKey, description, colour, opacity, density, viscosity, flowRate, minLevel, flowThreshold and one nullable Json `flammability`. Particle/sound/light refs come with 061/054 and generation settings with 053, each with its own full checklist, so no unused columns.
- **Flammability:** one shared `Flammability` type stored as a nullable Json column (null = not flammable), the same shape blocks reuse in 059. Exact semantics are finished in 056.
- **Oil defaults:** thick, slow, sticky - black, opacity ~0.9, density 0.8, high viscosity, low-medium flowRate, minLevel ~0.05, flowThreshold ~0.02. Tuned in the admin afterwards.
- **No bucket/pickup hook** for now.
- **Admin CRUD API and page** are ticket 060, not here. 051 stops at "the definition loads into the running server".

## Plan
Schema (additive `db push`), shared `FluidDefinition`/`Flammability` + `validateFluid`, `fluids.json` dev mirror, loader + reloader read the table (an empty table is fine), `MiningDataManager` getters, `prisma/add-oil-fluid.ts` (dry run by default, ask before `--apply`), tests.

## Implementation notes
- **Schema:** new `Fluid` table (additive `db push`, applied to the dev DB).
- **Shared:** `types/fluid.ts` (`Flammability`, `FluidDefinition`, `validateFluid`, `validateFlammability`), `data/fluids.json` dev mirror with Oil. `validateFluid` is what the 060 admin API will enforce.
- **Server:** `fluid` added to the loader and reloader Prisma picks; `loadDefinitionsFromDatabase` reads the table (empty is fine), `loadDefinitionsFromFiles` reads `fluids.json` if present; `MiningDataManager.getFluids()/getFluid(keyOrId)` (first duplicate typeKey wins; rows without a key are skipped). Reloads after admin saves already go through the same path.
- **Data:** `prisma/add-oil-fluid.ts` (dry run by default, idempotent, never overwrites an existing Oil). Dry run checked against the dev DB: "will be created". **Not applied: run `npx tsx prisma/add-oil-fluid.ts --apply` when ready, then restart the server.**
- **Tests:** shared validator (27), loader/data-manager/script tests. Mutation-checked: dropping the flowRate rule and dropping the duplicate-key guard each fail a test.
- **Not done here (by design):** admin CRUD/page (060), client delivery of fluid definitions (054), numeric grid ids (052).
