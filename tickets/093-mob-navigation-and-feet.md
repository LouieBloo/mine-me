# 093 - Mob navigation fixes and mob feet on the ground (3x blocks)

**Priority:** P1 - **Status:** Built, not yet played (2026-10-18) - **Depends on:** 085-090 (3x blocks), 090 (body-sized pathing)

## Problem
At 3x the Mole Person (a 1.9 x 2.67 cell body) barely moved: in a probe of random scenarios (the mole in one cave, a player in another 15-30 cells away, 60-90 s) it reached the player in 2 of 12. Its sprite also hovered above the ground.

## What was wrong (found by running the real mole in generated mines)
1. **Steering stopped 0.1 short of the footprint middle.** The mole is 1.9 cells wide in a 2-cell footprint (0.05 spare each side) but the AI's dead zone was 0.15 and mob movement was all-or-nothing. It stopped 0.1 off, still overhanging the ledge it meant to step off (never fell) or catching its head on the column beside a vertical jump (a 0.3-cell hop forever). Now `steer` slows over the last half cell and settles on the middle, a vertical jump waits until the body is lined up (0.04), and `MiningMobBody.processMovement` takes a fraction (-1..1), not just the sign.
2. **Planned digs through things it cannot dig.** The AI treated any solid block as diggable (a rock that landed on the route, or an ore needing more pick power than the mob has), then stood "mining" a block the server refused. `MobAIContext.canBreakTile` (pick power vs the block's requirement) now narrows the pathfinder (`canBreakTile` option) and the AI's `isDiggable` (mineable and breakable).
3. **Physically impossible routes.** The pathfinder let a body in the air move sideways at constant height (a chain of "falls"), so a jump to the top of a ledge could be planned as a horizontal float across the room, and the mole jumped, landed back where it started and looped. A body in the air now only drops (straight, or one cell sideways per cell down); sideways moves from the air only to land on something. Jumps over a pit are limited by `maxJumpReach` (walking speed x time in the air, from the mob's speed and jump force; a speed-3 mole cannot clear a 3-cell gap).
4. **Bodies resting on the bottom edge of the map never counted as grounded** (`MiningPhysicsBody.step` clamped the position to the edge but never grounded it), so a mob (or player) there could not jump. Fixed for every body.
5. **Floating sprite.** Skeletal mobs were placed with a hard-coded 426 rig pixels from pelvis to feet (the miner's), but the mole's legs end about 270 below its pelvis, so its feet hung about 15 px (nearly a cell) above the ground. `rigFootDepth(manifest)` (shared) reads the depth from each rig's legs, `ModularEntitySprite.getFootDepth()` exposes it, and `MiningMobRenderer.pelvisY` puts the feet on the bottom of the mob's own collider (it used to assume the player's collider height). The player and remote players still use 426 (the miner rig).

## Data
- Mole Person: `moveSpeed` 3, `jumpForce` 19.5. These are the original design (speed 1 and jump 6.5 tiles/s at 1x, scaled by 3), but a 19.5 jump is only 2.26 cells, less than its own height (2.67). The player jumps 3.87 cells (25.5). `prisma/set-mob-stat.ts "Mole Person" jumpForce 25.5 [--apply]` (dry run by default) sets it to the player's; the `mobs.json` mirror follows the next admin save.
- Walking speed is left at 3 cells/s (the player walks 13.5): that is the original "slow digger" design and an owner call.

## Tests
- Shared: `ChaseAndMineAI.bodies.test.ts` (steering settles on the middle, aligns before a vertical jump, does not dig rock or blocks above its pick power, gives up a planned dig when a rock lands there), `MiningPathfinder.air.test.ts` (no sideways floating, diagonal drops, jump reach, pick power), `MiningMobBody.test.ts` (map-bottom grounding, fractional movement), `modularRig.test.ts`.
- Server: `MiningGameEngine.mobNavigation.test.ts` (drops into a 2-wide well, jumps out of one, grounded on the map edge). Client: `MiningMobRenderer.test.ts` (feet on the collider bottom for different rigs and collider heights).
- Mutation checks: the old dead zone fails the well test and three unit tests; unaligned jumps, no map-bottom grounding, no hover rule, no jump reach, no pick-power check, and a diggable rock each fail a test.

## Not done / open
- In the probe the mole still only reaches the player in about half the scenarios (8 of 16 after the fixes, with the probe's scenarios changed between runs so the 2-of-12 start is not a strict before/after). Most of the rest are the player in a cave only reachable by digging a long way (slow at speed 3), or a route that goes away from the player past the 36-cell aggro range so the mole gives up. A search that returns the "closest node" when it runs out of nodes (1500) can lead a mole into a dead end in a big cave; raising the budget to 4000-8000 only changed 7 of 16 to 8 of 16.
- A rock that falls in front of a mole mid-route is handled by re-planning, but not predicted.
- The mole's drawn size is still `MOB_DEFAULT_DRAW_COLLIDER_HEIGHT` (3.75 cells) whatever its collider is (2.67); only its feet were fixed.
