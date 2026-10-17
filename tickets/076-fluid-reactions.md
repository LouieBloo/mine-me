# 076 - Fluid reactions (water hardens lava)

**Priority:** P1 - **Status:** Done (2026-10-16) - **Part of:** water + lava epic (074-080) - **Depends on:** 052, 077

## Problem
Fluids never interact beyond density layering (`FluidGrid`). Water must put out lava and leave lavarock; the rule must be data so other pairs (acid, etc.) are rows later.

## Decisions (Q&A 2026-10-16)
- **Data:** nullable Json `reactions` on `Fluid`, a list of `{ with: <fluid typeKey>, becomes: <block typeKey>, costPerLevel }`. Defined on Lava: `with WATER -> LAVAROCK`. No fluid or block name in logic.
- **Both are used up.** Ratio starts at **2 water per 1 lava** (water is the one that "boils off", the more realistic choice). `costPerLevel` is the water spent per level of lava hardened and is editable in the admin.
- When a lava cell touches a water cell (sideways or vertically) the pair reacts in the fluid step: the lava in that cell is hardened into the block (a full cell becomes the block; a partial cell only when it is filled by what is left), water is reduced by the cost. If there is not enough water the water is all used and the lava is reduced instead, so a trickle slowly eats a pool.
- The new block is written through the same path as `burnsInto` (ticket 059) so block deltas, collision and fog all work. Drops and bodies in the cell follow what `burnsInto` already does.
- Reaction sound, a splash/steam particle: later through the sound slots (062) / particle effect refs; not in this ticket.
- Pure and in `FluidGrid` (shared), stepped by `MiningFluidSubsystem`.

## Checklist
Schema, shared `FluidReaction` type + validator (target block must exist, `with` must be a known fluid), loader, no new wire (block + fluid deltas already exist), admin panel, tests.

## Tests
Water on lava makes the block and removes both in the 2:1 ratio, partial cells, insufficient water, unrelated fluids do not react, reaction is symmetric whichever flows first, validator. Mutation-check: the ratio and the "both used up" rule.

## Implementation notes
- **Data:** nullable Json `Fluid.reactions` (`{ with, becomes, costPerLevel }[]`). The admin API refuses a reaction naming a fluid or block that does not exist, and refuses deleting a fluid another fluid reacts with.
- **Simulation (shared `FluidGrid`):** after each step, every cell of a fluid with reactions that touches the other fluid (4 neighbours) hardens `min(its level, other / costPerLevel)` and spends `costPerLevel` of the other per level. When the reacting fluid in the cell is used up (or below its `minLevel`) the cell is emptied and reported through `takeReactions()`. With too little water, lava is only reduced and the water used up, so a trickle slowly eats a pool. Water that spreads away before it reacts is simply not there to spend (physically right, and lava can be left as a thin film that more water finishes).
- **Server:** `MiningFluidSubsystem.step` turns each reported cell into the block through `MiningBlockSubsystem.placeBlockFromReaction`: never overwrites a solid tile, adds the collider, tells clients only if the cell is revealed (otherwise fluid and gas are told directly).
- **Admin:** `FluidReactionsPanel` (touched by / turns into / cost per level).
- **Tests:** 8 grid tests, 6 room tests, 2 controller tests, panel tests. Mutation-checked: the 2:1 cost and the "both used up" rule, and always telling clients.
- **Deviation:** a lava cell with no water around it never reacts on its own (as designed); fully hardening a full lava cell needs 2 full cells of water.
