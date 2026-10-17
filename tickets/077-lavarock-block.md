# 077 - Lavarock block

**Priority:** P1 - **Status:** Done (2026-10-16); script applied - **Part of:** water + lava epic (074-080)

## Decisions (Q&A 2026-10-16)
- Like **Rock**: solid, mineable, more health than rock, needs a pickaxe tier, **drops nothing** by default (drop table editable in the admin).
- Uses the existing block system: `LAVAROCK` added to `MiningBlockTypeKey`, a `MiningBlock` row, a dry-run-by-default script (pattern: `prisma/add-bridge.ts`), `blocks.json` dev mirror entry. Mining sound goes through the sound library (`soundId`, per-use volume).
- **Art is the owner's job** (ticket 080). Until then the row uses the Rock texture as a placeholder so it is playable.
- Not flammable.

## Checklist
Shared type union, row + script (dry run, ask before `--apply`), tile rendering lookup, admin Blocks page needs no change (generic), tests.

## Tests
Script dry-run/idempotent, block loads with the right health/pick power, mining it behaves like rock, can be the target of a fluid reaction.

## Implementation notes
- `LAVAROCK` added to `MiningTileType` (11), `MiningBlockTypeKey`, tile definitions (solid, mineable, health 500, 2.5 s base), the data manager's key list, and a drawn fallback tile in the client renderer.
- `prisma/add-lavarock.ts` (dry run by default; **applied** on the dev DB at the owner's request) creates the block with the Rock texture as a placeholder and `requiredPickPower` 0: **no tool has a Pick Power effect yet**, so a higher number would make it unmineable. Raise it in the admin once tools have one. Dev mirror entry in `blocks.json`.
- Mining sound and drop table are set in the admin like any block (drops nothing for now).
- **Tests:** `add-lavarock.test.ts` (4) and the reaction room tests.
