# 028: Gate renderer.render monkey-patch behind debug flag

- **Status:** Done
- **Priority:** P3
- **Area:** client
- **Source:** Mining game audit

## Problem
`useMiningTicker` replaces `renderer.render` for profiling unconditionally, including production.

## Proposed approach
Enable only when the profiler/debug flag is on; restore cleanly.

## Acceptance
- No patching in normal play; profiler still works when enabled.

## Decisions (2026-10-09)
Owner asked to keep moving; chose: profiler is off unless the debug flag is on - URL `?miningProfiler=1` or `localStorage.miningProfiler = '1'` - and can be toggled live from the console (`miningProfiler.setEnabled(true)`, exposed on `window`).

## Implementation notes
- `MiningProfiler` has an `enabled` switch with `setEnabled`/`subscribe`; the shared instance starts from `isProfilerFlagOn()`. The long-task observer is created only while enabled (and disconnected when disabled). Removed the `any` types in the file.
- The `renderer.render` wrapper moved to `utils/renderInstrumentation.ts` (`installRenderInstrumentation` returns a restore function). `useMiningTicker` installs it only while profiling is on, follows live toggles, restores on unmount, and ends the profiler frame itself when the hook is not installed (a no-op when disabled).
- Tests: flag detection (default, localStorage, URL, blocked storage), enable/disable + subscribers, the instrumentation helper, and the ticker (untouched during normal play, wrapped while on, restored on unmount, follows toggles). Mutation-checked (always installing fails the ticker tests).

