import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MiningPlayerBody, type MiningClientTile, MiningTileType, type MiningActiveProjectile } from '@mine-me/shared';
import { useMiningTicker as useWorldTicker, type UseMiningTickerOptions } from './useMiningTicker';
import type { MiningClientWorld } from '../systems/MiningClientWorld';

/**
 * These tests describe the ticker's inputs as one flat bag of refs. The hook takes them as a
 * `world` plus a few options, so split the bag here instead of rewriting every scenario.
 */
function useMiningTicker(flat: Record<string, unknown>) {
  const { app, sessionState, soundManager, miningSwingSpeed, ...refs } = flat;
  return useWorldTicker({
    app,
    sessionState,
    soundManager,
    miningSwingSpeed,
    world: refs as unknown as MiningClientWorld,
  } as UseMiningTickerOptions);
}
import { renderHook, act } from '@testing-library/react';
import { miningProfiler } from '../utils/MiningProfiler';
import { MiningPredictionState } from '../systems/MiningPredictionState';

describe('useMiningTicker - Client-Side Prediction & Reconciliation', () => {
  let mockApp: any;
  let tickerCallbacks: (() => void)[] = [];
  let playerContainer: any;
  let gridContainer: any;
  let currentRenderPosRef: any;
  let targetServerPosRef: any;
  let isFacingLeftRef: any;
  let playerFacingDirRef: any;
  let playerSpriteRef: any;
  let activeFallingRocksRef: any;
  let fallingRockGraphicsMap: any;
  let debugGraphicsRef: any;
  let showDebugRef: any;
  let flashlightRef: any;
  let lightingEngineRef: any;
  let cameraRef: any;
  let playerBodyRef: any;
  let gridRef: any;
  let keysPressedRef: any;
  let isMiningRef: any;
  let miningTargetRef: any;

  // Simple 10x10 empty grid with solid floor at y=5
  const createMockGrid = (): MiningClientTile[][] => {
    return Array.from({ length: 10 }, (_, y) =>
      Array.from({ length: 10 }, () => ({
        type: y >= 5 ? MiningTileType.DIRT : MiningTileType.EMPTY,
        revealed: true,
        damageStage: 0,
      }))
    );
  };

  beforeEach(() => {
    tickerCallbacks = [];
    mockApp = {
      ticker: {
        deltaMS: 16.67, // ~60 FPS
        add: vi.fn((cb) => tickerCallbacks.push(cb)),
        remove: vi.fn((cb) => {
          tickerCallbacks = tickerCallbacks.filter((c) => c !== cb);
        }),
      },
      screen: { width: 800, height: 600 },
    };

    playerContainer = { x: 0, y: 0 };
    gridContainer = { x: 0, y: 0 };
    currentRenderPosRef = { current: { x: 2, y: 4 } };
    targetServerPosRef = { current: { x: 2, y: 4 } };
    isFacingLeftRef = { current: false };
    playerFacingDirRef = { current: { x: 1, y: 0 } };
    playerSpriteRef = {
      current: {
        setFlipped: vi.fn(),
        setState: vi.fn(),
        setMoveVelocity: vi.fn(),
        setAimAngle: vi.fn(),
        setSwingSpeed: vi.fn(),
        getScale: vi.fn(() => 0.5),
        getShoulderOffset: vi.fn(() => ({ x: -131, y: -68 })),
        update: vi.fn(),
      },
    };
    activeFallingRocksRef = { current: [] };
    fallingRockGraphicsMap = { current: new Map() };
    debugGraphicsRef = { current: null };
    showDebugRef = { current: false };
    flashlightRef = { current: null };
    lightingEngineRef = { current: null };
    cameraRef = { current: null };

    // Prediction bodies & refs
    playerBodyRef = { current: new MiningPlayerBody({ x: 2, y: 4 }) };
    gridRef = { current: createMockGrid() };
    keysPressedRef = {
      current: {
        up: false,
        down: false,
        left: false,
        right: false,
        jump: false,
        miningKey: false,
        miningTarget: null,
        sequence: 0,
      },
    };
    isMiningRef = { current: false };
    miningTargetRef = { current: null };
  });

  let predictionRef: any;

  const mount = () => {
    predictionRef = { current: new MiningPredictionState(playerBodyRef.current, keysPressedRef.current) };
    renderHook(() =>
      useMiningTicker({
        app: mockApp,
        playerContainerRef: { current: playerContainer },
        gridContainerRef: { current: gridContainer },
        fallingRocksContainerRef: { current: null },
        currentRenderPosRef,
        targetServerPosRef,
        isFacingLeftRef,
        playerFacingDirRef,
        playerSpriteRef,
        activeFallingRocksRef,
        fallingRockGraphicsMap,
        debugGraphicsRef,
        showDebugRef,
        flashlightRef,
        lightingEngineRef,
        cameraRef,
        playerBodyRef,
        predictionRef,
        gridRef,
        keysPressedRef,
        isMiningRef,
        miningTargetRef,
      })
    );
    expect(tickerCallbacks.length).toBe(1);
  };
  /** Changing the keys always bumps the input sequence, exactly as the real input handlers do. */
  const press = (change: Record<string, boolean>) => {
    Object.assign(keysPressedRef.current, change);
    keysPressedRef.current.sequence++;
  };
  const frames = (n: number) => { for (let i = 0; i < n; i++) tickerCallbacks[0](); };
  const stalePayload = (over: object = {}) => ({
    tick: 1, position: { x: 3.5, y: 4 }, velocity: { x: 0, y: 0 }, ackSequence: 999, ackAge: 1,
    bodyState: { isGrounded: true, isOnLadder: false, knockbackRemaining: 0 }, ...over,
  });

  it('moves the predicted body within a couple of frames of a key press, and the sprite follows it', () => {
    mount();
    press({ right: true });
    frames(3); // 60 fps frames; the body steps at the server's 30 Hz
    expect(playerBodyRef.current.position.x).toBeGreaterThan(2.05);
    // The sprite is drawn through the partial step after the body's last one, so it is at or just ahead of the body
    expect(playerContainer.x).toBeGreaterThanOrEqual(playerBodyRef.current.position.x * 64 - 1e-6);
  });

  it('moves the sprite on the very first frame after a key press, before any whole step has run', () => {
    mount();
    const startX = playerContainer.x;
    press({ right: true });
    frames(1); // one 60 fps frame: half a step
    expect(predictionRef.current.predictor.steps).toBeLessThanOrEqual(1);
    expect(playerContainer.x).toBeGreaterThan(startX);
  });

  it('keeps the prediction when the server snapshot agrees with it', () => {
    mount();
    press({ right: true });
    frames(8);
    const steps = predictionRef.current.predictor.steps;
    const rec = predictionRef.current.predictor;
    // The server agrees: same input, same age -> same place. Re-simulate the same steps independently.
    const mirror = new MiningPlayerBody({ x: 2, y: 4 });
    for (let i = 0; i < steps; i++) {
      mirror.processInputs({ ...keysPressedRef.current, right: i >= 0 }, gridRef.current);
      mirror.update(1 / 30, gridRef.current);
    }
    predictionRef.current.offer({
      tick: steps, position: { ...mirror.position }, velocity: { ...mirror.velocity },
      ackSequence: keysPressedRef.current.sequence, ackAge: steps,
      bodyState: { isGrounded: mirror.isGrounded, isOnLadder: mirror.isOnLadder, knockbackRemaining: 0 },
    });
    // the press happened before any step, so the first step used sequence 1 at age 1 -> `steps` steps in
    frames(1);
    expect(rec.correctionCount).toBe(0);
  });

  it('corrects to the server\'s position on a real disagreement and replays the steps since', () => {
    mount();
    frames(6); // standing still: 3 steps at 60 fps
    const steps = predictionRef.current.predictor.steps;
    expect(steps).toBeGreaterThan(0);
    // Server says the player is somewhere else entirely at step 1 (e.g. teleport/respawn)
    predictionRef.current.offer(stalePayload({ tick: 1, position: { x: 8, y: 2 }, ackSequence: 0, ackAge: 1 }));
    frames(1);
    expect(predictionRef.current.predictor.correctionCount).toBe(1);
    expect(playerBodyRef.current.position.x).toBeCloseTo(8, 1);
    expect(playerContainer.x).toBeCloseTo(8 * 64, -1);
    // No smoothing for a teleport: nothing left to blend
    expect(predictionRef.current.predictor.renderOffset).toEqual({ x: 0, y: 0 });
  });

  it('does not let a snapshot it cannot line up pull the player backwards while walking into a wall', () => {
    gridRef.current[4][4].type = MiningTileType.DIRT;
    mount();
    const flushWallX = 4.0 - playerBodyRef.current.halfWidth;
    playerBodyRef.current.position.x = flushWallX;
    playerBodyRef.current.position.y = 5.0 - playerBodyRef.current.halfHeight;
    playerBodyRef.current.isGrounded = true;
    press({ right: true });
    for (let i = 0; i < 10; i++) {
      predictionRef.current.offer(stalePayload());
      frames(1);
    }
    expect(playerBodyRef.current.position.x).toBeCloseTo(flushWallX, 3);
  });

  it('follows a smooth jump arc and is not dragged down by a stale snapshot', () => {
    mount();
    const groundedY = 5.0 - playerBodyRef.current.halfHeight;
    playerBodyRef.current.position = { x: 2, y: groundedY };
    playerBodyRef.current.isGrounded = true;
    press({ jump: true });
    frames(4);
    expect(playerBodyRef.current.isGrounded).toBe(false);
    expect(playerBodyRef.current.velocity.y).toBeLessThan(0);
    press({ jump: false });
    const ys: number[] = [];
    for (let i = 0; i < 6; i++) {
      predictionRef.current.offer(stalePayload({ position: { x: 2, y: groundedY } }));
      frames(1);
      ys.push(playerBodyRef.current.position.y);
    }
    expect(Math.min(...ys)).toBeLessThan(groundedY - 0.1); // it went up
    for (let i = 1; i < ys.length; i++) expect(Math.abs(ys[i] - ys[i - 1])).toBeLessThan(0.5);
  });
});

describe('useMiningTicker - profiler render patch', () => {
  const mountWith = (renderer: any) => {
    const callbacks: (() => void)[] = [];
    const app: any = {
      renderer,
      ticker: { deltaMS: 16.67, add: vi.fn((cb) => callbacks.push(cb)), remove: vi.fn() },
      screen: { width: 800, height: 600 },
    };
    return renderHook(() =>
      useMiningTicker({
        app,
        playerContainerRef: { current: { x: 0, y: 0 } as any },
        gridContainerRef: { current: { x: 0, y: 0 } as any },
        fallingRocksContainerRef: { current: null },
        currentRenderPosRef: { current: { x: 2, y: 4 } },
        targetServerPosRef: { current: { x: 2, y: 4 } },
        isFacingLeftRef: { current: false },
        playerFacingDirRef: { current: { x: 1, y: 0 } },
        playerSpriteRef: { current: null },
        activeFallingRocksRef: { current: [] },
        fallingRockGraphicsMap: { current: new Map() },
        debugGraphicsRef: { current: null },
        showDebugRef: { current: false },
        flashlightRef: { current: null },
        lightingEngineRef: { current: null },
        cameraRef: { current: null },
      } as any)
    );
  };

  afterEach(() => miningProfiler.setEnabled(false));

  it('leaves renderer.render alone during normal play', () => {
    miningProfiler.setEnabled(false);
    const original = vi.fn();
    const renderer = { render: original };
    mountWith(renderer);
    expect(renderer.render).toBe(original);
  });

  it('wraps renderer.render while profiling is on, and restores it on unmount', () => {
    miningProfiler.setEnabled(true);
    const original = vi.fn();
    const renderer = { render: original };
    const { unmount } = mountWith(renderer);
    expect(renderer.render).not.toBe(original);
    unmount();
    expect(renderer.render).toBe(original);
  });

  it('follows the profiler being switched on and off while mounted', () => {
    miningProfiler.setEnabled(false);
    const original = vi.fn();
    const renderer = { render: original };
    mountWith(renderer);
    expect(renderer.render).toBe(original);
    act(() => miningProfiler.setEnabled(true));
    expect(renderer.render).not.toBe(original);
    act(() => miningProfiler.setEnabled(false));
    expect(renderer.render).toBe(original);
  });
});

describe('useMiningTicker - Torch Preview Lighting', () => {
  let mockApp: any;
  let tickerCallbacks: (() => void)[] = [];
  let playerContainer: any;
  let gridContainer: any;
  let currentRenderPosRef: any;
  let targetServerPosRef: any;
  let isFacingLeftRef: any;
  let playerFacingDirRef: any;
  let playerSpriteRef: any;
  let activeFallingRocksRef: any;
  let fallingRockGraphicsMap: any;
  let debugGraphicsRef: any;
  let showDebugRef: any;
  let flashlightRef: any;
  let lightingEngineRef: any;
  let cameraRef: any;
  let playerBodyRef: any;
  let gridRef: any;
  let keysPressedRef: any;
  let isMiningRef: any;
  let miningTargetRef: any;
  let mockLightingEngine: any;
  let mockLights: Map<string, any>;
  let reticleState: any;
  let mouseControllerRef: any;

  beforeEach(() => {
    tickerCallbacks = [];
    mockApp = {
      ticker: {
        deltaMS: 16.67,
        add: vi.fn((cb) => tickerCallbacks.push(cb)),
        remove: vi.fn((cb) => {
          tickerCallbacks = tickerCallbacks.filter((c) => c !== cb);
        }),
      },
      screen: { width: 800, height: 600 },
    };

    playerContainer = { x: 0, y: 0 };
    gridContainer = { x: 0, y: 0 };
    currentRenderPosRef = { current: { x: 2, y: 4 } };
    targetServerPosRef = { current: { x: 2, y: 4 } };
    isFacingLeftRef = { current: false };
    playerFacingDirRef = { current: { x: 1, y: 0 } };
    playerSpriteRef = {
      current: {
        setFlipped: vi.fn(),
        setState: vi.fn(),
        setMoveVelocity: vi.fn(),
        setAimAngle: vi.fn(),
        getScale: vi.fn(() => 0.5),
        getShoulderOffset: vi.fn(() => ({ x: -131, y: -68 })),
        update: vi.fn(),
      },
    };
    activeFallingRocksRef = { current: [] };
    fallingRockGraphicsMap = { current: new Map() };
    debugGraphicsRef = { current: null };
    showDebugRef = { current: false };
    flashlightRef = { current: null };
    cameraRef = { current: null };
    playerBodyRef = { current: new MiningPlayerBody({ x: 2, y: 4 }) };
    gridRef = { current: [] };
    keysPressedRef = {
      current: {
        up: false,
        down: false,
        left: false,
        right: false,
        jump: false,
        miningKey: false,
        miningTarget: null,
        sequence: 0,
      },
    };
    isMiningRef = { current: false };
    miningTargetRef = { current: null };

    mockLights = new Map();
    mockLightingEngine = {
      addLight: vi.fn((light: any) => mockLights.set(light.id, light)),
      removeLight: vi.fn((id: string) => mockLights.delete(id)),
      getLight: vi.fn((id: string) => mockLights.get(id)),
      markLightmapDirty: vi.fn(),
      update: vi.fn(),
    };
    lightingEngineRef = { current: mockLightingEngine };

    reticleState = { active: false, target: null, style: null };
    mouseControllerRef = {
      current: {
        getReticleState: vi.fn(() => reticleState),
        setPlayerPosition: vi.fn(),
        setCamera: vi.fn(),
        update: vi.fn(),
        getWorldMousePosition: vi.fn(() => null),
      },
    };
  });

  const renderTickerHook = () => {
    return renderHook(() =>
      useMiningTicker({
        app: mockApp,
        playerContainerRef: { current: playerContainer },
        gridContainerRef: { current: gridContainer },
        fallingRocksContainerRef: { current: null },
        currentRenderPosRef,
        targetServerPosRef,
        isFacingLeftRef,
        playerFacingDirRef,
        playerSpriteRef,
        activeFallingRocksRef,
        fallingRockGraphicsMap,
        debugGraphicsRef,
        showDebugRef,
        flashlightRef,
        lightingEngineRef,
        cameraRef,
        playerBodyRef,
        gridRef,
        keysPressedRef,
        isMiningRef,
        miningTargetRef,
        mouseControllerRef,
      })
    );
  };

  it('adds normal torch point light to LightingEngine when in torch preview mode', () => {
    renderTickerHook();

    reticleState = {
      active: true,
      target: { x: 5, y: 7 },
      style: {
        showPreview: true,
        previewType: 'TORCH',
      },
    };

    tickerCallbacks[0]();

    expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(1);
    const addedLight = mockLightingEngine.addLight.mock.calls[0][0];
    expect(addedLight.id).toBe('torch_preview');
    expect(addedLight.position.x).toBeCloseTo(5.446, 3);
    expect(addedLight.position.y).toBeCloseTo(7.35, 3);
    expect(addedLight.color).toBe(0xf59e0b);
    expect(addedLight.baseIntensity).toBe(1.25);
    expect(addedLight.flicker).toEqual({
      speed: 4.0,
      amount: 0.15,
    });
  });

  it('updates existing torch preview light position and marks lightmap dirty when target tile changes', () => {
    renderTickerHook();

    // Step 1: Preview at (5, 7)
    reticleState = {
      active: true,
      target: { x: 5, y: 7 },
      style: { showPreview: true, previewType: 'TORCH' },
    };
    tickerCallbacks[0]();

    const addedLight = mockLightingEngine.addLight.mock.calls[0][0];
    expect(addedLight.position.x).toBeCloseTo(5.446, 3);
    expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(1);

    // Step 2: Hover moves to adjacent valid tile (6, 7)
    reticleState.target = { x: 6, y: 7 };
    tickerCallbacks[0]();

    // Should NOT create another light, but update position and mark dirty
    expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(1);
    expect(addedLight.position.x).toBeCloseTo(6.446, 3);
    expect(addedLight.position.y).toBeCloseTo(7.35, 3);
    expect(mockLightingEngine.markLightmapDirty).toHaveBeenCalled();
  });

  it('removes torch preview light when preview mode is no longer active', () => {
    renderTickerHook();

    // Activate preview
    reticleState = {
      active: true,
      target: { x: 5, y: 7 },
      style: { showPreview: true, previewType: 'TORCH' },
    };
    tickerCallbacks[0]();
    expect(mockLights.has('torch_preview')).toBe(true);

    // Move to invalid tile (showPreview: false)
    reticleState = {
      active: true,
      target: { x: 8, y: 8 },
      style: { showPreview: false },
    };
    tickerCallbacks[0]();

    expect(mockLightingEngine.removeLight).toHaveBeenCalledWith('torch_preview');
    expect(mockLights.has('torch_preview')).toBe(false);
  });

  it('does not add torch preview light when previewType is LADDER', () => {
    renderTickerHook();

    reticleState = {
      active: true,
      target: { x: 5, y: 7 },
      style: { showPreview: true, previewType: 'LADDER' },
    };
    tickerCallbacks[0]();

    expect(mockLightingEngine.addLight).not.toHaveBeenCalled();
  });

  it('cleans up torch preview light on unmount', () => {
    const { unmount } = renderTickerHook();

    reticleState = {
      active: true,
      target: { x: 5, y: 7 },
      style: { showPreview: true, previewType: 'TORCH' },
    };
    tickerCallbacks[0]();
    expect(mockLights.has('torch_preview')).toBe(true);

    unmount();
    expect(mockLightingEngine.removeLight).toHaveBeenCalledWith('torch_preview');
  });

  describe('Debug Mode - Colliders Overlay', () => {
    it('renders block colliders, item colliders, and falling rock colliders when showDebug is enabled', () => {
      const mockG: any = {
        clear: vi.fn(),
        rect: vi.fn().mockReturnThis(),
        stroke: vi.fn().mockReturnThis(),
        moveTo: vi.fn().mockReturnThis(),
        lineTo: vi.fn().mockReturnThis(),
        circle: vi.fn().mockReturnThis(),
        fill: vi.fn().mockReturnThis(),
        poly: vi.fn().mockReturnThis(),
        closePath: vi.fn().mockReturnThis(),
      };

      const activeDynamites = [
        {
          id: 'dyn-1',
          position: { x: 3, y: 3 },
          velocity: { x: 0, y: 0 },
          angle: 0.5,
          fuseRemainingSeconds: 3.5,
          physicsConfig: {
            hasPhysics: true,
            mass: 1,
            colliderType: 'RECTANGLE' as const,
            colliderWidth: 32,
            colliderHeight: 10,
            colliderRadius: 8,
            colliderOffsetX: 0,
            colliderOffsetY: 0,
          },
        },
      ];

      const activeRocks = [
        {
          id: 'rock-1',
          x: 4,
          y: 4,
          angle: 0,
        },
      ];

      const droppedItems = [
        {
          position: { x: 5, y: 5 },
          itemId: 'potion-1',
          itemName: 'Health Potion',
          iconUrl: null,
          quantity: 1,
          physicsConfig: {
            hasPhysics: true,
            colliderType: 'CIRCLE' as const,
            colliderRadius: 12,
            colliderOffsetX: 0,
            colliderOffsetY: 0,
          },
        },
      ];

      renderHook(() =>
        useMiningTicker({
          app: mockApp,
          playerContainerRef: { current: playerContainer },
          gridContainerRef: { current: gridContainer },
          fallingRocksContainerRef: { current: null },
          currentRenderPosRef: { current: { x: 2, y: 4 } },
          targetServerPosRef: { current: { x: 2, y: 4 } },
          isFacingLeftRef: { current: false },
          playerFacingDirRef: { current: { x: 1, y: 0 } },
          playerSpriteRef: { current: null },
          activeFallingRocksRef: { current: activeRocks as any },
          fallingRockGraphicsMap: { current: new Map() },
          activeDynamitesRef: { current: activeDynamites as any },
          droppedItemsRef: { current: droppedItems as any },
          debugGraphicsRef: { current: mockG },
          showDebugRef: { current: true },
          flashlightRef: { current: null },
          lightingEngineRef: { current: null },
          cameraRef: { current: null },
          playerBodyRef,
          gridRef,
          keysPressedRef,
          isMiningRef,
          miningTargetRef,
        })
      );

      // Trigger frame
      tickerCallbacks[0]();

      expect(mockG.clear).toHaveBeenCalled();
      // Block colliders rendered for solid tiles (y >= 5 in mock grid)
      expect(mockG.rect).toHaveBeenCalled();
      // Dynamite polygon collider rendered
      expect(mockG.poly).toHaveBeenCalled();
      // Rock circle collider & dropped item circle collider rendered
      expect(mockG.circle).toHaveBeenCalled();
    });

    it('calls mobRenderer.renderDebugHitboxes when showDebug is enabled', () => {
      const mockG: any = {
        clear: vi.fn(),
        rect: vi.fn().mockReturnThis(),
        stroke: vi.fn().mockReturnThis(),
        moveTo: vi.fn().mockReturnThis(),
        lineTo: vi.fn().mockReturnThis(),
        circle: vi.fn().mockReturnThis(),
        fill: vi.fn().mockReturnThis(),
      };

      const mockMobRenderer = {
        tick: vi.fn(),
        renderDebugHitboxes: vi.fn(),
      };

      renderHook(() =>
        useMiningTicker({
          app: mockApp,
          playerContainerRef: { current: playerContainer },
          gridContainerRef: { current: gridContainer },
          fallingRocksContainerRef: { current: null },
          currentRenderPosRef: { current: { x: 2, y: 4 } },
          targetServerPosRef: { current: { x: 2, y: 4 } },
          isFacingLeftRef: { current: false },
          playerFacingDirRef: { current: { x: 1, y: 0 } },
          playerSpriteRef: { current: null },
          mobRendererRef: { current: mockMobRenderer as any },
          activeFallingRocksRef: { current: [] },
          fallingRockGraphicsMap: { current: new Map() },
          debugGraphicsRef: { current: mockG },
          showDebugRef: { current: true },
          flashlightRef: { current: null },
          lightingEngineRef: { current: null },
          cameraRef: { current: null },
          playerBodyRef,
          gridRef,
          keysPressedRef,
          isMiningRef,
          miningTargetRef,
        })
      );

      tickerCallbacks[0]();
      expect(mockMobRenderer.renderDebugHitboxes).toHaveBeenCalledWith(mockG, expect.any(Number));
    });
  });

  describe('useMiningTicker - Dynamite Visual Effects', () => {
    it('calls dynamiteVisualManager update each tick and destroy on unmount', () => {
      const mockVisualManager = {
        update: vi.fn(),
        destroy: vi.fn(),
      };

      const { unmount } = renderHook(() =>
        useMiningTicker({
          app: mockApp,
          playerContainerRef: { current: playerContainer },
          gridContainerRef: { current: gridContainer },
          fallingRocksContainerRef: { current: null },
          currentRenderPosRef: { current: { x: 2, y: 4 } },
          targetServerPosRef: { current: { x: 2, y: 4 } },
          isFacingLeftRef: { current: false },
          playerFacingDirRef: { current: { x: 1, y: 0 } },
          playerSpriteRef: { current: null },
          activeFallingRocksRef: { current: [] },
          fallingRockGraphicsMap: { current: new Map() },
          activeDynamitesRef: {
            current: [
              {
                id: 'dyn-1',
                position: { x: 5, y: 5 },
                velocity: { x: 0, y: 0 },
                fuseRemainingSeconds: 3,
              },
            ] as any,
          },
          dynamiteVisualManagerRef: { current: mockVisualManager as any },
          droppedItemsRef: { current: [] },
          debugGraphicsRef: { current: null },
          showDebugRef: { current: false },
          flashlightRef: { current: null },
          lightingEngineRef: { current: null },
          cameraRef: { current: null },
          playerBodyRef,
          gridRef,
          keysPressedRef,
          isMiningRef,
          miningTargetRef,
        })
      );

      tickerCallbacks[0]();

      expect(mockVisualManager.update).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'dyn-1' })]),
        expect.any(Number),
        undefined,
        null,
        expect.any(Number),
        undefined
      );

      unmount();
      expect(mockVisualManager.destroy).toHaveBeenCalled();
    });
  });

  describe('useMiningTicker - Dropped Item Visual Effects', () => {
    it('calls droppedItemVisualManager update each tick and destroy on unmount', () => {
      const mockDroppedItemVisualManager = {
        update: vi.fn(),
        destroy: vi.fn(),
      };

      const droppedItems = [
        {
          id: 'drop_sol_1',
          itemId: 'sol',
          itemName: 'Sol',
          iconUrl: '/assets/icons/items/sol.png',
          quantity: 1,
          position: { x: 4, y: 7 },
          particleEffectId: 'pe_fairy_sparkle',
          lightConfig: { enabled: true, type: 'POINT', effect: 'PULSE' },
        },
      ];

      const { unmount } = renderHook(() =>
        useMiningTicker({
          app: mockApp,
          playerContainerRef: { current: playerContainer },
          gridContainerRef: { current: gridContainer },
          fallingRocksContainerRef: { current: null },
          currentRenderPosRef: { current: { x: 2, y: 4 } },
          targetServerPosRef: { current: { x: 2, y: 4 } },
          isFacingLeftRef: { current: false },
          playerFacingDirRef: { current: { x: 1, y: 0 } },
          playerSpriteRef: { current: null },
          activeFallingRocksRef: { current: [] },
          fallingRockGraphicsMap: { current: new Map() },
          debugGraphicsRef: { current: null },
          showDebugRef: { current: false },
          flashlightRef: { current: null },
          lightingEngineRef: { current: null },
          cameraRef: { current: null },
          playerBodyRef,
          gridRef,
          keysPressedRef,
          isMiningRef,
          miningTargetRef,
          droppedItemVisualManagerRef: { current: mockDroppedItemVisualManager as any },
          droppedItemsRef: { current: droppedItems as any },
        })
      );

      tickerCallbacks[0]();

      expect(mockDroppedItemVisualManager.update).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'drop_sol_1' })]),
        expect.any(Number),
        undefined,
        null,
        expect.any(Number)
      );

      unmount();
      expect(mockDroppedItemVisualManager.destroy).toHaveBeenCalled();
    });
  });
});

describe('useMiningTicker - Projectile Flight & Visibility', () => {
  let mockApp: any;
  let tickerCallbacks: (() => void)[] = [];
  let playerContainer: any;
  let gridContainer: any;

  const createMockGrid = (): MiningClientTile[][] => {
    return Array.from({ length: 10 }, (_, y) =>
      Array.from({ length: 10 }, () => ({
        type: y >= 5 ? MiningTileType.DIRT : MiningTileType.EMPTY,
        revealed: true,
        damageStage: 0,
      }))
    );
  };

  beforeEach(() => {
    tickerCallbacks = [];
    mockApp = {
      ticker: {
        deltaMS: 16.67,
        add: vi.fn((cb) => tickerCallbacks.push(cb)),
        remove: vi.fn((cb) => {
          tickerCallbacks = tickerCallbacks.filter((c) => c !== cb);
        }),
      },
      screen: { width: 800, height: 600 },
    };
    playerContainer = { x: 0, y: 0 };
    gridContainer = { x: 0, y: 0 };
  });

  it('advances client projectile position over empty tiles and maintains visibility', () => {
    const activeProjectiles: MiningActiveProjectile[] = [
      {
        id: 'client_proj_1',
        position: { x: 2, y: 2 },
        spawnPosition: { x: 2, y: 2 },
        velocity: { x: 10, y: 0 },
        angle: 0,
      },
    ];
    const activeProjectilesRef = { current: activeProjectiles };
    const projectileGraphicsMap = { current: new Map() };
    const projectilesContainer = { addChild: vi.fn(), removeChild: vi.fn(), children: [] };
    const gridRef = { current: createMockGrid() };
    const playerBodyRef = { current: new MiningPlayerBody({ x: 2, y: 4 }) };

    renderHook(() =>
      useMiningTicker({
        app: mockApp,
        playerContainerRef: { current: playerContainer },
        gridContainerRef: { current: gridContainer },
        fallingRocksContainerRef: { current: null },
        currentRenderPosRef: { current: { x: 2, y: 4 } },
        targetServerPosRef: { current: { x: 2, y: 4 } },
        isFacingLeftRef: { current: false },
        playerFacingDirRef: { current: { x: 1, y: 0 } },
        playerSpriteRef: { current: null },
        activeFallingRocksRef: { current: [] },
        fallingRockGraphicsMap: { current: new Map() },
        debugGraphicsRef: { current: null },
        showDebugRef: { current: false },
        flashlightRef: { current: null },
        lightingEngineRef: { current: null },
        cameraRef: { current: null },
        playerBodyRef,
        gridRef,
        projectilesContainerRef: { current: projectilesContainer as any },
        activeProjectilesRef,
        projectileGraphicsMap,
      })
    );

    // Run 1 frame (dt = 0.01667s)
    tickerCallbacks[0]();

    expect(activeProjectilesRef.current.length).toBe(1);
    const proj = activeProjectilesRef.current[0];
    expect(proj.position.x).toBeGreaterThan(2.0);
    expect(proj.hasHit).toBeFalsy();
  });

  it('retains projectile on impact frame at collision point with impact linger rather than immediate deletion', () => {
    // Grid has solid dirt floor at y >= 5
    const activeProjectiles: MiningActiveProjectile[] = [
      {
        id: 'client_proj_hit',
        position: { x: 2, y: 4.8 },
        spawnPosition: { x: 2, y: 3.5 },
        velocity: { x: 0, y: 20 }, // Moving downwards into dirt row y=5
        angle: Math.PI / 2,
      },
    ];
    const activeProjectilesRef = { current: activeProjectiles };
    const projectileGraphicsMap = { current: new Map() };
    const projectilesContainer = { addChild: vi.fn(), removeChild: vi.fn(), children: [] };
    const gridRef = { current: createMockGrid() };
    const playerBodyRef = { current: new MiningPlayerBody({ x: 2, y: 4 }) };

    renderHook(() =>
      useMiningTicker({
        app: mockApp,
        playerContainerRef: { current: playerContainer },
        gridContainerRef: { current: gridContainer },
        fallingRocksContainerRef: { current: null },
        currentRenderPosRef: { current: { x: 2, y: 4 } },
        targetServerPosRef: { current: { x: 2, y: 4 } },
        isFacingLeftRef: { current: false },
        playerFacingDirRef: { current: { x: 1, y: 0 } },
        playerSpriteRef: { current: null },
        activeFallingRocksRef: { current: [] },
        fallingRockGraphicsMap: { current: new Map() },
        debugGraphicsRef: { current: null },
        showDebugRef: { current: false },
        flashlightRef: { current: null },
        lightingEngineRef: { current: null },
        cameraRef: { current: null },
        playerBodyRef,
        gridRef,
        projectilesContainerRef: { current: projectilesContainer as any },
        activeProjectilesRef,
        projectileGraphicsMap,
      })
    );

    // Advance frame so bullet hits solid block
    tickerCallbacks[0]();

    // Crucial: projectile must NOT be removed from activeProjectiles on impact frame!
    expect(activeProjectilesRef.current.length).toBe(1);
    const proj = activeProjectilesRef.current[0];
    expect(proj.hasHit).toBe(true);
    expect(proj.velocity.x).toBe(0);
    expect(proj.velocity.y).toBe(0);
    expect(proj.impactTimer).toBeGreaterThan(0);
    expect(proj.alpha).toBe(1.0);
  });

  it('allows projectile to fly freely through open sky above ground (y < 0) without snapping to y=0 or despawning immediately', () => {
    // Projectile spawned above ground at y = -1.0, traveling horizontally through the sky
    const activeProjectiles: MiningActiveProjectile[] = [
      {
        id: 'client_proj_sky',
        position: { x: 2, y: -1.0 },
        spawnPosition: { x: 2, y: -1.0 },
        velocity: { x: 15, y: -2 }, // Shooting slightly upward into the sky
        angle: -0.13,
      },
    ];
    const activeProjectilesRef = { current: activeProjectiles };
    const projectileGraphicsMap = { current: new Map() };
    const projectilesContainer = { addChild: vi.fn(), removeChild: vi.fn(), children: [] };
    const gridRef = { current: createMockGrid() };
    const playerBodyRef = { current: new MiningPlayerBody({ x: 2, y: -0.5 }) };

    renderHook(() =>
      useMiningTicker({
        app: mockApp,
        playerContainerRef: { current: playerContainer },
        gridContainerRef: { current: gridContainer },
        fallingRocksContainerRef: { current: null },
        currentRenderPosRef: { current: { x: 2, y: -0.5 } },
        targetServerPosRef: { current: { x: 2, y: -0.5 } },
        isFacingLeftRef: { current: false },
        playerFacingDirRef: { current: { x: 1, y: 0 } },
        playerSpriteRef: { current: null },
        activeFallingRocksRef: { current: [] },
        fallingRockGraphicsMap: { current: new Map() },
        debugGraphicsRef: { current: null },
        showDebugRef: { current: false },
        flashlightRef: { current: null },
        lightingEngineRef: { current: null },
        cameraRef: { current: null },
        playerBodyRef,
        gridRef,
        projectilesContainerRef: { current: projectilesContainer as any },
        activeProjectilesRef,
        projectileGraphicsMap,
      })
    );

    // Advance 1 frame (dt = ~0.0167s)
    tickerCallbacks[0]();

    expect(activeProjectilesRef.current.length).toBe(1);
    const proj = activeProjectilesRef.current[0];
    // Projectile must remain airborne in negative y, NOT clamped to y=0 or flagged as hit
    expect(proj.position.y).toBeLessThan(0);
    expect(proj.position.x).toBeGreaterThan(2.0);
    expect(proj.hasHit).toBeFalsy();
    expect(proj.velocity.x).toBe(15);
  });

  it('applies miningSwingSpeed to playerSprite and triggers sound at weapon attack speed interval', () => {
    const playSfxMock = vi.fn();
    const setListenerPositionMock = vi.fn();
    const mockSoundManager: any = {
      playSfx: playSfxMock,
      setListenerPosition: setListenerPositionMock,
    };
    const weaponSoundUrlRef = { current: '/assets/sounds/axe_swing.mp3' };
    const setSwingSpeedMock = vi.fn();
    const setStateMock = vi.fn();
    const updateMock = vi.fn();
    const mockSprite: any = {
      setAimAngle: vi.fn(),
      setSwingSpeed: setSwingSpeedMock,
      setState: setStateMock,
      update: updateMock,
    };
    const playerSpriteRef = { current: mockSprite };
    const gridRef = { current: createMockGrid() };
    const playerBodyRef = { current: new MiningPlayerBody({ x: 2, y: 4 }) };
    const isMiningRef = { current: true };

    let mockTime = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    try {
      renderHook(() =>
        useMiningTicker({
          app: mockApp,
          playerContainerRef: { current: playerContainer },
          gridContainerRef: { current: gridContainer },
          fallingRocksContainerRef: { current: null },
          currentRenderPosRef: { current: { x: 2, y: 4 } },
          targetServerPosRef: { current: { x: 2, y: 4 } },
          isFacingLeftRef: { current: false },
          playerFacingDirRef: { current: { x: 1, y: 0 } },
          playerSpriteRef,
          activeFallingRocksRef: { current: [] },
          fallingRockGraphicsMap: { current: new Map() },
          debugGraphicsRef: { current: null },
          showDebugRef: { current: false },
          flashlightRef: { current: null },
          lightingEngineRef: { current: null },
          cameraRef: { current: null },
          playerBodyRef,
          gridRef,
          isMiningRef,
          soundManager: mockSoundManager,
          weaponSoundUrlRef,
          miningSwingSpeed: 2.0, // 2 swings/sec = 500ms cycle
        })
      );

      // Frame 1 at t=1000: first swing sound should trigger
      tickerCallbacks[0]();
      expect(setSwingSpeedMock).toHaveBeenCalledWith(2.0);
      expect(setStateMock).toHaveBeenCalledWith('mine');
      expect(playSfxMock).toHaveBeenCalledTimes(1);
      expect(playSfxMock).toHaveBeenCalledWith('/assets/sounds/axe_swing.mp3');

      // Frame 2 at t=1300 (300ms later, which is < 500ms cycle): sound should NOT trigger again yet
      mockTime = 1300;
      tickerCallbacks[0]();
      expect(playSfxMock).toHaveBeenCalledTimes(1);

      // Frame 3 at t=1505 (505ms later >= 500ms cycle): second swing sound triggers!
      mockTime = 1505;
      tickerCallbacks[0]();
      expect(playSfxMock).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

