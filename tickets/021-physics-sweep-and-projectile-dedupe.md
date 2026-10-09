# 021: Swept movement and single projectile collision model

- **Status:** Open
- **Priority:** P3
- **Area:** shared physics
- **Source:** Mining game audit

## Problem
`MiningPhysicsBody.update` checks only the destination of `v*dt` (tunnelling risk for knockback/explosions/fast entities). Projectiles are simulated twice: a Planck body plus a manual sub-stepped tile ray; the manual ray decides hits.

## Proposed approach
Axis-separated sweep or sub-stepping by max displacement; choose Planck or manual for projectiles, not both.

## Acceptance
- No tunnelling at defined max speeds; one projectile collision model; tests.

## Open questions
(to be asked before work starts)
