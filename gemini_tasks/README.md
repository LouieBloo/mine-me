# Gemini tasks

Art briefs for an image model (Gemini). Each file is self-contained: give the whole file to Gemini, save the result, and upload it through the admin app as the file describes. Style rules come from `../ART_STYLE_GUIDE.md`.

## Basic terrain blocks (ticket 140)

These six blocks exist in the game but use the Rock texture until real art is uploaded.

| Block | Brief | Save as |
|---|---|---|
| Stone | [stone_block_art_prompt.md](stone_block_art_prompt.md) | `block_stone-block.png` |
| Clay | [clay_block_art_prompt.md](clay_block_art_prompt.md) | `block_clay-block.png` |
| Sandstone | [sandstone_block_art_prompt.md](sandstone_block_art_prompt.md) | `block_sandstone-block.png` |
| Gravel | [gravel_block_art_prompt.md](gravel_block_art_prompt.md) | `block_gravel-block.png` |
| Ice | [ice_block_art_prompt.md](ice_block_art_prompt.md) | `block_ice-block.png` |
| Bedrock | [bedrock_block_art_prompt.md](bedrock_block_art_prompt.md) | `block_bedrock-block.png` |

## Tips for all of them
- Make them as a set, in one session if you can, so the palettes sit well together. Dirt and Lavarock are the existing blocks to match.
- Check **seamless tiling** before uploading: put four copies side by side and look for visible seams or cut-off features.
- Upload on the admin **Blocks Editor** page (one upload path; do not drop files into asset folders by hand).
- When a block looks good in the sandbox, tell Claude and ticket 140 can be closed.
