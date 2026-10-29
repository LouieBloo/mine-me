# Surface epic (tickets 129-138): questions for the owner

Work them through one at a time with the pick-from-a-list prompt. Each has the default that is built now, so "keep" is always safe. Answer, then record it in the ticket named in brackets.

1. **Weather timing** [132]. Built: a stretch of one weather lasts 2 to 5 minutes and turns into the next over 30 seconds, only between neighbouring kinds (clear, cloudy, windy, rain, storm, snow, fog). A run lasts up to about 30 minutes, so a player sees about 6 to 12 changes. Faster, slower, or keep?
2. **Storm frequency** [134]. Built: in a storm there is a strike in about half of the 3-second slots, so a flash every ~6 seconds on average. Green Valley's weather weights give storms about 7% of the time. More or fewer?
3. **Weather and gameplay** [133]. Built: purely cosmetic. `rainIntensity` is on the weather state for later (wet ground, dousing fire on the surface, water pools). Say if rain should do anything now.
4. **The exit sign is still drawn in code** [139/137]. The EXIT sign at the extraction point is a placeholder drawn with shapes. A picture would need its own place to upload (a doodad at the entrance, as ticket 139 suggested). Do you want that done, or is the drawn sign fine?
5. **Weather particles in the admin** [133]. The rain and snow are a small cheap system of their own, so you cannot pick a particle effect for them in the admin. If you want rain/snow looks editable per environment, say so (it costs speed).
6. **Sound muffling with depth** [134]. Built as a plain fade (the rain/wind loops fade out over 2 to 14 blocks below the ground). A real muffle (low-pass filter) needs a bigger change to the sound manager.
7. **Density of trees and birds** [135]. Green Valley: oak 5 per 100 columns, bush 7, bird flocks 2. On a 135-column map that is about 6 trees, 9 bushes and 3-11 birds. These are a first guess to tune on the Surface Editor.
8. **Tree size** [135]. Oak 4 x 8 small blocks (about three characters tall), pine 3 x 9, bush 3 x 2. Change them on the Doodads page.
9. **Surface props in the sandbox** [138]. They only appear when the doodad generator toggle is on (so the other sandbox scenes stay empty). Say if they should always be there.
10. **More environments** [129]. Three are made (Green Valley, Snowfield, Dusty Plains). A run picks by weight from its seed, so Green Valley is the usual one (weight 6 of 10). Say if a map or a mission should be able to choose the environment (the ticket left that for later).

## Decisions (2026-10-29)
1. Weather timing: **slower**. A stretch lasts 5 to 10 minutes (`WEATHER_SEGMENT_MIN/MAX_SECONDS` = 300/600); the 30 second turn stays. Done.
2. Storms: **calmer**. A strike in about 30% of the 3-second slots (`LIGHTNING_SLOT_CHANCE` 0.3, a flash every ~10 seconds). Done. Storm share of the weather is a weight on the Surface Editor: lower Green Valley's storm weight there if you want fewer storms.
3. Weather and gameplay: cosmetic only.
4. EXIT sign: keep it drawn in code.
5. Rain/snow particles: keep the built-in system.
6. Sound muffling: keep the plain fade.
7. Tree and bird density: keep, tune in the Surface Editor.
8. Tree size: keep, tune on the Doodads page.
9. Sandbox props: keep the doodad generator toggle.
10. Environment choice by map or mission: not yet.
