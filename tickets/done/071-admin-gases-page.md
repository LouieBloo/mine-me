# 071 - Admin: Gases page

**Priority:** P1 - **Status:** Done (2026-10-14); judge the preview by hand - **Depends on:** 066, 068 (pattern: 060)

## Problem
Gases must be added and edited in the admin app, just like fluids.

## Design
- New `pages/Gases/` (list, create, delete) and `GasDetail` cloned from the Fluids page structure; one component per folder with its `.tsx` and scoped CSS, Tailwind with our colour scheme.
- Detail sections: identity (key, name, description), physics (`density`, `diffusionRate`, `minConcentration`, `ventLifetime`), look (colour, opacity, appearance), `FlammabilityPanel` (reuse; extended with the explosion fields from 070), `GasGenerationPanel` (068), sound slots through the shared `SoundSlotPicker` with per-slot volume (no new uploader), and a live `GasPreview` built on the shared `GasGrid` (like `FluidPreview`) showing a small sealed box where the gas spreads and rises or sinks.
- Navigation: a Gases entry in `Layout` and a route in `App.tsx`.
- Every REST call has error handling that surfaces to the user, uses the shared loading spinner, and all buttons/clickables have the right cursor and hover state. Saves trigger the live definition reload (036).

## Tests
List/create/edit/delete, validation messages, error display on failed save, spinner shown while loading, sound slot assignment with volume, preview steps the shared grid, generation and flammability panels save. Mutation-check: break the save error handler, confirm a test fails.

## Implementation notes
- **Pages and components** (each in its own folder, with its own CSS file): `pages/Gases/Gases.tsx` (list: colour swatch, key, name, density, spread rate, burns, share of mines), `pages/Gases/GasDetail/GasDetail.tsx` (create, edit, delete), `GasGenerationPanel` (the fluid panel plus a "Starting Concentration" field), `GasSoundEffects` (the shared `SoundSlotPicker` with the five gas slots, category `GAS`, saved slot by slot with its own volume), and `components/GasPreview/` (`GasPreview.tsx` and `previewScene.ts`). The flammability panel is the shared one, as is. Nav entry "Gases Editor" and the `/gases` routes.
- **Detail page:** key (only editable on create), name, description; look (colour, opacity, softness, drift speed, drift amount); behaviour (density, spread rate, minimum concentration, open-air lifetime); flammability; generation. Validation runs in the browser with the shared `validateGas` and again on the server; every problem is listed, server errors surface as a toast, saving and loading use the shared spinner, and all buttons have a pointer cursor and hover state. Saves trigger the live definition reload (036).
- **Live preview:** a 24 x 14 box running the real shared `GasGrid` (a shelf above the spout so light gas pools under it, and a gate in the roof). Buttons: Release (pours gas in at the spout), Open Roof Gate (the column below it becomes open to the sky, so gas rises out and fades over its open-air lifetime) and Reset. It draws through the same shared soft-blob helpers as the game (`gasLook.ts`, moved into `packages/shared` so both apps share them). A physics change starts a fresh box; a look change does not. The picture is not eased between steps (the game's is), so the cloud steps at 10 Hz while the drift moves smoothly.
- **Tests:** `Gases.test.tsx`, `GasDetail.test.tsx` (26), `GasGenerationPanel.test.tsx`, `GasSoundEffects.test.tsx`, `GasPreview.test.tsx` and `previewScene.test.ts`; shared `gasLook.test.ts`. Mutation-checked: skipping the validation (5 fail), the preview not telling the grid its roof opened (3), and reset leaving the gate open (1).
