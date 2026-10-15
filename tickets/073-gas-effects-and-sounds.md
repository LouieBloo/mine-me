# 073 - Gas visuals and sounds

**Priority:** P2 - **Status:** Done (2026-10-14); needs audio files assigned in the admin - **Depends on:** 069, 070 (pattern: 061, 062)

## Problem
Gases and explosions need polish: particles, light and sounds, all configured as data through the existing frameworks.

## Design
- **Sounds:** `GAS_SOUND_SLOTS` (defined once; add the slot there, then its trigger in the renderer): for example enter, exit (body moves in/out of gas), ignite, explode, vent. Library `Sound` rows only, one upload path (`POST /api/admin/sounds`), assigned with `SoundSlotPicker`, per-slot `volume`, played with `withVolume(volume)`; final level = global effects slider x slot volume x distance falloff.
- **Explosion visuals:** the flame/flash `ParticleEffect` rows and `flameLight` referenced by the gas's flammability data (070); never hard-coded. Each front cell plays its effect once.
- **Gas ambience (optional, data-driven):** an optional `ParticleEffect` reference on the gas for faint drifting motes in dense cells. **Not built** (it was optional; the soft drifting blobs from 069 carry the look).
- All assets referenced as `/assets/...` URLs so the preloader finds them; new images follow `ART_STYLE_GUIDE.md`.

## Tests
Each slot resolves to a URL at load; the play site passes the slot volume; explosion effect plays once per crossed cell; missing sound does not crash; preload picks up the URLs. Mutation-check: drop the per-slot volume at a play site, confirm a test fails.

## Implementation notes
- **What was already done:** the five sound slots (`GAS_SOUND_SLOTS`: enter, exit, ignite, explode, vent), the admin sound panel with per-slot volume, the `GAS` sound category and the explosion visuals (effect burst and light in each cell) came with 066, 070 and 071. This ticket added the triggers.
- **Server events:** `GasEvent { kind: 'enter' | 'exit' | 'ignite' | 'vent', gasId, x, y }` on the tick as `gasEvents`, only to clients near the event (the same interest radius as splashes and blasts).
  - `enter`/`exit`: `MiningGasSubsystem.trackBodies()` runs every tick for each living player and mob. A body is in a cloud once the gas around it is `GAS_ENTER_CONCENTRATION` (0.3) thick and out once it is under `GAS_EXIT_CONCENTRATION` (0.1), so the rim of a cloud does not chatter; at most one pair of sounds per body every `GAS_EVENT_COOLDOWN_SECONDS` (0.5); going from one gas straight into another is an exit then an enter; bodies that leave the room are forgotten.
  - `ignite`: one event for the spark that sets an explosion off (`MiningGasExplosionSubsystem.ignite`), not one per cell the front then crosses. Silent for gas that cannot be lit.
  - `vent`: `MiningGasSubsystem.onTileChanged` compares which cells in the column were open to the sky before and after; when breaking a roof newly opens gas thicker than `GAS_VENT_EVENT_MIN_CONCENTRATION` (0.2), one event is queued at the highest newly opened gas cell.
  - Cell events (`ignite`, `vent`) go only for revealed tiles, like every other gas message, so a hidden pocket never gives itself away by sound. Body events (`enter`, `exit`) are about a body the receiver can already see.
- **Explode:** needs no event of its own: the `gasExplosions` cells from 070 carry it. The client plays one boom per batch (from the middle cell), at most every 150 ms.
- **Client:** `GasSounds` (`renderers/GasSounds.ts`) plays each event's slot from the gas's own resolved sounds at the volume set on that gas (`withVolume(slot.volume, ...)`, so the final level is the global effects slider x slot volume x distance falloff), with new spatial presets `GAS_ENTER`, `GAS_IGNITE`, `GAS_EXPLOSION`, `GAS_VENT` in `MINING_SPATIAL_AUDIO_PRESETS`. A gas with no sound in a slot is silent. `applyGasSounds` runs in the tick handlers after the gas is up to date; `MiningGrid` makes `GasSounds` once the scene's gas renderer exists. Sound urls are `/assets/...` library urls, so the generic preloader finds them.
- **Not done here:** the optional ambient particles (above); no audio files are assigned yet (the owner assigns library sounds on each gas's page, so until then the gases are silent).
- **Tests:** server `MiningGameEngine.gasEvents.test.ts` (16), client `GasSounds.test.ts` (9) and `applyGasSounds` cases in `tickHandlers.test.ts`. Mutation-checked: no hysteresis, no cooldown, venting for gas that was already open, no ignite event, leaking hidden cell events, leaving the events out of the payload (server); no explode interval, the handler left out of the tick, ignoring the slot volume and the wrong falloff for enter (client).
