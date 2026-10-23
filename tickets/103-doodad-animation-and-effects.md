# 103 - Doodad motion, light, particles and sound

**Priority:** P1 - **Status:** Open - **Depends on:** 102

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
