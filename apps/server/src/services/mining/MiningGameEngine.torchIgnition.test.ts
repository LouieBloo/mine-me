import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

const OIL_BURNS = { ignitionChance: 1, spreadChance: 0, burnDuration: 8, heat: 3, burnsInto: null };
const ignitesItem = (id: string, value = 100) => ({ id, name: id, itemEffects: [{ value, effect: { ignites: true } }] });
const plainItem = (id: string) => ({ id, name: id, itemEffects: [] });

describe('torches and carried items that light oil', () => {
  const cid = 'torch-char';
  let engine: MiningGameEngine;
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const items = new Map<string, unknown>();
  const lit = () => engine.ignitionSubsystem.takeIgnited().map((c) => `${c.x},${c.y}`).sort();
  const placeTorch = (x: number, y: number, itemId?: string) => {
    engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
    me().playerBody.position = { x: x + 0.5, y: y + 0.5 };
    return engine.placeTorch(cid, { x, y }, itemId);
  };

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 },
      toolDamage: 25, weaponDamage: 40, miningSpeed: 25,
      socket: { connected: true, emit: vi.fn() } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    // Open room x 16..28, y 17..20 over a dirt floor at row 21
    for (let x = 16; x <= 28; x++) {
      for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    me().playerBody.position = { x: 17.5, y: 21 - me().playerBody.halfHeight };
    me().playerBody.isGrounded = true;
    for (let y = 0; y < engine.fluidSubsystem.grid.height; y++) {
      for (let x = 0; x < engine.fluidSubsystem.grid.width; x++) engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
    }
    engine.dataManager.getFluid('OIL')!.flammability = OIL_BURNS;
    items.clear();
    items.set('torch', ignitesItem('torch'));
    items.set('damp-torch', plainItem('damp-torch'));
    items.set('flame-pick', ignitesItem('flame-pick'));
    items.set('plain-pick', plainItem('plain-pick'));
    const original = engine.dataManager.getItemData.bind(engine.dataManager);
    vi.spyOn(engine.dataManager, 'getItemData').mockImplementation((id: string) => (items.get(id) as any) ?? original(id));
  });

  afterEach(() => vi.restoreAllMocks());

  describe('a placed torch', () => {
    it('lights oil in its own piece and the cells touching it, and nothing further away', () => {
      // The torch covers x 21-23, rows 18-20 (the floor is row 21); its middle cell is (22, 19)
      expect(placeTorch(22, 20, 'torch')).toBe(true);
      for (const [x, y] of [[22, 19], [21, 18], [24, 19], [20, 19], [27, 19], [22, 15]]) engine.fluidSubsystem.placeFluid(x, y, 'OIL', 1);
      me().playerBody.position = { x: 17.5, y: 20.5 };
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual(['20,19', '21,18', '22,19', '24,19']);
    });

    it('lights oil that flows up to it later, not just oil that was there', () => {
      placeTorch(22, 20, 'torch');
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual([]);
      engine.fluidSubsystem.placeFluid(23, 20, 'OIL', 0.5);
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual(['23,20']);
    });

    it('a torch whose item has no Ignites effect lights nothing', () => {
      placeTorch(22, 20, 'damp-torch');
      engine.fluidSubsystem.placeFluid(23, 20, 'OIL', 1);
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual([]);
    });

    it('a torch placed without saying which item it was lights nothing', () => {
      placeTorch(22, 20);
      engine.fluidSubsystem.placeFluid(23, 20, 'OIL', 1);
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual([]);
    });

    it('uses the item\'s strength: a weak torch needs luckier rolls', () => {
      vi.mocked(Math.random).mockReturnValue(0.5);
      items.set('weak', ignitesItem('weak', 30));
      placeTorch(22, 20, 'weak');
      engine.fluidSubsystem.placeFluid(23, 20, 'OIL', 1);
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual([]);
      items.set('weak', ignitesItem('weak', 100));
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual(['23,20']);
    });

    it('reads the strength live, so editing the item in the admin applies without placing a new torch', () => {
      placeTorch(22, 20, 'torch');
      engine.fluidSubsystem.placeFluid(23, 20, 'OIL', 1);
      items.set('torch', plainItem('torch'));
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual([]);
    });

    it('stops lighting things once the torch is mined or blown away', () => {
      placeTorch(22, 20, 'torch');
      engine.fluidSubsystem.placeFluid(23, 20, 'OIL', 1);
      engine.grid[19][22] = { type: MiningTileType.EMPTY, revealed: true }; // the torch's middle cell
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual([]);
      // ...and a different block put there later is not mistaken for the torch
      engine.grid[19][22] = { type: MiningTileType.TORCH, revealed: true };
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual([]);
    });

    it('sets the oil burning in the running game, a fire step later', () => {
      placeTorch(22, 20, 'torch');
      engine.fluidSubsystem.placeFluid(23, 20, 'OIL', 1);
      tick(3);
      expect(engine.fireSubsystem.isBurning(23, 20)).toBe(true);
    });

    it('does not light anything with no oil about', () => {
      placeTorch(22, 20, 'torch');
      tick(6);
      expect(engine.ignitionSubsystem.pendingCount).toBe(0);
    });
  });

  describe('an item a player is carrying', () => {
    it('lights oil in the cells their body is in', () => {
      me().playerBody.position = { x: 22.5, y: 20.5 };
      me().equippedWeaponId = 'flame-pick';
      engine.fluidSubsystem.placeFluid(22, 20, 'OIL', 1);
      engine.fluidSubsystem.placeFluid(26, 20, 'OIL', 1);
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual(['22,20']);
    });

    it('an ordinary tool, or nothing in hand, lights nothing', () => {
      me().playerBody.position = { x: 22.5, y: 20.5 };
      engine.fluidSubsystem.placeFluid(22, 20, 'OIL', 1);
      me().equippedWeaponId = 'plain-pick';
      engine.ignitionSubsystem.emitFromSources();
      me().equippedWeaponId = null;
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual([]);
    });

    it('a dead player\'s item does not', () => {
      me().playerBody.position = { x: 22.5, y: 20.5 };
      me().equippedWeaponId = 'flame-pick';
      me().isDead = true;
      engine.fluidSubsystem.placeFluid(22, 20, 'OIL', 1);
      engine.ignitionSubsystem.emitFromSources();
      expect(lit()).toEqual([]);
    });
  });
});
