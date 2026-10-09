# 028: Gate renderer.render monkey-patch behind debug flag

- **Status:** Open
- **Priority:** P3
- **Area:** client
- **Source:** Mining game audit

## Problem
`useMiningTicker` replaces `renderer.render` for profiling unconditionally, including production.

## Proposed approach
Enable only when the profiler/debug flag is on; restore cleanly.

## Acceptance
- No patching in normal play; profiler still works when enabled.

## Open questions
(to be asked before work starts)
