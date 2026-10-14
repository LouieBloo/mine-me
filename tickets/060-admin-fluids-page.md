# 060 - Admin: Fluids page

**Priority:** P1 - **Status:** Done (2026-10-13) - **Depends on:** 051

## Scope
New admin page listing fluids and editing every property from 051 and the flammability fields from 056: colour/opacity, density, viscosity, flow rate, min level, flow threshold, generation, light, particle effects, sounds (shared `SoundSlotPicker` with per-use volume). Includes a **live preview** (a small sim sandbox showing the fluid pour and settle) so tuning minLevel/flowThreshold is visible. Shared loading spinner, errors surfaced to the user, hover/cursor rules, own folder per component with tests.

## Decisions (060 Q&A 2026-10-13)
- **Order:** built after 052, so the page ships with the real live preview (the shared `FluidGrid` pouring and settling in a small canvas). No static/fake preview.
- **CRUD:** create, edit AND delete fluids. Delete asks for confirmation and is refused while anything references the fluid.
- **Flammability UI:** a reusable `FlammabilityPanel` (own folder, tests) with a "Can burn" toggle; off saves `null`. Blocks reuse it in 059.
- **Saves:** server validates with the shared `validateFluid` (400 with the messages, shown inline), then `reloadDefinitions` (ticket 036), then mirrors to `fluids.json` via `syncJson`. API: `GET/POST /api/admin/fluids`, `GET/PUT/DELETE /api/admin/fluids/:id`.

## Implementation notes
- **API** (`fluid.controller.ts`, `/api/admin/fluids`): list, get by id or key, create (201, duplicate key is 409), update (partial updates are merged and validated as the whole fluid, so they cannot leave it invalid; the key cannot change), delete. All validate with the shared `validateFluid` and answer 400 with `{ error, errors[] }`; every write mirrors to `fluids.json` and (via `/fluids` in `DEFINITION_ROUTE_PREFIXES`) reloads the running server's definitions before the response goes out. Json columns are cleared with `Prisma.JsonNull`.
- **Delete** asks first. Nothing references a fluid yet (generation lives on the fluid), so there is no "in use" refusal; add one in `deleteFluid` when something does. Mines already running keep their copy.
- **Admin:** list page (`Fluids`), editor (`FluidDetail`, creates at `/fluids/new`), `FlammabilityPanel` (reusable; blocks use it in 059), `FluidGenerationPanel`, `FluidPreview`, nav link "Fluids Editor". The form has `noValidate` and validates with the shared `validateFluid` before sending, listing every problem inline (the browser's own step checks would have blocked values like 0.35 on a 0.05 step); server messages show inline and as a toast. Shared `LoadingSpinner` everywhere, pointer cursor and hover on all buttons.
- **Live preview:** a 24x12 tank (shelf under the spout, a gate low in the wall between two chambers) running the real shared `FluidGrid` at the game's fluid rate; Pour / Open Gate / Reset, with volume, evaporated and flowing-cell counts. It draws through the shared `layoutFluidCell` (moved to shared from the client) fed by the same quantised `FluidField` the game uses, so it looks like the game. Changing a physics setting starts a fresh tank; colour and opacity change live.
- **Tests:** server routes (12), reload prefix, admin list (6), editor (17), both panels, preview scene + component (15), shared layout (5). Mutation-checked: skipping client validation, an editable key on an existing fluid, a pour that adds nothing, merging partial updates, and the reload prefix each fail a test.
