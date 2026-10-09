# 019: Remove hard-coded item names and magic numbers

- **Status:** In progress (code done; one dev-DB step pending, see Remaining)
- **Priority:** P2
- **Area:** server + shared / data-driven design
- **Source:** Mining game audit

## Problem
- Handlers find items via `name contains 'ladder'`, `subType 'DYNAMITE'`.
- Fallbacks use `'copper_ore'`, `'sol'`, `'revolver_6shooter'`.
- `spawnMob` silently clamps `moveSpeed < 2.8` to 3.2 and `jumpForce < 8` to 8.8; `miningSpeed <= 10` is multiplied by 100.
- AI config (`aggroRange 20`, `attackRange 1.25`, `canMine true`) is hard-coded instead of read from mob data.
(Violates CLAUDE.md rule on item names.)

## Proposed approach
Drive from item table/subtypes/effects and mob data; move defaults into `MINING_CONFIG`; remove silent overrides.

## Acceptance
- Admin-configured values are honoured; no item-name literals in logic.

## Open questions
(to be asked before work starts)

## Decisions
- Item roles (torch/ladder/throwable/currency/ranged) come from category data via shared helpers in `packages/shared/src/gameLogic/itemRoles.ts`, never names.
- Legacy drop fallback removed. Chests stay empty until loot is configured in the admin app.
- Mob roster and surface dummy come from the map config (`allowedMobIds`, `surfaceDummyMobId`). Mob data (moveSpeed, jumpForce, miningSpeed, aiConfig) is honoured as-is, with defaults in `MINING_CONFIG.MOB_DEFAULT_*`.

## Implementation notes
- Server: data-manager helpers, handlers via `ITEM_ROLE_WHERE`, explosive default throwable, mob stats/AI from data. Tests incl. `MiningGameEngine.mobConfig.test.ts`.
- Prisma: `MiningMapConfig.surfaceDummyMobId` pushed. Admin: `MiningConfigMobs` card (roster + dummy select).
- Client: `QuickAccessContext`, `useMiningScene` use the shared role helpers. The pickaxe/any-weapon fallbacks in `equippedWeapon` were removed.
- Mob data migration: `apps/server/prisma/migrate-mob-stats.ts` (dry-run default, with tests). `mobs.json` already updated.
- Verified: server 604+13 tests pass, client 365 pass, client and server typecheck clean.

## Remaining (pick up here)
1. **Run `npx tsx prisma/migrate-mob-stats.ts --apply`** (load `.env` first) once the user approves. It updates only the "Mole Person" row (miningSpeed 0.25 -> 25, detectionRadius -> aggroRange). The user declined the prompt when asked, so it has NOT been applied. Note Mole Person's moveSpeed of 1 is now honoured (it used to be bumped to 3.2).
2. Admin `MobDetail.tsx`: miningSpeed default and label (it is a percentage now).
3. Bullet texture lookup in `useMiningScene.ts` still matches by id/itemKey/name 'bullet'. Replace with an ammo role or the equipped weapon's ammo item.
4. Run admin and shared test suites plus typechecks (`-p tsconfig.app.json`), then set Status Done and update the README row.
