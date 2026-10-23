# 137 - Surface background art (owner task, Gemini)

**Priority:** P2 - **Status:** Open - **Depends on:** none (blocks the final look of 130-136)

## Decision (2026-10-22, from the owner)
The owner has little art experience, so art is generated with Gemini. Keep it **simple but effective**: a handful of reusable pieces, no spritesheets, per `ART_STYLE_GUIDE.md` (atmospheric perspective: distant layers desaturated and paler, nearer layers more saturated). Placeholders are used until the images exist.

## Suggested minimum set for the first environment
- **Far mountains strip** (wide, tileable horizontally, pale/desaturated).
- **Near hills strip** (wide, tileable, more saturated).
- **Treeline strip** (optional third layer).
- **2-3 cloud sprites** (white, plus a darker storm variant) on transparent backgrounds.
- **Sun** (or draw it procedurally, no art).
- **1-2 tree sprites** and **1 bush** (transparent, base at the bottom for floor anchoring).
- **Bird sprite** (one, small; flight is motion, not frames).
- **Lightning bolt** (or procedural, no art).
- **Exit marker/sign** (a small sign or arrow post marking the exit spot, base at the bottom for floor anchoring; ticket 139).
- Rain and snow use particle textures from the particle system (a streak and a flake), so no new art unless the existing ones don't fit.

## Notes
- Tileable strips need matching left and right edges. Generate wide, then check the seam; if Gemini can't, generate one half and mirror it (flip) to guarantee a seamless loop.
- Strip sizes: tall enough to cover the visible sky above the surface at the game's camera zoom; confirm exact pixel sizes against the style guide before generating.
- Upload through the existing admin asset route and reference by `/assets/...` URLs. No one-off folders.
- Record the accepted prompts in this ticket so images can be regenerated.
- More environments (desert, snowy, forest) are the same set with different prompts.

## Done when
The first environment's images are uploaded, set on its row in the admin, and judged in the game.
