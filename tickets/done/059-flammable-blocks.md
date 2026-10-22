# 059 - Flammable blocks (grass, dead wood, ...)

**Priority:** P3 - **Status:** Done (2026-10-13), no block is flammable until set in the admin - **Depends on:** 057

## Scope
Use the 056 Flammability fields on blocks so fire spreads through them. Add admin editing for the fields on the Block page, a `burnsInto` result (air/ash), and first test materials. Content (grass, dead wood textures) is out of scope until the owner asks. Following the new-content checklist.

## Decisions (made on the owner's instruction to keep going; flag if wrong)
- **Any existing block can be made flammable in the admin** (a "Block Flammability" panel on the Block page, the same panel and the same `Flammability` shape fluids use, including the flame effect and flame light). **No block is flammable out of the box**, and no new block types (grass, dead wood) were added: those need a new tile type, texture and generation rules, which is content work for when you ask. When they exist, they are just rows with flammability set.
- **What remains after burning (`burnsInto`):** a block type key. A key that names a block replaces the burnt block with it (solid, with a collider); empty or an unknown key means the block simply goes (no loot, rocks on top start to fall).
- **Burning a block:** it burns for its burn duration (the block is the fuel; there is no level to drain), may light its neighbours (blocks and oil alike), then is spent.
- Ladders and torches are tiles, not blocks with settings, so they cannot be made flammable yet.

## Implementation notes
- **Schema:** `MiningBlock.flammability Json?` (additive `db push`, applied). Shared `MiningBlockConfig.flammability`; the admin Block update validates it with `validateFlammability` (400 with every problem) and clears it with `Prisma.JsonNull`.
- **Server:** the ignition system's `flammabilityAt` now answers for blocks (so sparks, spread and heat all work on them); `MiningFireSubsystem` burns a block's cell (fuel 1 until its time is up) and `MiningBlockSubsystem.burnBlock` turns it into what it burns into or removes it; the join state carries each burning block type's look (`blockFlames`).
- **Client:** `FireRenderer` draws flames and lights on burning blocks from `blockFlames` (looking the tile type up from the client grid); fluid looks take priority in a cell that holds fluid.
- **Tests:** server room scenarios (11: lighting, spread and its limit, burn time, no collider or loot, burns into another block, unknown key, falling rock, oil to block, the wire), block routes (4), block page (3), flame renderer (4). Mutation-checked: skipping the burn-away, the collider for a replacement block, dropping loot, and blocks never being flammable each fail a test.
