import { describe, it, expect } from 'vitest';
import type { MissionClientState } from '@mine-me/shared';
import { applyMissionDelta } from './missionProgress';

const mission = (over: Partial<MissionClientState> = {}): MissionClientState => ({
  id: 'm1', name: 'Test', tier: 1, completed: false, reward: { sol: 1, xp: 1, items: [] },
  objectives: [
    { type: 'MINE_ITEM', label: 'Collect 5 Copperium', target: 5, progress: 1, done: false, unit: 'count' },
    { type: 'KILL_MOB', label: 'Kill 2 mobs', target: 2, progress: 0, done: false, unit: 'count' },
  ], ...over,
});

describe('applyMissionDelta', () => {
  it('changes only the objectives in the delta', () => {
    const { mission: next, newlyDone, missionCompleted } = applyMissionDelta(mission(), { objectives: [{ index: 0, progress: 3, done: false }] });
    expect(next.objectives[0].progress).toBe(3);
    expect(next.objectives[1].progress).toBe(0);
    expect(newlyDone).toEqual([]);
    expect(missionCompleted).toBe(false);
  });

  it('reports an objective that just became done, once', () => {
    const first = applyMissionDelta(mission(), { objectives: [{ index: 1, progress: 2, done: true }] });
    expect(first.newlyDone).toEqual([1]);
    const again = applyMissionDelta(first.mission, { objectives: [{ index: 1, progress: 2, done: true }] });
    expect(again.newlyDone).toEqual([]);
  });

  it('reports the mission becoming complete once', () => {
    const done = applyMissionDelta(mission(), { objectives: [{ index: 0, progress: 5, done: true }, { index: 1, progress: 2, done: true }], completed: true });
    expect(done.missionCompleted).toBe(true);
    expect(done.mission.completed).toBe(true);
    expect(applyMissionDelta(done.mission, { objectives: [], completed: true }).missionCompleted).toBe(false);
  });

  it('never walks progress back or un-finishes an objective, and ignores an index it does not know', () => {
    const start = mission({ objectives: [{ type: 'MINE_ITEM', label: 'x', target: 5, progress: 5, done: true, unit: 'count' }] });
    const { mission: next } = applyMissionDelta(start, { objectives: [{ index: 0, progress: 2, done: false }, { index: 9, progress: 1, done: true }] });
    expect(next.objectives).toEqual(start.objectives);
  });
});
