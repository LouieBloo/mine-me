import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMiningActions } from './useMiningActions';
import { FreeCameraAction } from '../input/SandboxActions';
import { TorchPlacementAction } from '../input/MouseAction';

const setup = (overrideAction: FreeCameraAction | null, isPlacingTorch = false) => {
  const mouseController = { setActiveAction: vi.fn() };
  const ref = <T,>(current: T) => ({ current });
  const world: any = {
    playerSpriteRef: ref(null),
    gridContainerRef: ref(null),
    mouseControllerRef: ref(mouseController),
    gridRef: ref([]),
    playerBodyRef: ref(null),
    tilesContainerRef: ref(null),
    blockTexturesRef: ref({}),
    tileGraphicsMap: ref(new Map()),
    tileSpritesMap: ref(new Map()),
    dynamiteVisualManagerRef: ref(null),
    projectileVisualManagerRef: ref(null),
    activeProjectilesRef: ref([]),
    particleEngineRef: ref(null),
    lightingEngineRef: ref(null),
    dynamicItemsRef: ref([]),
  };
  const options = {
    world,
    playerState: { inventory: { items: [] } } as any,
    equippedWeapon: null,
    containersReady: true,
    soundManager: {} as any,
    sendGameEvent: vi.fn(),
    isPlacingTorch,
    overrideAction,
  };
  const hook = renderHook((props: typeof options) => useMiningActions(props), { initialProps: options });
  return { mouseController, hook, options };
};

describe('useMiningActions override', () => {
  it('uses the sandbox tool instead of what the equipped item would do', () => {
    const override = new FreeCameraAction();
    const { mouseController } = setup(override, true);
    expect(mouseController.setActiveAction).toHaveBeenLastCalledWith(override);
    expect(mouseController.setActiveAction).not.toHaveBeenCalledWith(expect.any(TorchPlacementAction));
  });

  it('falls back to the item\'s own action (here: nothing) when there is no override', () => {
    const { mouseController } = setup(null);
    expect(mouseController.setActiveAction).toHaveBeenLastCalledWith(null);
  });

  it('goes back to the item action when the override is dropped', () => {
    const override = new FreeCameraAction();
    const { mouseController, hook, options } = setup(override, true);
    hook.rerender({ ...options, overrideAction: null });
    expect(mouseController.setActiveAction).toHaveBeenLastCalledWith(expect.any(TorchPlacementAction));
  });
});
