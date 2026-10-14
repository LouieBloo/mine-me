import { describe, it, expect, vi } from 'vitest';
import { FireGrid, FIRE_SPREAD_DOWN, FIRE_SPREAD_SIDE, FIRE_SPREAD_UP, type Flammability, type FireWorld } from '../src/index';

const BURNS: Flammability = { ignitionChance: 1, spreadChance: 1, burnDuration: 4, heat: 2, burnsInto: null };

/** A simple world: a map of cell -> { flammability, fuel }. */
function makeWorld(cells: Record<string, { f?: Flammability; fuel?: number }>) {
  const key = (x: number, y: number) => `${x},${y}`;
  const state = new Map(Object.entries(cells).map(([k, v]) => [k, { f: v.f ?? BURNS, fuel: v.fuel ?? 1 }]));
  const spent: string[] = [];
  const world: FireWorld = {
    flammabilityAt: (x, y) => state.get(key(x, y))?.f ?? null,
    fuelAt: (x, y) => state.get(key(x, y))?.fuel ?? 0,
    consumeFuel: (x, y, amount) => {
      const c = state.get(key(x, y));
      if (c) c.fuel = Math.max(0, c.fuel - amount);
    },
    spend: (x, y) => spent.push(key(x, y)),
  };
  return { world, state, spent, key };
}
const rowOf = (n: number, y = 0, extra: { f?: Flammability; fuel?: number } = {}) =>
  Object.fromEntries(Array.from({ length: n }, (_, x) => [`${x},${y}`, { ...extra }]));

const alwaysSpread = () => 0;
const neverSpread = () => 0.999999;

describe('FireGrid ignition', () => {
  it('lights a flammable cell with fuel and reports it', () => {
    const { world } = makeWorld({ '2,2': {} });
    const fire = new FireGrid(5, 5, world, neverSpread);
    expect(fire.ignite(2, 2)).toBe(true);
    expect(fire.isBurning(2, 2)).toBe(true);
    expect(fire.burningCount).toBe(1);
    expect(fire.drainChanges()).toEqual([{ x: 2, y: 2, burning: true }]);
    expect(fire.drainChanges()).toEqual([]);
  });

  it('will not light what cannot burn, what has no fuel, what is already burning, or what is off the map', () => {
    const { world } = makeWorld({ '1,1': { fuel: 0 }, '2,2': {} });
    const fire = new FireGrid(5, 5, world, neverSpread);
    expect(fire.ignite(0, 0)).toBe(false);
    expect(fire.ignite(1, 1)).toBe(false);
    expect(fire.ignite(2, 2)).toBe(true);
    expect(fire.ignite(2, 2)).toBe(false);
    expect(fire.ignite(-1, 2)).toBe(false);
    expect(fire.ignite(9, 9)).toBe(false);
    expect(fire.ignite(1.5, 1)).toBe(false);
  });

  it('can be put out by hand', () => {
    const { world } = makeWorld({ '2,2': {} });
    const fire = new FireGrid(5, 5, world, neverSpread);
    fire.ignite(2, 2);
    fire.drainChanges();
    expect(fire.extinguish(2, 2)).toBe(true);
    expect(fire.extinguish(2, 2)).toBe(false);
    expect(fire.drainChanges()).toEqual([{ x: 2, y: 2, burning: false }]);
  });
});

describe('FireGrid burning out', () => {
  it('burns for the material\'s duration and then is spent', () => {
    const { world, spent } = makeWorld({ '2,2': { f: { ...BURNS, burnDuration: 2 }, fuel: 100 } });
    const fire = new FireGrid(5, 5, world, neverSpread);
    fire.ignite(2, 2);
    fire.step(1.9);
    expect(fire.isBurning(2, 2)).toBe(true);
    expect(spent).toEqual([]);
    fire.step(0.2);
    expect(fire.isBurning(2, 2)).toBe(false);
    expect(spent).toEqual(['2,2']);
  });

  it('burns fuel at the rate that empties a full cell in the burn duration', () => {
    const { world, state } = makeWorld({ '2,2': { f: { ...BURNS, burnDuration: 4 }, fuel: 1 } });
    const fire = new FireGrid(5, 5, world, neverSpread);
    fire.ignite(2, 2);
    fire.step(1);
    expect(state.get('2,2')!.fuel).toBeCloseTo(0.75, 5);
    fire.step(1);
    expect(state.get('2,2')!.fuel).toBeCloseTo(0.5, 5);
  });

  it('a thin cell runs out of fuel before its burn time and goes out, without being spent', () => {
    const { world, spent } = makeWorld({ '2,2': { f: { ...BURNS, burnDuration: 4 }, fuel: 0.3 } });
    const fire = new FireGrid(5, 5, world, neverSpread);
    fire.ignite(2, 2);
    fire.step(1); // burns off 0.25
    expect(fire.isBurning(2, 2)).toBe(true);
    fire.step(1); // fuel gone
    expect(fire.isBurning(2, 2)).toBe(false);
    expect(spent).toEqual([]);
  });

  it('goes out when what it burns is taken away, or stops being flammable', () => {
    const { world, state } = makeWorld({ '2,2': {} });
    const fire = new FireGrid(5, 5, world, neverSpread);
    fire.ignite(2, 2);
    state.delete('2,2');
    fire.step(0.1);
    expect(fire.isBurning(2, 2)).toBe(false);
  });

  it('does nothing for no time or an empty grid', () => {
    const { world } = makeWorld({ '2,2': {} });
    const fire = new FireGrid(5, 5, world, neverSpread);
    expect(fire.step(1)).toBe(0);
    fire.ignite(2, 2);
    expect(fire.step(0)).toBe(0);
    expect(fire.step(-1)).toBe(0);
    expect(fire.isBurning(2, 2)).toBe(true);
  });

  it('reports the cells that changed state in a step', () => {
    const { world } = makeWorld({ '2,2': { f: { ...BURNS, burnDuration: 1 } } });
    const fire = new FireGrid(5, 5, world, neverSpread);
    fire.ignite(2, 2);
    expect(fire.step(2)).toBe(1);
    expect(fire.drainChanges()).toEqual([{ x: 2, y: 2, burning: false }]);
  });
});

describe('FireGrid spreading', () => {
  it('spreads along flammable cells and not across a gap', () => {
    const { world } = makeWorld({ ...rowOf(3), '4,0': {}, '5,0': {} }); // 0,1,2 then a gap at 3, then 4,5
    const fire = new FireGrid(8, 1, world, alwaysSpread);
    fire.ignite(0, 0);
    for (let i = 0; i < 10; i++) fire.step(0.5);
    expect(fire.isBurning(1, 0) || fire.isBurning(2, 0) || !world.fuelAt(0, 0)).toBe(true);
    expect(fire.isBurning(4, 0)).toBe(false);
    expect(fire.isBurning(5, 0)).toBe(false);
  });

  it('never spreads with a spread chance of 0', () => {
    const { world } = makeWorld(rowOf(3, 0, { f: { ...BURNS, spreadChance: 0 } }));
    const fire = new FireGrid(3, 1, world, alwaysSpread);
    fire.ignite(0, 0);
    fire.step(1);
    expect(fire.isBurning(1, 0)).toBe(false);
  });

  it('spreads to fuel only: a neighbour with no fuel does not light', () => {
    const { world } = makeWorld({ '0,0': {}, '1,0': { fuel: 0 } });
    const fire = new FireGrid(3, 1, world, alwaysSpread);
    fire.ignite(0, 0);
    fire.step(1);
    expect(fire.isBurning(1, 0)).toBe(false);
  });

  it('a cell lit this step does not itself spread until the next step', () => {
    const { world } = makeWorld(rowOf(4));
    const fire = new FireGrid(4, 1, world, alwaysSpread);
    fire.ignite(0, 0);
    fire.step(1);
    expect(fire.isBurning(1, 0)).toBe(true);
    expect(fire.isBurning(2, 0)).toBe(false);
    fire.step(1);
    expect(fire.isBurning(2, 0)).toBe(true);
  });

  it('the neighbour\'s own ignition chance counts: hard-to-light material rarely catches', () => {
    const { world } = makeWorld({ '0,0': {}, '1,0': { f: { ...BURNS, ignitionChance: 0.1 } } });
    // chance = 1 (spread) x 1 (side) x 0.1 x 1s = 0.1
    const unlucky = new FireGrid(3, 1, world, () => 0.5);
    unlucky.ignite(0, 0);
    unlucky.step(1);
    expect(unlucky.isBurning(1, 0)).toBe(false);
    const lucky = new FireGrid(3, 1, world, () => 0.05);
    lucky.ignite(0, 0);
    lucky.step(1);
    expect(lucky.isBurning(1, 0)).toBe(true);
  });

  it('spreads more readily up than sideways, and sideways more than down', () => {
    expect(FIRE_SPREAD_UP).toBeGreaterThan(FIRE_SPREAD_SIDE);
    expect(FIRE_SPREAD_SIDE).toBeGreaterThan(FIRE_SPREAD_DOWN);
    // A burning cell with fuel on every side, spread chance 0.3 per second, one second: up 0.45, side 0.3, down 0.15
    const cells = { '1,1': { f: { ...BURNS, spreadChance: 0.3 } }, '1,0': {}, '0,1': {}, '2,1': {}, '1,2': {} };
    const outcome = (roll: number) => {
      const { world } = makeWorld(cells);
      const fire = new FireGrid(3, 3, world, () => roll);
      fire.ignite(1, 1);
      fire.step(1);
      return { up: fire.isBurning(1, 0), left: fire.isBurning(0, 1), right: fire.isBurning(2, 1), down: fire.isBurning(1, 2) };
    };
    expect(outcome(0.40)).toEqual({ up: true, left: false, right: false, down: false });
    expect(outcome(0.20)).toEqual({ up: true, left: true, right: true, down: false });
    expect(outcome(0.10)).toEqual({ up: true, left: true, right: true, down: true });
    expect(outcome(0.50)).toEqual({ up: false, left: false, right: false, down: false });
  });

  it('does not spread diagonally', () => {
    const { world } = makeWorld({ '1,1': {}, '0,0': {}, '2,2': {} });
    const fire = new FireGrid(3, 3, world, alwaysSpread);
    fire.ignite(1, 1);
    fire.step(1);
    expect(fire.isBurning(0, 0)).toBe(false);
    expect(fire.isBurning(2, 2)).toBe(false);
  });

  it('is deterministic for the same dice', () => {
    const run = () => {
      let seed = 7;
      const dice = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const { world } = makeWorld({ ...rowOf(20), ...rowOf(20, 1) });
      const fire = new FireGrid(20, 2, world, dice);
      fire.ignite(0, 0);
      for (let i = 0; i < 30; i++) fire.step(0.2);
      const out: string[] = [];
      fire.forEachBurning((x, y) => out.push(`${x},${y}`));
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('visits burning cells in a fixed order with the time they have left', () => {
    const { world } = makeWorld(rowOf(4));
    const fire = new FireGrid(4, 1, world, neverSpread);
    fire.ignite(3, 0);
    fire.ignite(1, 0);
    const seen: Array<[number, number, number]> = [];
    fire.forEachBurning((x, y, left) => seen.push([x, y, left]));
    expect(seen).toEqual([[1, 0, 4], [3, 0, 4]]);
  });

  it('spending a cell calls the world once, and a burning chain eventually burns out entirely', () => {
    const spend = vi.fn();
    const { world, state, key } = makeWorld(rowOf(5, 0, { f: { ...BURNS, burnDuration: 1 }, fuel: 50 }));
    // Like the real world, a spent cell stops being flammable (it burned into nothing)
    world.spend = (x, y) => {
      spend(x, y);
      state.delete(key(x, y));
    };
    const fire = new FireGrid(5, 1, world, alwaysSpread);
    fire.ignite(0, 0);
    for (let i = 0; i < 100 && fire.burningCount > 0; i++) fire.step(0.5);
    expect(fire.burningCount).toBe(0);
    expect(spend).toHaveBeenCalledTimes(5);
  });
});
