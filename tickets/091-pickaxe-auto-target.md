# 091 - Pickaxe auto-target (Terraria-style smart cursor)

**Priority:** P1 - **Status:** Done (2026-10-18) - **Depends on:** 085-090 (3x blocks)

## Problem
With blocks a third of the old size, aiming a pickaxe at every individual block is slow and fiddly. The goal is to mine as you move, without steering the cursor to each block.

## Decisions (2026-10-18, from the owner)
- **Targeting is directional, like Terraria's smart cursor (corrected 2026-10-18).** The targets are the face of blocks in front of the player toward the cursor: pointing sideways, the block ahead plus the blocks above and below it; pointing up or down, the block plus those to its left and right; diagonally, the diagonal block plus its neighbours. The block closest to the cursor is mined first. A cursor over a far or hidden block mines whatever is in the way, up to reach. No block is ever chosen from behind another block, and nothing past reach. When the face is gone, the next one becomes the front, so walking and digging repeats it. (The first build was a straight line out from the player; the owner corrected it.)
- **Three blocks queued** (`BLOCK_SCALE`, one original block), a fixed constant for now.
- **Auto-advance while the button is held:** mine the nearest queued block at the normal swing rate (one block per swing, damage and drops unchanged), move to the next when it breaks, and re-evaluate targets as the mouse or the player moves.
- **Ctrl (held) = precise mode:** only the single block under the cursor (within reach) is targeted, as today. Release to return to auto-target.
- **Nothing in reach in that direction = no target.**

## Open points (settled while building)
- Whether the queue is 3 blocks deep along the line (assumed), and how a line is traced through cells at an angle (cell-by-cell grid walk).
- What the reticle shows: the whole queue highlighted, with the current block marked.
- Server authority: the server must run the same shared targeting (a shared function used by client reticle and server), so the client cannot choose blocks outside the rule. Mining currently takes one `miningTarget` per player.
- Which items: pickaxes only (mining tools), found by role, not by name; weapons and placeables unchanged.

## Tests (planned)
- Shared line-trace: straight, diagonal and shallow angles; stops at reach and at the cursor; skips non-mineable blocks; returns at most 3.
- Server: holding the button mines the nearest block, then the next after it breaks; moving the cursor re-targets; Ctrl mode targets only the cursor block; no block in reach mines nothing.
- Client: reticle shows the queue; Ctrl switches to 1x1; mutation check on the queue length.

## Implementation notes (2026-10-18, corrected design)
- **One shared rule:** `selectMiningTargets(grid, from, cursor, { precise, count, reach, keep })` in `packages/shared/src/gameLogic/miningTargeting.ts` (`MINING_QUEUE_LENGTH` = `BLOCK_SCALE`). Candidates are the revealed, mineable blocks within reach that lie ahead of the player along the aim and within 1.6 blocks of the aim line (the line plus one block either side), and that the player can see: a straight line to the block's middle or to one of four points toward its corners crosses no solid block and no fog (the corner points keep a block beside the one you face from being hidden by a grazing line). They are ordered by distance to the cursor (a cursor beyond reach is stood in for by the point at the end of reach along the aim), with a small lean toward the player and ties going to the upper then the left block. The first `count` are the queue. `keep` (the block being mined now) stays first while it is still in the queue, so the pick does not flicker.
- **Ctrl (`precise`)** is just the cursor cell, if mineable and in reach.
- **Protocol:** the client sends the cursor cell as `miningTarget` and `preciseMining` (Ctrl) in `MiningInputState` (validated in `sanitizeMiningInput`). The server resolves the block itself every tick (`MiningBlockSubsystem.miningQueue`). When a block breaks, the next starts on the next tick; swing timing is unchanged (one block per swing); block damage persists on the tile, so changing block loses no progress.
- **Client:** `MiningMouseController` tracks Ctrl (key events, `ctrlKey` on the press, cleared on blur), re-sends when Ctrl changes mid-hold, and shows the queue in the default mining reticle (`ReticleStyle.miningQueue`, the block being mined brightest). A block with nothing minable toward it still shows the red or slate blocked reticle. Placement, throwing and shooting are unchanged.
- **Tests:** shared (20 cases: wall left and right, ceiling, floor, diagonal, cursor-closest first, far cursor, behind a block, unmineable block, fog, reach, air gap, behind the player, keep, Ctrl); server `MiningGameEngine.autoTarget.test.ts`; client controller tests; older single-block server tests send `preciseMining: true`. Mutation checks: dropping the sight check fails the behind-a-block, unmineable and fog tests; ignoring Ctrl on the server or the client fails the Ctrl tests.
- **Not done:** the queue length is a constant (a per-pickaxe field would be later), and mining speed, block health and drops are unchanged.
