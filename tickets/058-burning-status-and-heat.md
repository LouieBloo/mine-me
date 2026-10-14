# 058 - Burning status and heat damage

**Priority:** P1 - **Status:** Done (2026-10-13); flames drawn in 061 - **Depends on:** 057

## Decisions
- **Heat:** fire emits heat in a radius with distance falloff; standing close does small per-tick damage.
- **Burning status:** touching fire sets any entity (players, mobs, later drops) on fire for a duration. Burning does damage per tick and refreshes on re-contact. It **extinguishes naturally** after its (configurable) duration.
- Built through the unified damage pipeline (ticket 011) and shared `deriveCombatStats`, so heat/burn resistance can come from the Effects table later. Floating damage numbers (ticket 045) show burn damage.
- A burning entity can ignite flammable cells it touches.
- Mobs use the same logic. Per-mob immunity/weakness and flee-from-fire AI are follow-ups.

## Tests
Contact applies status, status ticks and expires, refresh extends, heat falloff, burning entity ignites oil, damage goes through `applyDamage`.

## Decisions (058 Q&A 2026-10-13, plus defaults flagged below)
- **Config (owner):** in the map config, shown on the Mine Generator page's Environmental Damage card next to fall and rock damage: `burnDamagePerSecond` (6), `burnSeconds` (5), `heatRadius` (2.5 tiles), `heatDamagePerSecond` (1.5, at a fire whose material has heat 1). The material's own `heat` (oil: 3) scales the heat damage, so a hotter material hurts more with no per-material duplication. An in-page preview shows what one burn costs and how hot oil is near and far.
- **Ticks (owner):** burn and heat damage is added up and dealt twice a second as one whole-number hit; it **ignores a player's hit protection and does not start one** (like fall damage), so fire cannot be shrugged off by taking a mob hit, nor shield from one. Fractions carry over, so a faint heat still hurts eventually.
- **Burning:** touching a burning cell (the body overlaps it) sets any player or mob alight for `burnSeconds`; touching again starts the count over; it goes out by itself. Players and mobs are treated the same; mobs are not stunned or interrupted by burn ticks (new `DamageEvent.noStun`).
- **Heat:** the hottest fire within the heat radius counts (not the sum), so a big blaze doesn't add up to instant death; falls off in a straight line to nothing at the radius, measured from the body's edge.
- **A burning body sets alight** flammable cells it stands in (an ignition source of normal strength), so a burning mob running through oil spreads the fire.
- **Default (flag if wrong):** no extinguishing by fluids yet. When a water-type fluid exists, entering it can end burning early; the place to add it is `MiningBurningSubsystem.tickBody`.

## Implementation notes
- **Shared:** `gameLogic/fire/heat.ts` (`bodyTouchesCell`, `distanceToCell`, `heatFalloff`, `heatDamageRate`, `FireDamageRule`); map config fields; `DamageEvent.noStun`; `burning` on the player tick, remote players and mobs.
- **Server:** `MiningBurningSubsystem` (tick step 4.7), `fireDamageRule` in `environmentalDamage.ts`, config columns (additive `db push`, applied; existing rows take the defaults), validation, service and JSON mirror. Burn state lives in the subsystem; the session flag `burning` is what goes on the wire.
- **Admin:** a "Fire: Burning and Heat" rule on the damage card.
- **Tests:** heat maths (10), room scenarios (16: burn, refresh, expiry, whole-number hits, hit protection, config, ignition by a burning body, death, heat near/far/radius/out, mobs incl. not stunned and dying, the wire), config routes (2), admin card (4). Mutation-checked: burn refresh, hit protection, mob stun, heat max-vs-sum, burning ignition, expiry and the radius each fail a test.
- Not done here: drawing the flames on burning bodies (061); the client keeps `burning` in the data it receives.
