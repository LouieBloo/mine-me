# 088 - Small blocks (3x): generation, fluids, fire, gas and profiling at 135x135

**Priority:** P1 - **Status:** In progress (stepping and profiling done 2026-10-17; cave smoothing, light cost and the by-eye checks remain) - **Part of:** small blocks epic (085-090) - **Depends on:** 085, 086, 087 (done; the owner chose 3x) - **Phase 2: next (088-090)**

## Problem
After phase 1 (085-087) the numbers are right, but the systems that work cell by cell (map generation, fluid, fire, gas, sandbox) were tuned for big cells. They need to produce the same world with finer detail, and the 9x cell count (135x135 = 18k cells) has to stay playable.

## Design
- **Map generation:** same layout at finer detail. The cave cellular automata gets enough smoothing passes to give round caves instead of speckle (try `cavernIterations` 3 -> 5-6 and record the value chosen; at 3x the default 3 is likely too speckled). Tunnels are 3 cells wide (`tunnelWidth` = the scale; the character is 1.9 x 2.7 cells). Rock and ore placement: veins and rock clusters are about the same world size as today (cluster growth in cells doubles), not single small cells scattered. Falling rocks (`ROCK` tiles) are single small cells.
- **Surface and entrance:** the entrance and surface rows line up at the new size. The sky/side margins in `LightingEngine` follow `TILE_SIZE`.
- **Sandbox:** done in phase 1 (`scaleSandboxLayout`, see 085). Check it by eye.
- **Fluids:** a cell is a ninth of the original volume, so flow measured in cells per step is a third as fast in the world. Keep world speed about the same by stepping the fluid more often (`FLUID_STEP_TICKS` 3 -> 1, i.e. every tick, is the most the 30 Hz tick allows; a pour that is still too slow may need two steps per tick). Check by eye with the 084 scenes, which stay cell-based. A bucket or pour adds what used to fill one old cell (4 small cells' worth). Reactions (water hardens lava 2:1) stay per cell.
- **Fire and gas:** fire spreads to neighbouring cells, so a front crosses the world a third as fast. Gas diffuses per cell, so it spreads a third as far. Step them like fluids (`GAS_STEP_TICKS` 3 -> 1) and leave `spreadChance` and `burnDuration` as data for the owner to tune in the admin. Record what changed.
- **Wire:** the full-map snapshot and fog reveal are 9x bigger. Measure the join snapshot size and the per-tick delta size with fluid, fire and gas active.
- **Already measured (phase 1):** dropped items are now a full tile across and fall twice as fast; an item step costs about 2.5x what it did (162 items settling: ~300 ms -> ~750 ms per 150 ticks alone). A blast of the same radius in tiles drops the same number of items; the data blast radius doubled with the migration, so a real blast now drops about 4x as many (capped by `MAX_DROPPED_ITEMS` 1000). Planck `bullet` mode is the likely cost; check whether items still need it now that they are as big as a cell.
- **Profiling:** measure server tick time (mean and worst) and client frame time at 135x135 with water, lava, fire, gas and 3 mobs pathing. Record the numbers here. Fix only what makes it unplayable: a tick over budget at 30 Hz, or under 60 fps.

## Decisions (2026-10-17)
- Same physical world area, more cells. The world does not get bigger.
- The 084 fluid scenes stay as cell-level tests. They are not redrawn at the new size.

## Tests
- Generator: a 135x135 grid, entrance at the top centre, every tunnel 3 cells wide and connected to the entrance, no tile out of bounds, ore and rock percentages within tolerance of the config.
- Fluid: water poured into a hole the size of an original block (3x3) fills it. The stepping change keeps the 084 scene tests passing.
- Sandbox map builds at the new size and its fixtures (pools, gas, test dummy) sit where the tests expect.

## 3x notes (2026-10-17)
- Measured on the 2x spike: an item step costs about 2.5x the original; at 3x the gravity is 3x the original and items are 32px across, so expect worse. Planck `bullet` (continuous collision) on items is the first thing to try turning off or limiting; items now sleep after about a third of a second at rest (`MiningDropSubsystem`).
- Planck needs `REST_SPEED` etc. to scale with the gravity: they are already `x BLOCK_SCALE`.
- A real dynamite blast (data radius x3) drops about 9x the items, up to `MAX_DROPPED_ITEMS` 1000.
- Light: every light covers 9x the cells; lightmap cost is the first suspect for client frame time.

## Implementation notes (2026-10-17, 3x)
- **Step rates:** `FLUID_STEP_TICKS` and `GAS_STEP_TICKS` are now `max(1, round(3 / BLOCK_SCALE))` (every tick at 3x, 10 Hz for the original blocks), so a pour or a gas cloud crosses the same screen distance in the same time. Fire steps on the fluid beat (`FIRE_STEP_SECONDS` follows). A gas explosion's front has its own beat, `EXPLOSION_STEP_TICKS` = 3, because `frontSpeed` (cells per beat) was already scaled by the migration. Fire still spreads a fixed chance per second per neighbour, so a fire front moves a third as far per second in the world as before: tune `spreadChance` in the admin if it feels slow.
- **Server cost measured at 135x135 (idle mine with 8 mobs: mean 0.9 ms per tick, max 5 ms; budget 33 ms).** Sandbox stress: 600 cells of water poured into the sky, mean 1.7 ms and a 17 ms worst tick while they fall; settling 1.1 ms; oil poured and set alight 1.2 ms. So the simulation, even stepping every tick, is nowhere near the budget. The expensive thing is **dropped-item physics** (see the notes above) and still-unmeasured **client light/fog/draw cost**: that needs a browser, so it is the owner's to judge.
- **Map generation:** at 135x135 caves look like decent caverns at 3 smoothing passes; 5 gives rounder, larger ones. Left at 3 (it is one number in the Mine Generator page); decide by eye.
- **Gas pockets:** pocket sizes triple, so a pocket rarely finds a place that is all dirt with a solid ring. The generator tries `BLOCK_SCALE^2` times as often (it tried 30 times per wanted pocket).
- **Not done:** the by-eye checks of the sandbox, fluid scenes and a pour at 3x; client frame time and join snapshot size (full-map payload is 135x135 tiles).
- **Cave shape (done, see 090's notes):** caves are generated on a coarse grid and redrawn at full size, so they keep their original size with rounded edges.
