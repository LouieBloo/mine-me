# 048 - Per-use sound volume (relative to the global effects volume)

**Priority:** P2 - **Status:** Done (2026-10-12)

## Problem
A sound's loudness can only be set once, on the sound itself, and only some uses respect it. The owner wants to set the volume of a sound **where it is used**: the jump sound on the character can be quieter than the same sound reused on a mob, and each setting works with the client's global effects (SFX) volume slider, so everything stays relative.

## What exists today (audit)
- `Sound.volume` (library) is edited on the Music & Sounds page and set in the upload modal ("Preset Volume").
- **Mob and character slots** resolve to `{ url, volume }` from the library volume at load (`resolveSlotSounds`) and the client multiplies it into `volumeScale` (`MiningMobRenderer.playMobSound`, `CharacterSoundPlayer.play`). So a library volume is the only knob and it is shared by every use.
- **Item and block sounds store only a url** (`Item.soundEffects` slots `{ url, loop }`, legacy `Item.soundEffectUrl`, `MiningBlock.soundEffectUrl`) and the client plays them with **no volume** (`ProjectileVisualManager`, `DynamiteVisualManager`, `useMiningActions`, `useMiningTicker` weapon sound, `tickHandlers` block mining/pickup sounds, reload sound). They ignore the library volume today.
- `SoundManager.playSfx(url, { volumeScale })` already computes `master SFX x volumeScale (x spatial falloff)`, so a per-use scale slots in without changing the manager.
- Music (`type: BGM`) uses `track.volume` times the global music slider in `MusicPlayer`.

## Decisions (owner Q&A)
- **Per-use volume on every place a sound is assigned:** mob slots, character slots, item slots (throw, inGameEffect, explosion, shoot, reload, ...), the legacy item sound, and block sounds. "All sounds get this, and every place in the admin where sounds are uploaded or set has the volume on it."
- Range **0-100%, default 100%**. It only turns a sound down relative to the file's own loudness.
- **The library volume goes away for sound effects.** A sound effect's loudness is decided only by the file itself and each use's volume. (Fix a badly mastered file by re-exporting it, or lower it per use.) The Music & Sounds page stops showing/setting volume for SFX and the upload modal's volume slider only applies to music.
- **Music keeps its per-track volume**, still multiplied by the global music slider. It is not "linked to something".
- **Formula:** `final = global SFX slider x use volume x distance falloff`. For spatial sounds the use volume is just another multiplier; falloff and hearing distance are unchanged.
- **Admin UI:** a volume slider on every slot row in the shared `SoundSlotPicker` (and wherever else a sound is chosen), next to the existing preview. The preview plays at the use volume so the admin hears what the game will play (the global slider is not applied in the admin).
- **Migration:** nothing is carried over. Every existing assignment starts at 100%, including mob/character slots that used to play at their library volume (so those may get louder; the owner will re-tune).
- Sounds are still assigned by library id (mobs, character) or stored url (items, blocks); the volume is stored **next to the reference**, never on the library sound, so reusing a sound elsewhere has its own volume.

## Plan (new-field checklist)
1. **Shared:** add `volume` (0-1, default 1) to the slot reference/resolved types (`SoundSlotRefBase`, `SoundSlotResolvedBase`, `MobSoundSlotRef`, `CharacterSoundSlotRef`, `SoundEffectSlotConfig`/item slots). One helper `clampSoundVolume(v)` (invalid -> 1, clamp 0-1) used by every normalizer. `normalizeSlotRefs` keeps `volume`; `resolveSlotSounds` outputs the slot's own `volume` instead of `sound.volume`. `npx tsc` in shared.
2. **Schema:** blocks need a volume next to `soundEffectUrl` (`MiningBlock.soundEffectVolume Float @default(1)`); item slots keep it inside the existing `soundEffects` Json (`{ url, loop, volume }`) plus `Item.soundEffectVolume Float @default(1)` for the legacy single sound if that field is still in use. Mob/character slots keep it in their Json refs. `prisma db push` + `generate`, no `--force-reset`, no `db seed`.
3. **Library:** SFX `volume` stops mattering: stop sending/using it for effects (keep the column for BGM; decide in implementation whether to leave existing values untouched). Remove it from the SFX rows on the Music page and from the upload modal for SFX. `PUT /admin/sounds/:id` keeps accepting it for BGM only.
4. **Server:** PATCH endpoints for mobs, character, items and blocks accept `volume` with the sound (`{ soundId, volume }`, or `{ volume }` alone to change just the volume of an assigned sound); validation (number 0-1, else 400); the definition loaders emit the per-use volume in the resolved/wire shapes (static data sent once with the entity description, not per tick). Reload after save uses the existing mechanism (ticket 036).
5. **Admin:** `SoundSlotPicker` gets a volume slider per row (disabled until a sound is chosen), saved with the same request path as loop toggle (`SoundSlotAction` gains `kind: 'volume'`), preview audio `volume` set to the use volume, errors surfaced, shared spinner. Item, block, mob and character screens pass the volume through their `buildRequest`.
6. **Client:** every play site passes `volumeScale` from the use volume: mob and character (already do, now the use volume), weapon shot/reload, dynamite throw/fuse/explosion, thrown items, block mining and pickup, reload trigger. Prefer a small shared helper (e.g. `playUseSound(url, volume, options)`) over repeating the object in each file. Preloading unchanged.
7. **Tests:** shared normalize/resolve keeps and clamps volume (invalid, negative, >1, missing = 1) for mob, character and item slots; server PATCH + validation + loader output for each entity; admin picker slider (changes, preview volume, disabled when empty, error path), Music page/upload modal no longer set SFX volume; client: each play site passes the volume and the master slider still scales it (`SoundManager` already covered; add a test that final = master x use x spatial). Mutation-check: ignore the use volume at one play site / clamp wrong, confirm failures.

## Not in scope
- A per-use hearing-distance setting (distance model unchanged).
- Boosting above 100%.
- Per-use volume for music tracks.
- Carrying existing library volumes over (owner chose a clean 100% start).

## Notes
- Removing the library volume for SFX changes how existing mob/character sounds play (library volume x master -> use volume x master): expect some to get louder until re-tuned. Item/block sounds are unaffected (they ignored the library volume before).

## Implementation notes
- **Shared:** `volume` added to the slot refs and resolved slots (`SoundEffectSlotConfig`, `MobSoundSlotRef`, `CharacterSoundSlotRef`, item slots) plus `MiningBlockConfig.soundEffectVolume`. `clampSoundVolume` / `DEFAULT_SOUND_VOLUME` (`sound/soundSlots.ts`) is the one rule: a number clamped to 0-1, anything else = 1. `normalizeSlotRefs` keeps the volume, `resolveSlotSounds` outputs the slot's own volume and no longer reads the library sound's (its library type is now just url + isActive); `ItemSoundProfile.normalizeConfig` keeps it per item slot. `MiningGunshotEvent.soundVolume` and `MiningExplosionEvent.soundVolume` carry the volume of server-announced sounds.
- **Schema:** only `MiningBlock.soundEffectVolume Float @default(1)` (additive `db push`, no reset/seed). Mob, character and item volumes live inside their existing Json slots; the legacy single item sound keeps its volume in the `throw` slot.
- **Server:** every sound PATCH accepts `volume` (0-1, else 400 and nothing saved), alone or with `soundId`; changing the sound keeps the slot's volume; a volume for an empty slot is a 400. Mobs, character (`characterSounds.service`), items and blocks share `readVolume` (`services/soundVolume.ts`). The loaders emit the per-use volume; gunshot and explosion events send it.
- **Admin:** `SoundSlotPicker` shows a Volume slider on every slot row (disabled until a sound is chosen), saved a moment after the last move (`VOLUME_SAVE_DELAY_MS`), with the preview audio playing at that volume. Mob, character, item and block screens send `{ volume }`. The upload modal and Music page no longer set SFX volume (only music keeps the preset volume; SFX rows show "Per use").
- **Client:** `withVolume(volume, options)` (`services/sound/sfxVolume.ts`) is the one helper; every play site uses it: mob and character sounds (already scaled, now by the use volume), weapon shot (local and other players'), swing, reload, thrown item, dynamite throw/fuse/explosion, block mining. `weaponSound.ts` (`weaponSoundOf`, `throwSoundOf`) resolves a weapon's/thrown item's sound and its volume including the legacy single sound. `blockSoundsRef` now holds `{ url, volume }`. `SoundChannel` already multiplies each registered sound's scale by the slider, so moving the effects slider rescales every sound proportionally.
- **Tests:** shared normalize/resolve/clamp (mob, character, item); server endpoints and validation for mobs, character, items, blocks, loaders, session state and wire events; admin picker slider (debounce, preview volume, failure rollback, unmount) and each screen's request; Music page and upload modal; client `withVolume`, `weaponSound`, each play site (including that the other existing sound tests now expect the volume option), `SoundManager` (effects volume x use volume) and `SoundChannel` (slider rescales proportionally). Mutation-checked: using the library volume again, a mob PATCH dropping the volume, the block sound without `withVolume`, the picker sending percent instead of 0-1, and the explosion without its volume each fail tests. Shared 330 / server 826 / admin 190 / client 585 tests pass; all typechecks clean.
- Two old assertions of the form `not.toHaveBeenCalledWith(url)` became vacuous once calls carry an options argument; they now check the played urls directly.
- The admin `CharacterEditor` page test was timing out under a parallel full run (the rig tests take ~2s alone against the 5s default); those two tests now have a 20s timeout.

## Not done / follow-ups
- Existing library SFX `volume` values stay in the database untouched (nothing reads them any more for effects). They could be cleared later with a dry-run script if wanted.
- Mob and character sounds that used to play quieter through their library volume now start at 100% and need re-tuning in the admin (as agreed).
