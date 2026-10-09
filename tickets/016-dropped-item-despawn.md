# 016: Dropped item despawn and cap

- **Status:** Done (hard limit); despawn and fade-out intentionally not built
- **Priority:** P2
- **Area:** server / drops
- **Source:** Mining game audit

## Problem
`droppedItems` never expire and have no cap; the list and Planck bodies grow unbounded in long sessions, and the full list is re-sent while anything moves.

## Proposed approach
Lifetime + max count with oldest-first eviction; sleep settled bodies; stop flagging dirty when items are at rest.

## Acceptance
- Bounded item count; tests for expiry and eviction.

## Decisions
- **No despawn timer for now.**
- **No eviction**, but a **hard safety limit of 1,000 dropped items per room**. Drops beyond it are **skipped and logged** (not merged, and existing items are never removed).
- Send the dropped-items list **only when something changes**; items at rest stop causing sends.
- **Fade-out effect: skipped for now.** With no timer and no eviction nothing can despawn except a pickup, so it will be built when something can despawn items (it needs a despawn event from the server).

## Implementation notes
- `MINING_CONFIG.MAX_DROPPED_ITEMS = 1000`; `MiningDropSubsystem.reserveDropSlots(n)` returns how many of `n` new drops fit and logs a throttled warning (at most every 5 s) when it has to truncate. Both drop creators use it (block drops and mob drops), so physics bodies and payload size are bounded. A batch that only partly fits spawns what fits.
- Measured the existing "dirty" logic before changing anything: after a chest breaks, the list is sent for ~0.3 s (9 of 240 ticks) while items fall and then not at all, so it already behaved as requested. It is now covered by tests so it can't regress: nothing sent when idle, announced on spawn, updates while falling, silence once settled, sent again on pickup (including the final empty list so clients clear their sprites), sent again if a settled item is disturbed (floor mined away), physics body released on pickup.
- Tests: `MiningDropSubsystem.test.ts` (limit: under / partial / at limit, no eviction, throttled warning, mob drops, pickup frees room), `MiningGameEngine.drops.test.ts`. Mutation-checked: removing the cap fails 3, always flagging dirty fails 1.

## Notes / follow-ups
- Not built: despawn timer, eviction, fade-out event (needs something that can remove items other than pickup).
- Drop creation logic is still duplicated between block and mob drops (ticket 018 will merge it into `spawnDrop`).
- Dropped-item deltas (only changed items) were considered; unnecessary for now since the list is only sent for ~0.3 s per drop event.
