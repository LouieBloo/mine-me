# 125 - Exit, death and mission integration

**Priority:** P1 - **Status:** Open - **Depends on:** 121, 113 (missions)

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
