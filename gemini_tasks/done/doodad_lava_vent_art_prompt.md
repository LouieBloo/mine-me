# Art brief: Lava Vent (doodad)

Give this whole file to Gemini (or any image model). It explains what to draw, how big, what to call the file and where it ends up.
Style rules come from `../ART_STYLE_GUIDE.md`; match the look of the existing block textures in `packages/shared/assets/mining/`.

## The image to produce
| | |
|---|---|
| **Doodad key** | `lava_vent` |
| **Format** | PNG, **transparent background** |
| **Aspect ratio** | **3 : 2** |
| **Guide size** | 384 x 256 pixels (bigger is fine if the ratio is the same) |
| **Anchor** | FLOOR |
| **Footprint in the game** | 3 x 2 small blocks |
| **File name** | `doodad_lava_vent.png` |
| **Number of images** | 1 |

## What to draw
- **Anchor:** FLOOR. **Footprint:** 3 x 2 small blocks. **Image ratio:** 3 : 2 (about 384 x 256 pixels).
- **Edge rule:** Sits on the ground, base at the bottom edge.
- **What it is:** A low mound of black cooled rock with a jagged crack across the top glowing orange to yellow, small ember specks above it. The game adds embers and light.

```text
2D pixel art game prop, low mound of black cooled lava rock with a jagged glowing orange and yellow crack across the top, small ember specks, sitting on a flat bottom edge, transparent background, single object centred, flat side-on orthographic view, 3:2 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Rules for the picture
1. **Format:** PNG with a **transparent background** (no ground, no wall, no shadow on the floor, no frame). One doodad per image, one picture each.
2. **Shape:** the **aspect ratio** in the table above must match: the game fits the picture inside the doodad's footprint, keeps the ratio, and puts the picture's **anchored edge** on the block it touches (a floor doodad's bottom edge, a ceiling doodad's top edge, a wall doodad's left edge). Leave **no empty margin on the anchored edge**: the doodad must touch that edge of the image.
3. **View:** flat, side-on, orthographic. No perspective. Even lighting with soft top-left highlights.
4. **Size:** the guide size in the table above is a guide (about 128 pixels per footprint cell); bigger is fine if the ratio is the same. One block is only about 21 screen pixels, so keep shapes **bold and readable**; fine detail disappears.
5. **Glow and light are added by the game**: draw glowing things with bright pixel clusters, but no halo, no light rays and no soft glow gradient around them.
6. **Style:** high-resolution painterly pixel art, intentional pixel clusters, subtle dithering, muted natural tones with the accent colours given, crisp pixels, no smooth gradients.
7. No text, no characters, no logos.

## Where the files go (a person does this; an image model cannot write files)
1. Save the result as `doodad_lava_vent.png` (the name is only for your own tidiness; the server renames it on upload).
2. Open the **admin app** and go to **Doodads Editor**.
3. Open the doodad `lava_vent`, and in the **Art** panel upload the file. Do not copy files into asset folders by hand and do not edit the database.
4. Check it in the **preview** on that page, then in the sandbox (Doodad scenes, "Everything"): the hall shows every doodad in a row.
