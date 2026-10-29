import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { MiningSessionClientState, MissionClientState } from '@mine-me/shared';
import { useMissionSync, playMissionSound } from './useMissionSync';

vi.mock('../../../services/notificationService', () => ({ notificationService: { info: vi.fn(), error: vi.fn() } }));
import { notificationService } from '../../../services/notificationService';

const mission = (over: Partial<MissionClientState> = {}): MissionClientState => ({
  id: 'm1', name: 'Copper Run', tier: 1, completed: false, reward: { sol: 1, xp: 1, items: [] },
  sounds: { objective: { url: '/o.mp3', volume: 0.5 } as any, complete: { url: '/c.mp3' } as any },
  objectives: [
    { type: 'MINE_ITEM', label: 'Collect 5 Copperium', target: 5, progress: 0, done: false, unit: 'count' },
    { type: 'KILL_MOB', label: 'Kill 2 mobs', target: 2, progress: 0, done: false, unit: 'count' },
  ], ...over,
});

function setup(initial: MiningSessionClientState | null) {
  const handlers: Record<string, (p: any) => void> = {};
  const onEvent = vi.fn((event: string, handler: (p: any) => void) => {
    handlers[event] = handler;
    return () => delete handlers[event];
  });
  let session = initial;
  const setSession = (update: (prev: MiningSessionClientState | null) => MiningSessionClientState | null) => {
    session = update(session);
  };
  const playSfx = vi.fn();
  const { unmount } = renderHook(() => useMissionSync(onEvent, setSession, playSfx));
  return { handlers, getSession: () => session, playSfx, unmount };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('useMissionSync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('folds a tick\'s progress into the session and announces a finished objective once, with the mission\'s sound', async () => {
    const t = setup({ mission: mission() } as MiningSessionClientState);
    await act(async () => {
      t.handlers.mining_state_tick({ missionProgress: { objectives: [{ index: 0, progress: 5, done: true }] } });
      await flush();
    });
    expect(t.getSession()!.mission!.objectives[0]).toMatchObject({ progress: 5, done: true });
    expect(notificationService.info).toHaveBeenCalledWith('Objective Complete', 'Collect 5 Copperium');
    expect(t.playSfx).toHaveBeenCalledWith('/o.mp3', expect.objectContaining({ volumeScale: 0.5 }));
    await act(async () => {
      t.handlers.mining_state_tick({ missionProgress: { objectives: [{ index: 0, progress: 5, done: true }] } });
      await flush();
    });
    expect(notificationService.info).toHaveBeenCalledTimes(1);
  });

  it('announces the whole mission once with its own sound', async () => {
    const t = setup({ mission: mission() } as MiningSessionClientState);
    await act(async () => {
      t.handlers.mining_state_tick({ missionProgress: { objectives: [{ index: 0, progress: 5, done: true }, { index: 1, progress: 2, done: true }], completed: true } });
      await flush();
    });
    expect(notificationService.info).toHaveBeenCalledWith('Mission Complete!', expect.stringContaining('Copper Run'));
    expect(notificationService.info).toHaveBeenCalledTimes(1);
    expect(t.playSfx).toHaveBeenCalledWith('/c.mp3', expect.anything());
  });

  it('ignores ticks without progress, and runs without a mission', async () => {
    const t = setup({ mission: mission() } as MiningSessionClientState);
    t.handlers.mining_state_tick({});
    expect(t.getSession()!.mission!.objectives[0].progress).toBe(0);
    const none = setup({} as MiningSessionClientState);
    none.handlers.mining_state_tick({ missionProgress: { objectives: [{ index: 0, progress: 1, done: false }] } });
    await flush();
    expect(none.getSession()!.mission).toBeUndefined();
  });

  it('replaces or drops the mission when the server sends a whole new state', () => {
    const t = setup({ mission: mission() } as MiningSessionClientState);
    t.handlers.mining_mission_state({ mission: mission({ name: 'Other' }) });
    expect(t.getSession()!.mission!.name).toBe('Other');
    t.handlers.mining_mission_state({ mission: null });
    expect(t.getSession()!.mission).toBeUndefined();
  });

  it('stops listening when unmounted', () => {
    const t = setup(null);
    expect(Object.keys(t.handlers)).toEqual(['mining_state_tick', 'mining_mission_state']);
    t.unmount();
    expect(Object.keys(t.handlers)).toEqual([]);
  });
});

describe('playMissionSound', () => {
  it('plays only a slot the mission has a sound for', () => {
    const playSfx = vi.fn();
    playMissionSound({ sounds: { complete: { url: '/c.mp3' } as any } }, 'failed', playSfx);
    expect(playSfx).not.toHaveBeenCalled();
    playMissionSound({ sounds: null }, 'complete', playSfx);
    expect(playSfx).not.toHaveBeenCalled();
  });
});
