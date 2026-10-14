# 050 - Held item light (a pattern for any item) and a subtler flame

**Priority:** P2 - **Status:** Done (2026-10-13)

## Problem
The Flame Pickaxe should light up the cavern like a torch while held, and the owner wants this as a **pattern for any item**, not a pickaxe special case. They also wanted a second, more subtle and smaller flame effect, designed from scratch.

## What exists today (audit)
- `Item.lightConfig` (`ItemLightConfig`: POINT/SPOT, STATIC/PULSE/FLICKER, colour, radius, intensity) is only used for items **on the ground** (`DroppedItemVisualManager.updateItemLight`, light-building code private to it).
- Ticket 049 added the held-item pattern for particles: columns on `Item`, fields on the gear layer (so remote players get it), a sprite accessor, a per-frame sync class for the local player and each remote player, and an origin card + marker in the admin hold preview.

## Decisions (made on the owner's request, no Q&A round; flag if wrong)
- **Same shape as ground lights:** a held light is the same `ItemLightConfig` plus a position on the sprite, stored as **one Json column `Item.heldLightConfig`** (`HeldLightConfig = ItemLightConfig + offsetX/offsetY`). No new columns per knob; the ground `lightConfig` is untouched, so an item can glow on the ground and in hand independently.
- **Reuse, not copy:** the light-building code moved out of `DroppedItemVisualManager` into `createItemLight` (`components/game/lighting/itemLight.ts`), used by both ground and held lights. In the admin the existing `ItemLightEffectConfig` panel is reused (title/description props) for "Held Light", and the origin controls became one shared `OriginOffsetCard` used by both the held particle and the held light.
- **Visible to everyone:** local player and other players, like the particle effect.
- **Admin preview:** shows a blue origin marker (the admin has no lighting engine to render the light itself); the in-game result is judged in the mine.
- A SPOT held light keeps a fixed direction (it does not turn with the aim). POINT is the intended use.
- **New flame "Ember Flame":** small, low-rate licks (rate 14 vs 45, scale 0.55 vs 1.6, speed up to 22 vs 70, life up to 0.6 vs 0.8 s), warm yellow to deep red, additive. It replaced the first "Flame" on the Flame Pickaxe; the first Flame stays in the library. The pickaxe also got a torch-like flickering warm light (POINT, `#ff8a2a`, radius 3.5, intensity 0.9). Both are plain data, editable in the admin.

## Implementation notes
- **Schema:** `Item.heldLightConfig Json?` (additive `db push`). Shared `HeldLightConfig`, on `GameItem` and `MiningGearLayer`.
- **Server:** validation (object or null); item create/update clear it with `Prisma.JsonNull` (a bare null is not valid for a Json column); `inventory.service` mapping and `miningLoadout.gearLayers` send it.
- **Client:** `ModularCharacterSprite.getHeldLight()/getHeldLightWorldPosition()`; `HeldItemLight` (add, follow in tile coordinates, rebuild on config change, remove on unequip/destroy) used in `useMiningTicker` (local) and `MiningRemotePlayerRenderer` (each remote player, removed when they leave).
- **Admin:** "Held Light" panel on the Item page; `ItemHoldPreview` "Held Light Origin" card (X/Y, reset, reset-all includes it); blue marker in the canvas (`syncLightMarker`).
- **Data:** `prisma/add-ember-flame.ts` (dry run by default, `--apply`, idempotent; only switches the pickaxe's effect if it still used the first Flame, only adds a light if it had none). Applied to the dev DB. The server needs a restart to load the new definitions.
- **Tests:** server (save/clear/validation of the light, loadout, inventory mapping, script planner); admin (origin card, marker, Item page save, light panel); client (`HeldItemLight` lifecycle, sprite accessors, remote renderer lights and cleanup, local ticker light + removal on unmount). Mutation-checked: not rebuilding the light on config change, and clearing with a bare null, each fail a test.

## Follow-ups
- Tune the Ember Flame and the light (radius/intensity/colour) in the admin once the sprite is in.
- Rotating a SPOT held light with the aim, if ever needed.
