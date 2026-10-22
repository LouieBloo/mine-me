# 036 - Apply admin edits without restarting the server

**Priority:** P2 - **Status:** Done (2026-10-10)

## Audit findings
- Items, mobs, blocks and sounds are read from Postgres once at server start and held in `MiningDataManager`. Admin edits (e.g. a mob's damage/death sound) did nothing in the running game until a restart; the owner assigned new mole sounds, heard nothing, and the server process predated the edit.

## Decisions (owner)
- Option A: reload the definitions automatically after every admin save of game content. (A manual "Reload" button/endpoint was offered as a follow-up, not built.)

## Implementation notes
- `definitionReloader.ts`: `reloadDefinitions()` re-runs `installDefinitionsFromDatabase`. Reloads never overlap; callers that arrive mid-reload share one follow-up reload (it starts after their writes committed). A failed load keeps the previous definitions. Configured in `index.ts` after the startup load; a no-op until then (tests).
- `middleware/definitionReload.ts`, installed on the admin router: after a successful (<400) POST/PUT/PATCH/DELETE under `/items /mobs /blocks /sounds /effects /particle-effects` it reloads BEFORE the response is sent, so "save, then test" can't race it. If the reload fails the save response is untouched but carries `X-Definitions-Reload-Failed` (shared constant, exposed to CORS).
- Admin: `useApi` turns that header into a window event; `ToastProvider` shows a warning ("Saved, but the game server could not reload...").
- Adding a new content type: add its route prefix to `DEFINITION_ROUTE_PREFIXES`.
- Tests: reloader (no-op, coalescing/no overlap, failure + recovery), middleware (ordering, skips reads/other writes/failed writes, failure header, throwing reload), admin useApi + toast. Mutation-checked: overlap protection, awaiting the reload before responding, skipping failed writes.
- Verified read-only against the dev DB that a fresh load resolves the mole's damage and death sounds.

## Limits
- A mining run already in progress, and mobs already spawned in it, keep their old definitions; a new run (or a newly seen mob) gets the new ones.
- Edits made outside the admin (scripts, Prisma Studio, `db push`) are not picked up; the server still needs a restart for those.
- The server must be restarted once to get this code.
