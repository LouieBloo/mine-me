# 034 - Sunlight recompute and lightmap churn

**Priority:** P2 - **Status:** Done (2026-10-10)

## Audit findings
- `syncTileLights` calls `updateGrid` for every reveal batch, including fog-of-war reveals that never change transparency. Each one recomputes the map, rebuilds the sun art and re-renders the lightmap.
- The calculator allocates a full-grid array although only the top ~11 rows can be lit, and allocates a neighbours array + objects per BFS node.
- Any enabled non-flashlight light (even a static chest glow) marks the lightmap dirty at 20Hz.

## Decisions (owner delegated; defaults chosen)
- Gate recompute on a signature of the transparency of the sun-affected rows; unchanged -> no work.
- The calculator only builds rows `ceil(maxDepth) + 3`.
- `LightSource.isAnimated` (default false; PointLight true with flicker/pulse); only animated lights dirty the lightmap on the throttle tick.

## Plan
1. `getSunlightSignature` + row-limited, allocation-free calculator.
2. `LightingEngine.updateGrid/markSunlightDirty` skip when signature unchanged.
3. `isAnimated` on lights; throttle loop uses it.
4. Tests incl. mutation check.

## Implementation notes
- `getSunlightSignature` + `getSunlightRowCount`; `updateGrid` skips when the signature is unchanged (`markSunlightDirty` still forces).
- Calculator returns only the top `ceil(maxDepth)+3` rows and uses a flat queue (no per-node allocations). The pixel buffer is reused between refreshes.
- `LightSource.isAnimated` (PointLight: flicker/pulse); only animated lights dirty the lightmap on the 20Hz tick.
- Mutation-checked: signature gate, `isAnimated`.
- No profiling numbers taken; the savings come from skipped work, not measured.
