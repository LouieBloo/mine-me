import { describe, it, expect } from 'vitest';
import { MiningTileType, NO_MISSION_REQUIREMENTS, deriveMissionRequirements, type MissionRequirements } from '@mine-me/shared';
import { generateMiningMapWithFluids } from './miningMap.service';
import { censusOf, mapShortfall } from './mining/missions/missionCensus';
import { MiningDataManager } from './mining/subsystems/MiningDataManager';
import { requirementContext } from './mining/missions/missionContext';
import { buildMapForMode } from './mining/mapSources';

const data = () => MiningDataManager.getInstance();
const options = (seed: number, mission?: MissionRequirements) => ({ seed, fluids: data().getFluids(), gases: data().getGases(), biomes: data().getBiomes(), mission });
const nitrogen = () => data().getGases().find((g) => !g.generation)!;

const countTiles = (grid: { type: number }[][], type: number) => grid.flat().filter((t) => t.type === type).length;

describe('the map holds what the mission needs (ticket 110)', () => {
  it('adds enough of a block, over many seeds, and never fewer than the usual recipe makes', () => {
    const req: MissionRequirements = { ...NO_MISSION_REQUIREMENTS, blocks: [{ typeKey: 'SILVERIUM', minCount: 200 }] };
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const without = generateMiningMapWithFluids(options(seed));
      const withMission = generateMiningMapWithFluids(options(seed, req));
      expect(countTiles(withMission.grid, MiningTileType.SILVERIUM)).toBeGreaterThanOrEqual(200);
      expect(countTiles(withMission.grid, MiningTileType.SILVERIUM)).toBeGreaterThanOrEqual(countTiles(without.grid, MiningTileType.SILVERIUM));
    }
  });

  it('puts a sealed pocket of a gas the recipe never makes, and of a fluid', () => {
    const gas = nitrogen();
    const req: MissionRequirements = { ...NO_MISSION_REQUIREMENTS, gases: [{ typeKey: gas.typeKey, minCells: 8 }], fluids: [{ typeKey: 'LAVA', minCells: 30 }] };
    for (const seed of [1, 2, 3, 4]) {
      const map = generateMiningMapWithFluids(options(seed, req));
      expect(map.gasCells.filter((c) => c.typeKey === gas.typeKey).length).toBeGreaterThanOrEqual(8);
      expect(map.fluidCells.filter((c) => c.typeKey === 'LAVA').length).toBeGreaterThanOrEqual(30);
      expect(mapShortfall(req, map)).toEqual([]);
    }
  });

  it('is the same map for the same seed and mission', () => {
    const req: MissionRequirements = { ...NO_MISSION_REQUIREMENTS, blocks: [{ typeKey: 'COPPERIUM', minCount: 150 }], gases: [{ typeKey: nitrogen().typeKey, minCells: 8 }] };
    const a = generateMiningMapWithFluids(options(7, req));
    const b = generateMiningMapWithFluids(options(7, req));
    expect(a.grid).toEqual(b.grid);
    expect(a.gasCells).toEqual(b.gasCells);
  });

  it('leaves a map with no mission exactly as it was (nothing asked, nothing drawn)', () => {
    const plain = generateMiningMapWithFluids(options(9));
    expect(generateMiningMapWithFluids(options(9, NO_MISSION_REQUIREMENTS)).grid).toEqual(plain.grid);
    // a requirement the map already meets changes nothing either
    const met: MissionRequirements = { ...NO_MISSION_REQUIREMENTS, blocks: [{ typeKey: 'DIRT', minCount: 10 }] };
    expect(generateMiningMapWithFluids(options(9, met)).grid).toEqual(plain.grid);
  });

  it('keeps the entrance and the surface row clear of the extra blocks', () => {
    const req: MissionRequirements = { ...NO_MISSION_REQUIREMENTS, blocks: [{ typeKey: 'COPPERIUM', minCount: 3000 }] };
    const map = generateMiningMapWithFluids(options(3, req));
    expect(map.grid[0].every((t) => t.type !== MiningTileType.COPPERIUM)).toBe(true);
  });

  it('the feasibility check names what is missing, and a real mission passes it', () => {
    const req: MissionRequirements = { ...NO_MISSION_REQUIREMENTS, blocks: [{ typeKey: 'SILVERIUM', minCount: 99999 }] };
    const map = generateMiningMapWithFluids(options(2));
    expect(mapShortfall(req, map)[0]).toMatchObject({ kind: 'block', key: 'SILVERIUM' });
    const copper = data().getBlocksDropping(data().getItems().find((i) => data().getBlocksDropping(i.id).some((b) => b.typeKey === 'COPPERIUM'))!.id);
    expect(copper.length).toBeGreaterThan(0);
    const real = deriveMissionRequirements([{ type: 'MINE_ITEM', targetId: data().getItems().find((i) => data().getBlocksDropping(i.id).some((b) => b.typeKey === 'COPPERIUM'))!.id, amount: 40 }], requirementContext(data()));
    expect(mapShortfall(real, generateMiningMapWithFluids(options(2, real)))).toEqual([]);
    expect(censusOf(map).depth).toBeGreaterThan(50);
  });

  it('builds a real run map with the guarantee through the map source', () => {
    const gas = nitrogen();
    const req: MissionRequirements = { ...NO_MISSION_REQUIREMENTS, gases: [{ typeKey: gas.typeKey, minCells: 8 }] };
    const built = buildMapForMode('singleplayer', { seed: 5, fluids: data().getFluids(), gases: data().getGases(), biomes: data().getBiomes(), mission: req });
    expect(built.gasCells?.filter((c) => c.typeKey === gas.typeKey).length).toBeGreaterThanOrEqual(8);
  });
});
