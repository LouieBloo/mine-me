# 022: Projectile vs mob uses real collider and swept test

- **Status:** Open
- **Priority:** P3
- **Area:** server / combat
- **Source:** Mining game audit

## Problem
Hit test is a fixed 0.7 circle around the mob centre (`MiningProjectileSubsystem.ts:273`), ignoring `colliderWidth/Height`, and only checks end-of-tick positions.

## Proposed approach
Segment-vs-AABB test using the mob collider.

## Acceptance
- Hits match collider shapes for tall/wide mobs; fast bullets don't skip mobs.

## Open questions
(to be asked before work starts)
