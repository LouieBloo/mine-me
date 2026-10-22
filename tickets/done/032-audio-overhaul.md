# 032 - Audio overhaul: one sound library, mob sound slots

**Priority:** P1 - **Status:** Done approval (2026-10-09)

## Audit findings
- The Music & Sounds admin page lists only `Sound` table rows (6 in dev). Item sounds (`Item.soundEffects`), block sounds (`Block.soundEffectUrl`) and mob files in `assets/sounds/mobs/` never create a `Sound` row, so they never show.
- `Mob` has no sound column. Mob sounds come from a hard-coded `MobSoundProfileRegistry` (mole person only; dig/idle/damage) and `MiningMobRenderer` reads `defaultUrl` from it. `MobDetail` has no sound section. No attack or death slots exist.
- The stray `mine_depths-*.mp3` files were written by `tests/sound.test.ts` (real multer, no cleanup). Fixed first: `src/config/assetPaths.ts` (`SHARED_ROOT`), `tests/setup/assetsRoot.ts`, `tests/assetsIsolation.test.ts`; fake files removed.

## Decisions (owner)
- **Mob slots:** `dig`, `idle`, `damage`, `attack`, `death`. (No aggro/spawn for now.)
- **Slot link:** a slot references a `Sound` row by id; the URL is resolved when definitions load.
- **Library scope:** everything is a library row, with category filters (music, item, block, mob). Item/block/mob uploads create a row automatically; a Sync button registers files already on disk.
- **Backfill:** dry-run-by-default script listing files with no row and rows with a missing file; `--apply` only after approval. Never `db seed` the dev DB.

## Plan
1. Prisma (additive, `db push`): `Sound.category`, `Mob.soundEffects Json?` (slot -> `{ soundId, loop? }`).
2. Shared: generic mob slot list (replace hard-coded mole profile), types.
3. Server: sound controller creates rows for item/block/mob uploads; sync endpoint; mob `PATCH /mobs/:id/sound-effects/:slot`; resolve ids to urls in the mob definition loader; send to client.
4. Admin: Music page category filters, missing-file marker, preview; `MobSoundEffectUpload` (own folder, css, tests) with pick-from-library or upload; section in `MobDetail`.
5. Client: `MiningMobRenderer` reads slots from the mob definition; add attack and death triggers.
6. Backfill script (dry run) + seed the mole person's three sounds.
7. Tests for every piece; mutation-check key rules. No commits.

## Implementation notes
- **Schema (pushed to dev DB, additive):** `SoundCategory` enum, `Sound.category` (default GENERAL), `Mob.soundEffects Json?` = `{ slot: { soundId, loop? } }`.
- **Shared:** `MOB_SOUND_SLOTS` (dig, idle, damage, attack, death) replaces the hard-coded mole profile/registry; `normalizeMobSoundRefs`, `resolveMobSounds`; `Mob.soundEffects` (stored) and `Mob.sounds` (resolved, never stored); `MiningActiveMob.sounds`.
- **Server:** `definitionLoaders` resolves ids to urls at load (`attachMobSounds`; deleted/inactive sounds are silently skipped). `soundLibrary.service` (register/sync), `soundUsage.service` ("used by"). Sound API: `category` filter/field, `usedBy` on list, 409 when deleting a sound something uses, `POST /sounds/sync`. Item/block uploads register `Sound` rows (best-effort; Sync repairs). Mob: `PATCH/POST /mobs/:id/sound-effects/:slot`; mob save strips `sounds` and normalizes `soundEffects`. Definitions load at server start, so mob sound edits need a restart (same as every other definition).
- **Client loading:** the mob's resolved `sounds` ride along with its once-only description (`spawned.mobs`, kept by `EntityDefinitionCache`). The preload now also scans the join snapshot's mobs, and the asset manifest already lists every file under assets/sounds (including `mobs/`). A mob first seen later preloads its own sounds; a mob with no sounds is silent (no fallback to the old mole files).
- **Admin:** `MobSoundEffects` (pick from library / upload / clear / preview) in `MobDetail`; Music page lists every sound, category tabs with counts, "Used by" column, "Sync from disk" button; upload modal asks what an SFX is used for.
- **Data migration:** `prisma/migrate-sound-library.ts` (dry run by default; `--apply` registers files and links the mole person's dig/idle/damage by sound id). Applied 2026-10-09: 18 sounds registered, Mole Person linked; a re-run reports nothing to do.
- **Test safety:** tests write uploads to a temp `SHARED_ROOT`, never `packages/shared/assets`.

## Not done / follow-ups
- Item and block sound pickers still store urls (not library ids); could get the same pick-from-library option.
- Loop flag is stored per slot but no mob slot is loopable yet.
- ~~Mob sound edits take effect after a server restart.~~ Fixed by ticket 036 (admin saves reload the definitions live).
- The 6 files under `assets/sounds/mobs/cmn_mole_person_001/` duplicate the root mole sounds (3 of them) or are unused whooshes.
