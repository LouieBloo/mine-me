# 065 - Sandbox mode

**Priority:** P2 - **Status:** Done (2026-10-14); not yet tried by hand in a browser - judge the feel in the game - **Depends on:** 052, 054, 055 (fluids), existing mining engine

## Problem
There is no quick way to test mining features (blocks, fluids, mobs, items, fire) without playing a whole run. We want a **sandbox**: a small, fully visible, hand-built map with tools to drop fluids, spawn mobs, pan the camera and reset, reachable from the expedition picker, and multiplayer-capable. It must not clutter the main game loop and must not duplicate engine code.

## Requirements (owner)
1. 30x30 grid of dirt, every block type, and rocks.
2. The logged-in character with their normal inventory and quick slots.
3. Free-camera mode: pan without moving the character.
4. Full vision (no fog).
5. A couple of dummy mobs on the surface.
6. Fluid-drop mode: click to pour a chosen fluid (oil or any other).
7. A walled-in pool of fluids to jump into, etc.
8. Spawn any mob (picker) to test mobs.
9. Reset button back to defaults.
10. A new option in the expedition modal (next to single/multiplayer).
11. Can be multiplayer like a normal game.

## Decisions (065 Q&A 2026-10-14)
- **Architecture (owner):** the same `MiningGameEngine` with a new `gameMode: 'sandbox'`. No second engine, no subclass. The mode selects a map builder and a few rule switches; the tick loop, subsystems, prediction and renderers are the real ones, so the sandbox tests exactly what ships.
- **Grid size (owner):** make grid size a **per-world value** (`MiningWorld` / physics world / pathfinder / raycast take width and height) instead of reading `MINING_CONFIG.GRID_WIDTH/HEIGHT` (about 56 reads across shared physics, pathfinding, raycast, server and client). Done as step 1 and may be split into its own ticket if large. The normal game keeps its current size.
- **Free camera (owner):** a toggle (button + hotkey). While on, the character gets no movement/mining input and the camera pans with WASD/arrows or middle-mouse drag; toggling off returns to following the character.
- **Full vision (owner):** server-side. The sandbox grid is generated fully `revealed`, so tiles, fluid and fire deltas (which are only sent for revealed cells) flow through the normal wire format with no client special case.
- **Rooms and tools (owner):** one shared, well-known sandbox room (like the default multiplayer lobby). Anyone in it can use every tool, including Reset. No admin gating. No solo/multi choice: the sandbox card enters the shared room (solo just means being the only one there).
- **Access (owner):** a third card, "Sandbox", in `ExpeditionModeModal`, shown to everyone.
- **Inventory (owner):** real loadout and hotbar (`buildMiningLoadout`), but persistence-safe: nothing mined, placed, thrown or lost writes back to the real character, and no death penalty or loot loss. Reset restores the loadout.
- **Test controls (owner, 2026-10-14):** the sandbox panel also has god mode (no damage), a simulation control (pause / single-step / speed, mainly for fluids), "clear fluid and fire", and "light fire here" (ignites the clicked cell). Giving items is not built here: the admin app already does it.
- **Size and layout (owner, 2026-10-14):** the sandbox is **90 x 30** (wider than first planned), and the two fluid pools sit **on the surface** (open to the sky, walls of mixed blocks) so you can jump straight in. Fluids in the pools are the first two loaded fluids in key order; two surface dummies.
- **Layout (owner):** fixed, hand-authored, declarative layout (data-driven so adding a zone is a one-entry change). Reset rebuilds it exactly.

## Proposed design
**Shared / server**
- `GameMode = 'singleplayer' | 'multiplayer' | 'sandbox'` in `packages/shared`, used by the socket payload, `MiningSessionManager`, `MiningGameEngine`.
- A `MiningMapSource` seam: `generateMiningMapWithFluids` stays the default; `SandboxMapBuilder` builds from a `SandboxLayout` (list of zones: `fill`, `blockRow` (one of every `MiningTileType`/block definition, from the loaded definitions, never hard-coded names), `fluidPool` (walls + fluid key + level), `surface`/spawn, `mobs`). Fully revealed. Block list comes from `MiningDataManager`, so new blocks appear automatically.
- Engine rules by mode via a small `GameModeRules` object (not `if (sandbox)` scattered): no session timeout, no random cavern mobs, no run-end/loot-loss on death (respawn at spawn), no persistence writes, do not close when empty (or close on empty with the usual cleanup).
- Sandbox command channel (new socket events, one handler file, each validated and only accepted when the player's room is a sandbox): `sandbox_pour_fluid {x, y, fluidKey}` (uses `MiningFluidSubsystem.placeFluid`), `sandbox_spawn_mob {mobId, x, y}` (uses `MiningMobSubsystem.spawnMob`), `sandbox_reset`. Reset rebuilds the grid and clears mobs/drops/rocks/projectiles/fluid/fire, and re-sends a full state to everyone in the room.
- **Grid size on the wire:** the session state sent to the client carries the grid width and height; the client's local simulation, debug renderer and scene setup use it instead of the global constants. The normal game sends its usual size, so nothing changes there.
- Extra sandbox commands (same handler file and validation): `sandbox_set_god_mode {enabled}`, `sandbox_set_sim {paused|step|speed}` (the engine tick loop honours a pause and a speed multiplier in sandbox rooms only), `sandbox_clear_hazards` (clears fluid and fire), `sandbox_ignite {x, y}` (uses the ignition/fire subsystems, no hard-coded sources).
- Lists for the pickers (fluids, mobs) come from the already loaded definitions.

**Client**
- `SandboxPanel` (HTML/CSS, own folder, Tailwind): tabs/sections for Fluid (picker + toggle "pour on click"), Mob (picker + toggle "spawn on click"), Camera (free-camera toggle), Reset. Only mounted when the session mode is `sandbox`. Shared loading spinner for any async call; errors surfaced as toasts.
- `useMiningInput` / mouse controller gets a tool-mode concept (`mine` | `pourFluid` | `spawnMob`) so the sandbox plugs in a mode rather than forking input handling. `Camera2D` gets a detachable follow target for free camera.
- Pixi stays for graphics only; all controls are DOM.

## Implementation steps
1. Per-world grid size (shared physics, pathfinding, raycast, server, client); existing tests keep passing; mutation-check that a non-default size is honoured.
2. `GameMode` type + `GameModeRules`; session manager routes `sandbox` to the shared room.
3. `SandboxLayout` + `SandboxMapBuilder` (30x30, all blocks, rocks, fluid pool, 2 surface dummies, fully revealed).
4. Persistence-safe loadout and no-run-end rules for the sandbox.
5. Sandbox command handlers (pour, spawn, reset, god mode, sim control, clear hazards, ignite) with validation and error replies.
6. Expedition modal third card + `mining_start` payload `mode: 'sandbox'`.
7. Client tool modes, `SandboxPanel` (incl. test controls), free camera, grid size from session state.
8. Tests and mutation checks for each rule (below). Typecheck client/admin with `-p tsconfig.app.json`, server with `npx tsc --noEmit`, rebuild `packages/shared`.

## Defaults taken (owner is not worried about multiplayer edge cases for now)
Same character in two tabs, Reset while other players are connected, and sandbox mob AI all use the engine's existing behaviour; no special handling in this ticket. Sandbox sounds/preload use the generic preloader.

## Open points to confirm while building
- Where in the 30x30 each zone goes (will propose a layout in step 3 and show it before wiring).
- Whether Reset keeps connected players where they stand or respawns them at the sandbox spawn (default: respawn at spawn).
- Fluid pour: single cell per click vs hold-to-pour (default: hold-to-pour at a fixed rate, one cell per step).

## Tests / mutation checks (planned)
- Per-world size: physics, raycast and pathfinder honour a 30x30 world.
- Sandbox builder: every block definition appears once, grid fully revealed, pool is enclosed, two dummies on the surface.
- Rules: sandbox has no timeout / run-end / persistence writes; normal modes unchanged.
- Commands: rejected outside a sandbox room, rejected with unknown fluid/mob or out-of-bounds cell; reset restores the exact layout.
- Test controls: god mode blocks damage, pause/step/speed affect only sandbox rooms, clear removes all fluid and fire, ignite uses the data-driven ignition path.
- Grid size from session state reaches the client's local simulation.
- Client: modal card, panel modes, free-camera detaches and re-attaches, error surfacing.

## Implementation notes
### Step 1 - per-world grid size (done)
- A world's size is now the size of its grid: new shared `getGridDimensions(grid)` (`physics/gridDimensions.ts`; falls back to the default mine size for an empty or non-array grid). Physics bodies (ground, fall, collision, ladder), `raycastSolidTiles` and `MiningPathfinder` use it instead of `MINING_CONFIG.GRID_WIDTH/HEIGHT`. `MiningRigidWorld` already took a size.
- Server: `isInBounds(x, y, grid)` now takes the grid (all 15 callers updated); `resolveGravity`, projectile bounds, cavern mob spawn search and the fog reveal clamp use the grid's size.
- Client: scene background, fluid renderer, lighting engine, debug renderer and local simulation use the grid's size. Since the client already receives the full grid, no extra wire field was needed (the "grid size on the wire" decision is met by the grid itself).
- `MINING_CONFIG.GRID_WIDTH/HEIGHT` remain only as the default mine size.
- **Tests:** `gridDimensions.test.ts` (helper, body wall, ray wall, pathfinder on a 10x10 world), `MiningGameEngine.gridSize.test.ts` (30x30 engine), `isInBounds` per-grid case. Mutation-checked: reverting the body wall to the global width fails a test.
- Shared 544, client 701 pass. Server: all pass except 3 in `MiningGameEngine.fallDamage.test.ts`, which also fail on the untouched baseline (checked with the changes stashed); not caused by this work.

### Step 2 - game mode and rules (done)
- Shared `MiningGameMode = 'singleplayer' | 'multiplayer' | 'sandbox'` replaces the three inline unions (session state, `mining_start` payload).
- Server `gameModeRules.ts`: one `GameModeRules` entry per mode (`sharedRoomId`, `timeLimited`, `persistsCharacter`, `endsRunOnDeath`, `restartsOnEntry`), `roomIdFor`, `isMiningGameMode` (the start handler rejects unknown modes). The engine exposes `engine.rules`; no code tests the mode by name.
- Sandbox = shared room `sandbox_shared`, untimed, nothing saved, death respawns at the entrance with full health (`MiningPlayerManager.respawnPlayer`). Normal modes behave as before.
- Not saved in the sandbox: loot and health on leave/abandon/room cleanup (`MiningSessionManager`), the app health bar (no `onPlayerHealthChanged`, no health broadcast on start), and torch/ladder/throwable spending (handlers use `inventoryActionsFor(engine.rules.persistsCharacter)`; items are still required to be owned, just not spent).
- Entering the sandbox while in a real run abandons that run, exactly like switching between single and multiplayer does today (default; not changed).
- **Tests:** `gameModeRules.test.ts`, `MiningSessionManager.sandbox.test.ts` (shared room, untimed, no save on leave/abandon, health bar untouched, respawn), `inventoryActionsFor` tests. Mutation-checked: the health-bar wiring, the endSession save guard, the time limit and the death rule each fail a test when broken.

### Step 3 - sandbox map (done)
- `services/mining/sandbox/SandboxLayout.ts`: declarative layout (`fill`, `tiles`, `blockRow`, `pool` zones painted in order, plus mob spawns) and `createDefaultSandboxLayout(blockTiles)`. `SandboxMapBuilder.ts` builds it fully revealed and throws on a zone outside the map.
- Default 90 x 30 map: surface spawn at x 22, dummies at x 17.5 and 27.5, a ladder shaft (x 13) into a long open hall (rows 12-15) with one of every block on its floor (`BLOCK_TILE_TYPES`, so a new block type appears by itself) and a rock tower, an ore/chest bed below, and two surface pools side by side (x 32-43 and 45-56, sharing a wall) filled one tile below the lip with fluid slots 0 and 1 (walls include rock, copperium, silverium, mineral).
- `mapSources.ts` `buildMapForMode` is the seam: sandbox -> builder, other modes -> the generator. The engine takes its physics size from the built grid and, when the map lists mobs, spawns exactly those (otherwise the usual cavern mobs + surface dummy).
- **Tests:** `SandboxMapBuilder.test.ts` (size, fully revealed, every block once, pools open at the surface and sealed, dry pool without a fluid, dummies, ladder, zone order, out-of-bounds rejected), `MiningGameEngine.sandbox.test.ts` (engine on the map: size, mobs, fluid simulated and shown, walking, pools do not spill, generated modes unchanged). Mutation-checked: revealing tiles, and the pool rectangle (unsealing a pool) each fail a test.

### Step 5 - sandbox commands (server done)
- Shared: `SandboxPourFluid/SpawnMob/Reset/SetGodMode/SetSim/ClearHazards/Ignite` payloads (`sandbox_*` game events), `SandboxClientInfo` (mob picker options + `SandboxStatus`) on the session state, `SANDBOX_SIM_SPEEDS` (0.25, 0.5, 1, 2, 4).
- `engine.sandbox` (`SandboxTools`) exists only when the mode rules say `hasSandboxTools`; every command lives there, validates its (client-supplied) input and works through the real subsystems: pour = `fluidSubsystem.placeFluid`, spawn = `mobSubsystem.spawnMob` (refused inside a block or off the map), ignite = the fire grid's own flammability rules, clear = drain every fluid cell + extinguish all fire.
- `sandboxHandlers.ts` refuses every command outside a sandbox room; registered in `gameEvents.ts` as `sandbox_*`.
- **Simulation control** pauses/steps/speeds the **fluid and fire** simulation only (`WorldSimClock`), not the whole room, so you can freeze a flow and still walk around it. Normal rooms keep the old "every Nth tick" path untouched. Fluid/Fire subsystems gained a public `step()`.
- **God mode** is per player (`session.godMode`, checked in `damagePlayer`, so fall, fire, rock and mob damage all respect it).
- **Reset:** the engine now builds its world in `rebuildWorld()` (grid, physics world, every subsystem, fluid, mobs) from the constructor and again from `resetWorld()`; players are kept and sent to the entrance with full health, an empty backpack and a clean entity memory (`resetForNewWorld`). `MiningSessionManager.resetSandbox` then emits `mining_sandbox_reset { sessionState }` to everyone in the room. Reset also clears pause/speed. Magazines/reloads reset with the world.
- **Tests:** `WorldSimClock.test.ts`, `SandboxTools.test.ts` (pour, spawn, god mode, pause/step/speed, clear, ignite, reset), `sandboxHandlers.test.ts` (refused outside the sandbox, reset reaches every player). Mutation-checked: ignoring pause, ignoring god mode, and a reset that keeps the old world each fail tests.
- Server suite: all pass except the 3 pre-existing `fallDamage` failures.

### Steps 6-7 - client (done)
- **Entry:** a third "Sandbox" card in `ExpeditionModeModal` (`MiningGameMode` on `onSelectMode`). Entering from `MineView` sends `mining_start { mode: 'sandbox', forceNew: false }`. In the sandbox there is no "Leave Mine?" prompt at the spawn and no loot summary on leaving (nothing is saved).
- **Tools plug into the existing mouse-action system**, not a fork of the input code: `input/SandboxActions.ts` has `PourFluidAction` (hold to pour, any open tile), `SpawnMobAction` (exact point, sky allowed), `IgniteAction`, and `FreeCameraAction` (swallows clicks). `useSandboxMouseAction` turns the panel's selection into one of these and `useMiningActions` takes it as `overrideAction` (it wins over torch/ladder/throwable/weapon actions; `null` means the equipped item decides, as before).
- **Free camera:** `systems/FreeCamera.ts` (WASD/arrows pan, drag pans, clamped to the map, same screen speed at any zoom). The ticker looks where it says while it is on; `useMiningInput` sends movement/jump keys to it instead of the character; `useSandboxFreeCamera` stops a character that was walking/mining and drags with the mouse. Toggling off snaps back to the player.
- **Panel:** `components/SandboxPanel` (HTML + Tailwind, collapsible, hover/cursor states, shared `LoadingSpinner` while a command runs): tool buttons (Normal, Pour fluid + fluid picker, Spawn mob + mob picker, Light fire), free camera, pause/resume/step/speed, clear fluid and fire, god mode, Reset, Leave. `hooks/useSandboxController` holds the state and sends the commands; refusals and network errors are shown through `notificationService`.
- **Reset:** the server's `mining_sandbox_reset { sessionState }` rebuilds the view (new `MiningGrid` key) and puts the tool/camera/settings back. The controller resets on the `sandbox` info object, not on every session update, so backpack/vision updates do not undo the chosen tool (a bug caught by a test).
- **Tests:** FreeCamera, SandboxActions, `useSandboxClient` (mouse action selection, command errors, camera detach/drag), `useSandboxController`, `SandboxPanel`, ticker camera, input suppression, `useMiningActions` override, modal card, and MineView lifecycle (start, panel, leave, no prompt, reset event). Mutation-checked: free-camera input suppression, ticker camera, the sandbox exit prompt skip, and the controller reset key each fail a test.
- Totals: shared 544, client 768, admin 312 all pass; server passes except the 3 pre-existing `fallDamage` failures. Client, admin and server typecheck clean.

### Not done / follow-ups
- Not exercised in a real browser yet (only unit/integration tests), so layout of the panel over the HUD, the free-camera feel and the pool look need a hands-on pass.
- Lighting is separate from fog: the cavern may still look dark despite full vision (a "full bright" toggle was suggested, not requested).
- Entering the sandbox mid-run abandons that run, as switching modes always has.
- The 3 failing `MiningGameEngine.fallDamage.test.ts` tests fail on the untouched baseline too and are unrelated.

### Follow-up (2026-10-14): pour and light anywhere, including above the map
Owner feedback: fluid and fire should spawn wherever the mouse is, even above the mine. The simulations are cell grids, and the map used to start at the ground (row 0), so there were no cells above it to hold fluid.
- **Open sky rows:** the sandbox now has `SANDBOX_SKY_ROWS` (12) rows of open sky above the ground (grid 90 x 42). Layout and mob coordinates stay relative to the ground (`y = 0` is the surface); the builder adds the sky and returns `surfaceRow`. Fluid poured in the sky falls, lands on the ground and spreads or runs into the pools.
- **Per-world spawn point:** `MiningWorld.spawnPoint` (entrance on the ground, `surfaceRow` down) replaces the global entrance for spawning and respawning. `surfaceRow` is also sent to clients on the session state (absent = 0, so normal mines are unchanged).
- **Client:** the sky/dirt background, entrance torch, ambient depth gradient and sunlight (`LightingEngine` takes a `surfaceRow`) are measured from the ground, so the sky is full daylight and the cavern keeps its depth lighting. The dirt backdrop starts at the ground.
- **Beyond the map:** pour and light tools set `clampsToGrid`, so a cursor above, beside or below the map targets the nearest edge tile (`MiningMouseController.screenToGridTileClamped`); other actions still ignore clicks off the map.
- **Limits:** a flame still needs something that burns (fluid with flammability, or a flammable block) in the cell: lighting empty air does nothing, as before. The sky is 12 tiles high; clicking higher drops fluid at the top row.
- **Tests:** builder (sky rows, offsets, surface row), engine spawn on the ground, pouring in the sky lands on the ground / falls into a pool, mouse clamping (above, beside, normal actions unaffected), lighting from the surface row. Mutation-checked: clamping, surface-row lighting and the builder's sky offset each fail a test.
- Totals: shared 544, client 778, admin 312 pass; server passes except the 3 pre-existing `fallDamage` failures (`MiningGameEngine.drops.test.ts` failed once in one full run and passed on every rerun, so it looks load-timing flaky).
