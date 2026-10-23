# 112 - Mission wire format, HUD tracker and completion toast

**Priority:** P1 - **Status:** Open - **Depends on:** 109, 111

## Decisions (2026-10-22, from the owner)
- HUD tracker with progress bars, a toast and sound on completion, plus the picker (111) and a results screen (113).

## Proposed design
- **Wire:** the mission description (name, objectives with labels and targets, rewards) is sent once at session start; progress is sent as small deltas only when it changes (not every tick). A late joiner gets the full current snapshot.
- **HUD:** a `MissionTracker` component in `MiningHUD` (own folder, Tailwind, our colors): objective list, progress bar per objective, check mark when done. Collapsible. Hover states and cursors on any control.
- **Completion:** a toast and a sound when an objective or the whole mission completes. Sound goes through the sound library: a `Sound` row with a category, assigned in admin with `SoundSlotPicker`, played with a per-use volume (`withVolume`). No new uploader.
- Percent objectives (clear gas/fluid) show a percent, depth shows current / target, items show n / N.
- Errors on the socket events are surfaced to the user.

## Tests
Wire payload sizes and delta-only updates; HUD renders each objective type and completion state; toast triggers once; late-join snapshot.
