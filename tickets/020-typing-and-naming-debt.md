# 020: Replace any types and fix misleading names

- **Status:** Open
- **Priority:** P3
- **Area:** server + client + shared
- **Source:** Mining game audit

## Problem
- `any` on `getItemData`, `getBlockConfig`, `getMobData`, `aiConfig`, `animations`, `dropTable`, client `onEvent`, `equippedWeapon`.
- `damageMs`, `miningProgressMs`, `miningTimeMs` hold HP/damage, not ms; `tile.damage` and `tile.damageMs` are written together.

## Proposed approach
Typed shared definitions for item/block/mob data; rename fields; remove the duplicate tile field.

## Acceptance
- Zero `any` in mining server/shared paths (or documented exceptions); consistent names.

## Open questions
(to be asked before work starts)
