import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { FreeCamera } from '../systems/FreeCamera';
import { FreeCameraAction, IgniteAction, PourFluidAction, SpawnMobAction } from '../input/SandboxActions';
import { sendSandboxCommand, useSandboxFreeCamera, useSandboxMouseAction } from './useSandboxClient';
import { MINE_TOOL, type SandboxViewState } from '../../../sandbox/sandboxTool';
import { notificationService } from '../../../../../services/notificationService';

vi.mock('../../../../../services/notificationService', () => ({
  notificationService: { error: vi.fn(), info: vi.fn() },
}));

const view = (over: Partial<SandboxViewState> = {}): SandboxViewState => ({ tool: MINE_TOOL, freeCamera: false, ...over });

describe('useSandboxMouseAction', () => {
  const send = vi.fn().mockResolvedValue({ success: true });
  beforeEach(() => vi.clearAllMocks());

  it('does nothing outside the sandbox, so the equipped item decides', () => {
    expect(renderHook(() => useSandboxMouseAction(undefined, send)).result.current).toBeNull();
  });

  it('leaves the normal item action alone for the Normal tool', () => {
    expect(renderHook(() => useSandboxMouseAction(view(), send)).result.current).toBeNull();
  });

  it('builds the tool the panel picked', () => {
    expect(renderHook(() => useSandboxMouseAction(view({ tool: { kind: 'pour', fluidKey: 'OIL' } }), send)).result.current).toBeInstanceOf(PourFluidAction);
    expect(renderHook(() => useSandboxMouseAction(view({ tool: { kind: 'spawn', mobId: 'm' } }), send)).result.current).toBeInstanceOf(SpawnMobAction);
    expect(renderHook(() => useSandboxMouseAction(view({ tool: { kind: 'ignite' } }), send)).result.current).toBeInstanceOf(IgniteAction);
  });

  it('turns clicks into sandbox commands', async () => {
    const pour = renderHook(() => useSandboxMouseAction(view({ tool: { kind: 'pour', fluidKey: 'OIL' } }), send)).result.current!;
    await pour.execute({ x: 4, y: 2 }, { x: 0, y: 0 });
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_pour_fluid', x: 4, y: 2, fluidKey: 'OIL' });

    const spawn = renderHook(() => useSandboxMouseAction(view({ tool: { kind: 'spawn', mobId: 'mole' } }), send)).result.current!;
    await spawn.execute({ x: 5.5, y: 3.25 }, { x: 0, y: 0 });
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_spawn_mob', mobId: 'mole', x: 5.5, y: 3.25 });

    const ignite = renderHook(() => useSandboxMouseAction(view({ tool: { kind: 'ignite' } }), send)).result.current!;
    await ignite.execute({ x: 1, y: 1 }, { x: 0, y: 0 });
    expect(send).toHaveBeenCalledWith({ type: 'sandbox_ignite', x: 1, y: 1 });
  });

  it('swallows clicks while the free camera is on, whatever tool is picked', () => {
    const action = renderHook(() => useSandboxMouseAction(view({ freeCamera: true, tool: { kind: 'pour', fluidKey: 'OIL' } }), send)).result.current;
    expect(action).toBeInstanceOf(FreeCameraAction);
  });

  it('keeps the same action while nothing about the selection changes (no re-arming every render)', () => {
    const { result, rerender } = renderHook(({ s }) => useSandboxMouseAction(s, send), {
      initialProps: { s: view({ tool: { kind: 'pour', fluidKey: 'OIL' } }) },
    });
    const first = result.current;
    rerender({ s: view({ tool: { kind: 'pour', fluidKey: 'OIL' } }) });
    expect(result.current).toBe(first);
    rerender({ s: view({ tool: { kind: 'pour', fluidKey: 'WATER' } }) });
    expect(result.current).not.toBe(first);
  });
});

describe('sendSandboxCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is true when the server accepts', async () => {
    expect(await sendSandboxCommand(vi.fn().mockResolvedValue({ success: true }), { type: 'x' })).toBe(true);
    expect(notificationService.error).not.toHaveBeenCalled();
  });

  it('shows the server\'s reason when it refuses', async () => {
    expect(await sendSandboxCommand(vi.fn().mockResolvedValue({ success: false, error: 'That spot is inside a block.' }), { type: 'x' })).toBe(false);
    expect(notificationService.error).toHaveBeenCalledWith('Sandbox', 'That spot is inside a block.');
  });

  it('shows a message when the request itself fails', async () => {
    expect(await sendSandboxCommand(vi.fn().mockRejectedValue(new Error('socket closed')), { type: 'x' })).toBe(false);
    expect(notificationService.error).toHaveBeenCalledWith('Sandbox', 'socket closed');
  });
});

describe('useSandboxFreeCamera', () => {
  const makeWorld = () => ({
    cameraRef: { current: { getCenter: () => ({ x: 640, y: 320 }), getZoom: () => 2 } } as any,
    keysPressedRef: {
      current: { up: false, down: false, left: false, right: true, jump: false, miningKey: true, miningTarget: { x: 1, y: 1 }, sequence: 3 },
    } as any,
    playerContainerRef: { current: { x: 10, y: 20 } } as any,
  });

  it('does nothing while off', () => {
    const cam = new FreeCamera();
    const world = makeWorld();
    renderHook(() => useSandboxFreeCamera({ enabled: false, freeCamera: cam, world, canvas: null, sendGameEvent: vi.fn() }));
    expect(cam.active).toBe(false);
    expect(world.keysPressedRef.current.right).toBe(true);
  });

  it('detaches from where the camera is, and stops the character that was walking or mining', () => {
    const cam = new FreeCamera();
    const world = makeWorld();
    const send = vi.fn().mockResolvedValue({ success: true });
    renderHook(() => useSandboxFreeCamera({ enabled: true, freeCamera: cam, world, canvas: null, sendGameEvent: send }));
    expect(cam.active).toBe(true);
    expect(cam.update(0, 1)).toEqual({ x: 640, y: 320 });
    expect(world.keysPressedRef.current).toMatchObject({ right: false, miningKey: false, miningTarget: null, sequence: 4 });
    expect(send).toHaveBeenCalledWith({ type: 'mining_input', input: expect.objectContaining({ right: false, miningKey: false }) });
  });

  it('re-attaches when turned off or unmounted', () => {
    const cam = new FreeCamera();
    const world = makeWorld();
    const { rerender, unmount } = renderHook(({ on }) => useSandboxFreeCamera({ enabled: on, freeCamera: cam, world, canvas: null, sendGameEvent: vi.fn() }), {
      initialProps: { on: true },
    });
    expect(cam.active).toBe(true);
    rerender({ on: false });
    expect(cam.active).toBe(false);
    rerender({ on: true });
    unmount();
    expect(cam.active).toBe(false);
  });

  it('drags the view with the mouse on the canvas only', () => {
    const cam = new FreeCamera();
    const world = makeWorld();
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    renderHook(() => useSandboxFreeCamera({ enabled: true, freeCamera: cam, world, canvas, sendGameEvent: vi.fn() }));

    const fire = (type: string, target: EventTarget, x: number, y: number) =>
      target.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { clientX: x, clientY: y }));

    // A drag that starts on a button (the panel) does not move the view
    const button = document.createElement('button');
    document.body.appendChild(button);
    fire('pointerdown', button, 100, 100);
    fire('pointermove', window, 140, 100);
    expect(cam.update(0, 2)).toEqual({ x: 640, y: 320 });

    fire('pointerdown', canvas, 100, 100);
    fire('pointermove', window, 140, 120); // zoom 2: moves the world 20, 10
    fire('pointerup', window, 140, 120);
    fire('pointermove', window, 300, 300); // released: no more movement
    expect(cam.update(0, 2)).toEqual({ x: 620, y: 310 });
    canvas.remove();
    button.remove();
  });
});
