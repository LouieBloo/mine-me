# 111 - Mission offers and the pre-run picker

**Priority:** P1 - **Status:** Built; waiting for you to try it - **Depends on:** 108, 110

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

## Built (2026-10-27)
- **Offers:** `MissionOfferService` rolls 2-4 distinct missions by weight from those whose level range holds the character's level (level from experience and the CharacterLevel table), keeps the roll in server memory for 30 minutes (asking again shows the same list, so there is no re-roll), and accepts a pick only from it (using it up). No missions that fit: the run starts without one.
- **Wire:** socket event `mining_mission_offers {mode}` (the character is known from the socket) returns `{ offers }` or, for the shared lobby when a room with players already exists, `{ offers: [], joining: <that room's mission> }`. `mining_start` takes `missionId`; an id that was not offered is refused with a reason and nothing starts. The sandbox ignores missions (it has tools).
- **Team:** whoever enters an empty lobby picks; later joiners inherit the room's mission and progress and see no picker.
- **Client:** `MissionPicker` (cards with tier, goals, reward; hover and pointer states), a "Choose a Mission" step in the expedition modal after the biome step (Single Player) or the lobby card, with the shared spinner, an error with Retry, Back, and a small "Start without a mission" button. The modal starts at once when there is nothing to pick.
- Tests: service (level, weights, stable roll, only offered picks, expiry, removed missions), handlers (offers, pick, refusal, inherit), picker, modal flow, start event.

## Decisions (assumed, to confirm) - built
- "Start without a mission" exists so a run (and biome testing) is never blocked. Say so if every run must have one.
- Offers are not stored across a server restart.

## Decisions (2026-10-28, from the owner)
- **Keep the "Start without a mission" button** (missions stay optional; biome testing and quick runs are never blocked).
- **Keep: the first player in an empty shared lobby picks**; later joiners inherit the mission and see no picker (there is no party system yet).
