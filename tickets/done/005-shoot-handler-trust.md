# 005: Server-validate weapon, muzzle and ammo on mining_shoot

- **Status:** Done
- **Priority:** P0
- **Area:** server / combat
- **Source:** Mining game audit

## Problem
- `weaponItemId` from the client is never checked against equipped gear; unknown IDs fall back to any item with `shootsProjectiles` (`MiningProjectileSubsystem.ts:41-48`).
- `muzzlePosition` is client-supplied and accepted up to 2.5 tiles from the player, allowing shots to start behind walls.
- No ammo item is consumed; only a server-side magazine counter exists.

## Proposed approach
- Resolve the weapon from the player's equipped item server-side (store in session at `mining_start`).
- Compute muzzle position on the server from player position, aim, and gear `muzzleOffset`.
- Decide ammo model (infinite, consumes inventory item, etc.).

## Acceptance
- Client cannot choose weapon or muzzle origin; tests cover spoofed weapon/muzzle.

## Decisions
- Weapon comes from the character's **equipped gear in the DB**, cached on the session and refreshed on `equip_item` / `unequip_item` (players can swap mid-run via the quick-access bar).
- No gun equipped (or equipped weapon doesn't `shootsProjectiles`) -> shot rejected ("No ranged weapon equipped."); the "pick any gun" fallback is removed.
- Muzzle: **hybrid** (chosen after finding the server can't reproduce the barrel position from item `muzzleOffsetX/Y`, which are weapon-sprite pixels run through client sprite scale/arm rotation). The client's `muzzlePosition` is used only if it is within `GUN_MUZZLE_MAX_DEVIATION` (1.0 tile) of the server estimate (shoulder + `GUN_MUZZLE_REACH` 0.9 along the aim) and has no solid tile between player and muzzle; otherwise the estimate is used (or the shoulder if the estimate is inside a wall).
- Ammo item consumption was not requested; the magazine remains a pure server counter (see 008).

## Implementation notes
- `MiningPlayerSession.equippedWeaponId`; `MiningPlayerManager.setLoadout` / `MiningGameEngine.setLoadout`.
- New `services/mining/miningLoadout.ts` (`buildMiningLoadout`) used by `mining_start`, `equip_item`, `unequip_item`. **Side fix:** equip/unequip previously updated only mining speed on a live session; mining damage and remote-visible gear layers are now updated too.
- New `subsystems/miningMuzzle.ts` (`resolveMuzzlePosition`, `isSegmentBlocked`); new `MINING_CONFIG.GUN_MUZZLE_REACH` / `GUN_MUZZLE_MAX_DEVIATION`.
- `engine.shootProjectile(characterId, target, muzzle?)` (the `weaponItemId` parameter is gone); handler ignores client `weaponItemId` / `itemId`. `createSession` gained a trailing `equippedWeaponId` param (the long positional list is a candidate for ticket 018).
- Tests: `miningMuzzle.test.ts`, `miningLoadout.test.ts`, new cases in `miningEvents.test.ts` (spoofed weapon, no weapon, malformed target) and `gameEvents.test.ts` (equip/unequip syncs live session).
- Known gap for 008: `playerWeaponAmmo` is still per character, so swapping guns keeps the old magazine size/fire rate.
- Known gap: the client's `equippedWeapon` falls back to any weapon in the inventory even if unequipped; those shots are now rejected by the server (the client will see an error). Consider cleaning that up client-side.
