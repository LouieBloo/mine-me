# 072 - Gases in sandbox mode

**Priority:** P2 - **Status:** Done (2026-10-14); try it by hand - **Depends on:** 065, 067, 069, 070

## Problem
The sandbox must let us test gases the way it lets us test fluids.

## Design
- Sandbox tool "Gas": pick any loaded gas (picker lists definitions, never a hard-coded name) and click/drag to release gas into the clicked cell, in `sandboxTool`, `SandboxPanel`, `SandboxActions`, `MouseAction`, the sandbox socket handler and `sandboxHandlers` (follow the fluid path exactly, including validation and error surfacing).
- Gas is cleared by the existing hazards button, which now reads "Clear fluid, gas and fire" (one command, `sandbox_clear_hazards`, instead of a second button). Reset also clears gas (it rebuilds the world).
- "Light fire here" already ignites the clicked cell: it must ignite hydrogen so the explosion front (070) can be tested. The simulation control (pause / single-step / speed) also applies to the gas step so spreading and the front can be stepped.
- Default sandbox map: add a sealed glass-like or block-walled chamber on the surface holding hydrogen and one holding nitrogen (the first loaded gases in key order if fewer exist), and leave one chamber with a breakable top so venting can be watched. Add them without disturbing the fluid pools.
- Multiplayer: everyone in the shared room sees the same gas through the normal deltas.

## Tests
Handler validates gas key and coordinates, rejects unknown gas, places via the subsystem, clear removes all gas, reset restores defaults, client tool sends the right action, panel lists loaded gases, error shown on failure. Mutation-check: skip validation on the handler, confirm a test fails.

## Implementation notes
- **Command:** `sandbox_release_gas { x, y, gasKey }` (shared `SandboxReleaseGasPayload`, `handleSandboxReleaseGas`, `SandboxTools.releaseGas`). Same validation as pouring fluid: refused outside a sandbox room, off the map, for a fractional or non-number tile, an unknown gas, a solid tile, a cell holding fluid (fluid wins) or another gas, or a full cell. It adds up to a full cell, so holding the mouse tops cells up.
- **Ignite:** `SandboxTools.ignite` sets off explosive gas first (no dice, so the test tool always works) and otherwise lights fluids and blocks exactly as before; nitrogen and clear air still answer "Nothing there can burn."
- **Clear:** `clearHazards` also drains every gas cell.
- **Simulation control:** the pause / step / speed clock already drove the fluid and fire steps from one `worldSteps` count; the gas step and the explosion front use the same count, so a paused sandbox holds gas (and an explosion) still and a single step advances both.
- **Map:** a new `chamber` layout zone (`rect`, `gasSlot`, optional `concentration`, the gas twin of `pool`: the loaded gases in key order, an empty slot stays empty). The default sandbox has two sealed chambers in the ground (8 x 6 cells each, x 60-67 hydrogen and x 70-77 nitrogen) under a roof of two dirt blocks, so mining down through the roof lets the gas out. `buildSandboxMap` returns `gasCells`; `mapSources` passes the loaded gases; the engine places them with the rest of the starting gas. The pools are untouched (tested).
- **Client:** `ReleaseGasAction` (hold to keep releasing, any open tile, no reach limit), tool `{ kind: 'releaseGas', gasKey }`, a "Release gas" button and gas picker in `SandboxPanel` (disabled with no gases or with the free camera on), the gases passed down from the session state in `MineView`.
- **Tests:** `SandboxMapBuilder.test.ts` (4 chamber cases), `SandboxTools.test.ts` (release, refusals, rise-and-fade in open sky, chambers sit still, mining the roof lets hydrogen out and leaves the nitrogen alone, igniting, clearing, pause/step and reset), `sandboxHandlers.test.ts`, `SandboxActions.test.ts`, `useSandboxClient.test.ts`, `SandboxPanel.test.tsx`, and a lifecycle test that the panel lists the session's gases. Mutation-checked: igniting ignoring gas, clearing leaving gas, no chamber gas, gas ignoring the sandbox clock, skipping validation on release, and `MineView` not passing the gases each fail a test.
