# 113 - Mission completion, rewards, failure and results screen

**Priority:** P1 - **Status:** Built; waiting for you to try it - **Depends on:** 109, 112

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

## Built (2026-10-27)
- **Pays on a safe exit only.** `MiningSessionManager.endSession` claims the reward (once per player, `tracker.claim`), rolls the reward items, and passes the coins, XP and items into the same banking call as the backpack and the stash: `RunStashService.bank(characterId, loot, { sol, experience })` writes items and coins in one transaction and adds the XP right after it commits (like item XP, with level-ups). If the write fails the claim is given back, so the reward is still owed.
- Death, timeout, leaving early, a lost room: nothing is paid and the loot rules are unchanged. Completing the mission does not end the run. Co-op: every player who exits safely gets the full reward, late joiners included; a dead or timed-out player gets nothing. A completed mission that was already paid pays nothing again.
- **Results:** the exit returns `mission` (`MissionResultView`: outcome paid / unfinished / failed, each objective, the reward, who did how much, the reason nothing was paid). The client shows `MissionResults` before the spoils on a safe exit, and instead of an immediate return home when a run is lost (death and timeout events carry it); the mode picker no longer pops up behind the results.
- Tests: pays with the loot in one call, nothing when unfinished or abandoned, once only, claim given back on failure, co-op and late joiners, no mission unchanged; results component for each outcome; MineView ordering (mission, then spoils; lost mission before home). Mutation-checked: letting an unfinished mission pay fails two tests.

## Decisions (2026-10-28, from the owner)
- **Keep: the results screen shows on every safe exit**, including with an unfinished mission, to say why nothing was paid.
- Kills are shared in co-op (see 109): everyone who exits safely gets the full reward.
