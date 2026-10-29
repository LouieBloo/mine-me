import { useCallback, useEffect, useState } from 'react';
import { SANDBOX_SIM_SPEEDS, type MiningSessionClientState, type SandboxStatus } from '@mine-me/shared';
import { notificationService } from '../../../services/notificationService';
import { MINE_TOOL, type SandboxToolSelection, type SandboxViewState } from '../sandbox/sandboxTool';

const DEFAULT_STATUS: SandboxStatus = { godMode: false, paused: false, speed: 1 };

type SendGameEvent = (event: any) => Promise<any>;

/**
 * Everything the sandbox panel controls: the mouse tool, the free camera and the room's settings.
 * It is inert in a normal mine (`session.sandbox` is absent, so `isSandbox` is false).
 */
export function useSandboxController(sendGameEvent: SendGameEvent, session: MiningSessionClientState | null) {
  const info = session?.sandbox ?? null;
  const [tool, setTool] = useState<SandboxToolSelection>(MINE_TOOL);
  const [freeCamera, setFreeCamera] = useState(false);
  const [status, setStatus] = useState<SandboxStatus>(info?.status ?? DEFAULT_STATUS);
  const [busy, setBusy] = useState(false);

  // A fresh state from the server (entering, or a reset) puts every setting back to what it says.
  // Keyed on the `sandbox` info, which is replaced only by a new server state: the session object
  // itself is also rebuilt for backpack and vision updates, which must not undo the player's choices.
  useEffect(() => {
    setTool(MINE_TOOL);
    setFreeCamera(false);
    setStatus(info?.status ?? DEFAULT_STATUS);
  }, [info]);

  /** Runs a command with the shared busy state; refusals are shown to the user. Returns the response data. */
  const run = useCallback(
    async (event: Record<string, unknown>, label: string): Promise<Record<string, any> | null> => {
      setBusy(true);
      try {
        const res = await sendGameEvent(event);
        if (res?.success) return res.data ?? {};
        notificationService.error(label, res?.error || 'The sandbox could not do that.');
      } catch (err: any) {
        notificationService.error(label, err?.message || 'Could not reach the server.');
      } finally {
        setBusy(false);
      }
      return null;
    },
    [sendGameEvent],
  );

  const applyStatus = useCallback((data: Record<string, any> | null) => {
    if (data?.status) setStatus(data.status as SandboxStatus);
  }, []);

  const setGodMode = useCallback(
    async (enabled: boolean) => applyStatus(await run({ type: 'sandbox_set_god_mode', enabled }, 'God mode')),
    [run, applyStatus],
  );
  const setPaused = useCallback(
    async (paused: boolean) => applyStatus(await run({ type: 'sandbox_set_sim', paused }, 'Simulation')),
    [run, applyStatus],
  );
  const step = useCallback(async () => {
    applyStatus(await run({ type: 'sandbox_set_sim', step: true }, 'Simulation'));
  }, [run, applyStatus]);
  const setSpeed = useCallback(
    async (speed: number) => {
      if (!(SANDBOX_SIM_SPEEDS as readonly number[]).includes(speed)) return;
      applyStatus(await run({ type: 'sandbox_set_sim', speed }, 'Simulation'));
    },
    [run, applyStatus],
  );
  /** The server answers these with a fresh state for everyone, which the view handles. */
  const spawnExtractor = useCallback(() => run({ type: 'sandbox_spawn_extractor' }, 'Extractor'), [run]);
  const digBelt = useCallback((rows: number) => run({ type: 'sandbox_dig_belt', rows }, 'Belt'), [run]);
  const setCapacity = useCallback((capacity: number) => run({ type: 'sandbox_set_capacity', capacity }, 'Capacity'), [run]);
  const fillBackpack = useCallback((quantity: number) => run({ type: 'sandbox_fill_backpack', quantity }, 'Backpack'), [run]);
  const loadExtractorScene = useCallback((sceneId: string) => run({ type: 'sandbox_load_extractor_scene', sceneId }, 'Scene'), [run]);
  const loadDoodadScene = useCallback((sceneId: string) => run({ type: 'sandbox_load_doodad_scene', sceneId }, 'Doodad scene'), [run]);
  const clearDoodads = useCallback(() => run({ type: 'sandbox_clear_doodads' }, 'Doodads'), [run]);
  /** The server rebuilds the map and answers with a fresh state for everyone, which the view handles. */
  const setDoodadGeneration = useCallback(async (enabled: boolean) => applyStatus(await run({ type: 'sandbox_set_doodad_generation', enabled }, 'Doodads')), [run, applyStatus]);
  /** Starting, finishing, restarting or dropping a mission is answered with the mission's state for everyone, which the view handles. */
  const startMission = useCallback((missionId: string) => run({ type: 'sandbox_start_mission', missionId }, 'Mission'), [run]);
  const missionControl = useCallback((action: 'complete' | 'reset' | 'clear') => run({ type: 'sandbox_mission_control', action }, 'Mission'), [run]);
  const loadMissionScene = useCallback((sceneId: string) => run({ type: 'sandbox_load_mission_scene', sceneId }, 'Mission scene'), [run]);
  const clearHazards = useCallback(() => run({ type: 'sandbox_clear_hazards' }, 'Clear'), [run]);
  /** The server answers a reset with a fresh state for everyone, which the view handles. */
  const reset = useCallback(() => run({ type: 'sandbox_reset' }, 'Reset'), [run]);

  const view: SandboxViewState | undefined = info ? { tool, freeCamera } : undefined;

  return {
    isSandbox: info !== null,
    info,
    view,
    tool,
    setTool,
    freeCamera,
    setFreeCamera,
    status,
    busy,
    setGodMode,
    setPaused,
    step,
    setSpeed,
    clearHazards,
    reset,
    spawnExtractor,
    digBelt,
    setCapacity,
    fillBackpack,
    loadExtractorScene,
    loadDoodadScene,
    clearDoodads,
    setDoodadGeneration,
    startMission,
    missionControl,
    loadMissionScene,
  };
}
