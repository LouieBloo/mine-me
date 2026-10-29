import { describe, it, expect } from 'vitest';
import type { MissionDefinition, MissionRewardView } from '@mine-me/shared';
import { MissionTracker, type MissionTrackerDeps } from './MissionTracker';

const reward: MissionRewardView = { sol: 10, xp: 5, items: [] };

function setup(objectives: MissionDefinition['objectives'], totals: { fluid?: number; gas?: number } = {}) {
  const state = { fluid: totals.fluid ?? 160, gas: totals.gas ?? 40 };
  const deps: MissionTrackerDeps = {
    lookups: { nameOf: (_k, id) => ({ copper: 'Copperium', mole: 'Mole Person', water: 'Water', hydrogen: 'Hydrogen' } as Record<string, string>)[id] },
    fluidTypeKey: (id) => (id === 'water' ? 'WATER' : undefined),
    gasTypeKey: (id) => (id === 'hydrogen' ? 'HYDROGEN' : undefined),
    fluidTotal: () => state.fluid,
    gasTotal: () => state.gas,
    mapDepth: 100,
    playerName: (id) => id.toUpperCase(),
    reward,
  };
  const mission: MissionDefinition = { id: 'm', key: 'm', name: 'Test', minLevel: 1, maxLevel: 9, tier: 1, weight: 1, objectives, rewardSol: 10, rewardXp: 5, rewardItems: [] };
  return { tracker: new MissionTracker(mission, deps), state };
}

describe('MINE_ITEM', () => {
  it('counts items collected into the backpack, only of the target item', () => {
    const { tracker } = setup([{ type: 'MINE_ITEM', targetId: 'copper', amount: 5 }]);
    tracker.onItemCollected('a', 'gold', 4);
    tracker.onItemCollected('a', 'copper', 2);
    expect(tracker.clientState().objectives[0]).toMatchObject({ progress: 2, target: 5, done: false, label: 'Collect 5 Copperium' });
    tracker.onItemCollected('b', 'copper', 3);
    expect(tracker.clientState().objectives[0].done).toBe(true);
    expect(tracker.completed).toBe(true);
  });

  it('does not count past the goal or after it is done', () => {
    const { tracker } = setup([{ type: 'MINE_ITEM', targetId: 'copper', amount: 3 }]);
    tracker.onItemCollected('a', 'copper', 10);
    tracker.onItemCollected('a', 'copper', 10);
    expect(tracker.clientState().objectives[0].progress).toBe(3);
    expect(tracker.result(['a'], 'completed').contributions[0].amounts).toEqual([3]);
  });

  it('ignores zero and negative quantities', () => {
    const { tracker } = setup([{ type: 'MINE_ITEM', targetId: 'copper', amount: 3 }]);
    tracker.onItemCollected('a', 'copper', 0);
    tracker.onItemCollected('a', 'copper', -2);
    expect(tracker.clientState().objectives[0].progress).toBe(0);
  });
});

describe('KILL_MOB', () => {
  it('counts a named mob, or any mob when none is named', () => {
    const { tracker } = setup([{ type: 'KILL_MOB', targetId: 'mole', amount: 2 }, { type: 'KILL_MOB', amount: 3 }]);
    tracker.onMobKilled('a', 'mole');
    tracker.onMobKilled('a', 'bat');
    tracker.onMobKilled('b', 'mole');
    const [named, any] = tracker.clientState().objectives;
    expect(named).toMatchObject({ progress: 2, done: true });
    expect(any).toMatchObject({ progress: 3, done: true });
    expect(tracker.completed).toBe(true);
  });
});

describe('REACH_DEPTH', () => {
  it('completes when any player gets deep enough, crediting the deepest of each', () => {
    const { tracker } = setup([{ type: 'REACH_DEPTH', amount: 40 }]);
    tracker.onDepth('a', 10);
    tracker.onDepth('b', 25);
    tracker.onDepth('a', 5);
    expect(tracker.clientState().objectives[0]).toMatchObject({ progress: 25, done: false });
    tracker.onDepth('a', 41);
    expect(tracker.clientState().objectives[0]).toMatchObject({ progress: 40, done: true });
    expect(tracker.result(['a', 'b'], 'completed').contributions.map((c) => c.amounts[0])).toEqual([41, 25]);
  });

  it('never asks for more depth than the map has', () => {
    const { tracker } = setup([{ type: 'REACH_DEPTH', amount: 500 }]);
    expect(tracker.clientState().objectives[0].target).toBe(98);
    tracker.onDepth('a', 98);
    expect(tracker.completed).toBe(true);
  });
});

describe('CLEAR_FLUID and CLEAR_GAS', () => {
  it('counts the cells of the starting amount that are gone and completes at the goal', () => {
    const { tracker, state } = setup([{ type: 'CLEAR_FLUID', targetId: 'water', amount: 90 }], { fluid: 160 });
    expect(tracker.clientState().objectives[0].label).toBe('Clear 90 cells of the Water');
    state.fluid = 110;
    tracker.poll();
    expect(tracker.clientState().objectives[0]).toMatchObject({ progress: 50, target: 90, done: false, unit: 'count' });
    state.fluid = 60;
    tracker.poll();
    expect(tracker.clientState().objectives[0]).toMatchObject({ progress: 90, target: 90, done: true });
  });

  it('holds a goal bigger than the map holds to what is there, and says so in the label', () => {
    const { tracker, state } = setup([{ type: 'CLEAR_FLUID', targetId: 'water', amount: 300 }], { fluid: 40 });
    expect(tracker.clientState().objectives[0]).toMatchObject({ target: 40, label: 'Clear 40 cells of the Water' });
    state.fluid = 0;
    tracker.poll();
    expect(tracker.completed).toBe(true);
  });

  it('keeps the baseline from the start: later flow or growth does not move it', () => {
    const { tracker, state } = setup([{ type: 'CLEAR_GAS', targetId: 'hydrogen', amount: 20 }], { gas: 40 });
    state.gas = 100; // more arrived: nothing is cleared
    tracker.poll();
    expect(tracker.clientState().objectives[0].progress).toBe(0);
    state.gas = 20;
    tracker.poll();
    expect(tracker.clientState().objectives[0]).toMatchObject({ progress: 20, done: true });
  });

  it('counts as done at the start when the map has none to clear', () => {
    const { tracker } = setup([{ type: 'CLEAR_GAS', targetId: 'hydrogen', amount: 50 }], { gas: 0 });
    expect(tracker.completed).toBe(true);
  });

  it('does not walk progress back once it is done', () => {
    const { tracker, state } = setup([{ type: 'CLEAR_FLUID', targetId: 'water', amount: 50 }], { fluid: 100 });
    state.fluid = 10;
    tracker.poll();
    state.fluid = 100;
    tracker.poll();
    expect(tracker.clientState().objectives[0].done).toBe(true);
  });
});

describe('KILL_MOB in co-op', () => {
  it('counts a kill nobody can be credited with for the run, but for nobody on the results screen', () => {
    const { tracker } = setup([{ type: 'KILL_MOB', amount: 2 }]);
    tracker.onMobKilled('a', 'x');
    tracker.onMobKilled(null, 'x');
    expect(tracker.clientState().objectives[0]).toMatchObject({ progress: 2, done: true });
    const result = tracker.result(['a', 'b'], 'completed');
    expect(result.contributions.find((c) => c.characterId === 'a')?.amounts).toEqual([1]);
    expect(result.contributions.find((c) => c.characterId === 'b')?.amounts).toEqual([0]);
  });
});

describe('completion, deltas and rewards', () => {
  it('sends only the objectives that moved, once, and announces completion once', () => {
    const { tracker } = setup([{ type: 'MINE_ITEM', targetId: 'copper', amount: 2 }, { type: 'KILL_MOB', amount: 2 }]);
    expect(tracker.takeDelta()).toBeNull();
    tracker.onItemCollected('a', 'copper', 1);
    expect(tracker.takeDelta()).toEqual({ objectives: [{ index: 0, progress: 1, done: false }] });
    expect(tracker.takeDelta()).toBeNull();
    tracker.onItemCollected('a', 'copper', 1);
    tracker.onMobKilled('a', 'x');
    tracker.onMobKilled('a', 'x');
    const delta = tracker.takeDelta()!;
    expect(delta.objectives.map((o) => o.index)).toEqual([0, 1]);
    expect(delta.completed).toBe(true);
    expect(tracker.takeDelta()).toBeNull();
  });

  it('pays each player once, and only after completion', () => {
    const { tracker } = setup([{ type: 'KILL_MOB', amount: 1 }]);
    expect(tracker.claim('a')).toBe(false);
    tracker.onMobKilled('a', 'x');
    expect(tracker.claim('a')).toBe(true);
    expect(tracker.claim('a')).toBe(false);
    expect(tracker.claim('b')).toBe(true); // co-op: everyone gets the full reward
    tracker.unclaim('b');
    expect(tracker.claim('b')).toBe(true);
  });

  it('takes objectives added mid-run, and the mission is not complete until they are done', () => {
    const { tracker } = setup([{ type: 'KILL_MOB', amount: 1 }]);
    tracker.onMobKilled('a', 'x');
    expect(tracker.completed).toBe(true);
    tracker.addObjective({ type: 'MINE_ITEM', targetId: 'copper', amount: 1 });
    expect(tracker.completed).toBe(false);
    expect(tracker.objectiveCount).toBe(2);
    tracker.onItemCollected('a', 'copper', 1);
    expect(tracker.completed).toBe(true);
  });

  it('can be force-completed', () => {
    const { tracker } = setup([{ type: 'KILL_MOB', amount: 5 }, { type: 'REACH_DEPTH', amount: 40 }]);
    tracker.forceComplete();
    expect(tracker.completed).toBe(true);
    expect(tracker.clientState().objectives.every((o) => o.done)).toBe(true);
  });

  it('describes contributions per player for the results screen, including players who contributed nothing', () => {
    const { tracker } = setup([{ type: 'KILL_MOB', amount: 4 }]);
    tracker.onMobKilled('a', 'x');
    tracker.onMobKilled('a', 'x');
    tracker.onMobKilled('b', 'x');
    const result = tracker.result(['a', 'b', 'c'], 'unfinished', 'You left early.');
    expect(result.contributions).toEqual([
      { characterId: 'a', characterName: 'A', amounts: [2] },
      { characterId: 'b', characterName: 'B', amounts: [1] },
      { characterId: 'c', characterName: 'C', amounts: [0] },
    ]);
    expect(result).toMatchObject({ outcome: 'unfinished', reason: 'You left early.' });
  });
});
