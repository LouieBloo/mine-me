# 094 - Autotiling: edges and rounded corners from one square texture

**Priority:** P2 - **Status:** Done (played, looks good, 2026-10-22) - **Depends on:** 085 (3x blocks)

## Problem
Every terrain cell draws the one `MiningBlock.textureUrl` as a 21px sprite (`MiningTileRenderer`). At 3x the cave edges are a staircase of identical squares: nothing says "this is the edge of the rock". The owner will only ever make one image per block, so the usual 16- or 47-image tile set is not an option.

## Design
- **Generate the variants from the single texture, on the client.** For each autotiled block type, build up to 16 textures, one per combination of exposed sides (top, right, bottom, left; "exposed" = the neighbour is not solid). Built lazily the first time a combination is seen, then cached (like `pieceSlice`). A cell draws its variant exactly as it draws its texture today.
- **What a variant adds to the source texture:** rounded outer corners (where two adjacent sides are exposed, a quarter-circle cut so the background shows through), and a rim along each exposed side (a thin dark line plus a soft inner shadow or highlight). Optional edge grit is a later idea.
- **Known limits (accepted):** neighbours on the diagonal are ignored (no true inner corners); no separate top, side and bottom art.
- **Shared:** a pure `autotileMask(isSolid, x, y)` function returning the 4-bit mask (testable, used by the client and later the admin preview).
- **Data:** the default look in the map config, and an optional autotile config on `MiningBlock` (null = use the default): corner radius, rim colour, rim width, rim strength. Set in the Mine Generator page and the admin block editor, with a live preview. No new upload.
- **Updates:** when a cell changes (mined, placed, blasted, burnt, a rock lands), it and its 4 neighbours re-pick their variant, inside the existing chunked redraw.
- **No wire change:** the client already knows the type of every revealed cell.
- **Checklist (CLAUDE.md):** schema, shared type, loader, wire (none), admin UI, client use, tests.

## Decisions (2026-10-21, from the owner)
1. **All terrain blocks** get autotiling (no opt-in).
2. **Shared default look plus a per-block override.** The default (corner radius, rim colour, width, strength) lives in the map config (Mine Generator page); a block's own autotile config, if set, overrides it field by field.
3. **Placed pieces stay out** (ladders, torches, bridges, rocks): they keep their own art and get no rim or rounded corners. For a neighbour's edge they count as open air, so dirt next to a ladder still shows its edge.
4. **Any solid terrain block is a solid neighbour.** Dirt next to stone has no edge between them; edges appear only against air (and pieces).
5. **Fog counts as solid:** no edge is drawn against unrevealed cells, so unexplored caves are not hinted at. The edge appears when the neighbour is revealed (that redraws the cell).
6. **Pixel size stays 21px.** The variants are built at the size the block is drawn, so a later change to `MINING_TILE_PIXELS` still works.

## Tests (planned)
- `autotileMask`: all 16 neighbour patterns, the map edge counts as solid, unrevealed cells count as solid, pieces count as open.
- Variant builder: the same mask gives the cached texture; a block with config null draws the single texture; a changed cell re-picks itself and its 4 neighbours only.
- Loader and PATCH round-trip for the config; admin editor saves and previews it.

## Implementation notes (2026-10-21)
- **Shared (`gameLogic/autotile.ts`):** `autotileMask(grid, x, y)` (4 bits: top 1, right 2, bottom 4, left 8, set = exposed), `isAutotileTerrain` (solid, not a piece, not ROCK or CHEST), `autotileCorners`, the style type and `DEFAULT_AUTOTILE_STYLE` (radius 0.28, rimWidth 0.22, rimStrength 0.55, rimColor #000000, all fractions of the block), `resolveAutotileStyle(...layers)`, `validateAutotileConfig`, and `drawAutotileVariant` (the canvas drawing, shared by the game and the admin preview).
- **Data:** `MiningBlock.autotile` and `MiningMapConfig.autotileStyle`, both nullable Json (pushed with `prisma db push`, nothing reset). PUT `/admin/blocks/:id` takes `autotile`; PUT `/admin/mining-config` takes `autotileStyle`; both validate and clear with a database null. The map look reaches the client in the join state (`autotileStyle`); a block's own look is already in `/api/public/blocks`.
- **Client:** `AutotileVariants` builds a variant texture per (texture, mask, look) the first time it is asked, from the block's one image, and caches it. `MiningTileRenderer.renderSingleTile` takes the grid and picks the variant; `updateRevealedTiles` now redraws a changed cell **and its four neighbours** (a mined block exposes the cells beside it; revealed fog stops hiding an edge). `useMiningScene` configures the variants from the map look and every block's override when the mine loads.
- **Admin:** `AutotilePanel` (switch, corner radius, rim width, rim strength, rim colour, per-field "Use default", live preview of a small cave drawn with the real drawing code). On the Mine Generator page it sets the map default; on a block page (terrain blocks only) it overrides field by field over the map default.
- **Tests:** mask (all 16 patterns, map edge, fog incl. fog over open space, pieces/rocks/chests open, diagonals ignored), style layering and validation, the drawing calls, the variant cache, renderer picking and neighbour redraw, server PUT/validation/round-trip and join state, admin panel/page/block page. Mutation-checked: fog as exposed, pieces as terrain, and no neighbour redraw each make a test fail.
- **Not done / to judge in the game:** the default look (radius 0.28, rim 0.55) is a first guess, tune it on the Mine Generator page with the preview. Diagonal-only neighbours are ignored, so there are no inner-corner pieces. `blocks.json` (the dev seed) has no `autotile`; nothing needs it.
- **Pickaxe highlight (found in play, fixed 2026-10-22):** the hover highlight, the queued-block squares and the mining pulse were plain squares over rounded blocks. They now trace the block's own shape (`traceCellShape` in `MiningReticleRenderer.ts`: rounded only at the corners the block is drawn rounded, same radius, inset for the pulse). Placement reticles over pieces stay rectangles.
- **Closed 2026-10-22 (owner):** looks good in the game.
