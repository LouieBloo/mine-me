# 049 - Flame Pickaxe and held-item particle effects

**Priority:** P2 - **Status:** Done (2026-10-13), sprite pending from owner

## Problem
The owner wants a second pickaxe that mines 4x faster than the Basic Pickaxe and looks like it is on fire. That needs a new capability: attaching a particle system to the item **while it is held**, with an adjustable position on the sprite so it can be fine-tuned.

## What exists today (audit)
- `Item.particleEffectId` (one `ParticleEffect` row) is only played while the item **lies on the ground** (`DroppedItemVisualManager.updateItemParticles`). Nothing plays on a held item.
- Held items are the equipped `WEAPON` gear layer on `ModularCharacterSprite`. Its position comes from `holdOffsetX/Y` + `holdRotation`; projectile weapons also have a muzzle point (`muzzleOffsetX/Y`, in weapon-sprite local space) used by `getMuzzleWorldPosition`. The admin tunes these in `ItemHoldPreview` (Pixi `ModularCharacterCanvas` + `useModularGear` draws a muzzle marker).
- The equipped item's gear layer reaches other players through the server (`miningLoadout.gearLayers` -> `session.gearLayers` -> `MiningRemotePlayer.gearLayers`), then `MiningRemotePlayerRenderer`.
- Particle configs live in the `ParticleEffect` table (admin Particle Effects page) and are fetched by the client from `/api/public/particle-effects`.
- Speed: swing rate comes from the **Mining Speed** effect (Basic Pickaxe = 25 = 2 swings/s), so 4x = **100**. Tool Damage (25) and Damage (25) stay the same.

## Decisions (owner Q&A)
- Name **Flame Pickaxe**, rarity higher than Basic (LOW): **MEDIUM**. It is created through the item create path (`createItem` fields), not the seed. Sprite (`gearImageUrl`, icon) left empty for the owner to upload. Same stats as Basic Pickaxe except Mining Speed 100; it reuses the Basic Pickaxe swing sound (a reference to the same library file, no new upload).
- **Not obtainable in-game for now**: not a starting piece, no drops. The owner grants/equips it while testing.
- **Data model:** a new, separate **held** effect on the item: `heldParticleEffectId` + `heldParticleOffsetX/Y` (weapon-sprite local space, same convention as the muzzle). The existing ground `particleEffectId` is untouched, so an item can burn in hand and sparkle on the ground independently.
- **Visibility:** wherever the item is held in the mine - the local player and **other players** - plus the admin hold preview, where the owner positions the emitter (marker + live particles, number + slider per axis, like the muzzle).
- New particle effect **"Flame"** (continuous, rising orange-to-red additive flame) created as a `ParticleEffect` row via the admin particle-effect create path, so it is editable on the Particle Effects page.

## Plan (new-field checklist)
1. **Schema:** `Item.heldParticleEffectId String?` (relation to `ParticleEffect`, `onDelete: SetNull`), `heldParticleOffsetX/Y Float @default(0)`. Name both `Item` <-> `ParticleEffect` relations. `prisma db push` + `generate` only (additive, no reset, no seed).
2. **Shared:** `GameItem` gets the three fields; `MiningGearLayer` gets the hold/muzzle fields it already carried untyped plus `heldParticleEffectId`, `heldParticleOffsetX/Y`. `npx tsc` in shared.
3. **Server:** validation for the new fields; the create/update item paths do not pass a `heldParticleEffect` relation object through; `inventory.service` item mapping and `miningLoadout.gearLayers` send the three fields.
4. **Admin:** Item page gets a "Held Particle Effect" select (separate from the ground one). `ItemHoldPreview` gets a "Particle Effect Origin" card (X/Y) shown when a held effect is chosen; `ModularCharacterCanvas`/`useModularGear` draw a marker on the weapon sprite and emit the effect from it so it follows the swing.
5. **Client:** `GearLayerDescriptor` + `ModularCharacterSprite` keep the held-effect spec and expose its world position (shared maths with the muzzle). A small `HeldItemParticles` system keeps one emitter per sprite at that position (create / move / replace when the effect changes / destroy when unequipped or the player leaves). Used for the local player (`useMiningTicker`) and each remote player (`MiningRemotePlayerRenderer`). Effect configs come from the same registry as the ground effects.
6. **Data:** script creates the "Flame" effect and the Flame Pickaxe in the database if missing (idempotent, additive).
7. **Tests:** server validation + mapping + loadout; admin Item page select, hold-preview controls, marker; client sprite spec/position, emitter lifecycle (create, move, change effect, unequip, destroy), remote renderer cleanup. Mutation-check the emitter replace/destroy rule and the offset passthrough.

## Not in scope
- The sprite / icon (owner uploads; the flame only shows once a `gearImageUrl` exists, because the held layer needs a sprite to attach to).
- Particles for items that are not held (inventory icons are HTML).
- Mob-held items.

## Implementation notes
- **Schema:** `Item.heldParticleEffectId` (+ relation `ItemHeldParticle`, SetNull), `heldParticleOffsetX/Y Float @default(0)`; the existing ground relation is now named `ItemGroundParticle` (same column and FK). Additive `db push`, no reset/seed.
- **Shared/server:** `GameItem` and `MiningGearLayer` carry the three fields; validation; `inventory.service` mapping and `miningLoadout.gearLayers` send them (so other players see the effect); item create/update strip a `heldParticleEffect` relation object.
- **Admin:** Item page has "Held Particle Effect" (the old one is now labelled "Ground Particle Effect"). `ItemHoldPreview` shows a "Held Particle Effect Origin" card (X/Y number, slider, +/-, reset; reset-all includes it) when an effect is chosen; the canvas draws an amber crosshair marker on the weapon sprite and plays the effect from it (`useHeldParticlePreview`, `HeldParticleEmitter`), only created while a held effect exists. Offsets are in weapon-sprite texture pixels, same as the muzzle.
- **Client:** `ModularCharacterSprite.getHeldParticle()/getHeldParticleWorldPosition()` (shares the muzzle maths); `HeldItemParticles` keeps one emitter per sprite (create, follow, swap on change, remove on unequip/destroy), used for the local player in `useMiningTicker` and per remote player in `MiningRemotePlayerRenderer`. Configs come from the same registry as ground effects (`DroppedItemVisualManager.setCustomParticleEffects` is now also fed from `/api/public/particle-effects`).
- **Data:** `prisma/add-flame-pickaxe.ts` (dry run by default, `--apply`, idempotent) created the "Flame" effect and the "Flame Pickaxe" in the dev DB: copy of Basic Pickaxe with Mining Speed 25 -> 100, rarity MEDIUM, swing sound reused, no sprite, not a starting piece. The running server needs a restart to load the new item definition (edits outside the admin do not reload).
- **Tests:** server validation/create/update/relation stripping, loadout and inventory mapping, script maths; admin hold-preview card, marker, emitter, Item page select and save; client sprite spec, `HeldItemParticles` lifecycle, remote renderer cleanup. Mutation-checked: not replacing the emitter on an effect change, and dropping the origin from the loadout, each fail a test. Shared 330 / server 838 / admin 208 / client 601 pass; typechecks clean.
- Found while testing: the new preview layer broke other canvases whose Pixi mocks lack `destroy`; it is now only created when a held effect exists.

## Follow-ups
- Upload the sprite on the item page, then tune the origin in the hold preview and the Flame on the Particle Effects page. The flame only appears in game once a gear image exists.
- Particle sizes in the admin preview are approximate (the preview rig is scaled differently from the game).
