# Doodad epic (tickets 099-107): questions for the owner

Work them through one at a time with the pick-from-a-list prompt. Each has the default that is built now, so "keep" is always safe. Answer, then record it in the ticket named in brackets.

## Do first
1. **Apply the first doodads?** `prisma/add-first-doodads.ts` is written and dry-run clean (12 doodads, no pictures, linked to the 8 biomes); nothing shows in the game until it runs. Default: ask, then run `--apply`. [107]

## Look and art
2. **Placeholders are fine for the first set?** A doodad with no picture is drawn as a coloured shape per anchor (mushroom, stalactite, moss patch, dot). Default: keep them until art is uploaded. [102]
3. **Picture fit.** A picture is fitted inside the footprint with its aspect ratio kept (never stretched), base on the anchored edge. Alternative: fill the footprint. Default: keep the ratio. [102]
4. **Art convention for facing.** Wall pictures are drawn for a wall on the LEFT (the game mirrors for the right); bugs and fireflies face RIGHT (flipped when they head left). Default: keep. The brief for Gemini is `gemini_tasks/doodads-art.md`. [106, 107]
5. **Parts.** The first set is one picture per doodad. The cap/stem split for mushrooms and a separate drop for the dripping stalactite are possible later (`weight_<part>: 0` keeps a part planted; a drip's drop is a part named `drop`). Default: single pictures first. [103]

## Numbers to tune (defaults are first guesses)
6. **Amount.** A fitting spot gets a doodad with 3% x weight x density; the first set's densities are high (a generated mine gets roughly 70-90). Cap 400 per mine ("Scenery" card on the Mine Generator page). Default: keep, tune after you have looked. [100]
7. **"Dark only"** means 4 original blocks or deeper (the generator has no lighting). Alternative: look at the real light sources. Default: depth. [100]
8. **Light cap.** 12 doodad lights at once near the player (slider on the Mine Generator page). [103]
9. **Motion defaults** (sway, pulse, bob, drip, flicker speeds and sizes) are guesses; tune with real art. [103]
10. **Brush rule.** A body must be moving (over 0.5 cells/s) to wiggle a doodad; strength 1 leans it about 40 degrees; one spore puff per brush, 1.5 s cooldown. [104]
11. **Sound.** Looping `ambient` plays as up to 4 loops on the nearest doodads, a one-shot ambient every 3-9 s per doodad, `break` once per doodad lost on screen. No doodad sounds are assigned yet (needs audio files). Want any other slot (e.g. a drip landing)? [103]
12. **Bug behaviour.** Bugs restart at their spot when they come back on screen; a moving body within the reaction radius (default 2 original blocks) scares one, it runs away at 2.5x speed, waits 1.5 s, comes home. [106]

## Rules
13. **Revealed with the fog.** A doodad is sent to everyone once any cell of its footprint is revealed. [101]
14. **What removes a doodad.** Any one supporting cell mined/blown/burnt away, or something solid landing in its footprint (a falling rock, lava hardening). Ladders, torches and bridges never remove one. Air doodads are never removed this way. [105]
15. **Size variants** are the only sizes picked from when present (the base size must be listed to stay possible). [099]
16. **Default size** for a new doodad is 3x3 small blocks (one original block). [099]
17. **Surface scenery** (trees, bushes, birds in the sky rows) is not generated here; that is ticket 135. [100]

## Admin and sandbox
18. **Sound category.** Doodad sound uploads go in the `GENERAL` library category; want a `DOODAD` category? [099]
19. **Biome table** in the admin is its own weight + density table (not the one-number WeightTable). [099]
20. **Anchor change to AIR** turns a CRAWL/HOP wander into FLUTTER automatically; AIR doodads can only flutter. [106]
21. **Admin preview** draws on a canvas copy of the game's drawing (built on the shared layout/motion/reaction/wander code), because the client renderer cannot be imported into the admin. If the game's look changes the preview needs the same change. Alternative: move the Pixi drawing into the shared package. [107]
22. **Sandbox.** Hand-placed doodads always use the first size; scenes lay out every size in the long hall; the "Generate doodads" toggle rebuilds the whole sandbox (like Reset) and uses the biome bands for the biome shares. [107]

## Answered (2026-10-24)
- 1: applied; the 12 first doodads are in the dev DB (restart the server to load them).
- 18: keep GENERAL as the sound category.
- 21: keep the admin preview's canvas copy; the owner will have Gemini generate the sprites, so no more drawing work is wanted now.
- All other defaults kept; tune after trying it in the game with real art.
