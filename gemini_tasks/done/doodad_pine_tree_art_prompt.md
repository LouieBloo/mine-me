# Art brief: Pine Tree (surface doodad)

Give this whole file to Gemini (or any image model). It explains what to draw, how big, what to call the file and where it ends up.
Style rules come from `../ART_STYLE_GUIDE.md`; match the look of the existing block textures in `packages/shared/assets/mining/` and the doodads already made.

## The image to produce
| | |
|---|---|
| **Doodad key** | `pine_tree` |
| **Format** | PNG, **transparent background** |
| **Aspect ratio** | **1 : 3** |
| **Guide size** | 192 x 576 pixels (bigger is fine if the ratio is the same) |
| **Anchor** | FLOOR |
| **Footprint in the game** | 3 x 9 (some 2 x 6) small blocks |
| **File name** | doodad_pine_tree.png |
| **Number of images** | 1 |

## What to draw
- **Anchor:** FLOOR. **Footprint:** 3 x 9 (some 2 x 6) small blocks. **Image ratio:** 1 : 3 (about 192 x 576 pixels).
- **Edge rule:** Stands on the ground, base at the bottom edge.
- **What it is:** A tall narrow pine: a slim brown trunk and stacked triangular layers of dark blue-green needles, a little snow on the upper layers, a pointed top. The trunk base touches the bottom edge.

```text
2D pixel art game prop, tall narrow pine tree with stacked triangular layers of dark blue-green needles and a little snow on the branches, slim brown trunk, pointed top, transparent background, single object centred, flat side-on orthographic view, 1:3 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, noise filter, ground, floor, shadow on the floor
```

## Rules for the picture
1. **Format:** PNG, **transparent background**. One thing per image. One picture per file, no frame, no border, no text, no characters, no logos.
2. **View:** flat, side-on, orthographic. No perspective. Even lighting with soft top-left highlights.
3. **Style:** high-resolution painterly pixel art, intentional pixel clusters, subtle dithering, muted natural tones, crisp pixels, no smooth gradients. Match `../ART_STYLE_GUIDE.md` (atmospheric perspective: the farther away, the paler and bluer).
4. **Size:** the guide size is a guide; bigger is fine if the ratio is the same. One small block is only about 21 screen pixels, so keep shapes **bold and readable**; fine detail disappears.
5. **Wind and weather are added by the game**: the picture is swayed and tilted by the wind and dimmed by the weather, so draw it still, in clear daylight.

## Where the files go (a person does this; an image model cannot write files)
1. Save the result as `doodad_pine_tree.png` (the name is only for your own tidiness; the server renames it on upload).
2. Open the **admin app** and go to **Doodads Editor**.
3. Open the doodad `pine_tree`, and in the **Art** panel upload the file. Do not copy files into asset folders by hand and do not edit the database.
4. Check it in the **preview** on that page, then in the sandbox: open the **Surface and weather** panel, turn on the generator's doodad pass (Doodads), and walk the surface.
