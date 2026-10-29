# Gemini tasks

Art briefs for an image model (Gemini). Each file is self-contained: give the whole file to Gemini, save the result, and upload it through the admin app as the file describes. Style rules come from `../ART_STYLE_GUIDE.md`.

## Basic terrain blocks (ticket 140) - done

These six are finished and archived in `done/` (like finished tickets in `tickets/done/`). Move a brief there when its art is uploaded and looks right.

| Block | Brief | Save as |
|---|---|---|
| Stone | [stone_block_art_prompt.md](done/stone_block_art_prompt.md) | `block_stone-block.png` |
| Clay | [clay_block_art_prompt.md](done/clay_block_art_prompt.md) | `block_clay-block.png` |
| Sandstone | [sandstone_block_art_prompt.md](done/sandstone_block_art_prompt.md) | `block_sandstone-block.png` |
| Gravel | [gravel_block_art_prompt.md](done/gravel_block_art_prompt.md) | `block_gravel-block.png` |
| Ice | [ice_block_art_prompt.md](done/ice_block_art_prompt.md) | `block_ice-block.png` |
| Bedrock | [bedrock_block_art_prompt.md](done/bedrock_block_art_prompt.md) | `block_bedrock-block.png` |

## Doodads (tickets 099-107) - done

Twelve pieces of cave scenery, one picture each. They show as coloured placeholders until art is uploaded (admin app, **Doodads Editor**, **Art** panel). One brief per doodad; the combined overview is [doodads-art.md](done/doodads-art.md). All generated and moved to `done/`.

| Doodad | Brief | Save as |
|---|---|---|
| Cave Mushroom | [doodad_cave_mushroom_art_prompt.md](done/doodad_cave_mushroom_art_prompt.md) | `doodad_cave_mushroom.png` |
| Glow Mushroom | [doodad_glow_mushroom_art_prompt.md](done/doodad_glow_mushroom_art_prompt.md) | `doodad_glow_mushroom.png` |
| Grass Tuft | [doodad_grass_tuft_art_prompt.md](done/doodad_grass_tuft_art_prompt.md) | `doodad_grass_tuft.png` |
| Stalactite | [doodad_stalactite_art_prompt.md](done/doodad_stalactite_art_prompt.md) | `doodad_stalactite.png` |
| Stalagmite | [doodad_stalagmite_art_prompt.md](done/doodad_stalagmite_art_prompt.md) | `doodad_stalagmite.png` |
| Dripping Stalactite | [doodad_dripping_stalactite_art_prompt.md](done/doodad_dripping_stalactite_art_prompt.md) | `doodad_dripping_stalactite.png` |
| Glow Crystal | [doodad_glow_crystal_art_prompt.md](done/doodad_glow_crystal_art_prompt.md) | `doodad_glow_crystal.png` |
| Icicle | [doodad_icicle_art_prompt.md](done/doodad_icicle_art_prompt.md) | `doodad_icicle.png` |
| Lava Vent | [doodad_lava_vent_art_prompt.md](done/doodad_lava_vent_art_prompt.md) | `doodad_lava_vent.png` |
| Wall Moss | [doodad_wall_moss_art_prompt.md](done/doodad_wall_moss_art_prompt.md) | `doodad_wall_moss.png` |
| Firefly | [doodad_firefly_art_prompt.md](done/doodad_firefly_art_prompt.md) | `doodad_firefly.png` |
| Cave Beetle | [doodad_cave_beetle_art_prompt.md](done/doodad_cave_beetle_art_prompt.md) | `doodad_cave_beetle.png` |

## Surface (tickets 129-138) - done

The sky, scenery, clouds and props above the ground. They draw as stand-ins in code until art is uploaded (admin app, **Surface Editor** for strips and clouds, **Doodads Editor** for trees, bushes and the bird). The overview, with what is *not* needed, is [surface-art.md](done/surface-art.md). All generated and moved to `done/`.

| Piece | Brief | Save as |
|---|---|---|
| Far mountains strip | [surface_far_mountains_art_prompt.md](done/surface_far_mountains_art_prompt.md) | `surface_far_mountains.png` |
| Rolling hills strip | [surface_hills_art_prompt.md](done/surface_hills_art_prompt.md) | `surface_hills.png` |
| Treeline strip | [surface_treeline_art_prompt.md](done/surface_treeline_art_prompt.md) | `surface_treeline.png` |
| Clouds (3 shapes) | [surface_clouds_art_prompt.md](done/surface_clouds_art_prompt.md) | `surface_cloud_a.png`, `_b`, `_c` |
| Oak Tree | [doodad_oak_tree_art_prompt.md](done/doodad_oak_tree_art_prompt.md) | `doodad_oak_tree.png` |
| Pine Tree | [doodad_pine_tree_art_prompt.md](done/doodad_pine_tree_art_prompt.md) | `doodad_pine_tree.png` |
| Bush | [doodad_bush_art_prompt.md](done/doodad_bush_art_prompt.md) | `doodad_bush.png` |
| Bird | [doodad_bird_art_prompt.md](done/doodad_bird_art_prompt.md) | `doodad_bird.png` |

## Tips for all of them
- Make them as a set, in one session if you can, so the palettes sit well together. Dirt and Lavarock are the existing blocks to match.
- Check **seamless tiling** before uploading: put four copies side by side and look for visible seams or cut-off features.
- Upload on the admin **Blocks Editor** page (one upload path; do not drop files into asset folders by hand).
- When a block looks good in the sandbox, tell Claude and ticket 140 can be closed.
