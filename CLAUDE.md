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
- Don't hard-code item names in logic unless absolutely necessary. Check what already exists first and use the item table instead of writing redundant functions.

### Shared code
- Anything needed by more than one app (e.g. types) goes in `packages/shared`.

### Database
- Prisma is used for the database and schema. Make all database field changes through Prisma on the server side.
- **Never use `--force-reset` on Prisma schema updates without asking first.** We must not wipe the database.

### Assets
- When creating images, follow `ART_STYLE_GUIDE.md`.
