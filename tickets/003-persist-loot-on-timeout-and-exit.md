# 003: Persist backpack loot on timeout and make exit failure-safe

- **Status:** Done
- **Priority:** P0
- **Area:** server / session manager
- **Source:** Mining game audit

## Problem
- `handleSessionTimeout` (`MiningGameEngine.ts:901`) tells the client it was returned with its items, but `onTimeout` → `cleanupRoom` never writes the backpack to the DB.
- `MiningSessionManager.endSession` removes the player first, then awaits sequential `giveItemToCharacter` calls with no transaction. A failure mid-loop loses the remaining loot.
- Item lookup uses `OR [id, name]`, which can match the wrong item.

- Found while working 001: `handleSessionTimeout` calls `onTimeout(primaryCharacterId || roomId)`, but `cleanupRoom` looks rooms up by `roomId`. For solo rooms (`solo_<charId>`) the lookup misses, so the stopped engine stays in `activeRooms` and is reused by the next `createSession` without being restarted. The existing test in `MiningGameEngine.test.ts` (expects `'char-1'`) encodes this behaviour and must be updated. The new fatal-error path already passes `roomId`.

## Proposed approach
- One shared "extract and persist" path used by exit, timeout, and (if desired) disconnect.
- Persist in a single Prisma transaction; look up by id only.
- Decide what happens to loot on failure (retry, keep session, log).

## Acceptance
- Timeout persists loot; exit is atomic; tests cover timeout, partial failure, and double-exit.

## Decisions
- Timeout and collapse (fatal tick errors): backpack loot is **lost** for now (a way to extract from the backpack will come later). Messages no longer promise items and `extractedItems` is no longer sent.
- Disconnect / `mining_cancel`: still loses loot.
- DB failure recovery (retry/recovery record): out of scope for now. The save is a single transaction, so a failure leaves nothing half-written; but the player has already left the room, so that loot is lost.
- Saving matches items by database ID only, inventory/wallet writes in one Prisma transaction, XP granted after commit.

## Implementation notes
- `InventoryService.giveItemsToCharacter` (new): merges duplicate ids, validates quantities, one `$transaction`, reports `skipped` (unknown id / bad quantity); `giveItemToCharacter` now shares the `applyItemGrant` helper.
- `MiningSessionManager.endSession` uses it and logs skipped items.
- **Extra bug found and fixed:** backpack entries carried the drop table's raw id (`'sol'` is an `itemKey`), and the old save matched `id OR name` (name is `"Sol"`, case-sensitive), so mob/chest Sol drops were never saved. Drops (`MiningDropSubsystem.spawnBlockDrops`, `MiningMobSubsystem.spawnMobDrops`) now store the resolved canonical id (`itemData.id`), falling back to the raw id if unresolved (those are skipped at save with a warning). Caveat: this relies on `items.json` ids matching DB ids.
- **Room cleanup bug fixed:** `onTimeout` is now called with `roomId` (was the characterId, which never matched a solo room key, leaving a stopped engine to be reused). Existing test updated to `solo_char-1`.
- Tests: `tests/inventory.batch.test.ts`, `MiningSessionManager.persistence.test.ts`, `subsystems/MiningDropSubsystem.test.ts`, updated `MiningGameEngine.test.ts`.
