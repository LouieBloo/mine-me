# 061 - Fire visuals and light (sounds moved to 062)

**Priority:** P2 - **Status:** Done (2026-10-13); data script applied (owner confirmed 2026-10-14) - **Depends on:** 054, 057

## Scope
Flames on burning cells (Pixi particles from `ParticleEffect` rows, never hard-coded), flickering light from the definition, heat shimmer optional, burn-out/ash, ignition and crackle sounds through the sound library (slots defined once, each with its own volume), entity burning visuals (flame on a burning character/mob), admin controls in the Fluids page and block page.

## Decisions (made on the owner's instruction to keep going; flag if wrong)
- **Everything is data, nothing hard-coded:**
  - A material's `Flammability` gains `flameEffectId` (a `ParticleEffect` row) and `flameLight` (the usual `ItemLightConfig`), so oil, and later grass or wood, each choose how they burn. Edited in the Fluids page's flammability panel (a picker over the particle library plus the same light panel items use).
  - What a burning **player or mob** looks like is one particle effect on the mine config (`burningEffectId`, a picker on the Mine Generator page).
  - The server resolves the effects from the library and sends them with the fluid definitions and the join state; the client draws them. New fuels need no client code.
- **Flames** rise from the burning surface of every burning cell (the surface sinks as the oil burns down); **lights** sit a little above it. Both follow cells starting and stopping. Caps keep it cheap: 120 flame emitters and 20 lights, given to the cells nearest the player and re-chosen as they move (the work happens 10 times a second, not every frame).
- **Burning bodies** get the burning effect at their position (the local player's follows every frame; mobs and other players follow the 30 Hz ticks).
- **Layering:** flames and lights draw with the particles and lighting, above the fluid and below nothing that matters.
- **Moved to 062:** all fire and fluid sounds (done there).
- Art direction (ART_STYLE_GUIDE.md): the starter effects are hand-tuned particle configs (warm yellow to deep red, additive, flame shape), not images, so they can be retuned in the particle editor; no new art files.

## Implementation notes
- **Shared:** `Flammability.flameEffectId/flameLight` (+ validation), `FluidClientDefinition.flame`, `MiningMapConfigData.burningEffectId`, `MiningSessionClientState.burningEffect`.
- **Server:** the definitions load now includes the particle effect library (`MiningDataManager.getParticleEffect`); `MiningFluidSubsystem.clientDefinitions` resolves each fluid's flame; the join state carries the burning effect; `MiningMapConfig.burningEffectId` (additive `db push`, applied) through service, validation and the JSON mirror.
- **Client:** `FireRenderer` (flames and lights on burning cells), `BurningBodies` (the effect on burning players and mobs), created with the scene, fed by `applyBurning` (each tick) and synced in the frame ticker; `FluidRenderer.flameOf`.
- **Admin:** flame picker and light panel in the flammability panel (`ItemLightEffectConfig` moved to `components/` because two screens now use it); "Burning Look" card on the Mine Generator page.
- **Data:** `prisma/add-fire-visuals.ts` creates the "Oil Fire" and "Burning" particle effects and points Oil and the active mine config at them, each only if unset (dry run by default, idempotent). **Applied** (owner confirmed 2026-10-14; not re-checked against the DB).
- **Tests:** flame/light rendering and caps (14), burning bodies (7), tick handler (5), server definitions/wire (7), admin panels (8 + 5), data script (7). Mutation-checked: "nearest first" ordering and the burning filter each fail a test.
- Not covered automatically: the Pixi scene wiring and the ticker line (both are only constructed in a real browser). Judged in the game.
