# Tickets

File-based tracker (no Jira). One markdown file per ticket: `NNN-slug.md`. Open and in-progress tickets live in this folder; a ticket moves to `done/` (and its README link gets the `done/` prefix) when it is Done. All 93 so far are archived there. Set `Status:` to Open / In Progress / Done. Every ticket gets a Q&A with the owner before work starts; answers are recorded in the ticket under "Decisions".

| ID | Title | Priority |
|----|-------|----------|
| [001](done/001-input-validation-and-tick-safety.md) | Validate client input and make the tick crash-proof | P0 (Done) |
| [002](done/002-vision-range-exploit.md) | Lock down mining_increase_vision | P0 (Done) |
| [003](done/003-persist-loot-on-timeout-and-exit.md) | Persist backpack loot on timeout and make exit failure-safe | P0 (Done) |
| [004](done/004-atomic-inventory-consumption.md) | Atomic inventory consumption for throw/place/shoot | P0 (Done) |
| [005](done/005-shoot-handler-trust.md) | Server-validate weapon, muzzle and ammo on mining_shoot | P0 (Done) |
| [006](done/006-stale-last-mob-and-player.md) | Fix empty mobs/otherPlayers not clearing on client | P1 (Done) |
| [007](done/007-mob-mining-shared-completion.md) | Route mob block mining through shared completion path | P1 (Done) |
| [008](done/008-per-weapon-ammo-state.md) | Per-weapon ammo and reload state | P1 (Done) |
| [009](done/009-player-health-and-mob-attacks.md) | Server-side player health and working mob attacks | P1 (Done) |
| [010](done/010-mob-defense-and-death-state.md) | Apply mob defense and play death animation | P1 (Death state done; defense deferred to 011) |
| [011](done/011-unified-damage-pipeline.md) | Unified damage pipeline (applyDamage / damageTile) | P1 (Done) |
| [012](done/012-separate-tool-and-weapon-stats.md) | Separate tool stats from weapon stats | P1 (Done) |
| [013](done/013-sim-time-and-game-loop.md) | Sim-time cooldowns and fixed-timestep loop | P1 (Done) |
| [014](done/014-hit-stun-lock.md) | Prevent hit-stun lock on mobs | P2 (Done) |
| [015](done/015-network-payload-static-data.md) | Stop re-sending static entity data every tick | P2 (Done) |
| [016](done/016-dropped-item-despawn.md) | Dropped item despawn and cap | P2 (Hard limit done; despawn deferred) |
| [017](done/017-remove-primary-session-facade.md) | Remove single-player facade from MiningGameEngine | P2 (Done) |
| [018](done/018-world-context-and-spawn-drop.md) | MiningWorldContext and single spawnDrop API | P2 (Done) |
| [019](done/019-hardcoded-names-and-magic-numbers.md) | Remove hard-coded item names and magic numbers | P2 (Done) |
| [020](done/020-typing-and-naming-debt.md) | Replace any types and fix misleading names | P3 (Done) |
| [021](done/021-physics-sweep-and-projectile-dedupe.md) | Swept movement and single projectile collision model | P3 (Done) |
| [022](done/022-projectile-mob-hitbox.md) | Projectile vs mob uses real collider and swept test | P3 (Done) |
| [023](done/023-mob-collisions-and-attack-windup.md) | Mob/player/mob-mob collision and attack wind-up | P3 (Done) |
| [024](done/024-pathfinding-performance.md) | Pathfinding performance and staggering | P3 (Done) |
| [025](done/025-dynamite-behavior.md) | Dynamite blast rules (damage, falloff, players, rocks) | P3 (Done) |
| [026](done/026-client-prediction-reconciliation.md) | Proper client prediction with input replay | P3 (Done) |
| [027](done/027-client-hook-options-refactor.md) | Reduce ref-passing in useMiningTicker/useMiningStateSync | P3 (Done) |
| [028](done/028-profiler-patch-gating.md) | Gate renderer.render monkey-patch behind debug flag | P3 (Done) |
| [029](done/029-definitions-from-database.md) | Load game definitions (items, mobs, blocks) from Postgres, not JSON files | P1 (Done) |
| [030](done/030-item-drops-audit.md) | Item drops audit: items not pickable after mass drops | P1 (Done) |
| [031](done/031-tick-payload-and-asset-preload.md) | Slim drop tick payloads; greedy asset + sound preload | P2 (Done) |
| [032](done/032-audio-overhaul.md) | Audio overhaul: one sound library, mob sound slots | P1 (Done) |
| [033](done/033-soft-sunlight-edges.md) | Soft sunlight edges | P2 (Done) |
| [034](done/034-sunlight-performance.md) | Sunlight recompute and lightmap churn | P2 (Done) |
| [035](done/035-session-startup-races.md) | Session startup races and flaky loading | P1 (Done) |
| [036](done/036-live-definition-reload.md) | Apply admin edits without restarting the server | P2 (Done) |
| [037](done/037-weapon-sound-wiring.md) | Weapon sound wiring (reload, gunshots) | P2 (Done) |
| [038](done/038-item-sound-picker.md) | Item sounds use the shared sound picker | P2 (Done) |
| [039](done/039-one-sound-framework.md) | One way to add and assign sounds; sounds keep their own names | P1 (Done) |
| [040](done/040-remove-mine-title-panel.md) | Remove the "Subterranean Mine" HUD panel | P3 (Done) |
| [041](done/041-hotbar-on-game-screen.md) | Move the quick access hotbar onto the mining screen (top left) | P2 (Done) |
| [042](done/042-ten-hotbar-slots.md) | Ten hotbar slots with keys 1-9 and 0 | P2 (Done) |
| [043](done/043-zoom-panel-on-scroll.md) | Camera zoom panel shows only after scrolling, then fades | P3 (Done) |
| [044](done/044-character-editor-and-sounds.md) | Character Editor (renamed viewer) with character sounds | P2 (Done) |
| [045](done/045-player-damage-floating-numbers.md) | Floating damage numbers when the player is hurt | P2 (Done) |
| [046](done/046-fall-damage.md) | Fall damage (players only), configurable in admin | P2 (Done) |
| [047](done/047-falling-rock-damage.md) | Falling rocks damage the player by impact speed | P2 (Done) |
| [048](done/048-per-use-sound-volume.md) | Per-use sound volume, relative to the global effects volume | P2 (Done) |
| [049](done/049-flame-pickaxe-held-particles.md) | Flame Pickaxe and held-item particle effects | P2 (Done) |
| [050](done/050-held-item-light-and-ember-flame.md) | Held item light (pattern for any item) and a subtler flame | P2 (Done) |
| [051](done/051-fluid-data-model.md) | Fluid data model (table, shared type, loader) | P1 (Done) |
| [052](done/052-fluid-simulation.md) | Fluid cell simulation | P1 (Done) |
| [053](done/053-oil-in-map-generation.md) | Oil pockets in map generation | P2 (Done) |
| [054](done/054-fluid-network-and-rendering.md) | Fluid wire format and client rendering | P1 (Done) |
| [055](done/055-fluid-entity-interaction.md) | Fluids affect players, mobs, drops and rocks | P2 (Done) |
| [056](done/056-flammability-and-ignition-sources.md) | Flammability fields and ignition sources | P1 (Done) |
| [057](done/057-fire-simulation.md) | Fire simulation (spreads through tiles) | P1 (Done; drawn in 061) |
| [058](done/058-burning-status-and-heat.md) | Burning status and heat damage | P1 (Done; drawn in 061) |
| [059](done/059-flammable-blocks.md) | Flammable blocks (grass, dead wood) | P3 (Done; no block flammable until set in the admin) |
| [060](done/060-admin-fluids-page.md) | Admin: Fluids page | P1 (Done) |
| [061](done/061-fire-and-fluid-effects.md) | Fire visuals and light (sounds in 062) | P2 (Done) |
| [062](done/062-fire-and-fluid-sounds.md) | Fire and fluid sounds through the sound library | P2 (Done; needs audio files) |
| [063](done/063-fluid-look.md) | Fluid look: smooth surface, waves, depth shading, streams | P2 (Done; judge the look in the game) |
| [064](done/064-torches-ignite-oil.md) | Torches light oil | P2 (Done; data applied, restart server) |
| [065](done/065-sandbox-mode.md) | Sandbox mode (90x30 test map, fluid/mob tools, free camera, reset) | P2 (Done; try it by hand) |
| [066](done/066-gas-data-model.md) | Gas data model (table, shared type, loader, hydrogen + nitrogen script) | P1 (Done; script not applied yet) |
| [067](done/067-gas-simulation.md) | Gas cell simulation (buoyancy, diffusion, venting) | P1 (Done) |
| [068](done/068-gas-in-map-generation.md) | Gas pockets in map generation | P2 (Done) |
| [069](done/069-gas-network-and-rendering.md) | Gas wire format and client rendering | P1 (Done; judge the look in the game) |
| [070](done/070-gas-explosion.md) | Explosive gases and the explosion front | P1 (Done; judge the look and damage in the game) |
| [071](done/071-admin-gases-page.md) | Admin: Gases page | P1 (Done; judge the preview by hand) |
| [072](done/072-gas-sandbox-support.md) | Gases in sandbox mode | P2 (Done; try it by hand) |
| [073](done/073-gas-effects-and-sounds.md) | Gas visuals and sounds | P2 (Done; needs audio files assigned in the admin) |
| [074](done/074-fluid-contact-damage-and-ignition.md) | Fluid contact damage, ignition and extinguishing | P1 (Done) |
| [075](done/075-fluid-light.md) | Fluid glow (always-on fluid light) | P1 (Done) |
| [076](done/076-fluid-reactions.md) | Fluid reactions (water hardens lava, 2:1) | P1 (Done) |
| [077](done/077-lavarock-block.md) | Lavarock block | P1 (Done) |
| [078](done/078-water-and-lava-fluids.md) | Water and Lava fluid rows and sandbox | P1 (Done) |
| [079](done/079-surface-pooling-generation.md) | Water pooling, deep lava, square/rectangle/vein pockets | P2 (Done) |
| [080](done/080-lavarock-sprites.md) | Lavarock art (owner task) | P3 (Done) |
| [081](done/081-discrete-fluid-simulation.md) | Discrete fluid levels and stable flow (Terraria-style) | P1 (Done) |
| [082](done/082-per-cell-fluid-geometry.md) | Per-cell fluid geometry (Minecraft-style corners) | P1 (Done) |
| [083](done/083-fluid-flow-rendering.md) | Fluid rendering: motion by animation, not moving shapes | P1 (Done; judge the look in the game) |
| [084](done/084-fluid-scenario-sandbox.md) | Fluid test scenes (repeatable audit cases) | P2 (Done) |
| [085](done/085-half-size-blocks-core.md) | Small blocks (3x): engine constants, units and rendering (phase 1) | P1 (Done in code at 3x; cleanup before merging listed in the ticket) |
| [086](done/086-half-size-blocks-data-migration.md) | Small blocks (3x): migrate DB rows and dev seed (phase 1) | P1 (Done; dev DB at 3x; seed JSON still 2x) |
| [087](done/087-step-up-for-small-ledges.md) | Auto step-up over 1-cell ledges, players and mobs (phase 1) | P1 (Done) |
| [088](done/088-half-size-blocks-world-systems.md) | Small blocks (3x): generation, fluids, fire, gas, profiling at 135x135 (phase 2) | P1 (Done) |
| [089](done/089-two-by-two-placeables.md) | Placeables take 3x3 cells: ladder, torch, bridge (phase 2) | P1 (Done) |
| [090](done/090-mob-pathing-for-tall-bodies.md) | Mob pathfinding and digging for bodies bigger than one cell (phase 2) | P1 (Done) |
| [091](done/091-pickaxe-auto-target.md) | Pickaxe auto-target: mine the next blocks along the line to the cursor, Ctrl for 1x1 | P1 (Done) |
| [092](done/092-big-rocks.md) | Rocks of several sizes (variable-size pieces) | P2 (Done) |
| [093](done/093-mob-navigation-and-feet.md) | Mob navigation fixes and mob feet on the ground (3x blocks) | P1 (Done; judge the new mole size) |
| [094](094-autotiling-from-one-texture.md) | Autotiling: edges and rounded corners from one texture | P2 (Open; design agreed) |
