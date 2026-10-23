# 113 - Mission completion, rewards, failure and results screen

**Priority:** P1 - **Status:** Open - **Depends on:** 109, 112

## Decisions (2026-10-22, from the owner)
- **Completing the mission does not end the run.** It is announced and the reward is banked; the player keeps mining and exits when ready.
- The reward is **claimed on a safe exit**.
- **Failure** (death, timeout, leaving early): the mission fails and pays nothing; the existing loot rules for death, timeout and exit are unchanged.
- Rewards: coins, XP and items (a drop table), authored per mission.

## Proposed design
- On mission complete the tracker (109) marks it `completed`. On the exit path (`exitMiningSession`), if completed, pay the reward in one transaction with the persisted loot (reuse the existing failure-safe persistence from ticket 003, and its atomicity). A crash or timeout after completion but before safe exit pays nothing (same as failure).
- Reward items roll the drop table at claim time and go to the inventory the same way run loot does.
- **Co-op (decided 2026-10-22, owner):** every player who exits safely gets the full reward, late joiners included; each is paid for themselves (a player who died or timed out gets nothing).
- **Results screen:** a panel on exit showing mission name, objectives done or failed, the reward received, and per-player contribution in co-op.
- Idempotent: a reward can never be paid twice (record paid state on the run).

## Tests
Paid on safe exit only; not paid on death, timeout, early leave; paid once; transaction rollback leaves nothing half-paid; co-op split; results screen renders both outcomes. Mutation: pay on completion instead of exit -> a test fails.
