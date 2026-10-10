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
- **Sounds go through the sound library** (`Sound` rows with a category). There is ONE upload path: `POST /api/admin/sounds` (the file keeps its own name; a clash gets `-2`, never an overwrite; never name a sound or file after what it is attached to). Entities reference sounds by library sound: mobs by id (`Mob.soundEffects`, resolved to URLs at load; slots defined once in `MOB_SOUND_SLOTS`, add a slot there, then its trigger in the renderer), items and blocks by `PATCH ... { soundId }` (which stores the sound's url). Every admin screen assigns sounds with the shared `SoundSlotPicker`; don't build another uploader.
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

### Workflow
- Larger audits and features are tracked as tickets in `tickets/`. Ask scoped design questions first, record the decisions in the ticket, and don't commit unless asked.
