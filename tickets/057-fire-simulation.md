# 057 - Fire simulation (spreads through tiles)

**Priority:** P1 - **Status:** Done (2026-10-13); drawn in 061 - **Depends on:** 052, 056

## Decisions
- World fire is **per-cell state** (intensity, remaining burn time) in a `FireGrid`, because it consumes the fuel in a specific cell and spreads to neighbours. Fire is NOT a block and not one entity per flame. Entities that burn (see 058) carry a Burning status; the cell layer and the entity status are two systems that exchange ignition.
- Each step: burning cells count down, may ignite flammable neighbours by `spreadChance`, consume fuel (fluid level shrinks, or block becomes `burnsInto`), emit heat for 058, and go out when burn time ends or fuel is gone. Burn duration is configurable per material (point 9 of the owner's outline).
- Burning oil keeps burning while there is oil; flowing burning oil can spread fire along its path.
- Server-authoritative, sim-clock, delta-synced like fluids.

## Tests
Spreads only to flammable neighbours, stops when fuel is gone, extinguishes after burnDuration, never spreads across non-flammable gaps, deterministic with seeded RNG.

## Decisions (057 Q&A 2026-10-13, plus defaults flagged below)
- **Fuel use (owner):** the oil's level drains gradually while it burns. A full cell would empty in the material's burn duration; a thin film burns out sooner. A cell goes out when its fuel is gone or its burn time ends, whichever is first. The oil keeps flowing while it burns.
- **Spread (owner):** to the four side neighbours with a bias upward: chance per second = the burning cell's spread chance x direction factor (up 1.5, side 1, down 0.5) x the neighbour's own ignition chance. No diagonals.
- **Default (flag if wrong):** fire exists only in a cell that has fuel; there is no flame in empty air and no oxygen model. The flames you see above a pool are drawn from the burning surface cell (061), and the danger around them is the heat radius (058).
- **Default:** newly lit cells do not spread until the next step; ignition from sparks (056) and from spreading use the same path.
- **Default:** fire states travel as start/stop only (`fireCells` `[x, y, 1|0]`), under the same fog rule as fluids: never sent for unrevealed cells; a newly revealed tile carries `fire: 1`; a joining client gets a snapshot.

## Implementation notes
- **Shared:** `gameLogic/fire/FireGrid.ts` (pure, takes a `FireWorld` and injected dice; burning cells in a fixed order), `fireWire.ts` (`FireField` for the client's copy). `FluidGrid.drainFluid` burns fuel away (new, reports `drainedVolume`).
- **Server:** `MiningFireSubsystem` wires the grid to the room: flammability from the ignition system (so blocks burn here for free when 059 adds them), fuel = the fluid level, burning drains the fluid. It takes the ignition queue and steps on the fluid beat (tick step 4.6). `FIRE_STEP_SECONDS` = 0.1.
- **Client:** `FireField` kept up to date by `applyFireUpdates` (`fireFieldRef` on the world). Nothing is drawn yet: flames, light and sound are ticket 061.
- **Tests:** FireGrid (19: ignition rules, burn time, fuel drain, thin film, spread incl. direction bias exactly, no diagonals, determinism), drain (4), FireField (5), server room scenarios and wire (13), client handler (4). Mutation-checked: the direction factor, the fuel drain, taking the ignition queue, and the fog filters on changes, snapshot and reveal each fail a test.
- Not done here: the heat/burning damage (058) and anything to see (061).
