# 074 - Fluid contact damage, ignition and extinguishing

**Priority:** P1 - **Status:** Done (2026-10-16) - **Part of:** water + lava epic (074-080) - **Depends on:** 055, 058

## Problem
Fluids slow bodies (055) but never hurt them, and nothing a fluid does can set a body alight or put it out. Lava must hurt anything touching it and set it burning; water must end burning.

## Decisions (Q&A 2026-10-16)
- **Data on `Fluid`, not code:** a nullable Json `contact` (shared `FluidContactEffects`): `damagePerSecond` (number, 0 = none), `ignites` (burn strength, same meaning as the `Ignites` effect value, 0 = none), `extinguishes` (boolean). Lava = high damage + ignites; water = extinguishes; oil keeps null.
- **Damage:** dealt while a player or mob body overlaps a cell of the fluid, scaled by how submerged the body is, added up and dealt as whole-number hits like fire/heat (058): through `applyDamage`, `noStun`, ignores and does not start hit protection, floating damage numbers (045).
- **Burning:** touching an igniting fluid sets the body burning through the existing burning system (`MiningBurningSubsystem`), for `burnSeconds` from the map config.
- **Extinguish:** a body entering a fluid with `extinguishes` ends its burning at once (the default flagged in 058; place is `MiningBurningSubsystem.tickBody`). Burning also cannot restart while submerged in it.
- Players and mobs share the same logic. Per-mob immunity (e.g. a lava mob) is a later follow-up through the Effects table.

## Checklist
Schema (additive `db push`), shared type + `validateFluid`, loader, fluid definition on the wire (static, sent once), admin Fluids page panel, server subsystem, client (burning state already synced), tests.

## Tests
Damage scales with submersion, whole-number hits, hit protection untouched, ignition starts burning, water ends burning and blocks re-ignition, mobs the same, validator rejects bad values. Mutation-check: skip the extinguish and the submersion scaling.

## Implementation notes
- **Data:** nullable Json `Fluid.contact` (`FluidContactEffects`: `damagePerSecond`, `ignites` in %, `extinguishes`), additive `db push` (applied). `validateFluidContact` also refuses a fluid that both ignites and extinguishes.
- **Server:** `MiningBurningSubsystem` now asks which fluid a body is in (`sampleFluidContact`, deepest wins) and reads that fluid's `contact`: damage per second x submerged fraction joins the same pending total as burn/heat (same whole-number hits, no stun, ignores hit protection; the hit is named after the fluid), `ignites` keeps the body burning for `burnSeconds`, `extinguishes` ends burning and blocks catching fire in it. No fluid or name is hard-coded.
- **Lava as a spark:** an igniting fluid also lights what touches it (oil, flammable blocks, explosive gas): `MiningIgnitionSubsystem.emitFromFluids` emits from every cell of the fluid at `ignites/100` strength, each fire step.
- **Admin:** `FluidContactPanel` on the Fluids page.
- **Not sent to the client:** damage and extinguishing are server-only, so no wire change was needed.
- **Tests:** validator (shared), 9 room scenarios (damage scales with submersion, whole hits, ignition, extinguish, harmless, lava lights adjacent oil / not far oil / not when it does not ignite), admin panel and save. Mutation-checked: dropping the extinguish and the submersion scaling, and dropping the lava spark, each fail a test.
