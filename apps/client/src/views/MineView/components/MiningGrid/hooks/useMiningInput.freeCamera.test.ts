import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMiningInput } from './useMiningInput';
import { FreeCamera } from '../systems/FreeCamera';

const setup = (freeCamera: FreeCamera) => {
  const sendGameEvent = vi.fn().mockResolvedValue({ success: true });
  const hook = renderHook(() =>
    useMiningInput({
      sendGameEvent,
      world: {
        playerSpriteRef: { current: null },
        flashlightRef: { current: null },
        showDebugRef: { current: false },
        playerFacingDirRef: { current: { x: 1, y: 0 } },
        isFacingLeftRef: { current: false },
        mouseControllerRef: { current: null as never },
        freeCameraRef: { current: freeCamera },
      },
      zoom: 1.5,
    }),
  );
  const press = async (key: string, type: 'keydown' | 'keyup' = 'keydown', init: KeyboardEventInit = {}) => {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent(type, { key, ...init }));
    });
  };
  const moveEvents = () => sendGameEvent.mock.calls.filter((c) => c[0]?.type === 'mining_input');
  return { hook, sendGameEvent, press, moveEvents };
};

describe('useMiningInput with the sandbox free camera', () => {
  it('walks the character normally while the camera is attached', async () => {
    const { press, moveEvents } = setup(new FreeCamera());
    await press('d');
    expect(moveEvents().length).toBeGreaterThan(0);
    expect(moveEvents()[0][0].input.right).toBe(true);
  });

  it('pans the camera instead of moving the character while it is detached', async () => {
    const cam = new FreeCamera();
    cam.enable({ x: 0, y: 0 });
    const { press, moveEvents } = setup(cam);
    await press('d');
    await press('w');
    await press('ArrowLeft');
    await press(' ', 'keydown', { code: 'Space' });
    expect(moveEvents()).toHaveLength(0);
    // ...and the camera is panning right/up/left
    expect(cam.update(1, 1).x).toBeCloseTo(0, 5); // right and left cancel
    expect(cam.update(1, 1).y).toBeLessThan(0);
  });

  it('still handles non-movement keys such as the flashlight toggle while detached', async () => {
    const cam = new FreeCamera();
    cam.enable({ x: 0, y: 0 });
    const { press } = setup(cam);
    await expect(press('b')).resolves.toBeUndefined();
  });
});
