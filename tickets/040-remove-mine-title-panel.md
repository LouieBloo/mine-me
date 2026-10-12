# 040 - Remove the "Subterranean Mine" HUD panel

**Priority:** P3 - **Status:** Done (2026-10-12)

## Problem
`MiningHUD` shows a top-left panel titled "Subterranean Mine" (city, vision range, Solo/Multiplayer miner count, "Excavating block..." status, debug Pos/Reach line). Owner wants it gone.

## Decisions (owner Q&A)
- Remove the whole panel. Nothing replaces any of its contents (no debug readout, no miner-count badge).
- Zoom control and Temporary Backpack stay in the top-left column (they move per 041/042/043).

## Plan
1. `apps/client/src/views/MineView/components/MiningHUD/MiningHUD.tsx`: delete the panel block. Remove props/imports that become unused (`MINING_CONFIG` if only used there, etc.), and check `MineView` still passes only what is needed.
2. `MiningHUD.test.tsx`: replace the `getByText('Subterranean Mine')` assertion with one that it is absent; drop tests for the removed content.
3. Typecheck client (`npx tsc --noEmit -p tsconfig.app.json`).
4. Mutation-check: re-add the title, confirm the absence test fails, restore.

## Notes
- Debug hitbox toggle button (top right) is unaffected.

## Implementation notes
- Panel block deleted from `MiningHUD.tsx`; no imports/props became unused. Added an absence test (title, Solo Mine, Excavating, Reach). Mutation-checked: re-adding the title fails it. Client typecheck clean.
