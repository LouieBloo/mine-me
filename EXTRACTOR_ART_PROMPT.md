# Art brief: the Extractor machine

Give this whole file to Gemini (or any image model). It explains what to draw, how big, what to call the file and where it ends up.
Style rules come from `ART_STYLE_GUIDE.md`.

## What it is
The extractor is the machine that flies down and lands on the surface at the start of every mining run. Miners walk up to it and hand over their loot. A conveyor belt runs from a doorway in its base straight down into the mine. It is a side-on view of a heavy, chunky, hand-built fantasy mining machine, not a modern or sci-fi one.

## The image to produce
| | |
|---|---|
| **Format** | PNG with a **transparent background** |
| **Size** | **1008 x 756 pixels** (exactly 4:3). Do not crop or pad. |
| **File name** | `basic_extractor_body.png` |
| **Number of images** | 1 (a single still picture; there is no flying version, the game slides this same picture down from the sky) |

In the game the picture is stretched to a footprint of 12 x 9 blocks (252 x 189 screen pixels), so the proportions MUST stay 4:3. Keep shapes bold and readable; very fine detail disappears at that size.

## Layout rules (these matter)
1. The machine fills the **whole canvas, edge to edge**. Nothing outside the machine: no ground, no sky, no shadow on the floor.
2. The **bottom edge is perfectly flat and level**. It sits on the ground.
3. In the bottom edge there is an **open doorway, 252 pixels wide**, from **336 px to 588 px from the left edge** (33.3% to 58.3% of the width). A conveyor belt leaves through it going straight down, so it must be a clear rectangular opening with nothing blocking it. If the picture is made at a different size, keep the doorway at 33.3% to 58.3% of the width.
4. A **hopper or loading bay on the left side** where miners drop loot.
5. The **top is a flat deck**.
6. **Orthographic flat side view**: no perspective, no 3/4 view.
7. No text, no characters, no logos.

## The prompt
```text
Side-view 2D pixel art of a heavy industrial ore extractor machine standing on flat ground, orthographic flat side elevation, no perspective, wide squat chunky body with riveted brass and dark slate steel plating, a large hopper on the left where miners hand over loot, a short smokestack, small pipes and a glowing amber lamp, weathered bronze and iron, moss-stained, painterly pixel clusters, subtle dithering, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural earth tones with warm brass accents, transparent background. Canvas 1008x756 pixels, 4:3. The machine fills the whole canvas edge to edge. The BOTTOM EDGE is perfectly flat and level (it sits on the ground). On the bottom edge there is an open doorway 252 pixels wide (a rectangular opening in the base, no door), starting 336 pixels from the left edge and ending 588 pixels from the left edge, where a conveyor belt leaves downward into the ground. The top of the machine is a flat walkable deck. No text, no characters, no ground, no shadow outside the machine --no 3d render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, people
```

## Where the file goes (a person does this; an image model cannot write files)
1. Save the result on your computer as **`basic_extractor_body.png`** (the name is only for your own tidiness; the server renames it on upload).
2. Open the **admin app** and go to **Extractors Editor**.
3. Click **Edit Extractor** on **Basic Extractor**.
4. In the **Art** panel on the right, find the **Machine** row and click **Upload** (or **Replace**), then pick the file.
5. It is saved at once. The server stores it as `packages/shared/assets/sprites/extractors/<extractor id>-body.png` and fills in the extractor's `textureUrl` (`/assets/sprites/extractors/<extractor id>-body.png`). Do not copy files into that folder by hand and do not edit the database for this.

## Check it in the game
- Open the **sandbox**, click **Spawn extractor** and then **Dig belt +10** in the sandbox panel.
- The machine should slide down and land with its bottom edge on the ground, and the belt should come out of the doorway.
- If the belt does not line up with the doorway, the doorway is in the wrong place in the picture: redo it at 33.3% to 58.3% of the width. (The admin preview only shows plain placeholders, not this picture.)

## Not needed (do not make)
A flying/landing version, thruster flames, a damaged version, or the belt. The belt is a separate brief: `CONVEYOR_BELT_ART_PROMPT.md`.
