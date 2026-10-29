import type { MissionClientState, MissionProgressDelta } from '@mine-me/shared';

export interface AppliedMissionDelta {
  mission: MissionClientState;
  /** Indexes of objectives that became done with this delta (each is announced once). */
  newlyDone: number[];
  /** The whole mission became complete with this delta. */
  missionCompleted: boolean;
}

/**
 * Folds a server progress delta into the mission the HUD shows. Only the objectives named in the delta change; one the delta
 * does not know (a stale index) is ignored. What became done is reported so it is announced once, never twice.
 */
export function applyMissionDelta(mission: MissionClientState, delta: MissionProgressDelta): AppliedMissionDelta {
  const newlyDone: number[] = [];
  const objectives = mission.objectives.map((o, index) => {
    const change = delta.objectives.find((c) => c.index === index);
    if (!change) return o;
    if (change.done && !o.done) newlyDone.push(index);
    // Progress never goes backwards on screen, and a finished objective stays finished
    return { ...o, progress: Math.max(o.progress, change.progress), done: o.done || change.done };
  });
  const missionCompleted = Boolean(delta.completed) && !mission.completed;
  return { mission: { ...mission, objectives, completed: mission.completed || Boolean(delta.completed) }, newlyDone, missionCompleted };
}
