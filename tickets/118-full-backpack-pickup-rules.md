# 118 - Full backpack: pickup refusal and feedback

**Priority:** P1 - **Status:** Open - **Depends on:** 117

## Decisions (2026-10-22, from the owner)
- **Pickups are refused when they don't fit; the item stays on the ground.** Mining still works. The player can unload and come back.

## Proposed design
- The pickup path (server, authoritative) checks `canCarry` before moving a dropped item into the backpack. A stack that partly fits takes what fits and leaves the rest as a smaller drop on the ground (decided 2026-10-22, owner).
- Client prediction uses the same shared helper so the item doesn't flicker.
- Feedback: a HUD weight bar (current / capacity) in `MiningHUD`, a "Backpack full" toast and a sound from the sound library (per-use volume via `withVolume`), and refused drops show a small "full" marker only while the player is near.
- Drop physics: a refused item must not be re-picked every tick (throttle the check).
- Missions (109): MINE objectives count items *collected into the backpack*, so a refused pickup doesn't count; depositing to the extractor later does not subtract progress.

## Tests
Fits, doesn't fit, partial stack, throttle, prediction parity, mission counter unaffected by deposits.
