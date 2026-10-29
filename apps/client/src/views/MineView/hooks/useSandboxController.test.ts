import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { MiningSessionClientState } from '@mine-me/shared';
import { useSandboxController } from './useSandboxController';
import { notificationService } from '../../../services/notificationService';

vi.mock('../../../services/notificationService', () => ({
  notificationService: { error: vi.fn(), info: vi.fn() },
}));

const sandboxSession = (status = { godMode: false, paused: false, speed: 1 }): MiningSessionClientState =>
  ({ gameMode: 'sandbox', sandbox: { mobs: [{ id: 'm1', name: 'Mole' }], status } }) as unknown as MiningSessionClientState;
const normalSession = { gameMode: 'singleplayer' } as unknown as MiningSessionClientState;

/** Renders the hook with one session object for every render, like the app (state, not rebuilt per render). */
const render = (send: (e: any) => Promise<any>, session: MiningSessionClientState | null) =>
  renderHook(() => useSandboxController(send, session));

describe('useSandboxController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is inert in a normal mine', () => {
    const { result } = render(vi.fn(), normalSession);
    expect(result.current.isSandbox).toBe(false);
    expect(result.current.view).toBeUndefined();
  });

  it('is inert before a session exists', () => {
    expect(render(vi.fn(), null).result.current.isSandbox).toBe(false);
  });

  it('starts with the normal tool, the camera attached and the server\'s settings', () => {
    const { result } = render(vi.fn(), sandboxSession({ godMode: true, paused: true, speed: 2 }));
    expect(result.current.isSandbox).toBe(true);
    expect(result.current.view).toEqual({ tool: { kind: 'mine' }, freeCamera: false });
    expect(result.current.status).toEqual({ godMode: true, paused: true, speed: 2 });
    expect(result.current.info?.mobs).toEqual([{ id: 'm1', name: 'Mole' }]);
  });

  it('sends commands and keeps the settings the server answers with', async () => {
    const send = vi.fn().mockResolvedValue({ success: true, data: { status: { godMode: true, paused: false, speed: 1 } } });
    const { result } = render(send, sandboxSession());
    await act(() => result.current.setGodMode(true));
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_set_god_mode', enabled: true });
    expect(result.current.status.godMode).toBe(true);

    send.mockResolvedValue({ success: true, data: { status: { godMode: true, paused: true, speed: 1 } } });
    await act(() => result.current.setPaused(true));
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_set_sim', paused: true });
    expect(result.current.status.paused).toBe(true);

    await act(() => result.current.step());
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_set_sim', step: true });

    send.mockResolvedValue({ success: true, data: { status: { godMode: true, paused: true, speed: 4 } } });
    await act(() => result.current.setSpeed(4));
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_set_sim', speed: 4 });
    expect(result.current.status.speed).toBe(4);

    send.mockResolvedValue({ success: true });
    await act(() => result.current.clearHazards());
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_clear_hazards' });
    await act(() => result.current.reset());
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_reset' });
  });

  it('sends the doodad commands, and keeps the setting the server answers with', async () => {
    const send = vi.fn().mockResolvedValue({ success: true, data: { status: { godMode: false, paused: false, speed: 1, doodadsGenerated: true } } });
    const { result } = render(send, sandboxSession());
    await act(() => result.current.setDoodadGeneration(true));
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_set_doodad_generation', enabled: true });
    expect(result.current.status.doodadsGenerated).toBe(true);
    send.mockResolvedValue({ success: true });
    await act(() => result.current.loadDoodadScene('floor-row'));
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_load_doodad_scene', sceneId: 'floor-row' });
    await act(() => result.current.clearDoodads());
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_clear_doodads' });
  });

  it('shows why a doodad scene could not load', async () => {
    const send = vi.fn().mockResolvedValue({ success: false, error: 'There are no doodads defined to show.' });
    const { result } = render(send, sandboxSession());
    await act(() => result.current.loadDoodadScene('floor-row'));
    expect(notificationService.error).toHaveBeenCalledWith('Doodad scene', 'There are no doodads defined to show.');
  });

  it('sends the mission commands, and shows why one was refused', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const { result } = render(send, sandboxSession());
    await act(() => result.current.startMission('m1'));
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_start_mission', missionId: 'm1' });
    await act(() => result.current.missionControl('complete'));
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_mission_control', action: 'complete' });
    await act(() => result.current.loadMissionScene('reach-depth'));
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_load_mission_scene', sceneId: 'reach-depth' });
    send.mockResolvedValue({ success: false, error: 'There is no mission running.' });
    await act(() => result.current.missionControl('reset'));
    expect(notificationService.error).toHaveBeenCalledWith('Mission', 'There is no mission running.');
  });

  it('does not send a speed the sandbox does not offer', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const { result } = render(send, sandboxSession());
    await act(() => result.current.setSpeed(3));
    expect(send).not.toHaveBeenCalled();
  });

  it('shows the server\'s reason when a command is refused, and keeps the old settings', async () => {
    const send = vi.fn().mockResolvedValue({ success: false, error: 'Unsupported speed.' });
    const { result } = render(send, sandboxSession());
    await act(() => result.current.setPaused(true));
    expect(notificationService.error).toHaveBeenCalledWith('Simulation', 'Unsupported speed.');
    expect(result.current.status.paused).toBe(false);
  });

  it('shows an error when the request fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    const { result } = render(send, sandboxSession());
    await act(() => result.current.reset());
    expect(notificationService.error).toHaveBeenCalledWith('Reset', 'offline');
    expect(result.current.busy).toBe(false);
  });

  it('is busy while a command is in flight', async () => {
    let finish: (v: unknown) => void = () => {};
    const send = vi.fn().mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = render(send, sandboxSession());
    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.reset();
    });
    await waitFor(() => expect(result.current.busy).toBe(true));
    await act(async () => {
      finish({ success: true });
      await pending;
    });
    expect(result.current.busy).toBe(false);
  });

  it('keeps the tool and camera when the session is only updated (backpack, vision)', () => {
    const first = sandboxSession();
    const send = vi.fn();
    const { result, rerender } = renderHook(({ s }) => useSandboxController(send, s), { initialProps: { s: first } });
    act(() => {
      result.current.setTool({ kind: 'ignite' });
      result.current.setFreeCamera(true);
    });
    rerender({ s: { ...first, visionRange: 9 } as MiningSessionClientState }); // same `sandbox` object, new session object
    expect(result.current.view).toEqual({ tool: { kind: 'ignite' }, freeCamera: true });
  });

  it('puts the tool and camera back when a fresh state arrives (after a reset)', () => {
    const send = vi.fn();
    const { result, rerender } = renderHook(({ s }) => useSandboxController(send, s), { initialProps: { s: sandboxSession() } });
    act(() => {
      result.current.setTool({ kind: 'ignite' });
      result.current.setFreeCamera(true);
    });
    expect(result.current.view).toEqual({ tool: { kind: 'ignite' }, freeCamera: true });
    rerender({ s: sandboxSession() });
    expect(result.current.view).toEqual({ tool: { kind: 'mine' }, freeCamera: false });
  });

  it('sends the extractor commands', async () => {
    const send = vi.fn().mockResolvedValue({ success: true, data: {} });
    const { result } = render(send, sandboxSession());
    await act(() => result.current.spawnExtractor());
    expect(send).toHaveBeenLastCalledWith({ type: 'sandbox_spawn_extractor' });
    await act(() => result.current.digBelt(10));
    expect(send).toHaveBeenLastCalledWith({ type: 'sandbox_dig_belt', rows: 10 });
    await act(() => result.current.setCapacity(300));
    expect(send).toHaveBeenLastCalledWith({ type: 'sandbox_set_capacity', capacity: 300 });
    await act(() => result.current.fillBackpack(50));
    expect(send).toHaveBeenLastCalledWith({ type: 'sandbox_fill_backpack', quantity: 50 });
    await act(() => result.current.loadExtractorScene('full-pack-at-belt'));
    expect(send).toHaveBeenLastCalledWith({ type: 'sandbox_load_extractor_scene', sceneId: 'full-pack-at-belt' });
  });

  it('shows why an extractor command was refused', async () => {
    const send = vi.fn().mockResolvedValue({ success: false, error: 'Spawn the extractor first.' });
    const { result } = render(send, sandboxSession());
    await act(() => result.current.digBelt(5));
    expect(notificationService.error).toHaveBeenCalledWith('Belt', 'Spawn the extractor first.');
  });
});
