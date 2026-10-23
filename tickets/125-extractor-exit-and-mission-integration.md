# 125 - Exit, death and mission integration

**Priority:** P1 - **Status:** Partly done (stash exit, death, timeout and co-op rules are in; the mission reward waits for 113) - **Depends on:** 121, 113 (missions)

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
