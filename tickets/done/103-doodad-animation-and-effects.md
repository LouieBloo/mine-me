# 103 - Doodad motion, light, particles and sound

**Priority:** P1 - **Status:** Done (closed by the owner 2026-10-26) - **Depends on:** 102

## Decisions (2026-10-22, from the owner)
- Procedural motion on a still image in v1 (no spritesheets, the owner can't generate them). Reuse the existing character and mob animation approach (`ModularEntitySprite`/`SpriteMotion`: parts with pivots moved by sine-based procedural motion) instead of inventing a new animation system.

## Proposed design
- Motion presets in data, each with parameters: `sway` (rotate about the base pivot), `pulse` (scale/alpha glow), `bob`, `drip` (loop: a droplet part falls and resets), `flicker`. Presets live in a shared registry (like `ROCK_SHAPES`); adding one is a registry entry plus a function, no per-doodad code.
- A doodad is one part or a few parts with pivots (same pivot data shape as `SkeletonPartDef`), so a bigger doodad can sway at the top and stay planted at the bottom. Phase is offset per doodad so a field of mushrooms doesn't move in sync.
- A single shared ticker updates motion for on-screen doodads only; skip when off screen.
- **Light:** `light` data (the shared `ItemLightConfig`) built by `createItemLight`, added when the doodad is on screen/near, with a cap on simultaneous doodad lights (set in map config) to protect lighting cost. Pulse can modulate intensity.
- **Particles:** `particleEffectId` from `ParticleEffect` rows; emitted at an offset on a timer (a leaky cave drips with a splash on landing).
- **Sound:** slots with their own `volume`, played with `withVolume(volume)` and distance falloff; throttle so a field of doodads doesn't spam; only nearby doodads make sound.

## Tests
Each preset's output is deterministic for a time value, phase offsets, off-screen skipped, light cap, sound throttling and volume.

## Built (2026-10-24, stage 3)
- **Motion registry** (shared `gameLogic/doodad/doodadMotion.ts`, like `ROCK_SHAPES`): `sway`, `pulse`, `bob`, `drip`, `flicker`. A preset is a pure function of the cycle (time x speed + phase) giving a pose (`rotation`, `x`, `y`, `scaleX`, `scaleY`, `alpha`, and `drop` for drips), so every client agrees and it is testable. `validateDoodad` now refuses a preset that is not in the registry. Adding a preset = one registry entry; nothing else names one.
- **Phase:** each placed doodad gets its own from its cell (`doodadPhase`), unless the motion fixes one, so a field of mushrooms is out of step.
- **Parts:** each part is posed on its own by name; `params.weight_<part>` scales how much of a motion a part gets (weight 0 keeps a stem planted while the cap sways). `drip` moves the part named `drop` (it grows, falls and fades) and, on a doodad with no parts, the placeholder draws the falling drop.
- **Light:** `DoodadEffects` (systems) keeps lights on the nearest on-screen doodads that have one, at most the map's new **Most Doodad Lights** setting (`doodadMaxLights`, default 12, Mine Generator page "Scenery" card, Prisma column, sent to the client with the session). A `pulse`/`flicker` motion with a plain light gives a pulsing/flickering light at the motion's speed (`doodadLightConfig`), so the light follows the picture and the lighting engine knows nothing about doodads. Lights update about 6 times a second.
- **Particles:** a continuous emitter (at most 24, nearest first) at the doodad's particle offset; a `drip` splashes its effect where the drop lands (`dripLandedBetween`) instead. Offsets are in pixels of the doodad's own picture (scaled to the drawing; 64 px = one cell while it is a placeholder) and are mirrored with a wall doodad.
- **Sound** (`DoodadSounds`): `ambient` (a looping slot plays as up to 4 positional loops on the nearest doodads; a non-looping slot makes a one-off every 3-9 s per doodad, out of step, at most 2 doodads per sync), `break` (once, when a doodad on screen loses its block, at most one per 80 ms). All through `withVolume(slot.volume)` with a new `DOODAD` spatial preset (audible to 12 original blocks), so the level is effects slider x slot volume x distance. `react` is played by ticket 104.
- One update per frame for the doodads on screen only (`DoodadRenderer.update`, called from the mining ticker).
- Tests: shared `doodadMotion.test.ts` (every preset deterministic, ranges, weights, phase, drip fall/landing, light config), client `DoodadEffects.test.ts` (light cap and nearest, offsets, emitters, splash), `DoodadSounds.test.ts` (loops, cap, distance, one-shots and spacing, break), admin and server config tests for the new setting. Mutation checked: no light cap, no per-doodad phase, no off-screen release: each fails tests.

## For the next stages
- **Reactions (104):** `DoodadRenderer.pose` is where a damped-spring offset plugs in: add the spring's angle to `pose.rotation` (whole doodad) or per part in `pose()` before it is applied. The renderer already knows each doodad's `DoodadViewInfo` (base point in pixels), which is what a body-overlap test needs.
- **Wander (106):** a wander position is an extra offset on `view.root` (the doodad's base point) in `pose()`; crawlers need the tile grid (`world.gridRef`).

## Decisions (assumed, to confirm)
- **Light cap default 12**, sorted by distance to the player, recomputed about 6 times a second.
- **Motion speeds/amplitudes** (sway 0.4 Hz 0.08 rad, pulse 0.6 Hz 6%, bob 0.5 Hz 6% of the height, drip a drop every 4 s falling over 40% of the cycle, flicker 2.5 Hz 25%): tune once there is art.
- **Ambient sound:** looping slots are heard up to 12 original blocks away, 4 loops at most; non-looping ones every 3-9 seconds.
