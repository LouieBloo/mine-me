# 114 - Admin: Missions page

**Priority:** P1 - **Status:** Open - **Depends on:** 108

## Proposed design
- New admin page like Fluids/Gases: list, create, edit, delete missions.
- Form: name/description, level range, tier, weight, an objectives editor (add/remove rows; per row a type dropdown from the registry, a target picker that lists the right table for the type (items, mobs, fluids, gases), an amount), rewards (coins, XP, drop table picker reusing the existing drop table UI), requirements.
- Shows the implied map requirements (110) as a read-only summary so the owner sees what the generator will guarantee.
- A "simulate offers" tool: pick a level and see which missions would be offered and how often.
- Standard rules: hover states, pointer cursors, errors surfaced, shared loading spinner, a save triggers the definition reload (ticket 036).
- `GET/POST/PATCH/DELETE /api/admin/missions` with validation through the registry (108): unknown targets, amounts <= 0, min level > max level, empty objective list.

## Tests
Route validation and reload; form tests including the per-type target pickers; error display.
