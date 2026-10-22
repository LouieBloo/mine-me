# 044 - Character Editor (renamed viewer) with character sounds

**Priority:** P2 - **Status:** Done (2026-10-12)

## Problem
The admin has a Character Viewer (the modular rig editor for the player character) but nowhere to assign the character's sounds (hurt, jump, ...). Owner wants the viewer reused as a "Character Editor" with sound upload/assignment.

## Decisions (owner Q&A)
- Rename Character Viewer to **Character Editor** everywhere (nav label, route `/character-editor` with a redirect from `/character-viewer`, page folder `pages/CharacterEditor`, component, CSS, tests).
- Sounds are global to the player character (like the rig), not per class or per item.
- Slots: **hurt** (takes any damage), **jump**, **land** (after a fall), **death**. Defined once in a shared list in the style of `MOB_SOUND_SLOTS` (`CHARACTER_SOUND_SLOTS`) so adding a slot is a one-line change plus its trigger.
- Sounds go through the sound library only (`POST /api/admin/sounds`, category label `character` or reuse `general`); assignment by library sound id with the shared `SoundSlotPicker`. No new uploader, no entity-named files.

## Plan (new-field checklist)
1. Shared: `CHARACTER_SOUND_SLOTS`, slot type and config type (mirror `packages/shared/src/sound/MobSoundProfile.ts` and `types/sound.ts`); `npx tsc` in shared.
2. Schema: store the character sound config where the rig config lives (single global row; `soundEffects` Json of slot -> `{ soundId }`). `npx prisma db push` then `generate`; no `--force-reset`, no `db seed`.
3. Server: loader resolves slot sound ids to URLs at start and reloads after admin save (ticket 036 mechanism); admin GET/PATCH endpoints with validation and error handling; send the resolved URLs once with the player/session description, not every tick.
4. Admin: rename page; add a "Sounds" panel to the editor using `SoundSlotPicker` per slot; surface errors; shared loading spinner.
5. Client: trigger sounds from existing events: hurt on `player_damaged`, death on death event, jump on a grounded->airborne jump input, land on airborne->grounded (see 046 for scaling with impact speed). URLs are `/assets/...` so the preloader picks them up.
6. Tests: shared slot list, server loader/endpoints (temp `SHARED_ROOT`), admin editor + picker, client triggers (each slot fires once, no sound when unassigned). Rename updates the existing `CharacterViewer.test.tsx`.
7. Mutation-check: drop a slot trigger / break URL resolution; confirm a test fails.

## Notes
- Land should not play on tiny hops; use a minimum impact speed (shared with 046's fall minimum or its own constant in the shared sound config).

## Implementation notes
- **Rename:** `pages/CharacterViewer` is now `pages/CharacterEditor` (component, CSS, test), nav label "Character Editor", route `/character-editor`; `/character-viewer` redirects to it.
- **Shared:** generic `SoundSlotDefinition` + `normalizeSlotRefs` / `resolveSlotSounds` (`sound/soundSlots.ts`); the mob helpers now delegate to them (behavior unchanged, covered by tests). `CHARACTER_SOUND_SLOTS` (hurt, jump, land, death) with `normalizeCharacterSoundRefs` / `resolveCharacterSounds`. New `CHARACTER` sound category (shared type, Prisma enum, upload modal, Music filter, picker group label). `MiningSessionClientState.characterSounds` carries the resolved sounds once per run. (Dropping the `SpatialAudio` export from `sound/index.ts` while editing it broke the client; the client suite caught it and it is restored.)
- **Server:** `CharacterSoundConfig` table (single row `default`, `soundEffects` Json of slot -> sound id; `db push`, additive, no reset/seed). `characterSounds.service` + `GET /api/admin/character-sounds` and `PATCH /api/admin/character-sounds/:slot { soundId | null }` (unknown slot 400, bad id 400, missing sound 404). Loaded with the definitions (`GameDefinitions.characterSounds`) so it reloads after every admin save (`/character-sounds` added to the reload prefixes); sent in `buildClientState`; listed in the sound usage index as "Character (slot)".
- **Admin:** `CharacterSoundEffects` panel under the rig editor using the shared `SoundSlotPicker` (upload goes through `POST /api/admin/sounds` with category `CHARACTER`, then assigns), shared spinner while loading, error + retry, save errors surfaced by the picker.
- **Client:** `CharacterSoundPlayer` (OOP, no file names): `onDamaged(healthAfter)` plays hurt, or death on the killing blow (from `player_damaged`, so falls and rocks are covered); `observeMotion` (called each frame from `MiningPredictionSystem` after the predicted body advances) plays jump when the player leaves the ground by their own jump and land when touching down at 6+ tiles/s (`LAND_SOUND_MIN_IMPACT_SPEED`; a normal jump lands at ~8.5, small steps are quiet). Sounds are preloaded (the generic asset collector also gets `characterSounds`).
- **Tests:** shared slot/normalize/resolve (+ mob regression), server endpoints/loader/session state/reload prefix/usage/upload category, admin panel + page + modal, client player (12 cases), prediction wiring, damage-event wiring. Mutation-checked: death/hurt split, the land speed gate, the knockback guard on jump, and removing the frame observation each fail tests. All four packages pass (shared 322, server 791, admin 175, client 561) with clean typechecks.

## Not done
- The death sound plays when the killing `player_damaged` arrives; the run-end screen is not delayed to let it finish.
- Other players' sounds in multiplayer (only the local character is voiced).
