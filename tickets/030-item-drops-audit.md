# 030 - Item drops audit (items that can't be picked up)

**Priority:** P1 - **Status:** Done (2026-10-09)

## Report
After a lot of items dropped at once, walking over them did nothing and they stayed in the game.

## Findings
1. **Client: duplicate, untracked sprites (main cause).** `MiningEntityRenderer.updateDroppedItems` created an item's sprite only *after* its texture finished loading. Every 30 Hz tick in the meantime found "no sprite yet" and started another load, so one item got several sprites and only the last was tracked. The others were never removed: items that looked real but were already picked up (or never existed on the server). Also a sprite whose item was picked up mid-load appeared afterwards and stayed.
2. **Server: items pushed into the floor.** Dropped items collided with each other. A blast drops hundreds at once; the pile shoved items into the solid floor (3-6 of 162 ended embedded in dirt, unreachable), and solving the pile made ticks slow (150 ticks took ~5 s in a test).
3. Checked and fine: pickup radius/AABB, backpack merge, body cleanup on pickup, drop id uniqueness, `droppedItemsDirty` resend logic.

## Fixes
- Sprites are created and tracked synchronously with an empty texture; the texture is applied when loaded (cached textures immediately). A failed load shows an amber square; a sprite destroyed meanwhile is ignored. Tests for all four cases.
- Item fixtures share a negative collision group (`ITEM_COLLISION_GROUP`) so items never collide with each other (they still collide with tiles). New `MiningGameEngine.dropPhysics.test.ts`: nothing embedded after a radius-5 blast, the pile is cheap, and every item can be picked up.

## Not done (recommendations)
- While items move, the **whole item list** (with icon URLs etc.) is resent every tick; static fields could be sent once like `EntityDefinitionCache` does for mobs.
- Items never despawn; the 1000 cap silently skips further drops (logged).
