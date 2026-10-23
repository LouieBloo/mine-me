# 117 - Item weight and backpack carry capacity

**Priority:** P1 - **Status:** Open - **Depends on:** none (first of the extractor epic 117-127)

## Problem
The backpack has no limit today, so there is no reason to return to the surface. We want a carry limit so the player must empty the pack at the extractor (118+) or on its belt.

## Decisions (2026-10-22, from the owner)
- **Weight limit** (not slots or item count). Each item has a weight; capacity is total weight.
- **Weight lives on `Item` rows; capacity comes from the Effects table**, derived like other stats (a new `Carry Capacity` effect type), so bags, gear and upgrades are just effects. No capacity field on the character.
- Capacity can be upgraded by items and so on (bags, gear, later extractor/profession upgrades).

## Proposed design
- `Item.weight` (Float, default 0 for quest-like or tiny items). Shared type field, loader, wire (sent once with the item description), admin item form field.
- `Carry Capacity` effect in the Effects table. Note the `Effect` model uses one boolean column per effect kind (`healthGain`, `miningSpeedModifier`, `ignites`, ...), so this needs a new `carryCapacityModifier` column (Prisma `db push`, then `generate`; no force-reset), a new entry in the admin's `effectKinds.ts` and the Effects page, an `Effect` row for it and a value on item `ObjectEffects`. The effect is the capacity bonus in weight units; a shared `deriveCarryCapacity(effects)` beside `deriveCombatStats`, with a documented base value for a character with no gear.
- Shared pure helper `backpackWeight(contents, itemDefs)` and `canCarry(contents, item, qty, capacity)` so server, client prediction and tests use one rule.
- Existing items need weights: a dry-run-by-default script (like `migrate-sound-library.ts`) proposes values; ask before `--apply`. Never run db seed on the dev DB.
- Placed or thrown items (ladder, torch, dynamite) reduce weight as they are consumed, nothing special.

## Open questions for the owner
1. ~~Slowdown~~ Decided (2026-10-22, owner): no slowdown; full is just full.
2. ~~Scale~~ Decided (2026-10-22, owner): small integers, base capacity about 100 (dirt 1, stone 2, ore 3-5, gems 1-2); the dry-run script proposes values.

## Tests
`backpackWeight`, `canCarry`, `deriveCarryCapacity` (base, gear, stacked effects), loader maps weight, admin validation (weight >= 0). Mutation: ignore capacity effects -> a test fails.
