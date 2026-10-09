# 023: Mob/player/mob-mob collision and attack wind-up

- **Status:** Open
- **Priority:** P3
- **Area:** server / mobs
- **Source:** Mining game audit

## Problem
No mob-vs-player or mob-vs-mob collision (mobs stack). Mob attacks are instantaneous within range 1.25 with no wind-up, line of sight, or telegraph.

## Proposed approach
Soft separation, attack wind-up/active/recovery phases with animation hooks.

## Acceptance
- Mobs don't stack; attacks are telegraphed and testable.

## Open questions
(to be asked before work starts)
