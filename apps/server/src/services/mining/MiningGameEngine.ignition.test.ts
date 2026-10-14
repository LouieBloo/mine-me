import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

const OIL_BURNS = { ignitionChance: 1, spreadChance: 0.5, burnDuration: 8, heat: 3, burnsInto: null };
const ignitesItem = (id: string, value = 100) => ({ id, name: id, itemEffects: [{ value, effect: { ignites: true } }] });

describe('sparks in a mining room', () => {
  const cid = 'spark-char';
  let engine: MiningGameEngine;
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const items = new Map<string, unknown>();
  const lit = () => engine.ignitionSubsystem.takeIgnited().map((c) => `${c.x},${c.y}`).sort();

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // every roll succeeds when the chance is above 0
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 },
      toolDamage: 25, weaponDamage: 40, miningSpeed: 25,
      socket: { connected: true, emit: vi.fn() } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    // Open room x 16..28, y 17..20 over a dirt floor at row 21; the player stands at x = 22.5
    for (let x = 16; x <= 28; x++) {
      for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    me().playerBody.position = { x: 22.5, y: 21 - me().playerBody.halfHeight };
    me().playerBody.isGrounded = true;
    me().aimDirection = { x: 1, y: 0 };
    for (let y = 0; y < engine.fluidSubsystem.grid.height; y++) {
      for (let x = 0; x < engine.fluidSubsystem.grid.width; x++) engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
    }
    engine.dataManager.getFluid('OIL')!.flammability = OIL_BURNS;
    items.clear();
    for (const id of ['torch-pick', 'torch-dynamite']) items.set(id, ignitesItem(id));
    items.set('plain-pick', { id: 'plain-pick', name: 'plain-pick', itemEffects: [] } as any);
    const original = engine.dataManager.getItemData.bind(engine.dataManager);
    vi.spyOn(engine.dataManager, 'getItemData').mockImplementation((id: string) => (items.get(id) as any) ?? original(id));
  });

  afterEach(() => vi.restoreAllMocks());

  const mineBlockNextToOil = (weaponId: string) => {
    engine.grid[19][23] = { type: MiningTileType.DIRT, revealed: true };
    engine.fluidSubsystem.placeFluid(23, 20, 'OIL', 1); // directly under the block
    me().equippedWeaponId = weaponId;
    me().inputs = { ...me().inputs, miningKey: true, miningTarget: { x: 23, y: 19 } };
    tick(1);
  };

  it('mining with an item that ignites sets oil next to the block alight', () => {
    mineBlockNextToOil('torch-pick');
    expect(lit()).toEqual(['23,20']);
  });

  it('mining with an ordinary tool lights nothing', () => {
    mineBlockNextToOil('plain-pick');
    expect(lit()).toEqual([]);
  });

  it('mining with nothing equipped lights nothing', () => {
    mineBlockNextToOil(null as unknown as string);
    expect(lit()).toEqual([]);
  });

  it('a melee hit with an item that ignites lights oil where the mob stands', () => {
    const mob = engine.spawnMob({ id: 'm', name: 'Mole', health: 500, aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 }, { x: 23.4, y: 21 });
    engine.fluidSubsystem.placeFluid(23, 20, 'OIL', 1);
    me().equippedWeaponId = 'torch-pick';
    me().inputs = { ...me().inputs, miningKey: true, miningTarget: null };
    tick(1);
    expect(mob.health).toBeLessThan(500);
    expect(lit()).toContain('23,20');
  });

  it('a thrown explosive that ignites lights the oil in the whole blast, and one that does not does not', () => {
    for (let x = 20; x <= 25; x++) engine.fluidSubsystem.placeFluid(x, 20, 'OIL', 1);
    engine.explodeDynamite({ id: 'd1', position: { x: 22.5, y: 19.5 }, explosionRadius: 3, ownerId: cid, itemId: 'plain-pick' } as any);
    expect(lit()).toEqual([]);
    for (let x = 20; x <= 25; x++) engine.fluidSubsystem.placeFluid(x, 20, 'OIL', 1);
    engine.explodeDynamite({ id: 'd2', position: { x: 22.5, y: 19.5 }, explosionRadius: 3, ownerId: cid, itemId: 'torch-dynamite' } as any);
    expect(lit().length).toBeGreaterThan(2);
  });

  it('a hit on a player by something that ignites lights oil where the player stands', () => {
    engine.fluidSubsystem.placeFluid(22, 20, 'OIL', 1);
    engine.applyDamage({ kind: 'player', id: cid }, { amount: 5, type: 'melee', source: { kind: 'mob', itemId: 'torch-pick' } });
    expect(lit()).toContain('22,20');
  });

  it('a weaker Ignites effect needs luckier rolls', () => {
    vi.mocked(Math.random).mockReturnValue(0.5);
    items.set('weak', ignitesItem('weak', 30));
    engine.fluidSubsystem.placeFluid(23, 20, 'OIL', 1);
    expect(engine.ignitionSubsystem.fromHit({ source: { kind: 'player', itemId: 'weak' } }, 23.5, 20.5)).toBe(0);
    expect(engine.ignitionSubsystem.fromHit({ source: { kind: 'player', itemId: 'torch-pick' } }, 23.5, 20.5)).toBe(1);
  });
});
