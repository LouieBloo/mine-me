# 025: Dynamite blast rules (damage, falloff, players, rocks)

- **Status:** Done
- **Priority:** P3
- **Area:** server / explosives
- **Source:** Mining game audit

## Problem
Explosion clears every tile except ENTRANCE/EMPTY, including non-mineable ROCK, LADDER, TORCH; hard-codes 50 mob damage; no falloff or line of sight; does not damage players; stale `tile.damage` is not reset.

## Proposed approach
Define blast rules per item (tile hardness limits, damage/falloff, player damage, knockback) via the damage pipeline.

## Acceptance
- Rules documented and data-driven; tests.

## Decisions (2026-10-09)
**Revised after owner review:** everything in the blast radius takes the same damage (players, the thrower and mobs alike - `EXPLOSION_PLAYER_DAMAGE_FACTOR` removed), and distance is the only thing that reduces it. Walls no longer shield from damage; only the ENTRANCE is blast-proof. **Rocks are destroyed by blasts** like any block (a first version wrongly made them immune, which left rocks floating after a blast); rocks above any cleared tile now start falling. Tile shielding was removed as a result. Falloff stays linear to 25% at the edge. Original defaults (superseded where stated above):
- Blast strength = the explosive item's own Damage effect (via `getItemDamageEffect`), else `EXPLOSION_DEFAULT_DAMAGE` (50). Radius is still the Explodes effect.
- Linear falloff to `EXPLOSION_MIN_DAMAGE_FRACTION` (25%) at the edge.
- Players are hurt too, including the thrower, for `EXPLOSION_PLAYER_DAMAGE_FACTOR` (50%) of the mob damage; everything the blast hurts is knocked away (`EXPLOSION_KNOCKBACK_X/Y`).
- Bedrock-like tiles (`isBlastProof`: ROCK, ENTRANCE) survive and shield what is behind them (line of sight by exact ray) - for tiles and for entity damage. Ladders and torches are destroyed.

## Implementation notes
- New shared `blastDamageAt` (`gameLogic/blast.ts`) and `isTileBlastProof` / `MiningTileDefinition.isBlastProof`. `EXPLOSION_MOB_DAMAGE` replaced by the constants above.
- `explodeDynamite` order: damage entities first (so walls still shield), then excavate (also resets `tile.damage`), then interrupt miners and trigger rocks. All damage goes through `applyDamage` with `type: 'explosive'`.
- Tests (`MiningGameEngine.blast.test.ts`, plus updated existing ones): radius, blast-proof/ladder/torch, shielding for tiles/mobs/players, damage reset, falloff, item-driven strength, knockback, player damage incl. thrower. Mutation-checked (4 mutations each fail a test).
- Not done: admin UI for per-item overrides beyond the existing Damage/Explodes effects (they are already editable as item effects).

