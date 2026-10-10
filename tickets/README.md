# Tickets

File-based tracker (no Jira). One markdown file per ticket: `NNN-slug.md`. Set `Status:` to Open / In Progress / Done. Every ticket gets a Q&A with the owner before work starts; answers are recorded in the ticket under "Decisions".

| ID | Title | Priority |
|----|-------|----------|
| [001](001-input-validation-and-tick-safety.md) | Validate client input and make the tick crash-proof | P0 (Done) |
| [002](002-vision-range-exploit.md) | Lock down mining_increase_vision | P0 (Done) |
| [003](003-persist-loot-on-timeout-and-exit.md) | Persist backpack loot on timeout and make exit failure-safe | P0 (Done) |
| [004](004-atomic-inventory-consumption.md) | Atomic inventory consumption for throw/place/shoot | P0 (Done) |
| [005](005-shoot-handler-trust.md) | Server-validate weapon, muzzle and ammo on mining_shoot | P0 (Done) |
| [006](006-stale-last-mob-and-player.md) | Fix empty mobs/otherPlayers not clearing on client | P1 (Done) |
| [007](007-mob-mining-shared-completion.md) | Route mob block mining through shared completion path | P1 (Done) |
| [008](008-per-weapon-ammo-state.md) | Per-weapon ammo and reload state | P1 (Done) |
| [009](009-player-health-and-mob-attacks.md) | Server-side player health and working mob attacks | P1 (Done) |
| [010](010-mob-defense-and-death-state.md) | Apply mob defense and play death animation | P1 (Death state done; defense deferred to 011) |
| [011](011-unified-damage-pipeline.md) | Unified damage pipeline (applyDamage / damageTile) | P1 (Done) |
| [012](012-separate-tool-and-weapon-stats.md) | Separate tool stats from weapon stats | P1 (Done) |
| [013](013-sim-time-and-game-loop.md) | Sim-time cooldowns and fixed-timestep loop | P1 (Done) |
| [014](014-hit-stun-lock.md) | Prevent hit-stun lock on mobs | P2 (Done) |
| [015](015-network-payload-static-data.md) | Stop re-sending static entity data every tick | P2 (Done) |
| [016](016-dropped-item-despawn.md) | Dropped item despawn and cap | P2 (Hard limit done; despawn deferred) |
| [017](017-remove-primary-session-facade.md) | Remove single-player facade from MiningGameEngine | P2 (Done) |
| [018](018-world-context-and-spawn-drop.md) | MiningWorldContext and single spawnDrop API | P2 (Done) |
| [019](019-hardcoded-names-and-magic-numbers.md) | Remove hard-coded item names and magic numbers | P2 (Done) |
| [020](020-typing-and-naming-debt.md) | Replace any types and fix misleading names | P3 (Done) |
| [021](021-physics-sweep-and-projectile-dedupe.md) | Swept movement and single projectile collision model | P3 (Done) |
| [022](022-projectile-mob-hitbox.md) | Projectile vs mob uses real collider and swept test | P3 (Done) |
| [023](023-mob-collisions-and-attack-windup.md) | Mob/player/mob-mob collision and attack wind-up | P3 (Done) |
| [024](024-pathfinding-performance.md) | Pathfinding performance and staggering | P3 (Done) |
| [025](025-dynamite-behavior.md) | Dynamite blast rules (damage, falloff, players, rocks) | P3 (Done) |
| [026](026-client-prediction-reconciliation.md) | Proper client prediction with input replay | P3 (Done) |
| [027](027-client-hook-options-refactor.md) | Reduce ref-passing in useMiningTicker/useMiningStateSync | P3 (Done) |
| [028](028-profiler-patch-gating.md) | Gate renderer.render monkey-patch behind debug flag | P3 (Done) |
| [029](029-definitions-from-database.md) | Load game definitions (items, mobs, blocks) from Postgres, not JSON files | P1 (Done) |
| [030](030-item-drops-audit.md) | Item drops audit: items not pickable after mass drops | P1 (Done) |
| [031](031-tick-payload-and-asset-preload.md) | Slim drop tick payloads; greedy asset + sound preload | P2 (Done) |
| [032](032-audio-overhaul.md) | Audio overhaul: one sound library, mob sound slots | P1 (Done) |
| [033](033-soft-sunlight-edges.md) | Soft sunlight edges | P2 (Done) |
| [034](034-sunlight-performance.md) | Sunlight recompute and lightmap churn | P2 (Done) |
| [035](035-session-startup-races.md) | Session startup races and flaky loading | P1 (Done) |
| [036](036-live-definition-reload.md) | Apply admin edits without restarting the server | P2 (Done) |
| [037](037-weapon-sound-wiring.md) | Weapon sound wiring (reload, gunshots) | P2 (Done) |
| [038](038-item-sound-picker.md) | Item sounds use the shared sound picker | P2 (Done) |
| [039](039-one-sound-framework.md) | One way to add and assign sounds; sounds keep their own names | P1 (Done) |
