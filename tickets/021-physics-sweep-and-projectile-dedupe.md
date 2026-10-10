# 021: Swept movement and single projectile collision model

- **Status:** Done
- **Priority:** P3
- **Area:** shared physics
- **Source:** Mining game audit

## Problem
`MiningPhysicsBody.update` checks only the destination of `v*dt` (tunnelling risk for knockback/explosions/fast entities). Projectiles are simulated twice: a Planck body plus a manual sub-stepped tile ray; the manual ray decides hits.

## Proposed approach
Axis-separated sweep or sub-stepping by max displacement; choose Planck or manual for projectiles, not both.

## Acceptance
- No tunnelling at defined max speeds; one projectile collision model; tests.

## Decisions (2026-10-09)
- Projectiles: manual exact swept grid ray (DDA); Planck body removed from projectiles (Planck stays for rocks/dynamite/drops). Reason: bullets need no solver behaviour, mobs/players aren't Planck bodies anyway, Planck bullet could ricochet before our ray decided. Keep `gravityScale` (own integration).
- Bodies (`MiningPhysicsBody.update`): sub-step by max displacement (<= ~0.4 tile per sub-step), existing axis-separated collision per sub-step.
- Cap body speed at `MAX_ENTITY_SPEED = 60` tiles/s; test tunnel-free at that speed vs a 1-tile wall.

## Implementation notes

- New `raycastSolidTiles` (shared `physics/gridRaycast.ts`): exact grid traversal returning the first solid cell entered, with entry point and `t`; cavern walls/floor are solid, sky is open. `isSegmentBlocked` (muzzle/line-of-sight) now uses it instead of 0.25-step sampling, so there is one ray implementation. Ticket 022 can reuse it for mob hit tests.
- `MiningProjectileEntity` is a plain kinematic entity: own gravity (`GRAVITY * gravityScale`), one swept ray per update, 0.35 muzzle clearance kept, hit point is the exact entry point on the tile face. Planck body, `createProjectileBody`, `ProjectileBodyOptions` and the `'projectile'` rigid type were removed.
- `MiningPhysicsBody.update` clamps speed per axis to `MAX_ENTITY_SPEED` (60) and splits into sub-steps of at most `MAX_STEP_DISPLACEMENT` (0.4 tile); slow bodies still run one step, so behaviour is unchanged for them. Dynamite/rocks stay on Planck.
- Tests: ray cases, body no-tunnel at 60 tiles/s (wall and floor) with a mutation check (forcing one step fails them), projectile thin-wall, gravity, muzzle clearance, cavern wall.
- Note: mob/player hit tests for projectiles (`dist < 0.7` point check) are untouched; that is ticket 022.
