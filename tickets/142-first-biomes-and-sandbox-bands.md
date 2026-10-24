# 142 - First biomes and the sandbox biome walk

**Priority:** P2 - **Status:** Built 2026-10-23, waiting for you to try it - **Depends on:** 095-098

## Decisions (2026-10-23, from the owner)
- First pass of biomes made with my own judgement; the sandbox shows them in a line, with the transitions, so they can be walked through.

## Built
- `prisma/add-first-biomes.ts` (dry run by default, creates only missing keys; applied to the dev DB): `default` (Earthen Mine), `clay_pits`, `sandstone_hollows`, `gravel_banks`, `oil_shale`, `frozen_caves`, `deep_stone`, `magma_depths`. Each is a depth window (the mine is 135 rows deep), a few block swaps, fluid/gas multipliers and a wall tint. Mob lists are empty (the map's usual mobs); no wall textures yet (art job).
- Shared `BandBiomeField` (a `BiomeField` laid out by hand): the biomes stand side by side in equal bands, default first then by the depth they start at, with a linear crossover of 12 cells (4 original blocks) at each border. Everything that reads the field (swaps, mixes, the per-cell primary biome on the wire) works unchanged.
- Sandbox: `buildSandboxMap` takes the loaded biomes, swaps the base ground by the band (before the hand-built zones are painted, so the hall, pools, ladder and block patches stay as drawn), and returns the field. The client shows the wall tint and `F4` overlay as it does in a generated mine. Walk the long hall underground (ladder at x 12-14 original blocks) from left to right.

## Not done / notes
- Only the base blocks swap in the sandbox; ore, fluid and gas multipliers and mob lists are generator-side and the sandbox's hand-placed ore, pools and chambers do not change by band.
- The biome numbers (weights, windows, chances) are a first guess: tune them in the admin Biomes page after looking at a generated mine.
