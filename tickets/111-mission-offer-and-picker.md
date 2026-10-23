# 111 - Mission offers and the pre-run picker

**Priority:** P1 - **Status:** Open - **Depends on:** 108, 110

## Decisions (2026-10-22, from the owner)
- The player **picks from a few offered missions** (2-4) before the map is generated.
- Offers come from the pool filtered by the character's level and tier. Objective count grows with tier.
- **No re-roll and no abandon.**

## Proposed design
- Server `MissionOfferService`: `rollOffers(character)` picks 2-4 distinct missions weighted by `weight`, filtered by level range. Offers are stored on the pending session (so a refresh or reconnect shows the same list, and a client can't pick a mission it wasn't offered).
- `startMiningSession` takes the chosen mission id, validates it against the stored offers, passes it to generation (110) and to the tracker (109). A run with no offers available (empty pool) starts without a mission, as today.
- Client: a mission picker panel (HTML + CSS, Tailwind, own component folder) shown before the mine loads: each card shows name, objectives, tier, rewards. Hover states, pointer cursor, errors surfaced, the shared loading spinner while generating.
- Multiplayer: how a team picks (leader picks, or vote) needs a decision, see the open question below.

## Open questions for the owner
1. ~~Team pick~~ Decided (2026-10-22, owner): the party leader picks; no vote.
2. ~~Late join~~ Decided (2026-10-22, owner): a player joining an existing run inherits its mission and progress.

## Tests
Offer roll respects level and weights and is stable per session; picking a non-offered mission is rejected; the empty-pool case; picker component tests including error display.
