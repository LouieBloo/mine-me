# Fluid Mechanics & Presentation Audit

## 1. Executive Summary & Screenshot Breakdown

In the game's fluid simulation and rendering pipeline, two prominent visual glitches appear when fluid moves over ledges and falls down vertical shafts, as captured in the recent playtest screenshot:

```
                  [ Water Wave Crest ]
                          │
[ Left Ledge ]            ▼               [ Right Shaft ]
      │             ~~~~~~~~~~~~~~~~~            │
      ▼             │               │            ▼
   │     │          │   (Player)    │         │  │  │  <-- Vertical bar poking
   │     │          │               │         │  │  │      UP through the wave
   │  │  │ <------- │───────────────│         │  │  │
   │  │  │ (Random vertical bar               │  │  │  <-- Stream falling down
   │  │  │  along cliff face)                 │  │  │      ladder shaft
~~~'──'~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~         │  │  │
[ Lower Pool on Lava Rock ]
```

---

### Artifact A: The Bar Poking Through Waves (Right Edge)
* **Visual Symptom:** At the edge of the dirt plateau above the ladder shaft, a light-blue vertical bar extends upward into empty sky, poking straight through the wave animation crest.
* **Root Causes in Code:**
  1. **Ceiling Snapping in Stream Origin ([fluidShape.ts:405](file:///home/luke/code/mine-me/packages/shared/src/gameLogic/fluid/fluidShape.ts#L405)):**
     When a fall is fed by fluid in the first row (`firstRow`), `startTop` defaults to `first * tile` (the top ceiling boundary of that cell, $y=0$ in tile space). However, the water in the donor pool on the plateau is only partially full—its resting surface (`surfaceY`) sits 20–30% down from the ceiling.
  2. **Wave Trough Inversion:**
     The surface of the plateau pool animates dynamically with a sine wave ([fluidShape.ts:710-745](file:///home/luke/code/mine-me/packages/shared/src/gameLogic/fluid/fluidShape.ts#L710-L745)). When the wave undulates down into a trough, the stream’s static top remains locked at the tile ceiling. The wave surface drops below the stream top, leaving the top of the stream exposed in mid-air.
  3. **Hardcoded Rectangular Sheen ([FluidRenderer.ts:327](file:///home/luke/code/mine-me/apps/client/src/views/MineView/components/MiningGrid/renderers/FluidRenderer.ts#L327)):**
     Every falling stream renders a vertical highlight sheen:
     ```ts
     graphics.rect(shape.x + shape.width * 0.15, shape.top, shape.width * 0.2, shape.bottom - shape.top);
     graphics.fill({ color: look.surface, alpha: look.opacity * look.appearance.highlight * 0.5 });
     ```
     Because this sheen starts at `shape.top` (the ceiling in empty air), it renders as a bright, sharp needle piercing the wave.
  4. **Non-Solid Ledge Failure ([fluidShape.ts:244-254](file:///home/luke/code/mine-me/packages/shared/src/gameLogic/fluid/fluidShape.ts#L244-L254)):**
     `lipShare` checks `isSolid(nx, y + 1)`. Because ladders are non-solid (`isTileSolid(MiningTileType.LADDER) === false`), `lipShare` evaluates to 0. This collapses `spillShare` to 0, completely disabling the curved spill arc and forcing the stream to begin as an uncurved, raw vertical jet at the ceiling.

---

### Artifact B: The Random Bar of Water (Left Edge)
* **Visual Symptom:** At the vertical face of the dirt cliff on the left, a thin vertical blue bar (5–8 pixels wide) stands in open air along the cliff face above the lower water surface.
* **Root Causes in Code:**
  1. **Dual Entity Generation in a Single Column ([fluidShape.ts:267-305](file:///home/luke/code/mine-me/packages/shared/src/gameLogic/fluid/fluidShape.ts#L267-L305)):**
     When water pours off the dirt plateau into the air column next to the cliff, that column contains both falling fluid (rows 9, 10, 11) and resting fluid at the bottom on the lava rock (row 12). The layout engine groups all contiguous fluid cells into a single `ColumnBody`, but simultaneously generates a separate `StreamSegment` in the same column.
  2. **Artificial Stream Width Clamping ([fluidShape.ts:22, 432-434](file:///home/luke/code/mine-me/packages/shared/src/gameLogic/fluid/fluidShape.ts#L22)):**
     Streams clamp to a minimum width of `STREAM_MIN_WIDTH = 0.125` (1/8th of a tile, or 8 pixels wide at 64px/tile):
     ```ts
     width = tile * Math.min(STREAM_MAX_WIDTH, Math.max(STREAM_MIN_WIDTH, STREAM_WIDTH_PER_LEVEL * perCell)) * strength;
     ```
  3. **Wall Hugging ([fluidShape.ts:437-442](file:///home/luke/code/mine-me/packages/shared/src/gameLogic/fluid/fluidShape.ts#L437-L442)):**
     Because the dirt cliff to the right is solid, `wallBias = 1`. This positions the 8px stream tightly against the cliff boundary:
     ```ts
     sx = (x + 1) * tile - width;
     ```
  4. **Disconnected Visual Fragment:**
     The pool at the bottom is drawn as a shaded `body`, but the falling stream's bounding box and vertical sheen are drawn on top. When the stream flow trickles or enters the pool, this 8px stream line stays pinned to the cliff face, appearing as an isolated, floating vertical stick.

---

### Artifact C: The Triangular Wedge on the Lower Ground
* **Visual Symptom:** Beneath the cliff, water on the lava rock forms an unnatural steep slope ramping up against the cliff wall rather than leveling out.
* **Root Causes in Code:**
  1. **Simulation Flow Disparity ([FluidGrid.ts:403-450](file:///home/luke/code/mine-me/packages/shared/src/gameLogic/fluid/FluidGrid.ts#L403-L450)):**
     In `FluidGrid`, falling water moves downward under gravity at 100% of volume per step. Sideways spreading, however, is throttled by `flowRate` (0.6 for water) and `flowThreshold`.
  2. Water drops into the bottom cell much faster than it can disperse horizontally across the floor, causing it to pile up into an artificial mound against the cliff wall.
  3. **Surface Join Limitations ([fluidShape.ts:460-463](file:///home/luke/code/mine-me/packages/shared/src/gameLogic/fluid/fluidShape.ts#L460-L463)):**
     `edgesOf` only connects adjacent columns if they overlap vertically in height (`overlapBottom - overlapTop > 0`). When water hits the bottom, it slopes steeply up towards the landing point without smoothing across stepped drops.

---

## 2. Architecture & Pipeline Breakdown

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ SIMULATION: FluidGrid.ts (Server, 10 Hz)                                          │
│ - Conservation of mass in cells [0.0 .. 1.0 + compression]                        │
│ - Instant gravity drop down, throttled sideways diffusion, pressure push up       │
│ - Tracks `fallen` volume to identify falling water                                │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │ FluidWireCell [x, y, id, level, falling]
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ CLIENT INTERPOLATION: FluidDisplay.ts (Client, 60 FPS)                            │
│ - Exponential smoothing: 0.12s regular easing; 0.015s `hurry` for free-fall       │
│ - Damps simulation step pulses between 10 Hz ticks                                │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │ FluidLevels
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ GEOMETRY SYNTHESIS: fluidShape.ts & FluidLayout.ts                                │
│                                                                                   │
│   ┌──────────────────────────────┐     ┌──────────────────────────────────────┐   │
│   | 1. "Bodies" (Puddles/Pools)  |     | 2. "Streams" (Falls/Jets)            |   │
│   | - Packed down onto floors    |     | - Narrow rectangular strips (≥ 8px)  |   │
│   | - Shaded horizontal bands    |     | - Hardcoded vertical sheens          |   │
│   | - Dynamic sine wave surface  |     | - No waves; static Y bounds          |   │
│   └──────────────────────────────┘     └──────────────────────────────────────┘   │
│                                  \     /                                          │
│                       ┌─────────────────────────┐                                 │
│                       | 3. "Spills" (Lip Arcs)  |                                 │
│                       | - Cubic Bézier curve    |                                 │
│                       | - Only if ground below  |                                 │
│                       └─────────────────────────┘                                 │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │ FluidShape[]
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ RENDERING: FluidRenderer.ts (Pixi.js v8)                                          │
│ - 8x8 cell chunking with dirty flags                                              │
│ - `body` Graphics: Depth-shaded polygon strips, stream sheens                     │
│ - `surfaces` Graphics: Animated sine-wave surface fills, glow bands, strokes      │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core System Flaws

### Flaw 1: The Dual-Model Schism ("Body" vs. "Stream")
The fluid engine attempts to reconcile two fundamentally incompatible visual representations:
* **Bodies** are modeled as 2D heightfield meshes packed onto floor tiles with sine-wave deformation.
* **Falling fluid** is modeled as 1D rectangular stream strips with hardcoded width and static sheen highlights.

Because these two systems have fundamentally different math:
* Where a pool flows into a stream, the waving mesh abruptly stops, and a rigid vertical rectangle begins.
* Where a stream lands in a pool, the rectangle clips into the waving mesh.
* The system constantly attempts heuristic "glue" (the `spillShape` Bézier arc, `lipShare`, `freeFallShare`, `fallHurry`), but any edge case (such as a ladder, platform, or partial cell) breaks the heuristics and exposes raw seams.

### Flaw 2: The Static Sheen Discontinuity
In `FluidRenderer.ts`, falling fluid is given a bright highlight sheen via `graphics.rect(...)`. This sheen:
* Has hard, non-blended 90° corners.
* Extends from `shape.top` to `shape.bottom`.
* Does not respect surface wave modulation or depth attenuation.
* Is responsible for the vertical "needles" sticking out into the sky.

### Flaw 3: Non-Solid Ledges Invalidate Spill Geometry
`lipShare` in `fluidShape.ts` determines whether water is at a "lip":
```ts
if (this.isSolid(nx, y + 1)) onGround += level;
```
If the ledge is not standard solid rock/dirt (e.g., wooden platforms, bridges, scaffolding, or ladder shafts), `isSolid` returns `false`. The engine concludes that this is *not* a ledge lip, suppresses the smooth `spill` curve entirely, and renders the water as an uncurved, disconnected falling jet.

### Flaw 4: Single-Column Fall Constraint
Water cannot cascade diagonally over stepped terrain. Each column acts independently, creating disconnected vertical strips instead of flowing sheets.

### Flaw 5: Simulation-Presentation Coupling in Spreading
In `FluidGrid`, horizontal flow moves at 60% difference per step, while downward fall is 100%. Over a 10 Hz tick rate, falling water deposits faster than it can disperse sideways, creating steep, unnatural piles at the base of falls.

---

## 4. Minecraft Water Mechanics vs. Current Implementation

| Aspect | Minecraft Fluid Mechanics | Current 2D Mining Fluid |
| :--- | :--- | :--- |
| **State Model** | **Discrete Levels & Flowing Flags**<br>Source block (level 8/0) drops down to level 1 over distance. | **Continuous Floating-Point Mass**<br>Arbitrary floats (e.g. 0.042) that pulse during cell transitions. |
| **Falling Water Representation** | **Unified Block with `FALLING` Flag**<br>A falling water block is **full width/height** (level 8). It is *never* a skinny sub-tile needle. | **Separate Stream Geometry**<br>Falling water is culled from the body and drawn as a narrow 0.125-width column with a separate sheen. |
| **Mesh Geometry** | **Corner Height Averaging**<br>Every corner vertex of a water block is calculated by averaging adjacent fluid heights. Water naturally forms seamless 45° diagonal ramps down ledges and drops. | **Horizontal Strips + Vertical Jets**<br>Bodies are sliced into horizontal shaded strips; falls are vertical boxes; ledges use cubic Bézier patches. |
| **Ledge Transitions** | **Continuous Diagonal Slopes**<br>Because corner heights interpolate downwards to the lower block, water cascades smoothly over ledges without gaps or separate "spill" entities. | **Artificial "Spill" Patch**<br>A separate Bézier shape that attempts to bridge the pool and stream, easily breaking when terrain isn't pure solid ground. |
| **Falling Speed & Spread** | Falling water reaches the floor rapidly in full columns, and immediately spreads laterally upon contact. | Falling water enters bottom cells faster than horizontal diffusion can clear it, creating steep triangular mounds at cliff bases. |

---

## 5. Strategic Recommendations

### Phase 1: Immediate Presentation Fixes (Within Current Architecture)
1. **Clamp Stream `startTop` to Neighboring Surface Height:**
   Ensure `startTop` cannot exceed the actual surface level ($y$) of the fluid donor cell. It must never start at `cellTop` ($y=0$) unless water is actively pressing from a ceiling above.
2. **Tether Stream Top to Wave Displacement:**
   If a stream originates from a body of water with waves, its top boundary must sample the wave height at that exact $X$ coordinate so the stream edge undulates synchronously with the wave, preventing it from poking through the trough.
3. **Fix Ledge Recognition for Interactable Tiles:**
   Update `lipShare` to recognize bridges, ladders, and platforms as valid drop lips so water curves smoothly over scaffolding instead of snapping to a raw vertical jet.
4. **Eliminate or Blend the Rectangular Sheen:**
   Remove the raw `graphics.rect` sheen or fade it out near the top and bottom of stream segments to eliminate vertical needle artifacts.

### Phase 2: Structural / Minecraft-Style 2D Overhaul
1. **Adopt Unified Vertex-Interpolated Fluid Meshes:**
   Follow Minecraft's 2D equivalent: represent fluid in every cell by calculating left-edge height ($Y_L$) and right-edge height ($Y_R$):
   * A resting pool has $Y_L = Y_R = \text{surface height}$.
   * Fluid flowing down a ledge slopes naturally ($Y_L = \text{top level}$, $Y_R = \text{bottom level}$).
   * A cell in free fall renders as a full falling column ($Y_L = 1.0, Y_R = 1.0$) connecting seamlessly to the cells above and below.
2. **Remove the Distinct "Stream" / "Spill" Entity Separation:**
   By letting cell vertex heights connect directly across block borders (like Minecraft's corner height interpolation), falling and sloping water becomes a continuous sheet of fluid rather than a composite of bodies, Bézier spills, and narrow rectangles.
3. **Harmonize Horizontal Diffusion with Gravity:**
   Increase lateral flow rate when water hits a horizontal surface from a fall, preventing water from mounding up into steep triangular wedges at the foot of cliffs.
