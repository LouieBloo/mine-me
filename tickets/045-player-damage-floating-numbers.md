# 045 - Floating damage numbers when the player is hurt

**Priority:** P2 - **Status:** Done (2026-10-12)

## Problem
Mobs show floating damage numbers (`FloatingTextManager.spawnDamage`, used in `MiningMobRenderer`), but the player taking damage shows nothing except the health bar.

## Decisions (owner Q&A)
- Reuse the existing `FloatingTextManager`; do not build a second text system.
- Applies to every source of player damage (mob hits, explosions, projectiles, fall damage 046, rock damage 047), because all go through `applyDamage` -> `player_damaged`.

## Plan
1. Client: on `player_damaged` (already handled in `usePlayerDamageEvents`), spawn `spawnDamage` at the player sprite's position using `event.damage`. Needs the floating text manager and player position available to that hook (pass via options, like the other refs).
2. Distinguish from mob numbers visually (e.g. a different color for damage to the player) only via an option on the existing manager, if it does not already support it.
3. Other players in multiplayer: decide in implementation whether the server also sends damage events for other players (not required now; note in ticket if skipped).
4. Tests: event spawns exactly one number with the right value and position; zero/invalid damage spawns none; no manager available does not throw. Mutation-check: remove the spawn call, confirm failure.

## Notes
- Server already sends `damage` in `MiningPlayerDamagedEvent`; no wire change expected.
- Show the dealt amount (after any future modifiers), which is what the event carries.

## Implementation notes
- `usePlayerDamageEvents` takes the scene's `floatingTextManagerRef` and, on every `player_damaged`, calls `showPlayerDamageNumber`: one `FloatingTextManager.spawnDamage` above the local player (pixels = tiles x `TILE_SIZE`, 0.7 tile up like the mob numbers), orange `#fb923c` through the manager's existing `color` option so it differs from the red numbers on mobs. No manager changes and no wire change (the event already carried `damage`).
- Zero, negative or non-finite damage shows nothing; a missing manager or body does not throw; the manager ref is read when the event fires, so a manager created after mount is used.
- Not done: other players' damage in multiplayer (the server only sends `player_damaged` to the player who was hurt).
- Tests: spawn position/value/color, invalid amounts, missing manager/body, every source (mob, "Fall", "Falling rock") shows a number, lazy ref. Mutation-checked: removing the call and removing the zero-damage guard each fail tests. Client 543 tests pass, typecheck clean.
