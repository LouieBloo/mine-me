# 128 - Extractor and conveyor belt art (owner task, Gemini)

**Priority:** P2 - **Status:** Open - **Depends on:** none (blocks the final look of 120, 122, 123, 124)

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
