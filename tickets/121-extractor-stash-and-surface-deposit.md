# 121 - Extractor stash, surface deposit and persistence

**Priority:** P1 - **Status:** Done in code (judge the feel in the game) - **Depends on:** 117, 120

## Decisions (2026-10-22, from the owner)
- The extractor **takes the player's items and saves them for when they leave.**
- The player can **walk onto the extractor on the surface** to deposit.
- **On death or timeout the stash is kept and the backpack is lost; items still on the belt are not saved.** An item is safe only once it has reached the extractor.
- **Exit stays at the entrance and the backpack leaves with the player as today**, together with the stash.

## Proposed design
- Per-player stash on the run (`stash: playerId -> item contents`). The stash has no weight limit.
- Deposit zone on the extractor: while a player stands in it, the backpack empties into the stash at a data rate (reuse the unload rate, with a short per-item delay so it reads as an action), until empty or they leave.
- **Crash safety:** a deposit persists to the database as it lands (same failure-safe, atomic approach as ticket 003/004), so a server crash or timeout does not lose the stash.
- Exit (entrance tile): backpack and stash are banked together in one transaction; the mission reward (113) pays with them.
- Death and timeout: stash is banked, backpack is lost, belt items are lost. Existing loot rules otherwise unchanged. Note this softens today's death rule.
- Each player's stash is separate even though the extractor is shared.

## Tests
Deposit empties pack into the stash, persists per deposit, death keeps stash and loses pack and belt, exit banks both once (idempotent), per-player separation, interplay with mission reward.

## Progress (2026-10-22)
- `RunStash` table (characterId + itemId, quantity) and `RunStashService`: `add` writes each deposit (in order per character), `bank` adds the stash and the backpack to the inventory and deletes the rows in ONE transaction, safe to call twice. Nothing in the live room is the only copy of a deposit.
- Deposit: `MiningExtractorSubsystem.updateDeposits` moves units from the backpack to the player's stash at the extractor's new `depositItemsPerSecond` (default 20; separate from the belt's `unloadItemsPerSecond`), heaviest item first (`nextUnloadIndex`, shared, reused by 123), only after landing and only while standing in the footprint. Writes follow within 1 s, or at once when they stop or leave; a failed write is kept and retried.
- Exit (`endSession`): backpack + stash banked together in one transaction; the result lists `extractedItems` (both), `backpackItems` and `stashItems`. Death, timeout, abandon, disconnect: the backpack is lost and the stash is banked on its own. A stash left by a crash is banked when the character next starts a run.
- Client: "Stored in extractor" section in the backpack panel.
- Co-op: each player has their own stash and deposits and exits separately.
- Mission reward interplay is ticket 125 (missions do not exist yet).
