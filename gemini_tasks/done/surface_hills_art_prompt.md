# Art brief: Rolling Hills (surface scenery strip)

Give this whole file to Gemini (or any image model). It explains what to draw, how big, what to call the file and where it ends up.
Style rules come from `../ART_STYLE_GUIDE.md`; match the look of the existing block textures in `packages/shared/assets/mining/` and the doodads already made.

## The image to produce
| | |
|---|---|
| **Used as** | a scenery layer of a surface environment |
| **Layer** | Layer 2 (middle). About 18 small blocks tall in the game at picture scale 1 (the layer's Picture scale makes it bigger or smaller). |
| **Format** | PNG, **transparent above the silhouette** |
| **Aspect ratio** | **16 : 3** (wide) |
| **Guide size** | 2048 x 384 pixels |
| **Tiling** | **seamless left to right** (the left edge must match the right edge) |
| **File name** | surface_hills.png |
| **Number of images** | 1 |

## What to draw
- **What it is:** A long row of **rolling green hills** with a few small bushes and rocks on the slopes, mid-saturation greens (nearer than the mountains, so more colour), soft pixel-cluster shading, a clear wavy ridge line on top. Solid at the bottom edge; everything above the ridge is **transparent**.
- **Seam:** the picture repeats sideways forever, so the left and right edges must line up exactly. Generate it wide, then put two copies side by side and look for a visible join; if Gemini cannot do it, make one half and mirror it (flip) to guarantee a seamless loop.
- **Bottom edge:** the strip stands on the horizon, so the bottom edge must be solid (no transparent gap) all the way across.

```text
2D pixel art game background strip, rolling green hills with a few small bushes, mid-saturation mossy greens, wavy ridge line along the top, solid at the bottom edge, transparent sky above the ridge, horizontally seamless tileable, flat side-on orthographic view, 16:5 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, noise filter
```

## Rules for the picture
1. **Format:** PNG, **transparent background above the silhouette**. One strip per image. One picture per file, no frame, no border, no text, no characters, no logos.
2. **View:** flat, side-on, orthographic. No perspective. Even lighting with soft top-left highlights.
3. **Style:** high-resolution painterly pixel art, intentional pixel clusters, subtle dithering, muted natural tones, crisp pixels, no smooth gradients. Match `../ART_STYLE_GUIDE.md` (atmospheric perspective: the farther away, the paler and bluer).
4. **Size:** the guide size is a guide; bigger is fine if the ratio is the same. One small block is only about 21 screen pixels, so keep shapes **bold and readable**; fine detail disappears.
5. **Colour:** the game can tint a strip (a Tint colour on the layer), so keep it fairly neutral if you can; the farther layers should be paler and bluer.
6. **Weather:** the game dims and greys everything in storms by itself; draw it in clear daylight.

## Where the files go (a person does this; an image model cannot write files)
1. Save the result as `surface_hills.png` (the name is only for your own tidiness; the server renames it on upload).
2. Open the **admin app** and go to **Surface Editor**. Open an environment (for example *Green Valley*).
3. In the **Scenery** panel pick the layer for this strip (or **+ Add Layer**) and click **Upload Picture**. Do not copy files into asset folders by hand and do not edit the database.
4. Check it in the **Preview** at the top of the page (drag it sideways: the seam must not show), then in the sandbox (Surface and weather panel).
