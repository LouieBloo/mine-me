# 039 - One way to add and assign sounds; sounds keep their own names

**Priority:** P1 - **Status:** Done (2026-10-10)

## Audit findings
- Four separate upload paths (library, item, block, mob), each with its own multer storage and file naming: library `name-<timestamp>-<rand>.mp3`, items `{itemId}_{slot}_sfx`, blocks `{typeKey}_sfx`, mobs `{mobId}_{slot}`. Files are named after what they were first attached to, and library rows were named `"{entity} - {slot}"`, so a reusable sound shows up as e.g. "Dynamite - throw" or `cmtz702uk0001nu7bn2tidnx0 explosion sfx`.
- Same-name uploads overwrite the file in place, so a sound shared by several entities changes under all of them.
- Blocks still used the old upload-only component; items/mobs use the shared picker (ticket 038).
- Tests: `definitionLoaders.test` created a temp folder per run and never removed it (116 `defs-*` folders were sitting in /tmp). Tests do not write to the dev database, the assets folder or the data JSON (verified by snapshotting all three around a full run of every suite).

## Decisions (owner direction + defaults)
- **One upload path:** `POST /api/admin/sounds` is the only way a sound enters the system. Every other screen (item, block, mob) uploads through it and then assigns the resulting library sound by id (`PATCH ... { soundId }`). The per-entity upload/remove endpoints are removed.
- **Sounds keep their name:** the library name is the file's own name (without extension, verbatim); the file on disk keeps that name too (made filesystem/URL-safe: spaces and odd characters become `_`, case kept). A clash gets `-2`, `-3`... instead of overwriting. No entity or slot name is ever put in a file or sound name. Everything is stored flat in `assets/sounds/`; the category (item/block/mob/general) is only a label used for filtering.
- Existing sounds are not renamed by this change (their urls are referenced by items/mobs). Their display names can be edited on the Music & Sounds page; ID-named ones are listed in the hand-over for an optional rename.
- Block sound uses the same picker (one slot) via `PATCH /blocks/:id/sound-effect { soundId }`.

## Plan
1. Server: unique, name-preserving file naming (`soundLibrary.service`); library upload uses it; remove item/block/mob upload + remove endpoints and their multer configs; add block `soundId` PATCH.
2. Admin: `SoundSlotPicker` uploads via the library endpoint then assigns; block page uses it; music upload modal keeps the file's name verbatim.
3. Tests: new/updated for all of the above; stop the temp-folder leak and remove the leaked folders.
4. Mutation-check the key rules (no overwrite, name kept, one upload path).

## Implementation notes
- `soundLibrary.service`: `uniqueSoundFileName` (url-safe, case kept, `-2`/`-3` on a clash, never overwrites) and `soundNameFromFile` (verbatim, no extension). Sync and the backfill name rows the same way. `tryRegister/unregisterSoundFile` are gone.
- `POST /api/admin/sounds` is the only upload. The item, block and mob upload endpoints, the item/block remove endpoints and all their multer configs are removed (they now 404). Assignment is `PATCH { soundId | null }` on items (per slot), blocks (`/blocks/:id/sound-effect`, new) and mobs. Clearing never deletes a file.
- Admin: `SoundSlotPicker` uploads to the library (category label from where it was uploaded) then assigns the new sound; `BlockSoundEffectUpload` is now the same picker with one slot; the Music upload modal pre-fills the name with the file's own name unchanged.
- Tests: server (naming/clash/no-overwrite, block PATCH, removed endpoints 404, item/mob updates), admin (every picker uses the library upload, no `name`/slot sent, error handling). Mutation-checked: no-overwrite loop, name-from-file, category, name tied to slot.
- `definitionLoaders.test` created a temp folder on import and never removed it (118 `defs-*` folders had piled up in /tmp): now `beforeAll`/`afterAll`, folders removed. Verified by snapshot: a full run of all four suites leaves the sound rows, the assets folder, the data JSON and /tmp unchanged.
- CLAUDE.md sound rule updated to describe the single path.

## Not done
- Existing library rows keep their current names (ID-based ones like `cmtz702uk0001nu7bn2tidnx0 explosion sfx`, and `Mole Person - death` style ones made by the old per-entity uploads). Rename them on the Music & Sounds page, or ask for a dry-run rename script.
- Existing files stay in their old folders (`items/`, `blocks/`, `mobs/...`); only new uploads go flat into `assets/sounds/`.
