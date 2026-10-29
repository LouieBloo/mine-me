# 114 - Admin: Missions page

**Priority:** P1 - **Status:** Built; waiting for you to try it - **Depends on:** 108

## Proposed design
- New admin page like Fluids/Gases: list, create, edit, delete missions.
- Form: name/description, level range, tier, weight, an objectives editor (add/remove rows; per row a type dropdown from the registry, a target picker that lists the right table for the type (items, mobs, fluids, gases), an amount), rewards (Sol, XP, drop table picker reusing the existing drop table UI), requirements.
- Shows the implied map requirements (110) as a read-only summary so the owner sees what the generator will guarantee.
- A "simulate offers" tool: pick a level and see which missions would be offered and how often.
- Standard rules: hover states, pointer cursors, errors surfaced, shared loading spinner, a save triggers the definition reload (ticket 036).
- `GET/POST/PATCH/DELETE /api/admin/missions` with validation through the registry (108): unknown targets, amounts <= 0, min level > max level, empty objective list.

## Tests
Route validation and reload; form tests including the per-type target pickers; error display.

## Built (2026-10-27)
- Admin pages `Missions` (list with tier, levels, goals and reward, plus the offer simulator) and `MissionDetail` (properties, `ObjectivesEditor` with a type dropdown from the registry and the right target table per type, reward Sol and XP, `RewardItemsEditor`, `MissionRequirements`, `MissionSoundEffects` through the shared `SoundSlotPicker`), a nav link, routes. Standard rules: hover states, pointer cursors, errors surfaced, the shared spinner.
- API: `GET/POST/PUT/PATCH/DELETE /api/admin/missions`, `POST /missions/preview` (problems, the written objectives and what the map will hold), `POST /missions/simulate-offers` (a level and 2000 rolls: who is offered how often), sound slot route. Validation goes through the registry; every save reloads the definitions.
- Tests: route validation (empty list, unknown target, zero amount, levels the wrong way, pumping, depth beyond the map, duplicate key), create/update/delete/mirror, preview and simulation, sound slots; the form, objectives editor (per-type pickers), reward editor, requirements summary, simulator, list and detail pages.
