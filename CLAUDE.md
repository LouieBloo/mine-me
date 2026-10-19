# mine-me

## Project structure

Monorepo with three apps and one shared package:

- `apps/admin`: admin app for adding/updating game content
- `apps/client`: the web-based game itself
- `apps/server`: serves both the client and admin apps
- `packages/shared`: code used by more than one app

## Rules

### React components
- Every component lives in its own folder containing the `.tsx` and a CSS file scoped to that component.
- Use Tailwind for all CSS needs, and use our color scheme where relevant.
- Every function and feature needs tests and must be written to be testable.

### Client app (Pixi)
- Use Pixi **v8** and follow its new API and standards.
- Pixi is for the 2D graphics only (animations, background images, characters, main gameplay loop).
- Build all UI (buttons, panels, anything that isn't animation or a background image) with normal HTML + CSS and DOM elements.

### Front-end behavior (admin and client)
- All buttons and clickable elements need the correct cursor and a hover state.
- All REST API and WebSocket actions need proper error handling. Surface errors to the user, especially in the admin app.
- All actions that load in the background (e.g. REST calls) use the same shared loading spinner, so the user always knows something is happening.

### Code design
- Use best programming practices: object-oriented principles with inheritance where applicable, and clean functional programming where needed.
- Design so that adding new gear, items, dungeons, etc. is easy (good game-code architecture).

### Use the existing tables and frameworks
Check what already exists before writing anything new. Don't hard-code item names, stats or URLs in logic, and don't add one-off uploads, folders or entity-specific columns.
- **Game data** (items, mobs, blocks) lives in Postgres and loads at server start (`definitionLoaders`) and reloads after every admin save (ticket 036), so admin edits apply to the next run without a restart; edits made outside the admin (scripts, Prisma Studio) still need one. `packages/shared/src/data/*.json` is only a dev seed/mirror that server tests read.
- **Stats come from the Effects table** for players, mobs and anything later, via the shared `deriveCombatStats` / `advanceSwing`. Mining Speed is the swing rate, not damage.
- **Sounds go through the sound library** (`Sound` rows with a category). There is ONE upload path: `POST /api/admin/sounds` (the file keeps its own name; a clash gets `-2`, never an overwrite; never name a sound or file after what it is attached to). Entities reference sounds by library sound: mobs by id (`Mob.soundEffects`, resolved to URLs at load; slots defined once in `MOB_SOUND_SLOTS`, add a slot there, then its trigger in the renderer), items and blocks by `PATCH ... { soundId }` (which stores the sound's url). Every admin screen assigns sounds with the shared `SoundSlotPicker`; don't build another uploader. **Volume is set per use, never on the sound:** each slot (mob, character, item, block) stores its own `volume` (0-1, default 1) next to the reference via `PATCH ... { volume }`, and the client plays it with `withVolume(volume)` so the final level is global effects slider x use volume x distance falloff. Library `Sound.volume` only applies to music (BGM). A new play site must pass the slot's volume.
- **Item particles:** `Item.particleEffectId` plays only while the item is on the ground; `heldParticleEffectId` + `heldParticleOffsetX/Y` play from the item while it is held (local and remote players), positioned in the admin hold preview. Both reference `ParticleEffect` rows; never hard-code an effect. **Held lights:** `Item.heldLightConfig` (an `ItemLightConfig` plus `offsetX/offsetY`) lights the cavern around whoever holds the item, built by the shared `createItemLight`; set it with the `ItemLightEffectConfig` panel and position it in the hold preview. Any new held visual follows the same pattern: data on `Item`, a field on the gear layer, a sprite accessor, a per-frame sync class, and an origin card + marker in `ItemHoldPreview`.
- **Fluids and fire (tickets 051-062):** fluids are `Fluid` rows (key, look, physics, `flammability`, `generation`, `soundEffects`), loaded with the other definitions. The cell simulation is the pure shared `FluidGrid` (`MiningFluidSubsystem` steps it every `FLUID_STEP_TICKS`); fire is the pure shared `FireGrid` (`MiningFireSubsystem`), fed by the ignition system. **Anything that sets things alight is data:** an item/mob with the `Ignites` effect (value = strength in %), never a hard-coded name. **What burns is data:** the shared `Flammability` shape on a fluid or a block (`ignitionChance`, `spreadChance`, `burnDuration`, `heat`, `burnsInto`, `flameEffectId`, `flameLight`); `MiningIgnitionSubsystem.flammabilityAt` is the one place that answers it. Burn/heat damage numbers and the burning-body effect live in the map config (Mine Generator page). Fluid and fire state reach clients as deltas of changed cells and only for fog-revealed cells (`takeVisibleChanges`, `visibleSnapshot`). Bodies feel fluid through `body.fluidEnvironment` (server and client prediction must both set it). Fluid sounds use `FLUID_SOUND_SLOTS` with a per-slot volume like every other sound. **Fluid levels are whole units (tickets 081-084):** a full cell is `FLUID_UNITS` (16); the public getters still speak fractions (0-1), so callers never see units. A cell's fluid is *falling* while the cell below can take more of it (`isFalling`, one flag on the wire), there is no pressure, spreading needs a 2-unit difference, and a lone 1-unit film evaporates after `FLUID_FILM_EVAPORATE_STEPS`. Anything that burns or drains fluid in small pieces goes through `drainFluid` (it keeps the remainder). Drawing is one shape per cell from the shared `FluidLayout` (corners shared with the neighbours, fluid under fluid is full height via `isFluidCovered`, falling cells are full-width columns with light streaks from `fluidFlowStreaks`); there are no streams or spills. `fluidScenes.ts` holds the named test scenes (also the admin preview's scene picker): reproduce a fluid bug as a scene first.
- **Block size (tickets 085-090):** a block is a third of the original 64px tile (`BLOCK_SCALE` = 3 in `packages/shared/src/types/mining.ts`; `MINING_TILE_PIXELS` = 21px), and the character is about three blocks tall (collider 1.9 x 2.7). Everything measured in blocks (distances, speeds, radii, depths, in code and in the database) is in these small blocks and is written as its original value times `BLOCK_SCALE`; a number that is a pixel size (item colliders, particles, hold and muzzle offsets, item and bullet sprites) stays in pixels and converts with `MINING_TILE_PIXELS`. New content follows the same rule: a light radius of 9 means 9 blocks (3 original blocks). The conversion of existing data is `apps/server/prisma/migrate-half-size-blocks.ts` (it scales the database from the scale in the `DataMigration` ledger to `BLOCK_SCALE`).
- **Multi-cell objects (tickets 089, 092):** anything bigger than a cell is a *piece*: every cell has `piece: [ox, oy]` (its place), plus `[ox, oy, w, h]` when pieces of the type come in several sizes (`pieceCells(anchor, footprint, true)`, read with `pieceFootprint`). Remove, blast and burn through `clearPieceSiblings`; never touch one cell of a piece alone. Rocks use this (`ROCK_SHAPES`, `rockMass`; damage scales with mass); a new variable-size object follows the same pattern.
- **New content or field checklist:** schema, shared type, loader, wire format, admin UI, client use, tests. Send static data once with an entity's description, not every tick. Anything to preload must be a `/assets/...` URL (the preloader finds them generically).

### Shared code
- Anything needed by more than one app (e.g. types) goes in `packages/shared`. It is consumed from `dist`: run `npx tsc` in `packages/shared` after editing it.

### Database
- Prisma is used for the database and schema. Make all database field changes through Prisma on the server side.
- Apply schema changes with `npx prisma db push` then `npx prisma generate` (there is no migrations folder).
- **Never use `--force-reset` on Prisma schema updates without asking first.** We must not wipe the database.
- **Never run `prisma db seed` on the dev DB**: it overwrites admin edits. Change data with a dry-run-by-default script (see `apps/server/prisma/migrate-sound-library.ts`) and ask before `--apply`.

### Assets
- When creating images, follow `ART_STYLE_GUIDE.md`.
- Server code that reads or writes asset files must use the helpers in `apps/server/src/config/assetPaths.ts`, never hard-coded `packages/shared/...` paths.

### Testing and tooling
- Tests must never write to real asset folders: server tests use a temp `SHARED_ROOT` (`tests/setup/assetsRoot.ts`).
- For key rules, mutation-check: break the rule, confirm a test fails, restore it.
- Typecheck client and admin with `npx tsc --noEmit -p tsconfig.app.json` (the root tsconfig checks nothing). The server uses `npx tsc --noEmit`.
- Client has `erasableSyntaxOnly`: no constructor parameter properties.
- Never print `.env` values (e.g. `DATABASE_URL`) in command output.
- **Performance:** in the mine, F3 (or `?miningProfiler=1`) opens the performance overlay: FPS, where each frame goes, scene size (display objects, lights, particles), lightmap/fluid/tick-handling costs, and the server's per-step tick cost (always measured by `MiningTickProfiler`, sent about once a second as `perf` in the state tick), with a verdict on whether the server, network, browser code or GPU is slow. "Copy report" gives JSON to paste. A new costly client phase uses `miningProfiler.timeEvent(...)`/`startSection(...)`; a new server step goes through `runStep`. `PROFILE_SANDBOX=1 npx vitest run src/services/mining/profileSandbox.perf.test.ts` (server) prints the server cost of sandbox scenes without a browser.

### Workflow
- Larger audits and features are tracked as tickets in `tickets/`. Ask scoped design questions first, record the decisions in the ticket, and don't commit unless asked.
