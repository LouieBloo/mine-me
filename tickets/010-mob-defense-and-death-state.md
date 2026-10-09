# 010: Apply mob defense and play death animation

- **Status:** Done (death state); defense deferred to 011
- **Priority:** P1
- **Area:** server + client / mobs
- **Source:** Mining game audit

## Problem
`defense` exists on mobs but `damageMob` ignores it. `killMob` deletes the mob immediately, so clients never receive the `death` state and no death animation can play.

## Proposed approach
Apply defense in the damage pipeline (011). Keep dying mobs for a short duration in a `dying` state (no AI, no collision/damage), then remove.

## Acceptance
- Defense reduces damage per agreed formula; death animation plays; drops timing defined.

## Decisions
- **Defense: not applied for now.** Answers were "flat damage for now until we add more" and "none" of the sources reduced, so mob `defense` stays unused. The formula and which sources it affects are decided with the unified damage pipeline (011).
- Death state: a killed mob lingers **~1 s, inert** (no AI, no damage dealt or taken, no collision), then is removed.
- Loot drops **immediately** on death; the corpse is purely visual.

## Implementation notes
- `MINING_CONFIG.MOB_DEATH_LINGER_SECONDS = 1.0`.
- `MiningMobSubsystem.killMob` no longer deletes the mob: it sets `health 0`, `animationState 'death'`, a `deathTimer`, clears hit-stun and digging, drops loot, and is idempotent (a second kill never drops loot twice). `updateActiveMobs` runs `updateDyingMob` for corpses (gravity and a horizontal slide so it doesn't hang in mid-air, no AI), and removes it when the timer expires.
- Inertness comes from existing guards, now covered by tests: projectiles skip `health <= 0` / `'death'`, melee skips `health <= 0`, `damageMob` ignores dead mobs (so explosions can't re-kill), and the AI never runs for corpses.
- Clients already rendered `'death'` (slump pose, hidden health bar at 0, final damage number, client-side bullets ignore dead mobs); no client change needed beyond a new renderer test.
- Tests: `MiningGameEngine.mobDeath.test.ts` (lifecycle, loot once, undamageable, ignored by bullets/melee, no attacks/digging, gravity, hit-stun cleared), updated mob tests in `MiningGameEngine.test.ts` / `MiningGameEngine.safety.test.ts` (a corpse is now reported for a second before the list goes empty), client `MiningMobRenderer.test.ts`.
- Side effect to be aware of: the surface target dummy now also lingers 1 s after death like any mob (there's still no respawn logic for it; unchanged).
