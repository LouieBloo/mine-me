# Art brief: one conveyor belt segment

Give this whole file to Gemini (or any image model). It explains what to draw, how big, what to call the file and where it ends up.
Style rules come from `ART_STYLE_GUIDE.md`.

## What it is
The conveyor belt runs from the extractor machine straight down into the mine, one section at a time. The game repeats this one picture down the shaft and scrolls it upward so the belt looks like it is running. You draw ONE section; the game stacks and moves it. The view is straight on, looking at the belt flat, as part of a side-scrolling mine.

## The image to produce
| | |
|---|---|
| **Format** | PNG, **fully opaque** (no transparency) |
| **Size** | **252 x 84 pixels** (exactly 3:1). Do not crop or pad. |
| **File name** | `basic_extractor_belt.png` |
| **Number of images** | 1 |

In the game one section is 3 blocks wide and 1 block tall (63 x 21 screen pixels). The picture is scaled to fit, so the proportions MUST stay 3:1 (width three times the height). Keep the pattern bold: fine detail disappears at that size.

## Layout rules (these matter)
1. It must be **seamless top to bottom**: the **bottom edge continues perfectly into the top edge**. Test it by placing two copies one above the other; there must be no visible seam, and the slat pattern must repeat cleanly.
2. The belt surface fills the middle; a **riveted brass-and-iron side rail** runs along the **left and right edges** (about 6% of the width each).
3. Evenly spaced **ribbed slats** go across the full width, so the movement is easy to see when it scrolls.
4. Nothing outside the rails. No text, no characters, no items on the belt (items on it are drawn separately by the game).
5. The belt carries things **UP** (toward the extractor) and the picture scrolls upward. Keep the pattern direction-neutral (plain slats); if you add chevrons or arrows they must point **UP**.
6. Always the **undamaged** belt. The game draws cracks and broken gaps itself over the picture.

## The prompt
```text
Seamless vertically tiling 2D pixel art texture of one section of a mining conveyor belt seen straight on from the front, exactly 252 pixels wide and 84 pixels tall, top-down belt viewed flat: dark rubber belt surface with evenly spaced horizontal ribbed slats across the full width, two riveted brass-and-iron side rails running along the left and right edges, subtle wear and scratches, muted dark slate and bronze, painterly pixel clusters, crisp pixels, high resolution 32-bit pixel art, late 90s arcade style. The top edge and the bottom edge continue perfectly into each other so copies stack vertically with no visible seam, and the slat pattern repeats cleanly. Fully opaque, no transparency, nothing outside the rails, no text --no 3d render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text
```

## Where the file goes (a person does this; an image model cannot write files)
1. Save the result on your computer as **`basic_extractor_belt.png`** (the name is only for your own tidiness; the server renames it on upload).
2. Open the **admin app** and go to **Extractors Editor**.
3. Click **Edit Extractor** on **Basic Extractor**.
4. In the **Art** panel on the right, find the **Belt Segment** row and click **Upload** (or **Replace**), then pick the file.
5. It is saved at once. The server stores it as `packages/shared/assets/sprites/extractors/<extractor id>-belt.png` and fills in the extractor's `beltTextureUrl` (`/assets/sprites/extractors/<extractor id>-belt.png`). Do not copy files into that folder by hand and do not edit the database for this.

## Check it in the game
- Open the **sandbox**, click **Spawn extractor** and then **Dig belt +10** in the sandbox panel.
- Walk down beside the belt: the belt should look continuous with no seams, and its pattern should move upward steadily. It stops moving while the belt is waiting for fluid, gas or fire to clear.
- If you can see a seam every block, the top and bottom edges of the picture do not match: redo it.
- If the pattern looks stretched or squashed, the picture is not exactly 3:1.

## Not needed (do not make)
A damaged version, a broken version, a belt tip or end piece, a second animation frame, or the machine. The machine is a separate brief: `EXTRACTOR_ART_PROMPT.md`.
