# 023: Mob/player/mob-mob collision and attack wind-up

- **Status:** Done
- **Priority:** P3
- **Area:** server / mobs
- **Source:** Mining game audit

## Problem
No mob-vs-player or mob-vs-mob collision (mobs stack). Mob attacks are instantaneous within range 1.25 with no wind-up, line of sight, or telegraph.

## Proposed approach
Soft separation, attack wind-up/active/recovery phases with animation hooks.

## Acceptance
- Mobs don't stack; attacks are telegraphed and testable.

## Decisions (2026-10-09)
Reviewed with the owner afterwards: all of the below confirmed as is (soft separation, players never pushed, 0.3 s wind-up).
Owner asked to keep moving between tickets, so defaults were chosen (all easy to change): soft sideways separation (no hard collision), mobs are pushed but players never are, stationary mobs are immovable, wind-up 0.3 s default and configurable per mob.

## Implementation notes
- **Attack phases:** a swing now starts a wind-up (telegraph, `animationState: 'attack'`, mob rooted), then the hit resolves. At resolution it lands only if the target is alive, within `max(attackRange, distance at start) + MOB_ATTACK_DODGE_MARGIN` (so stepping away dodges it), and no solid tile is in between. A stun cancels the attack in progress. Wind-up is capped at 0.8 of one swing period so it never lowers the attack rate; `aiConfig.attackWindupMs` overrides the default `MOB_ATTACK_WINDUP_SECONDS`, 0 = instant. Recovery is the rest of the swing cooldown (the same Mining Speed clock as before).
- **Collision:** `subsystems/mobSeparation.ts` (`separateBodies`) pushes overlapping boxes apart sideways each tick (>= `MOB_SEPARATION_SPEED`*dt, or half the overlap, whichever is larger) among living mobs and players; never into a wall; immovable = `moveSpeed <= 0` mobs and all players.
- Tests: separation unit tests, wind-up/dodge/wall/stun/instant/attack-rate tests, crowd and spawn-stack tests. Mutation-checked (instant resolve, no separation, stun not cancelling all fail tests). Existing attack tests now tick through the wind-up. The slow-vs-fast mob test now runs one mob per run, since mobs now (rightly) bump each other.
- Not done: the admin mob editor has no field for `attackWindupMs` yet (aiConfig is edited as data); client art for the telegraph just uses the existing 'attack' animation state.

