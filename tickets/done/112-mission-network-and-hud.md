# 112 - Mission wire format, HUD tracker and completion toast

**Priority:** P1 - **Status:** Done (verified by the owner 2026-10-28) - **Depends on:** 109, 111

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

## Built (2026-10-27)
- **Wire:** the mission with its objectives, rewards and resolved sounds is in the session state once (a late joiner gets the current progress in the same place). Progress is a delta in the state tick only on the ticks it changes (`missionProgress`: the objectives that moved by index, plus `completed` once). `mining_mission_state` carries a whole new state (sandbox start, restart, drop).
- **HUD:** `MissionTracker` in the top-left stack of the HUD: name and tier, each objective with a bar (counts as `3 / 10`, percents as `45%`, depth as `12 / 40`), a check mark when done, foldable, and a "leave the mine safely to claim the reward" line when everything is done.
- **Completion:** `useMissionSync` folds deltas into the session (`applyMissionDelta`, pure), and announces each finished objective and the whole mission once with a toast and the mission's own library sound at the slot's own volume (`withVolume`). The failed sound plays when a run is lost.
- Tests: delta fold (only the moved objectives, once, never backwards), the hook (toast and sound once, replace/drop on a new state), tracker component (units, bars, fold, completion line), HUD, MineView integration.

## Decisions (2026-10-28, from the owner)
- Clear objectives show as counts (`12 / 40`) like items now; the percent unit stays in the view type but no objective type uses it.
