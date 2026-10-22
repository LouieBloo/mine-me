# 029: Load game definitions (items, mobs, blocks) from Postgres, not JSON files

- **Status:** Done
- **Priority:** P1 (blocks 008)
- **Area:** server / data
- **Source:** Found while working ticket 008 (user: "the JSON is for developers to seed their DB")

## Problem
- The mining server reads items, mobs and blocks from `packages/shared/src/data/*.json` via `MiningDataManager` (`apps/server/src/services/mining/subsystems/MiningDataManager.ts`), ~23 call sites. Postgres is the source of truth; the JSON files are only a mirror written by the admin controllers' `syncJson` and used to seed dev DBs (`prisma/seed.ts`).
- The data directory is resolved relative to the *source* tree (`../../../../../../packages/shared/src/data`), so a built/deployed server would look in the wrong place or read stale data.
- `getBlockConfig` / `getItems` do `fs.existsSync` + `fs.statSync` on every call, including from inside the 30 Hz tick (e.g. every block hit).

## Proposed approach
- A `DefinitionSource` abstraction with a Prisma implementation (production/dev) and a file implementation (tests/fixtures).
- Load items (with `itemEffects.effect`, `particleEffect`), mobs (with drop tables) and mining blocks (with drop tables) into memory once at server startup, before sockets are accepted; shapes must match what the JSON export produces today so callers do not change.
- No refresh on admin save (prod never edits live; local dev restarts the process).
- Remove per-call filesystem access.

## Acceptance
- No runtime reads of `packages/shared/src/data/*.json` in the server (seed script and tests excepted).
- Startup loads definitions from the DB; behaviour identical for existing callers.
- Tests cover the Prisma source (mocked), the file source, lookup by id / itemKey / name, and startup failure behaviour.

## Decisions
- Approach: in-memory cache loaded from Postgres at startup (user's call: "your option 1 is correct"); **no refresh on admin save** (prod never edits live; local dev restarts the process).
- Startup failure: **refuse to start** (`process.exit(1)` with the error).
- Tests: the seed JSON via a file source, installed by a vitest setup file; production code cannot fall back to files.
- `MiningDataManager.clearCache()` and its only caller (admin block controller) removed.

## Implementation notes
- `MiningDataManager` is now a pure in-memory index (`GameDefinitions { items, mobs, blocks }`): `initialize()` / `getInstance()` (throws a clear error if not initialised) / `reset()`; items indexed by id, itemKey and name (exact matches first, then case-insensitive), mobs by id/name, blocks by typeKey. No filesystem access, no per-call `statSync` (the old version stat'ed the JSON from inside the tick on every block hit).
- New `services/mining/definitionLoaders.ts`: `loadDefinitionsFromDatabase` (same `include`s the admin export uses, so shapes are unchanged; throws if items or blocks are empty, i.e. the DB is unseeded), `loadDefinitionsFromFiles` (tests/tooling), `installDefinitionsFromDatabase` (called from `index.ts` before `listen`).
- `vitest.config.ts` `setupFiles: tests/setup/definitions.ts`.
- Tests: `MiningDataManager.test.ts`, `definitionLoaders.test.ts`.
- Findings: the only field in the JSON that isn't in the Prisma schema is a stale `sounds` key on mobs; nothing reads it. The JSON's shape also depends on which admin action last wrote it (some upload handlers re-export items without `itemEffects`), which is another reason the DB is the better source. `syncJson` still writes the seed JSON files; left as-is.
- Not done: the old default path resolution relative to the source tree is gone; `prisma/seed.ts` still reads the JSON (intended).
