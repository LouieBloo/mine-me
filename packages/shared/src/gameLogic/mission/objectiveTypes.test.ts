import { describe, it, expect } from 'vitest';
import { AVAILABLE_OBJECTIVE_TYPES, OBJECTIVE_TYPES, describeObjective, formatProgress, isObjectiveType, progressFraction, validateObjective, type MissionLookups } from './objectiveTypes';

const names: Record<string, string> = { copper: 'Copperium', mole: 'Mole Person', water: 'Water', hydrogen: 'Hydrogen' };
const lookups: MissionLookups = {
  hasItem: (id) => id === 'copper' || id === 'unmineable',
  hasMob: (id) => id === 'mole',
  hasFluid: (id) => id === 'water',
  hasGas: (id) => id === 'hydrogen',
  nameOf: (_kind, id) => names[id],
  itemIsMineable: (id) => id === 'copper',
  maxDepth: 120,
};

describe('objective type registry', () => {
  it('knows every type, and PUMP_FLUID is not available yet', () => {
    expect(Object.keys(OBJECTIVE_TYPES).sort()).toEqual(['CLEAR_FLUID', 'CLEAR_GAS', 'KILL_MOB', 'MINE_ITEM', 'PUMP_FLUID', 'REACH_DEPTH']);
    expect(AVAILABLE_OBJECTIVE_TYPES).not.toContain('PUMP_FLUID');
    expect(isObjectiveType('KILL_MOB')).toBe(true);
    expect(isObjectiveType('DANCE')).toBe(false);
  });
});

describe('validateObjective', () => {
  it('accepts a good objective of each type', () => {
    expect(validateObjective({ type: 'MINE_ITEM', targetId: 'copper', amount: 10 }, lookups)).toEqual([]);
    expect(validateObjective({ type: 'KILL_MOB', targetId: 'mole', amount: 3 }, lookups)).toEqual([]);
    expect(validateObjective({ type: 'KILL_MOB', amount: 3 }, lookups)).toEqual([]); // any mob
    expect(validateObjective({ type: 'CLEAR_FLUID', targetId: 'water', amount: 90 }, lookups)).toEqual([]);
    expect(validateObjective({ type: 'CLEAR_GAS', targetId: 'hydrogen', amount: 50 }, lookups)).toEqual([]);
    expect(validateObjective({ type: 'REACH_DEPTH', amount: 60 }, lookups)).toEqual([]);
  });

  it('rejects an unknown type, a type that cannot be used yet, and a missing objective', () => {
    expect(validateObjective({ type: 'DANCE' as never, amount: 1 }, lookups)[0]).toMatch(/unknown objective type/);
    expect(validateObjective({ type: 'PUMP_FLUID', targetId: 'water', amount: 5 }, lookups).join()).toMatch(/cannot be used yet/);
    expect(validateObjective(null, lookups)).toHaveLength(1);
  });

  it('rejects bad amounts (zero, negative, fractions, too many cells)', () => {
    for (const amount of [0, -3, 2.5, Number.NaN]) expect(validateObjective({ type: 'MINE_ITEM', targetId: 'copper', amount }, lookups).join()).toMatch(/amount/);
    expect(validateObjective({ type: 'CLEAR_FLUID', targetId: 'water', amount: 1001 }, lookups).join()).toMatch(/amount/);
  });

  it('rejects unknown targets, a missing required target and a target where none is taken', () => {
    expect(validateObjective({ type: 'MINE_ITEM', targetId: 'nope', amount: 1 }, lookups).join()).toMatch(/unknown item/);
    expect(validateObjective({ type: 'KILL_MOB', targetId: 'nope', amount: 1 }, lookups).join()).toMatch(/unknown mob/);
    expect(validateObjective({ type: 'CLEAR_GAS', amount: 50 }, lookups).join()).toMatch(/choose a gas/);
    expect(validateObjective({ type: 'REACH_DEPTH', targetId: 'copper', amount: 5 }, lookups).join()).toMatch(/no target/);
  });

  it('rejects an item no block drops and a depth beyond the map', () => {
    expect(validateObjective({ type: 'MINE_ITEM', targetId: 'unmineable', amount: 5 }, lookups).join()).toMatch(/no block drops/);
    expect(validateObjective({ type: 'REACH_DEPTH', amount: 121 }, lookups).join()).toMatch(/only 120 blocks deep/);
  });
});

describe('describing and showing progress', () => {
  it('writes each objective as a sentence with the target name', () => {
    expect(describeObjective({ type: 'MINE_ITEM', targetId: 'copper', amount: 10 }, lookups)).toBe('Collect 10 Copperium');
    expect(describeObjective({ type: 'KILL_MOB', targetId: 'mole', amount: 3 }, lookups)).toBe('Kill 3 Mole Person');
    expect(describeObjective({ type: 'KILL_MOB', amount: 1 }, lookups)).toBe('Kill 1 mob');
    expect(describeObjective({ type: 'CLEAR_FLUID', targetId: 'water', amount: 90 }, lookups)).toBe('Clear 90 cells of the Water');
    expect(describeObjective({ type: 'CLEAR_GAS', targetId: 'hydrogen', amount: 1 }, lookups)).toBe('Clear 1 cell of the Hydrogen');
    expect(describeObjective({ type: 'REACH_DEPTH', amount: 40 }, lookups)).toBe('Reach depth 40');
  });

  it('falls back to the id when a name is unknown', () => {
    expect(describeObjective({ type: 'MINE_ITEM', targetId: 'xyz', amount: 2 }, { nameOf: () => undefined })).toBe('Collect 2 xyz');
  });

  it('formats progress by unit and caps it at the target', () => {
    expect(formatProgress('count', 3, 10)).toBe('3 / 10');
    expect(formatProgress('count', 14, 10)).toBe('10 / 10');
    expect(formatProgress('percent', 45.7, 90)).toBe('45%');
    expect(formatProgress('percent', 140, 90)).toBe('100%');
    expect(formatProgress('depth', 12, 40)).toBe('12 / 40');
  });

  it('gives a 0 to 1 fraction for a bar', () => {
    expect(progressFraction(5, 10)).toBe(0.5);
    expect(progressFraction(20, 10)).toBe(1);
    expect(progressFraction(-1, 10)).toBe(0);
    expect(progressFraction(0, 0)).toBe(1);
  });
});
