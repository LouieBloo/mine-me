# 062 - Fire and fluid sounds

**Priority:** P2 - **Status:** Done (2026-10-13); needs audio uploaded in the admin - **Depends on:** 054, 057, 061 - **Split from:** 055 and 061

## Problem
Fluids and fire should make noise: wading into and out of a fluid, a fire catching, and a fire crackling. Per the project rules every sound goes through the sound library (`Sound` rows with a category), entities reference library sounds by id with a slot defined once, and **volume is set per use**, never on the sound.

## Decisions (062 Q&A 2026-10-13)
- **Splashes (owner):** heard from everyone in hearing range: players and mobs wading in or out. The server notices each crossing and tells the clients near it; each client plays it positionally, louder when close.
- **Crackle (owner):** up to 4 positional loops on the burning cells nearest the player, handed to nearer cells as the player moves, so the cost is the same however big the fire is.
- **Slots (defined once in `FLUID_SOUND_SLOTS`):** `enter`, `exit`, `ignite` (a cell catches fire; at most one every 120 ms so a spreading fire crackles rather than machine-guns; cells that only came into view are silent) and `burn` (the loop, always looping). Each slot stores a library sound id and **its own volume**; every play passes it (`withVolume`), so the level is effects slider x use volume x distance falloff. The library's own volume is not used.
- **Default (flag if wrong):** splashes need some give at the surface to avoid spam: a body counts as in a fluid at 30% submerged and out below 10%, with at least 0.4 s between a body's splashes.
- **No audio was added.** The slots start empty (silent). Upload sounds on the Fluids page (or the Music page under the new "Fluid & Fire SFX" category) and pick them per slot.

## Implementation notes
- **Schema/shared:** `Fluid.soundEffects Json?` and a `FLUID` sound category (an additive enum value, `db push` applied); `FluidSoundProfile` (slots, normalise, resolve), spatial presets `FLUID_SPLASH` / `FIRE_IGNITE` / `FIRE_CRACKLE`, `crossFluidSurface` (the in/out rule), `MiningFluidSplashEvent`, `fluidSplashes` on the tick, `sounds` on the client fluid definition.
- **Server:** definitions resolve each fluid's sounds from the library at load (`attachFluidSounds`), the fluid subsystem tracks crossings (`trackSplashes`) and the broadcast sends them to players in range; `PATCH /api/admin/fluids/:id/sound-effects/:slot` (same behaviour as mobs: choose, clear, volume alone, unknown slot/sound/volume rejected), the sound-usage list now includes fluids.
- **Admin:** a "Sounds" panel on the saved fluid's page using the shared `SoundSlotPicker` (upload files under the Fluid & fire category); the Music page filter and upload form know the new category.
- **Client:** `FluidSounds` (splashes, ignite, loops), made once the scene exists, fed by `applyFluidSounds` and synced in the ticker.
- **Tests:** shared profile (6) and crossing rule (7), server splash scenarios (8), slot endpoints (8), definitions (3), usage (2), wire (1), admin panel (6 + 2), client sounds (16) and handler (4). Mutation-checked: the splash cooldown, the hearing-range filter, the ignite throttle, the loop cap and the per-use volume each fail a test.
- Not covered automatically: the scene hookup (the component is mocked in its tests) and actual playback. Judged in the game.
