# 025: Dynamite blast rules (damage, falloff, players, rocks)

- **Status:** Open
- **Priority:** P3
- **Area:** server / explosives
- **Source:** Mining game audit

## Problem
Explosion clears every tile except ENTRANCE/EMPTY, including non-mineable ROCK, LADDER, TORCH; hard-codes 50 mob damage; no falloff or line of sight; does not damage players; stale `tile.damage` is not reset.

## Proposed approach
Define blast rules per item (tile hardness limits, damage/falloff, player damage, knockback) via the damage pipeline.

## Acceptance
- Rules documented and data-driven; tests.

## Open questions
(to be asked before work starts)
