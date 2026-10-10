import { describe, it, expect, afterAll } from 'vitest';
import { MiningDataManager, type GameDefinitions } from './MiningDataManager';
import { MiningTileType } from '@mine-me/shared';
import { partialDefinitions } from '../testHelpers';

const defs: GameDefinitions = partialDefinitions({
  items: [
    { id: 'cuid-sol', itemKey: 'sol', name: 'Sol', type: 'CURRENCY' },
    { id: 'cuid-dyn', itemKey: null, name: 'Dynamite', subType: 'DYNAMITE', physicsConfig: { fuseSeconds: 2 }, soundEffects: { throw: { url: '/t.mp3' } },
      itemEffects: [{ value: 3, effect: { explodes: true } }] },
    { id: 'cuid-pick', itemKey: 'iron_pickaxe', name: 'Iron Pickaxe' },
  ],
  mobs: [{ id: 'mob-1', name: 'Mole Person' }],
  blocks: [
    { id: 'b1', typeKey: 'DIRT', health: 80, dropTable: null },
    { id: 'b2', typeKey: 'ROCK', health: 0 },
  ],
});

describe('MiningDataManager (in-memory definitions)', () => {
  const dm = new MiningDataManager(defs);

  it('finds items by id, itemKey and name, case-insensitively, in that order of precedence', () => {
    expect(dm.getItemData('cuid-sol')?.name).toBe('Sol');
    expect(dm.getItemData('sol')?.id).toBe('cuid-sol');
    expect(dm.getItemData('SOL')?.id).toBe('cuid-sol');
    expect(dm.getItemData('Iron Pickaxe')?.id).toBe('cuid-pick');
    expect(dm.getItemData('iron_pickaxe')?.id).toBe('cuid-pick');
    expect(dm.getItemData('CUID-DYN')?.id).toBe('cuid-dyn');
    expect(dm.getItemData('nope')).toBeUndefined();
  });

  it('prefers an exact id over another item whose key/name matches', () => {
    const m = new MiningDataManager(
      partialDefinitions({ items: [{ id: 'a', itemKey: 'b', name: 'x' }, { id: 'b', itemKey: null, name: 'y' }] })
    );
    expect(m.getItemData('b')?.id).toBe('b');
  });

  it('ignores non-string lookups instead of throwing', () => {
    expect(dm.getItemData(undefined as any)).toBeUndefined();
    expect(dm.getMobData(null as any)).toBeUndefined();
  });

  it('finds mobs by id or case-insensitive name', () => {
    expect(dm.getMobData('mob-1')?.name).toBe('Mole Person');
    expect(dm.getMobData('mole person')?.id).toBe('mob-1');
    expect(dm.getMobData('ghost')).toBeUndefined();
  });

  it('resolves block configs by tile type and falls back to 100 health', () => {
    expect(dm.getBlockConfig(MiningTileType.DIRT)?.id).toBe('b1');
    expect(dm.getBlockMaxHealth(MiningTileType.DIRT)).toBe(80);
    expect(dm.getBlockMaxHealth(MiningTileType.ROCK)).toBe(100); // health 0 -> default
    expect(dm.getBlockMaxHealth(MiningTileType.MINERAL)).toBe(100); // no config -> default
    expect(dm.getBlockConfig(MiningTileType.EMPTY)).toBeUndefined();
  });

  it('exposes item helpers', () => {
    expect(dm.getItemExplosionRadius('dynamite')).toBe(3);
    expect(dm.getItemSoundEffects('dynamite')).toEqual({ throw: { url: '/t.mp3' } });
    expect(dm.getItemPhysicsConfig('dynamite')).toEqual({ fuseSeconds: 2 });
    expect(dm.getDynamiteItemPhysicsConfig()).toEqual({ fuseSeconds: 2 });
    expect(new MiningDataManager({ items: [], mobs: [], blocks: [] }).getDynamiteItemPhysicsConfig().fuseSeconds).toBeGreaterThan(0);
  });

  describe('singleton', () => {
    const original = MiningDataManager.getInstance();
    afterAll(() => {
      MiningDataManager.initialize({ items: original.getItems(), mobs: (original as any).mobs, blocks: [...(original as any).blocksByTypeKey.values()] });
    });

    it('throws a clear error until initialized', () => {
      MiningDataManager.reset();
      expect(MiningDataManager.isInitialized()).toBe(false);
      expect(() => MiningDataManager.getInstance()).toThrow(/not been initialized/);
    });

    it('serves what was installed', () => {
      MiningDataManager.initialize(defs);
      expect(MiningDataManager.isInitialized()).toBe(true);
      expect(MiningDataManager.getInstance().getItemData('sol')?.id).toBe('cuid-sol');
    });
  });
});
