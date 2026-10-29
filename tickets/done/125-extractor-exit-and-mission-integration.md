# 125 - Exit, death and mission integration

**Priority:** P1 - **Status:** Done (verified by the owner 2026-10-28) - **Depends on:** 121, 113 (missions)

## Where this collides with the mission epic (108-116)
- Mission reward is still claimed on a **safe exit at the entrance** (113). The reward now banks with the backpack and the stash together.
- Mission MINE objectives count items collected into the backpack (109), so depositing does not change progress.
- Death or timeout: no mission reward (113) and the stash is kept (121). These two rules are independent.
- The results screen (113) shows the stash and backpack separately and the weight carried out.
- A mission requirement for a map (110) must also leave room for the extractor landing pad and the shaft column.

## Proposed design
- One exit transaction: stash + backpack + mission reward, idempotent.
- Update tickets 003 (persist loot) assumptions in tests: loot on timeout now includes the stash.
- Co-op: each player exits separately and is paid for their own stash and pack; the shared extractor stays for others.

## Tests
Exit with items in pack and stash, death/timeout rules, mission reward combined, double-exit idempotent, co-op separation.

## Progress (2026-10-22)
Missions (108-116) are not built, so only the extractor side is done:
- One exit: `endSession` banks the backpack and the stash in one transaction (`RunStashService.bank`) and reports `extractedItems` (both), `backpackItems` and `stashItems`. A second exit finds no room or player and banks nothing (idempotent).
- Death, timeout, abandon, disconnect: no backpack, the stash is kept (banked on its own); belt items are lost with the player.
- Co-op: each player has their own stash and exits separately; the shared extractor and belt stay for the others (tested).
- Existing loot assumptions (003) were updated in the session manager tests: timeout and death no longer say "no loot saved" but "no backpack saved, stash banked".
- **Waiting for 113:** the mission reward paid together with the stash and pack, the results screen showing stash and pack separately (the data is returned, no screen yet), and the map requirement leaving room for the pad and shaft (110).

## Built (2026-10-27, with the missions epic)
- The mission reward (Sol, XP, rolled items) is banked in the same transaction as the backpack and the stash (`RunStashService.bank` with a bonus), once per player, only on a safe exit; see 113.
- Still open: the exit screen shows backpack and stash as one list (the response still carries them separately); the forced mission blocks do not avoid the belt shaft (the belt digs through them).

## Decisions (2026-10-28, from the owner): leaving only at the extraction point
- The always-visible bottom-right "Extract & Leave" / "Abandon Mine" button is removed. A normal run can only be left by standing on the extraction point on the surface (the exit entrance) and confirming "Leave Mine?"; dying or running out of time still end the run on their own.
- **The server enforces it:** `mining_exit` is rejected ("You can only leave the mine at the extraction point on the surface.") unless the player's live position is on the exit (`MiningSessionManager.canExit`, the same `isOnEntrance` rule as `canExtract`). The sandbox, which saves nothing, keeps its Leave button and can leave from anywhere. Closing the page or leaving the view still cancels the run as before.
- **How the player finds it (2026-10-28):** the point is drawn as an EXIT sign standing on the ground at the entrance (placeholder Graphics, behind every body, not drawn in the sandbox). While the player stands on it, a "Press E to leave the mine" prompt (key E, free in the input handling, plus a clickable button) opens the existing "Leave Mine?" confirmation. **Decided:** the old auto-popup when walking back onto the spawn is removed (it never worked with the sky rows and would be intrusive); the question only opens from the key or the button.

