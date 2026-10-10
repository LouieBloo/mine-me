# 038 - Item sounds use the shared sound picker

**Priority:** P2 - **Status:** Done (2026-10-10)

## Audit findings
- The item detail page had its own upload-only sound UI (drop zone, Replace/Remove). It could not reuse a sound already in the library, and "Remove" deleted the file from disk (and its library row) even if another item or mob used it.
- Mobs already had the right UX (pick from the library or upload new), but it lived inside `MobSoundEffects`.

## Decisions (owner delegated; defaults chosen)
- One shared component for both: `components/SoundSlotPicker` (+ `hooks/useSoundLibrary`). `MobSoundEffects` and `ItemSoundEffectUpload` are now thin wrappers that only build their own requests.
- Items keep storing the sound **url** (+ loop) in `Item.soundEffects` / `soundEffectUrl`, not a library id: client, server, the public API, the character state and the dynamite defaults all read the url directly, so there is no schema or wire change. The picker matches a slot's url to its library row; the server turns a chosen `soundId` into the url.
- "Clear" only detaches the slot. Files are removed from the library page (which refuses while something uses them).

## Implementation notes
- Server: `PATCH /items/:id/sound-effects/:slot` now also takes `{ soundId }` (a library id, or `null` to clear). The slot's url (and the legacy `soundEffectUrl` for `throw`) follows; the loop flag is kept. Unknown id -> 404, malformed -> 400. Upload is unchanged (still registers a library row).
- Admin: `SoundSlotPicker` does select/upload/clear/preview/loop toggle, client-side audio type and 20 MB checks, "Missing sound" and "Not in library" states (an item can point at a file that was never registered; Sync fixes it). Library reloads after an upload.
- Tests: server `soundId` set/clear/legacy sync/loop kept/404/400; admin item picker (choose, url match + preview, legacy url, upload with loop, bad file, server error, unlisted file, loop toggle, load failure); the existing mob picker tests all still pass unchanged. Mutation-checked: url->library matching, audio guard, library reload after upload, legacy url sync.
- Fixed a timing-dependent `MobDetail` test (`/save/i` matched two buttons once the rig editor loaded).

## Not done / follow-ups
- (Resolved in ticket 039: the unsafe DELETE and the per-item upload were removed, uploads never overwrite, and blocks use the same picker.)
