# 020: Replace any types and fix misleading names

- **Status:** Done
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

## Decisions (2026-10-09)
- Typed definitions: hand-written shared interfaces in `packages/shared` (item/block/mob definitions), used by loaders and `MiningDataManager`.
- Renames: `miningProgressMs` -> `miningProgress`, `miningTimeMs` -> `miningTotal` (block HP), server + wire + client HUD.
- `tile.damageMs` removed; `tile.damage` is the only field (no legacy load fallback).
- Fix the `tile.type as any` casts by typing `isTileSolid`/`isTileClimbable`/etc.

## Implementation notes

- Typed definitions: `GameDefinitions` / `MiningDataManager` now use shared `GameItem`, `Mob`, `MiningBlockConfig`; `getItemData`, `getBlockConfig`, `getMobData` etc. return typed values. The Prisma-to-shared mapping is a single documented cast in `loadDefinitionsFromDatabase`. Test fixtures that are partial go through `partialDefinitions` / `testBlockConfig` / `testDropTable` in `testHelpers.ts`.
- `spawnMob` takes a named `MobSpawnData`; `MobAIConfig` gained the collider/sprite/health-bar fields it was already read for. `MiningActiveMob.animations` is `SkeletonManifest | MobAtlas | null`; new `isSkeletonManifest` / `getMobSpriteUrl` in shared (`mobAnimations.ts`) replace ad-hoc `.parts` / `.url` probing on server and client.
- Renames: `miningProgressMs` -> `miningProgress`, `miningTimeMs` -> `miningTotal` everywhere (server, wire, client HUD, shared types). `tile.damageMs` removed; ladder/torch placement and explosions now reset `tile.damage` (before they only reset `damageMs`, which `damage` shadowed). Tests added and mutation-checked.
- `tile.type as any` casts removed (collision grid type was `MiningTileType | number`). `ITEM_ROLE_WHERE` is no longer `as const` so Prisma accepts it without a cast.
- Removed dead `physicsConfig.explosionRadius` fallback (not in the type or any data).
- Other `any` fixes: `buildMiningLoadout` (Prisma payload type), `resolveWeaponLimits`, `resolveEquippedWeapon`, `endSession`, the throw handler, socket `catch (err)` blocks.
- Left as documented exceptions: `InventoryService` mapping helpers (outside mining paths), `(engine as any).tick` in tests, client-side `any` (`onEvent`, `equippedWeapon`, MiningGrid item lookups, profiler) which are the scope of ticket 027.
