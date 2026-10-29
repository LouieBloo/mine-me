# 141 - Retire the Bridge, Chest, Mineral and Entrance blocks

**Priority:** P2 - **Status:** Done (verified by the owner 2026-10-28) - **Depends on:** 140

## Decisions (owner, 2026-10-23)
- **Bridge:** items place it, so it has no block of its own. The `BRIDGE` tile type stays (it is an item-placed tile like the ladder and torch); its block row, key, `blocks.json` entry and admin entry go.
- **Chest, Mineral:** gone entirely. Loot will come from items later.
- **Entrance:** was never a block, only a coordinate (`MINING_CONFIG.ENTRANCE_X/Y` stays). The tile type goes.

## Built
- Shared: `MiningTileType` `MINERAL` (3), `CHEST` (4), `ENTRANCE` (5) removed, **numbers not reused** (gaps on purpose, saved maps and the wire keep their meaning). Gone too: their tile definitions, `MiningBlockTypeKey` entries (and `BRIDGE`), `MINERAL_MINE_TIME_MS`, `CHEST_MINE_TIME_MS`, `TREASURE_CHEST_COUNT`, `MINERAL_PERCENTAGE`, and the map config fields `mineralPercentage` / `chestCount` (type, default, `mining_map_config.json`).
- Server: chest placement in the generator (`placeChests`), the chest/mineral loot in `miningSession.service`, the `BRIDGE` key in the data manager, config service and validation for the two fields, the map preview stats. A tile an item places has no block row, so mining one drops the placing item (`PLACED_ITEM_TILES`, in `spawnBlockDrops`) and its health comes from the tile definition (`getBlockMaxHealth`).
- Client: the mineral, chest and entrance fallback art, the chest light. Admin: preview colours, the chest stat and legend, the Treasure Chests field, the preset values.
- `prisma/add-bridge.ts` now creates only the Bridge item.
- `prisma/remove-retired-blocks.ts`: dry run by default; deletes the four `MiningBlock` rows (drop tables cascade) and takes the keys out of every biome's block palette. **Not applied yet.**

## Left on purpose
- Prisma columns `MiningMapConfig.mineralPercentage` and `chestCount` stay in `schema.prisma` (they have defaults, nothing reads or writes them now). Drop them with a later `db push` when convenient.
- The item sub types `MINERAL` and `CHEST` (gear slot) are item data, not blocks.
- Particle effects named `block_mineral_*` are effect names, not the block.
