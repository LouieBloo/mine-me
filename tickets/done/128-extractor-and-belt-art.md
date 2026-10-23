# 128 - Extractor and conveyor belt art (owner task, Gemini)

**Priority:** P2 - **Status:** Done - **Depends on:** none (blocks the final look of 120, 122, 123, 124)

## Decision (2026-10-22, from the owner)
Gemini generates the art for the extractor and the conveyor belt. Images follow `ART_STYLE_GUIDE.md`. No spritesheets; each piece is a still image (motion is procedural, as for doodads in 103). Until the art exists the code uses placeholders so the tickets are not blocked.

## Art needed
- **Extractor body:** the landed machine (sized to its footprint in blocks, 119), with a clear walkable top / deposit zone, and an opening where the belt carries items in.
- **Extractor flying (landing intro):** the same machine in flight (thrusters), for the 120 animation. Could be the body plus separate thruster/flame parts with pivots so they can animate.
- **Belt segment:** one tileable 3-block-wide row (shaft width, 119) that repeats vertically. Needs a seamless top and bottom edge.
- **Belt end/tip:** the lowest segment where the belt is still building (optional drill or digging head).
- **Damaged belt segment:** one or two crack states for 124, and a broken/missing look.
- **Belt moving look (optional):** a second frame or a stripe overlay so the belt appears to move; if a single image, the client scrolls a texture offset at `beltSpeed`.
- **Item-on-belt:** none; items use their own icons scaled to the belt.

## Notes
- Textures are uploaded through the existing admin asset route and referenced by `/assets/...` URLs on the `Extractor` row (119, 126). No one-off folders or uploads.
- Sizes follow the block-scale rule: pixel art sized for `MINING_TILE_PIXELS` (21px per block), so a 3-block-wide belt is about 63px wide. Confirm exact pixel sizes against the style guide before generating.
- Record which prompts produced the accepted images in this ticket so they can be regenerated.

## Done when
All listed images are uploaded, assigned in the admin Extractors page, and judged in the game.

## What the game actually uses (checked against the code, 2026-10-22)
Only TWO pictures are used today; the other items in the list above have no code behind them yet and should not be made:
- **Machine** (`Extractor.textureUrl`): one still image, stretched to the footprint (default 12 x 9 blocks), drawn standing on the ground, not solid (players walk in front of it). The landing is that same image sliding down from the sky, so there is no separate flying frame.
- **Belt segment** (`Extractor.beltTextureUrl`): one tile, 3 blocks wide by 1 block tall, repeated down the shaft and scrolled at the belt speed. Damage cracks and broken gaps are drawn by the game over the picture; the picture itself is always the undamaged belt. Items riding the belt use their own icons.
- Upload both in the admin: Extractors Editor, the extractor, Art panel (Machine, Belt Segment). They are scaled to fit, so any resolution works if the proportions are exact.

### Exact sizes
- Machine: proportions 4:3 (default footprint 12 x 9 blocks, one block is 21 screen pixels, so 252 x 189 on screen). Make it 1008 x 756 px, transparent PNG. The belt opening is the bottom edge from 4/12 to 7/12 of the width (33.3% to 58.3%), 3 blocks wide. If the footprint or shaft width is changed in the admin the proportions change with it.
- Belt segment: proportions 3:1 (63 x 21 on screen). Make it 252 x 84 px, PNG, seamless top to bottom (the bottom edge must continue into the top edge).

The ready-to-use briefs (prompt, exact sizes, file names, where to upload and how to check) are `EXTRACTOR_ART_PROMPT.md` and `CONVEYOR_BELT_ART_PROMPT.md` at the project root.
