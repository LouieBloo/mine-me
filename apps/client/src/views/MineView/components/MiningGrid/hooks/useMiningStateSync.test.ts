import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMiningStateSync } from './useMiningStateSync';

const ref = <T>(current: T) => ({ current });

function setup() {
  const emitter = { destroy: vi.fn() };
  const world: any = {
    gridRef: ref([]),
    playerBodyRef: ref({ position: { x: 1, y: 1 } }),
    predictionRef: ref({ offer: vi.fn() }),
    isMiningRef: ref(false),
    miningTargetRef: ref(null),
    targetServerPosRef: ref({ x: 0, y: 0 }),
    activeFallingRocksRef: ref([]),
    activeDynamitesRef: ref([]),
    activeProjectilesRef: ref([]),
    droppedItemsRef: ref([]),
    weaponAmmoStateRef: ref({ current: 0, max: 0, isReloading: false }),
    torchEmittersRef: ref(new Map([['t', emitter]])),
    blockEmittersRef: ref(new Map([['b', emitter]])),
    dynamiteVisualManagerRef: ref({ destroy: vi.fn() }),
    droppedItemVisualManagerRef: ref({ destroy: vi.fn() }),
    particleEngineRef: ref(null),
    lightingEngineRef: ref(null),
    remotePlayerRendererRef: ref(null),
    mobRendererRef: ref(null),
    projectileVisualManagerRef: ref(null),
    mouseControllerRef: ref({ setGrid: vi.fn(), getWorldMousePosition: () => null, getHoveredTile: () => null }),
    tilesContainerRef: ref(null),
    droppedItemsContainerRef: ref(null),
    droppedSpritesMap: ref(new Map()),
    blockSoundsRef: ref(new Map()),
    blockParticleConfigsRef: ref(new Map()),
    weaponSoundUrlRef: ref(null),
    lastWeaponSoundTimeRef: ref(0),
  };
  const off = vi.fn();
  let handler: ((p: unknown) => void) | undefined;
  const onEvent = vi.fn((_name: string, h: (p: unknown) => void) => { handler = h; return off; });
  const soundManager: any = { setListenerPosition: vi.fn() };
  const hook = renderHook(() =>
    useMiningStateSync({
      onEvent: onEvent as any,
      playerState: { id: 'me' } as any,
      equippedWeapon: null,
      soundManager,
      world,
      containersReady: true,
    })
  );
  return { world, emitter, off, onEvent, getHandler: () => handler!, hook };
}

describe('useMiningStateSync', () => {
  it('subscribes to the server tick and runs the section handlers on each one', () => {
    const { world, onEvent, getHandler } = setup();
    expect(onEvent).toHaveBeenCalledWith('mining_state_tick', expect.any(Function));
    getHandler()({
      tick: 1, position: { x: 7, y: 8 }, velocity: { x: 0, y: 0 }, ackSequence: 0, ackAge: 1, isMining: true,
      spawned: { droppedItems: [{ id: 'g1', itemId: 'gem' }] },
      droppedItems: [{ id: 'g1', position: { x: 1, y: 2 } }],
    });
    expect(world.targetServerPosRef.current).toEqual({ x: 7, y: 8 });
    expect(world.predictionRef.current.offer).toHaveBeenCalled();
    expect(world.isMiningRef.current).toBe(true);
    expect(world.droppedItemsRef.current).toEqual([{ id: 'g1', itemId: 'gem', position: { x: 1, y: 2 } }]);
  });

  it('unsubscribes and tears down emitters and visual managers on unmount', () => {
    const { world, emitter, off, hook } = setup();
    hook.unmount();
    expect(off).toHaveBeenCalled();
    expect(emitter.destroy).toHaveBeenCalledTimes(2);
    expect(world.torchEmittersRef.current.size).toBe(0);
    expect(world.blockEmittersRef.current.size).toBe(0);
    expect(world.dynamiteVisualManagerRef.current.destroy).toHaveBeenCalled();
    expect(world.droppedItemVisualManagerRef.current.destroy).toHaveBeenCalled();
  });
});
