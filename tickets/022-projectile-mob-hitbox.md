# 022: Projectile vs mob uses real collider and swept test

- **Status:** Done
- **Priority:** P3
- **Area:** server / combat
- **Source:** Mining game audit

## Problem
Hit test is a fixed 0.7 circle around the mob centre (`MiningProjectileSubsystem.ts:273`), ignoring `colliderWidth/Height`, and only checks end-of-tick positions.

## Proposed approach
Segment-vs-AABB test using the mob collider.

## Acceptance
- Hits match collider shapes for tall/wide mobs; fast bullets don't skip mobs.

## Decisions (2026-10-09)
Reviewed with the owner afterwards: keep the real collider + bullet radius (no extra padding, no separate hitbox); add an optional **pierce count** (`projectileConfig.pierceCount`, admin field, bullets pass through N extra mobs, each mob hit once, walls still stop them). Original defaults: swept segment vs the mob's real collider box (grown by the bullet radius), earliest mob wins, a wall earlier on the path wins over a mob behind it.

## Implementation notes
- New shared `segmentAabbEntryTime` (`physics/segmentAabb.ts`, slab test, tested).
- `MiningProjectileEntity` now exposes `previousPosition` and `expired`; the subsystem sweeps `previousPosition -> position` (already truncated at a wall by the 021 ray) against each living mob's `halfWidth/halfHeight`, moves the bullet to the entry point and applies the hit. Expired bullets (lifetime/out of world) do not hit.
- Tests: fast bullet doesn't skip, tall vs short collider, wide collider, wall in front, nearest of two mobs; mutation-checked (fixed 0.35 box fails).

