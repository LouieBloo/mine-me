# Art brief: Doodads (cave scenery)

Give this whole file to Gemini (or any image model), one doodad at a time. Style rules come from `../ART_STYLE_GUIDE.md`; match the look of the existing block textures in `packages/shared/assets/mining/`. The doodads exist in the game already (created by `add-first-doodads.ts`) and are drawn as coloured placeholder shapes until a picture is uploaded.

## Rules for every picture
1. **Format:** PNG with a **transparent background** (no ground, no wall, no shadow on the floor, no frame). One doodad per image, one picture each.
2. **Shape:** the **aspect ratio** below must match: the game fits the picture inside the doodad's footprint, keeps the ratio, and puts the picture's **anchored edge** on the block it touches (a floor doodad's bottom edge, a ceiling doodad's top edge, a wall doodad's left edge). Leave **no empty margin on the anchored edge**: the doodad must touch that edge of the image.
3. **View:** flat, side-on, orthographic. No perspective. Even lighting with soft top-left highlights.
4. **Size:** the pixel size below is a guide (about 128 pixels per footprint cell); bigger is fine if the ratio is the same. One block is only about 21 screen pixels, so keep shapes **bold and readable**; fine detail disappears.
5. **Glow and light are added by the game**: draw glowing things with bright pixel clusters, but no halo, no light rays and no soft glow gradient around them.
6. **Style:** high-resolution painterly pixel art, intentional pixel clusters, subtle dithering, muted natural tones with the accent colours given, crisp pixels, no smooth gradients.
7. No text, no characters, no logos.

## Where the files go (a person does this; an image model cannot write files)
1. Save each result as `doodad_<key>.png` (the name is only for your own tidiness; the server renames it on upload).
2. Open the **admin app** and go to **Doodads Editor**.
3. Open the doodad (its key is in the table), and in the **Art** panel upload the file. Do not copy files into asset folders by hand and do not edit the database.
4. Check it in the **preview** on that page, then in the sandbox (Doodad scenes, "Everything"): the hall shows every doodad in a row.

## Summary

| Doodad (key) | Anchor | Footprint (small blocks) | Image ratio | Guide size | Save as |
|---|---|---|---|---|---|
| Cave Mushroom (`cave_mushroom`) | FLOOR | 2 x 2 (some 3 x 3) | 1 : 1 | 256 x 256 | `doodad_cave_mushroom.png` |
| Glow Mushroom (`glow_mushroom`) | FLOOR | 2 x 2 (some 3 x 3) | 1 : 1 | 256 x 256 | `doodad_glow_mushroom.png` |
| Grass Tuft (`grass_tuft`) | FLOOR | 1 x 1 (some 2 x 2) | 1 : 1 | 128 x 128 | `doodad_grass_tuft.png` |
| Stalactite (`stalactite`) | CEILING | 2 x 3 (some 3 x 4) | 2 : 3 | 256 x 384 | `doodad_stalactite.png` |
| Stalagmite (`stalagmite`) | FLOOR | 2 x 3 (some 3 x 4) | 2 : 3 | 256 x 384 | `doodad_stalagmite.png` |
| Dripping Stalactite (`dripping_stalactite`) | CEILING | 2 x 3 | 2 : 3 | 256 x 384 | `doodad_dripping_stalactite.png` |
| Glow Crystal (`glow_crystal`) | FLOOR | 2 x 3 (some 3 x 4) | 2 : 3 | 256 x 384 | `doodad_glow_crystal.png` |
| Icicle (`icicle`) | CEILING | 1 x 3 (some 2 x 4) | 1 : 3 | 128 x 384 | `doodad_icicle.png` |
| Lava Vent (`lava_vent`) | FLOOR | 3 x 2 | 3 : 2 | 384 x 256 | `doodad_lava_vent.png` |
| Wall Moss (`wall_moss`) | WALL | 1 x 3 (or 1 x 2) | 1 : 3 | 128 x 384 | `doodad_wall_moss.png` |
| Firefly (`firefly`) | AIR | 1 x 1 | 1 : 1 | 64 x 64 | `doodad_firefly.png` |
| Cave Beetle (`cave_beetle`) | FLOOR | 1 x 1 | 1 : 1 | 128 x 128 | `doodad_cave_beetle.png` |

## Cave Mushroom (`cave_mushroom`)
- **Anchor:** FLOOR. **Footprint:** 2 x 2 (some 3 x 3) small blocks. **Image ratio:** 1 : 1 (about 256 x 256 pixels).
- **Edge rule:** Stands on the ground, base at the bottom edge.
- **What it is:** A pale, slightly bent cave mushroom with a rounded cap and a short thick stem, cream and dusty lilac, a few darker spots on the cap, soft highlights top-left. Cap and stem are separate shapes so they can be split into parts later.

```text
2D pixel art game prop, pale cream and dusty lilac cave mushroom, rounded cap with a few darker spots, short thick stem, transparent background, single object centred, flat side-on orthographic view, 1:1 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Glow Mushroom (`glow_mushroom`)
- **Anchor:** FLOOR. **Footprint:** 2 x 2 (some 3 x 3) small blocks. **Image ratio:** 1 : 1 (about 256 x 256 pixels).
- **Edge rule:** Stands on the ground, base at the bottom edge.
- **What it is:** A glowing mushroom for dark places: teal-green cap with brighter pale-green gills and bright spots, dark blue-green stem. The glow is drawn into the picture as bright cap pixels; the game adds the actual light.

```text
2D pixel art game prop, teal green glowing mushroom, brighter pale green spots and gills on the cap, dark blue green stem, bioluminescent look painted with bright pixel clusters, transparent background, single object centred, flat side-on orthographic view, 1:1 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Grass Tuft (`grass_tuft`)
- **Anchor:** FLOOR. **Footprint:** 1 x 1 (some 2 x 2) small blocks. **Image ratio:** 1 : 1 (about 128 x 128 pixels).
- **Edge rule:** Stands on the ground, base at the bottom edge.
- **What it is:** A small tuft of pale cave grass: 5-7 blades in two desaturated greens, a few bent blades, a bit of yellowed tips.

```text
2D pixel art game prop, small tuft of pale desaturated green cave grass blades, a few bent, yellowed tips, transparent background, single object centred, flat side-on orthographic view, 1:1 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Stalactite (`stalactite`)
- **Anchor:** CEILING. **Footprint:** 2 x 3 (some 3 x 4) small blocks. **Image ratio:** 2 : 3 (about 256 x 384 pixels).
- **Edge rule:** Hangs from the ceiling, its flat top is the TOP edge of the image.
- **What it is:** Warm grey limestone stalactite: a wide base at the top tapering to a point at the bottom, layered stratified bands, a darker side and a lighter lit side.

```text
2D pixel art game prop, grey limestone stalactite hanging point down, wide flat base at the top, layered bands, lit from the top left, transparent background, single object centred, flat side-on orthographic view, 2:3 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Stalagmite (`stalagmite`)
- **Anchor:** FLOOR. **Footprint:** 2 x 3 (some 3 x 4) small blocks. **Image ratio:** 2 : 3 (about 256 x 384 pixels).
- **Edge rule:** Stands on the ground, its wide flat base is the BOTTOM edge of the image.
- **What it is:** The same limestone as the stalactite, standing up: wide base at the bottom tapering to a point, a chipped tip.

```text
2D pixel art game prop, grey limestone stalagmite pointing up, wide flat base at the bottom, layered bands, chipped tip, lit from the top left, transparent background, single object centred, flat side-on orthographic view, 2:3 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Dripping Stalactite (`dripping_stalactite`)
- **Anchor:** CEILING. **Footprint:** 2 x 3 small blocks. **Image ratio:** 2 : 3 (about 256 x 384 pixels).
- **Edge rule:** Hangs from the ceiling, its flat top is the TOP edge.
- **What it is:** A damp, darker stalactite with a glossy wet tip and a single water bead forming on the point. (The falling drop is drawn by the game, as a separate part: if you can, ALSO produce `dripping_stalactite_drop.png`, a 32 x 32 transparent water drop.)

```text
2D pixel art game prop, dark wet limestone stalactite, glossy highlights, a single water bead forming at the point, hanging from the top edge, transparent background, single object centred, flat side-on orthographic view, 2:3 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Glow Crystal (`glow_crystal`)
- **Anchor:** FLOOR. **Footprint:** 2 x 3 (some 3 x 4) small blocks. **Image ratio:** 2 : 3 (about 256 x 384 pixels).
- **Edge rule:** Stands on the ground, base at the bottom edge.
- **What it is:** A cluster of 3-5 hexagonal crystals of different heights growing from a small rock stub, pale cyan to deep blue with bright white facet highlights. Drawn glowing; the game adds the light.

```text
2D pixel art game prop, cluster of cyan and deep blue faceted crystals of different heights growing up from a small grey rock stub, bright white facet highlights, glowing look, transparent background, single object centred, flat side-on orthographic view, 2:3 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Icicle (`icicle`)
- **Anchor:** CEILING. **Footprint:** 1 x 3 (some 2 x 4) small blocks. **Image ratio:** 1 : 3 (about 128 x 384 pixels).
- **Edge rule:** Hangs from the ceiling, its flat top is the TOP edge.
- **What it is:** A long thin icicle, pale cyan and white with sharp straight highlight streaks, a slightly bent tip.

```text
2D pixel art game prop, long thin pale cyan and white icicle hanging point down, sharp straight highlight streaks, a flat top edge, transparent background, single object centred, flat side-on orthographic view, 1:3 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Lava Vent (`lava_vent`)
- **Anchor:** FLOOR. **Footprint:** 3 x 2 small blocks. **Image ratio:** 3 : 2 (about 384 x 256 pixels).
- **Edge rule:** Sits on the ground, base at the bottom edge.
- **What it is:** A low mound of black cooled rock with a jagged crack across the top glowing orange to yellow, small ember specks above it. The game adds embers and light.

```text
2D pixel art game prop, low mound of black cooled lava rock with a jagged glowing orange and yellow crack across the top, small ember specks, sitting on a flat bottom edge, transparent background, single object centred, flat side-on orthographic view, 3:2 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Wall Moss (`wall_moss`)
- **Anchor:** WALL. **Footprint:** 1 x 3 (or 1 x 2) small blocks. **Image ratio:** 1 : 3 (about 128 x 384 pixels).
- **Edge rule:** Clings to a wall on its LEFT: the left edge of the image is against the wall. Draw it for a wall on the left; the game mirrors it for the right..
- **What it is:** Damp moss clinging to a wall: a vertical strip of dark and mid green moss clumps with a few hanging tendrils, thicker at the wall side (left) and thin on the right.

```text
2D pixel art game prop, vertical strip of dark and mid green moss clumps clinging to a wall on the left, hanging tendrils, thick at the left edge and thin at the right edge, transparent background, single object centred, flat side-on orthographic view, 1:3 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Firefly (`firefly`)
- **Anchor:** AIR. **Footprint:** 1 x 1 small blocks. **Image ratio:** 1 : 1 (about 64 x 64 pixels).
- **Edge rule:** Floats freely; faces right.
- **What it is:** A tiny firefly seen from the side: dark body, two small pale wings, a bright yellow-green glowing tail. Very small and simple; the game adds the light and the flutter.

```text
2D pixel art game prop, tiny firefly seen from the side facing right, dark body, two small pale translucent wings, bright yellow green glowing tail, transparent background, single object centred, flat side-on orthographic view, 1:1 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Cave Beetle (`cave_beetle`)
- **Anchor:** FLOOR. **Footprint:** 1 x 1 small blocks. **Image ratio:** 1 : 1 (about 128 x 128 pixels).
- **Edge rule:** Walks on the ground; faces right.
- **What it is:** A chunky cave beetle seen from the side facing right: a glossy dark brown-black shell with one highlight, six short legs, two small feelers. Legs touch the bottom edge.

```text
2D pixel art game prop, chunky cave beetle seen from the side facing right, glossy dark brown black shell with one highlight, six short legs touching the bottom edge, two small feelers, transparent background, single object centred, flat side-on orthographic view, 1:1 aspect ratio, painterly pixel clusters, subtle dithering, crisp pixel grid, high resolution 32-bit pixel art, late 90s arcade fantasy style, muted natural palette, soft top-left highlight, no ground under it --no 3D render, smooth gradient, vector illustration, photographic, blurry, antialiased soft brush, photorealistic, cel shading, perspective, text, border, frame, background, ground, floor, shadow on the floor, noise filter
```

## Not needed (do not make)
Animation frames or spritesheets (the game moves a single picture: sway, pulse, bob, drip, flicker), shadows or glow halos, mirrored copies for wall doodads (the game flips them), and separate pictures per size (the picture is scaled to each size).

## Parts (later, optional)
Everything above is one picture each. If you want a stem that stays planted while the cap sways, or a drop that falls from a tip, the admin Art panel can take extra named pictures with pivots. The mushrooms (cap and stem) and the dripping stalactite (drop) are the ones that would use it; ask Claude before splitting anything.
