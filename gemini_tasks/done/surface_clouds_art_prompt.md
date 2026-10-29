# Art brief: Clouds (surface)

Give this whole file to Gemini (or any image model). It explains what to draw, how big, what to call the file and where it ends up.
Style rules come from `../ART_STYLE_GUIDE.md`; match the look of the existing block textures in `packages/shared/assets/mining/` and the doodads already made.

## The image to produce
| | |
|---|---|
| **Used as** | the clouds that drift across the sky |
| **Format** | PNG, **transparent background** |
| **Aspect ratio** | **2 : 1** |
| **Guide size** | 512 x 256 pixels each |
| **File names** | `surface_cloud_a.png`, `surface_cloud_b.png`, `surface_cloud_c.png` |
| **Number of images** | 3 (three different cloud shapes) |

## What to draw
- **What it is:** three different clouds. Draw each **white** (the game tints them grey and dark in bad weather, so never colour them), with pale blue-grey shading on the underside and a soft top-left highlight.
- **Image A:** a wide flat-bottomed cumulus with three round puffs on top.
- **Image B:** a long thin stretched cloud with a few small puffs.
- **Image C:** a big heavy cloud with five round puffs and a flat base.
- The cloud touches no edge: leave a small transparent margin all round.

```text
2D pixel art game cloud, a wide flat-bottomed cumulus cloud with three round puffs on top, pure white with pale blue-grey shading underneath, transparent background, single object centred, flat side-on orthographic view, 2:1 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, soft top-left highlight, no sky behind it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, noise filter
```

```text
2D pixel art game cloud, a long thin stretched cloud with a few small puffs, pure white with pale blue-grey shading underneath, transparent background, single object centred, flat side-on orthographic view, 2:1 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, soft top-left highlight, no sky behind it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, noise filter
```

```text
2D pixel art game cloud, a big heavy cloud with five round puffs and a flat base, pure white with pale blue-grey shading underneath, transparent background, single object centred, flat side-on orthographic view, 2:1 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, soft top-left highlight, no sky behind it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, noise filter
```

## Rules for the picture
1. **Format:** PNG, **transparent background**. Three separate images. One picture per file, no frame, no border, no text, no characters, no logos.
2. **View:** flat, side-on, orthographic. No perspective. Even lighting with soft top-left highlights.
3. **Style:** high-resolution painterly pixel art, intentional pixel clusters, subtle dithering, muted natural tones, crisp pixels, no smooth gradients. Match `../ART_STYLE_GUIDE.md` (atmospheric perspective: the farther away, the paler and bluer).
4. **Size:** the guide size is a guide; bigger is fine if the ratio is the same. One small block is only about 21 screen pixels, so keep shapes **bold and readable**; fine detail disappears.
5. **No colour:** pure white clouds only; grey and dark clouds in storms are made by the game.

## Where the files go (a person does this; an image model cannot write files)
1. Save the three results as `surface_cloud_a.png`, `surface_cloud_b.png` and `surface_cloud_c.png`.
2. Open the **admin app**, **Surface Editor**, open an environment.
3. In the **Clouds** panel click **+ Add Cloud Picture** three times (once per file). The game picks a shape for each cloud from these.
4. Check them in the **Preview** (choose Cloudy or Storm weather), then in the sandbox.
