import { useEffect } from 'react';
import type { MiningSessionClientState, MiningStateTickPayload, MissionClientState } from '@mine-me/shared';
import { notificationService } from '../../../services/notificationService';
import { withVolume } from '../../../services/sound/sfxVolume';
import { applyMissionDelta } from '../missionProgress';

type OnEvent = (event: string, handler: (payload: any) => void) => () => void;
type SetSession = (update: (prev: MiningSessionClientState | null) => MiningSessionClientState | null) => void;
type PlaySfx = (url: string, options?: unknown) => unknown;

/** Plays one of a mission's library sounds with the slot's own volume, if the mission has it. */
export function playMissionSound(mission: Pick<MissionClientState, 'sounds'>, slot: 'objective' | 'complete' | 'failed', playSfx: PlaySfx): void {
  const sound = mission.sounds?.[slot];
  if (sound?.url) playSfx(sound.url, withVolume(sound.volume));
}

/**
 * Keeps the HUD's mission up to date from the server: small progress deltas in the tick (announcing what just finished, with a toast
 * and the mission's own sounds), and a whole new mission state when it is started, restarted or dropped (sandbox).
 * Quiet in a run without a mission.
 */
export function useMissionSync(onEvent: OnEvent, setSession: SetSession, playSfx: PlaySfx | undefined) {
  useEffect(() => {
    const stopTicks = onEvent('mining_state_tick', (payload: MiningStateTickPayload) => {
      const delta = payload?.missionProgress;
      if (!delta) return;
      let announce: { objectives: string[]; completed: boolean; mission: MissionClientState } | null = null;
      setSession((prev) => {
        if (!prev?.mission) return prev;
        const applied = applyMissionDelta(prev.mission, delta);
        if (applied.newlyDone.length > 0 || applied.missionCompleted) {
          announce = { objectives: applied.newlyDone.map((i) => applied.mission.objectives[i].label), completed: applied.missionCompleted, mission: applied.mission };
        }
        return { ...prev, mission: applied.mission };
      });
      // (announced outside the state update, which React may run twice)
      queueMicrotask(() => {
        if (!announce) return;
        const { objectives, completed, mission } = announce;
        if (completed) {
          notificationService.info('Mission Complete!', `${mission.name}: leave the mine safely to claim your reward.`);
          if (playSfx) playMissionSound(mission, 'complete', playSfx);
        } else {
          for (const label of objectives) notificationService.info('Objective Complete', label);
          if (playSfx) playMissionSound(mission, 'objective', playSfx);
        }
      });
    });
    const stopState = onEvent('mining_mission_state', (payload: { mission: MissionClientState | null }) => {
      setSession((prev) => {
        if (!prev) return prev;
        const { mission: _old, ...rest } = prev;
        return payload?.mission ? { ...rest, mission: payload.mission } : (rest as MiningSessionClientState);
      });
    });
    return () => {
      stopTicks();
      stopState();
    };
  }, [onEvent, setSession, playSfx]);
}
