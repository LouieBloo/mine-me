import { describe, it, expect } from 'vitest';
import { MISSION_MIN_POCKET_CELLS, MISSION_SUPPLY_MARGIN, deriveMissionRequirements, hasRequirements, missionShortfall, cellsCleared, NO_MISSION_REQUIREMENTS, type MapCensus, type RequirementContext } from './missionRequirements';

const ctx: RequirementContext = {
  blocksDropping: (id) => (id === 'copper' ? [{ typeKey: 'COPPERIUM', expectedPerBlock: 1 }, { typeKey: 'DIRT', expectedPerBlock: 0.1 }] : []),
  fluidTypeKey: (id) => (id === 'water' ? 'WATER' : undefined),
  gasTypeKey: (id) => (id === 'hydrogen' ? 'HYDROGEN' : undefined),
};

const census = (over: Partial<MapCensus> = {}): MapCensus => ({
  blockCounts: new Map(), mobCounts: new Map(), fluidCells: new Map(), gasCells: new Map(), depth: 120, ...over,
});

describe('deriveMissionRequirements', () => {
  it('asks for twice the need in the best block, adding objectives that share a block', () => {
    const req = deriveMissionRequirements([{ type: 'MINE_ITEM', targetId: 'copper', amount: 10 }, { type: 'MINE_ITEM', targetId: 'copper', amount: 5 }], ctx);
    expect(req.blocks).toEqual([{ typeKey: 'COPPERIUM', minCount: 30 }]);
  });

  it('asks for more spawns than kills, for one mob or any mob', () => {
    const req = deriveMissionRequirements([{ type: 'KILL_MOB', targetId: 'mole', amount: 4 }, { type: 'KILL_MOB', amount: 2 }], ctx);
    expect(req.mobs).toEqual([{ mobId: 'mole', minSpawns: 6 }, { mobId: null, minSpawns: 4 }]);
  });

  it('asks for the cells to clear times the margin (at least one small pocket), and for depth', () => {
    const req = deriveMissionRequirements([{ type: 'CLEAR_FLUID', targetId: 'water', amount: 90 }, { type: 'CLEAR_GAS', targetId: 'hydrogen', amount: 50 }, { type: 'REACH_DEPTH', amount: 40 }, { type: 'REACH_DEPTH', amount: 70 }], ctx);
    expect(req.fluids).toEqual([{ typeKey: 'WATER', minCells: 90 * MISSION_SUPPLY_MARGIN }]);
    expect(req.gases).toEqual([{ typeKey: 'HYDROGEN', minCells: 50 * MISSION_SUPPLY_MARGIN }]);
    expect(req.minDepth).toBe(70);
  });

  it('adds up objectives that clear the same fluid, and never asks for less than a small pocket', () => {
    const both = deriveMissionRequirements([{ type: 'CLEAR_FLUID', targetId: 'water', amount: 20 }, { type: 'CLEAR_FLUID', targetId: 'water', amount: 30 }], ctx);
    expect(both.fluids).toEqual([{ typeKey: 'WATER', minCells: 50 * MISSION_SUPPLY_MARGIN }]);
    expect(deriveMissionRequirements([{ type: 'CLEAR_FLUID', targetId: 'water', amount: 1 }], ctx).fluids).toEqual([{ typeKey: 'WATER', minCells: MISSION_MIN_POCKET_CELLS }]);
  });

  it('asks for nothing it cannot name (an unmineable item, an unknown fluid)', () => {
    const req = deriveMissionRequirements([{ type: 'MINE_ITEM', targetId: 'ghost', amount: 3 }, { type: 'CLEAR_FLUID', targetId: 'lava', amount: 50 }], ctx);
    expect(hasRequirements(req)).toBe(false);
    expect(hasRequirements(NO_MISSION_REQUIREMENTS)).toBe(false);
  });
});

describe('missionShortfall (the feasibility check)', () => {
  const req = deriveMissionRequirements(
    [{ type: 'MINE_ITEM', targetId: 'copper', amount: 10 }, { type: 'KILL_MOB', targetId: 'mole', amount: 2 }, { type: 'CLEAR_FLUID', targetId: 'water', amount: 90 }, { type: 'CLEAR_GAS', targetId: 'hydrogen', amount: 50 }, { type: 'REACH_DEPTH', amount: 100 }],
    ctx
  );

  it('lists everything the map lacks', () => {
    const lacking = missionShortfall(req, census({ depth: 60 }));
    expect(lacking.map((s) => s.kind).sort()).toEqual(['block', 'depth', 'fluid', 'gas', 'mob']);
    expect(lacking.find((s) => s.kind === 'block')).toMatchObject({ key: 'COPPERIUM', missing: 20 });
    expect(lacking.find((s) => s.kind === 'depth')?.missing).toBe(40);
  });

  it('is empty once the map holds enough', () => {
    const full = census({ blockCounts: new Map([['COPPERIUM', 25]]), mobCounts: new Map([['mole', 4]]), fluidCells: new Map([['WATER', 180]]), gasCells: new Map([['HYDROGEN', 100]]), depth: 100 });
    expect(missionShortfall(req, full)).toEqual([]);
  });

  it('counts every mob for an any-mob requirement', () => {
    const anyReq = deriveMissionRequirements([{ type: 'KILL_MOB', amount: 3 }], ctx);
    expect(missionShortfall(anyReq, census({ mobCounts: new Map([['a', 3], ['b', 2]]) }))).toEqual([]);
    expect(missionShortfall(anyReq, census({ mobCounts: new Map([['a', 2]]) }))[0]).toMatchObject({ kind: 'mob', missing: 3 });
  });
});

describe('cellsCleared', () => {
  it('is how many cells of the start are gone, never negative', () => {
    expect(cellsCleared(160, 16)).toBe(144);
    expect(cellsCleared(160, 160)).toBe(0);
    expect(cellsCleared(160, 200)).toBe(0);
    expect(cellsCleared(160, 0)).toBe(160);
  });

  it('is 0 when there was nothing to clear', () => {
    expect(cellsCleared(0, 0)).toBe(0);
  });
});
