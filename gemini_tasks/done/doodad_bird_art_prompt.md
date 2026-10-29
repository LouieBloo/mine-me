# Art brief: Bird (surface doodad)

Give this whole file to Gemini (or any image model). It explains what to draw, how big, what to call the file and where it ends up.
Style rules come from `../ART_STYLE_GUIDE.md`; match the look of the existing block textures in `packages/shared/assets/mining/` and the doodads already made.

## The image to produce
| | |
|---|---|
| **Doodad key** | `bird` |
| **Format** | PNG, **transparent background** |
| **Aspect ratio** | **1 : 1** |
| **Guide size** | 128 x 128 pixels (bigger is fine if the ratio is the same) |
| **Anchor** | AIR |
| **Footprint in the game** | 1 x 1 small block |
| **File name** | doodad_bird.png |
| **Number of images** | 1 |

## What to draw
- **Anchor:** AIR. **Footprint:** 1 x 1 small block. **Image ratio:** 1 : 1 (about 128 x 128 pixels).
- **Edge rule:** Flies in the air: it touches no edge, leave a small transparent margin all round.
- **What it is:** A small bird in flight seen from the side, wings raised, a brown-grey body with a lighter belly and a small beak. One pose only: the game makes it flutter and drift by itself (flight is motion, not frames). It hides in rain and storms.

```text
2D pixel art game prop, small bird in flight seen from the side with raised wings, brown-grey body and lighter belly, small beak, transparent background, single object centred, flat side-on orthographic view, 1:1 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no sky behind it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, noise filter, ground, floor, shadow on the floor
```

## Rules for the picture
1. **Format:** PNG, **transparent background**. One thing per image. One picture per file, no frame, no border, no text, no characters, no logos.
2. **View:** flat, side-on, orthographic. No perspective. Even lighting with soft top-left highlights.
3. **Style:** high-resolution painterly pixel art, intentional pixel clusters, subtle dithering, muted natural tones, crisp pixels, no smooth gradients. Match `../ART_STYLE_GUIDE.md` (atmospheric perspective: the farther away, the paler and bluer).
4. **Size:** the guide size is a guide; bigger is fine if the ratio is the same. One small block is only about 21 screen pixels, so keep shapes **bold and readable**; fine detail disappears.
5. **Wind and weather are added by the game**: the picture is swayed and tilted by the wind and dimmed by the weather, so draw it still, in clear daylight.

## Where the files go (a person does this; an image model cannot write files)
1. Save the result as `doodad_bird.png` (the name is only for your own tidiness; the server renames it on upload).
2. Open the **admin app** and go to **Doodads Editor**.
3. Open the doodad `bird`, and in the **Art** panel upload the file. Do not copy files into asset folders by hand and do not edit the database.
4. Check it in the **preview** on that page, then in the sandbox: open the **Surface and weather** panel, turn on the generator's doodad pass (Doodads), and walk the surface.
