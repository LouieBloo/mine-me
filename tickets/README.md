# Tickets

File-based tracker (no Jira). One markdown file per ticket: `NNN-slug.md`. Open and in-progress tickets live in this folder; a ticket moves to `done/` (and its README link gets the `done/` prefix) when it is Done. All 143 so far are archived there. Set `Status:` to Open / In Progress / Done. Every ticket gets a Q&A with the owner before work starts; answers are recorded in the ticket under "Decisions".

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
| [094](done/094-autotiling-from-one-texture.md) | Autotiling: edges and rounded corners from one texture | P2 (Done) |
| [095](done/095-biome-data-model.md) | Biome data model and loader | P1 (Done) |
| [096](done/096-biome-generation.md) | Biome map generation and blended borders | P1 (Done) |
| [097](done/097-biome-network-and-ambient-look.md) | Biome wire format and ambient look | P2 (Done) |
| [098](done/098-admin-biomes-page.md) | Admin: Biomes page | P1 (Done) |
| [099](done/099-doodad-data-model.md) | Doodad data model, loader and admin page | P1 (Done) |
| [100](done/100-doodad-generation.md) | Doodad generation | P1 (Done) |
| [101](done/101-doodad-network.md) | Doodad wire format and fog reveal | P1 (Done) |
| [102](done/102-doodad-rendering.md) | Doodad rendering (static, layered, lit) | P1 (Done) |
| [103](done/103-doodad-animation-and-effects.md) | Doodad motion, light, particles and sound | P1 (Done) |
| [104](done/104-doodad-body-reaction.md) | Doodad reactions to bodies (wiggle) | P2 (Done) |
| [105](done/105-doodad-removal-on-mining.md) | Doodads disappear when their anchor is removed | P1 (Done) |
| [106](done/106-doodad-wandering-bugs.md) | Wandering doodads (bugs) | P3 (Done) |
| [107](done/107-doodad-preview-and-sandbox.md) | Doodad admin preview and sandbox placement | P2 (Done) |
| [108](done/108-mission-data-model.md) | Mission data model, objective registry and loader | P1 (Done) |
| [109](done/109-objective-tracking.md) | Objective tracking engine | P1 (Done) |
| [110](done/110-mission-map-generation.md) | Map generation guarantees the mission is achievable | P1 (Done) |
| [111](done/111-mission-offer-and-picker.md) | Mission offers and the pre-run picker | P1 (Done) |
| [112](done/112-mission-network-and-hud.md) | Mission wire format, HUD tracker and completion toast | P1 (Done) |
| [113](done/113-mission-completion-rewards-and-results.md) | Mission completion, rewards, failure and results screen | P1 (Done) |
| [114](done/114-admin-missions-page.md) | Admin: Missions page | P1 (Done) |
| [115](115-pump-fluid-objective.md) | Pump-out-a-fluid objective (future) | P3 (Open) |
| [116](done/116-mission-sandbox-and-scenes.md) | Missions in sandbox mode and test scenes | P2 (Done) |
| [117](done/117-item-weight-and-backpack-capacity.md) | Item weight and backpack carry capacity | P1 (Done; limit enforced in 118) |
| [118](done/118-full-backpack-pickup-rules.md) | Full backpack: pickup refusal and feedback | P1 (Done; "full" marker on drops deferred) |
| [119](done/119-extractor-data-model.md) | Extractor data model and loader | P1 (Done) |
| [120](done/120-extractor-entity-and-landing.md) | Extractor entity, landing intro and placement | P1 (Done) |
| [121](done/121-extractor-stash-and-surface-deposit.md) | Extractor stash, surface deposit and persistence | P1 (Done) |
| [122](done/122-conveyor-belt-build.md) | Conveyor belt: digging down and laying segments | P1 (Done) |
| [123](done/123-conveyor-unloading-and-item-travel.md) | Conveyor unloading and item travel | P1 (Done) |
| [124](done/124-belt-and-extractor-damage.md) | Belt damage: mobs and fire | P2 (Done) |
| [125](done/125-extractor-exit-and-mission-integration.md) | Exit, death and mission integration | P1 (Done) |
| [126](done/126-admin-extractors-page.md) | Admin: Extractors page and item weight field | P2 (Done) |
| [127](done/127-extractor-sandbox-and-profiling.md) | Extractor in sandbox mode, test scenes and profiling | P2 (Done) |
| [128](done/128-extractor-and-belt-art.md) | Extractor and conveyor belt art (owner task, Gemini) | P2 (Done) |
| [129](done/129-surface-environment-data-model.md) | Surface environment data model and loader | P2 (Done) |
| [130](done/130-sky-and-parallax-rendering.md) | Procedural sky and parallax scenery | P2 (Done) |
| [131](done/131-cloud-rendering.md) | Clouds | P2 (Done) |
| [132](done/132-weather-state-and-sync.md) | Weather state and sync | P2 (Done) |
| [133](done/133-precipitation-and-wind-effects.md) | Rain, snow, fog and wind effects | P2 (Done) |
| [134](done/134-lightning-thunder-and-weather-lighting.md) | Lightning, thunder and weather lighting | P2 (Done) |
| [135](done/135-surface-props-as-doodads.md) | Surface props via doodads (trees, bushes, birds) | P2 (Done) |
| [136](done/136-admin-environments-page.md) | Admin: Environments (and weather) page | P2 (Done) |
| [137](137-surface-art-gemini.md) | Surface background art (owner task, Gemini) | P2 (Open; first art set uploaded, better assets wanted; briefs in gemini_tasks) |
| [138](done/138-surface-sandbox-and-profiling.md) | Surface in sandbox mode, test scenes and profiling | P3 (Done) |
| [139](done/139-surface-sky-rows-in-real-mine.md) | Sky rows above the ground in the real mine | P1 (Done; exit sign waits for doodads; found in audit, blocks 120, 130, 135) |
| [140](done/140-basic-terrain-blocks.md) | Basic terrain blocks: stone, clay, sandstone, gravel, ice, bedrock | P2 (Done) |
| [141](done/141-retire-blocks.md) | Retire the Bridge, Chest, Mineral and Entrance blocks | P2 (Done) |
| [142](done/142-first-biomes-and-sandbox-bands.md) | First biomes and the sandbox biome walk | P2 (Done) |
| [143](done/143-doodad-damage-and-falling.md) | Doodads can be hurt and killed; ceiling doodads fall like rocks | P2 (Done) |
| [145](done/145-biome-dirt-oil-and-doodad-size-tuning.md) | Biome dirt, oil and doodad size tuning | P2 (Done) |
| [146](done/146-doodad-groups.md) | Doodads that spawn in groups, clumps and meadows | P2 (Done) |
| [144](done/144-singleplayer-biome-picker.md) | Choose biomes for a Single Player run | P2 (Done) |

## Suggested build order (open tickets 095-139)

IDs stay as they are (tickets reference each other by number); this is the order to build them in. Extractor first, because it changes the exit and loot path that mission rewards (113) build on.

| Step | Tickets | What |
|------|---------|------|
| 1 | 117, 118 | Item weight, backpack capacity, full-pack pickup rules |
| 2 | 139, 119, 120, 121 | Sky rows above the ground (139) first, then extractor data model, landing, stash and surface deposit |
| 3 | 122, 123 | Conveyor belt: digging down, unloading and item travel |
| 4 | 108, 109, 110, 111, 112, 114 | Missions: data model, tracking, generation guarantees, picker, HUD, admin |
| 5 | 113, 125 | Mission completion and rewards, then exit/death/mission integration |
| 6 | 124, 126, 127, 116 | Belt damage, extractor admin page, sandbox scenes (extractor and missions) |
| 7 | 095, 096, 097, 098 | Biomes: data model, generation, ambient look, admin |
| 8 | ~~099-107~~ | Doodads, done: data, generation, wire, rendering, motion/effects, reactions, removal, bugs, preview |
| Any time | 128 | Extractor and belt art (owner task, Gemini); start before step 2 finishes |
| 9 | 129, 130, 131, 132, 133, 134, 136, 138 | Surface background: environment data, sky/parallax, clouds, weather state, precipitation, lightning, admin, sandbox |
| 10 | 135 | Surface props (needs doodads, step 8) |
| Any time | 137 | Surface art (Gemini); start with the first environment |
| Later | 115 | Pump-out objective (needs pumps) |

Biomes and doodads (steps 7-8) touch neither the exit nor the loot rules, so they can be pulled forward whenever a visible win is wanted.
