# Art brief: Sandstone block

Give this whole file to Gemini (or any image model). It explains what to draw, how big, what to call the file and where it ends up.
Style rules come from `../ART_STYLE_GUIDE.md`.

## What it is
Layered, crumbly sandstone for dry biomes.

## What it should look like
- **Palette and details:** Warm limestone beige and pale sand yellow, clearly stratified in thin horizontal bands of slightly different tone, a few grainy dither patches and tiny pits. No cracks wider than a hairline, no plants.
- **Important:** Strong horizontal layering so it reads as sandstone at a glance, even when shrunk small. Light overall, so it stands out against the dark mine.

## The image to produce
| | |
|---|---|
| **Format** | PNG |
| **Size** | **512 x 512 pixels** (square) |
| **Seamless** | **Yes, it must tile.** The left edge continues into the right edge and the top edge into the bottom edge. The game repeats this one image across the whole mine. |
| **File name** | `block_sandstone-block.png` |
| **Number of images** | 1 |

## Layout rules (these matter)
1. The picture is **one flat square of material, edge to edge**: no border, no frame, no vignette, no shadow, no lighting gradient across the tile.
2. **Orthographic, flat, front-on**: it is a wall seen straight on, no perspective.
3. **Tiles seamlessly** on all four sides (no feature cut off at an edge that does not continue on the opposite edge).
4. Opaque: **no transparent pixels**.
5. Even lighting with soft top-left highlights only, so neighbouring blocks do not show seams or light patches.
6. No text, no characters, no logos, no ore, no objects lying on it.
7. The picture shrinks a long way in the game (one block is about 21 screen pixels), so keep shapes **bold and readable** at small size. Very fine detail disappears.

## Style
Follow `../ART_STYLE_GUIDE.md`: high-resolution painterly pixel art, intentional pixel clusters and subtle dithering, muted natural earth tones, crisp pixels, no smooth gradients. Match the existing block textures in `packages/shared/assets/mining/` (for example `block_dirt-block.png`, `block_lavarock-block.png`).

## The prompt
```text
2D pixel art seamless tileable block texture, 512x512 pixels, flat front-on view of sandstone for an underground mining platformer, warm limestone beige and pale sand yellow, clearly stratified in thin horizontal bands of slightly different tone, a few grainy dither patches and tiny pits, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, even flat lighting, edges wrap seamlessly on all four sides, fills the whole square edge to edge, opaque, no text, no objects --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, vignette, noise filter
```

## Where the file goes (a person does this; an image model cannot write files)
1. Save the result on your computer as **`block_sandstone-block.png`** (the name is only for your own tidiness; the server renames it on upload).
2. Open the **admin app** and go to **Blocks Editor**.
3. Open **Sandstone** (key `SANDSTONE`).
4. In the texture section choose the file and upload it. It is saved at once as `packages/shared/assets/mining/sandstone-block.png` and the block's `textureUrl` is filled in. Do not copy files into that folder by hand and do not edit the database for this.

## Check it in the game
- Open the **sandbox**: the block gallery row shows every block, so sandstone appears next to the others.
- Look for visible seams where the picture repeats, and compare it with the blocks next to it. It should be easy to tell apart from them at the small in-game size.

## Not needed (do not make)
Cracks for mining progress (the game draws those), edge or corner pieces (the game draws block edges itself), ore or decoration versions.
