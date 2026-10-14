import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from '../MiningGameEngine';
import { MiningIgnitionSubsystem } from './MiningIgnitionSubsystem';

const OIL_BURNS = { ignitionChance: 0.8, spreadChance: 0.5, burnDuration: 8, heat: 3, burnsInto: null };

describe('MiningIgnitionSubsystem', () => {
  let engine: MiningGameEngine;
  let roll: number;
  let ignition: MiningIgnitionSubsystem;

  /** An open pocket x 10..14, y 20..22 holding oil in its bottom row (y 22, x 10..14) and one dry cell. */
  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: 'ig', cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 },
      socket: { connected: true, emit: () => {} } as any,
    });
    for (let y = 0; y < engine.fluidSubsystem.grid.height; y++) {
      for (let x = 0; x < engine.fluidSubsystem.grid.width; x++) engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
    }
    for (let y = 18; y <= 24; y++) {
      for (let x = 8; x <= 16; x++) {
        engine.grid[y][x] = { type: x >= 10 && x <= 14 && y >= 20 && y <= 22 ? MiningTileType.EMPTY : MiningTileType.DIRT, revealed: true };
      }
    }
    for (let x = 10; x <= 14; x++) engine.fluidSubsystem.placeFluid(x, 22, 'OIL', 1);
    roll = 0;
    ignition = new MiningIgnitionSubsystem((engine as any).buildWorld(), () => roll);
    engine.dataManager.getFluid('OIL')!.flammability = OIL_BURNS;
  });

  afterEach(() => vi.restoreAllMocks());

  it('knows what burns where: oil does, empty air and rock do not', () => {
    expect(ignition.flammabilityAt(12, 22)).toEqual(OIL_BURNS);
    expect(ignition.flammabilityAt(12, 21)).toBeNull(); // empty
    expect(ignition.flammabilityAt(9, 22)).toBeNull(); // dirt
    expect(ignition.flammabilityAt(-1, 3)).toBeNull(); // off the map
  });

  it('a fluid that cannot burn is never flammable', () => {
    engine.dataManager.getFluid('OIL')!.flammability = null;
    expect(ignition.flammabilityAt(12, 22)).toBeNull();
    expect(ignition.emit(12.5, 22.5, 3, 5)).toBe(0);
  });

  it('lights oil within reach and only that oil', () => {
    expect(ignition.emit(12.5, 22.5, 1.01, 1)).toBe(3); // the cell and the two beside it (above is empty)
    const cells = ignition.takeIgnited().map((c) => c.x).sort();
    expect(cells).toEqual([11, 12, 13]);
  });

  it('chance 0.8 at strength 1 catches on a roll under 0.8 and misses on a roll over it', () => {
    roll = 0.79;
    expect(ignition.emit(12.5, 22.5, 0.5, 1)).toBe(1);
    ignition.takeIgnited();
    roll = 0.81;
    expect(ignition.emit(12.5, 22.5, 0.5, 1)).toBe(0);
  });

  it('a weaker source needs a luckier roll; a stronger one catches almost always', () => {
    roll = 0.5;
    expect(ignition.emit(12.5, 22.5, 0.5, 0.5)).toBe(0); // chance 0.4
    expect(ignition.emit(12.5, 22.5, 0.5, 2)).toBe(1); // chance clamps to 1
  });

  it('does nothing without strength', () => {
    expect(ignition.emit(12.5, 22.5, 3, 0)).toBe(0);
    expect(ignition.emit(12.5, 22.5, -1, 1)).toBe(0);
    expect(ignition.pendingCount).toBe(0);
  });

  it('counts a cell once however many sources hit it, and forgets cells once taken', () => {
    ignition.emit(12.5, 22.5, 0.5, 1);
    expect(ignition.emit(12.5, 22.5, 0.5, 1)).toBe(0);
    expect(ignition.pendingCount).toBe(1);
    expect(ignition.takeIgnited()).toEqual([{ x: 12, y: 22, flammability: OIL_BURNS }]);
    expect(ignition.takeIgnited()).toEqual([]);
    expect(ignition.emit(12.5, 22.5, 0.5, 1)).toBe(1);
  });

  describe('items', () => {
    const torch = { id: 'torch-sword', itemEffects: [{ value: 100, effect: { ignites: true } }] };
    const dud = { id: 'plain-sword', itemEffects: [{ value: 40, effect: { damageModifier: true } }] };

    beforeEach(() => {
      const original = engine.dataManager.getItemData.bind(engine.dataManager);
      vi.spyOn(engine.dataManager, 'getItemData').mockImplementation((id: string) =>
        id === 'torch-sword' ? (torch as any) : id === 'plain-sword' ? (dud as any) : original(id)
      );
    });

    it('a hit by an item that ignites sparks where it lands', () => {
      expect(ignition.fromHit({ source: { kind: 'player', itemId: 'torch-sword' } }, 12.5, 22.5)).toBeGreaterThan(0);
    });

    it('a hit by an item without the effect, or by something with no item, sparks nothing', () => {
      expect(ignition.fromHit({ source: { kind: 'player', itemId: 'plain-sword' } }, 12.5, 22.5)).toBe(0);
      expect(ignition.fromHit({ source: { kind: 'player' } }, 12.5, 22.5)).toBe(0);
      expect(ignition.fromHit({ source: { kind: 'player', itemId: 'unknown' } }, 12.5, 22.5)).toBe(0);
      expect(ignition.pendingCount).toBe(0);
    });

    it('an explosion of an item that ignites lights the whole blast, and one that does not lights nothing', () => {
      expect(ignition.fromExplosion('torch-sword', 12.5, 22.5, 3)).toBe(5);
      ignition.takeIgnited();
      expect(ignition.fromExplosion('plain-sword', 12.5, 22.5, 3)).toBe(0);
      expect(ignition.fromExplosion(undefined, 12.5, 22.5, 3)).toBe(0);
    });
  });
});
