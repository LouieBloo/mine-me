import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiningPlayerBody, type MiningClientTile, MiningTileType } from '@mine-me/shared';
import { useMiningTicker } from './useMiningTicker';
import { renderHook } from '@testing-library/react';

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

  it('immediately advances player body position on client frame when right key is pressed (Zero Input Lag)', () => {
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
        gridRef,
        keysPressedRef,
        isMiningRef,
        miningTargetRef,
      })
    );

    expect(tickerCallbacks.length).toBe(1);

    // Press right
    keysPressedRef.current.right = true;

    // Advance 1 frame (16.67ms = 0.01667s)
    tickerCallbacks[0]();

    // Player position should have immediately increased (predicted movement minus initial server reconciliation nudge)
    expect(playerBodyRef.current.position.x).toBeGreaterThan(2.05);

    // Sprite container pixel position should immediately reflect predicted coordinates
    expect(playerContainer.x).toBeCloseTo(playerBodyRef.current.position.x * 64, 2);
  });

  it('smoothly reconciles predicted position towards authoritative server position on small drift', () => {
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
        gridRef,
        keysPressedRef,
        isMiningRef,
        miningTargetRef,
      })
    );

    // Simulate minor server discrepancy: server says player is at 2.05, client is at 2.0
    playerBodyRef.current.position.x = 2.0;
    targetServerPosRef.current.x = 2.05;

    // Step 1 frame without movement input
    tickerCallbacks[0]();

    // Client body should have been softly pulled towards 2.05 without popping
    expect(playerBodyRef.current.position.x).toBeGreaterThan(2.0);
    expect(playerBodyRef.current.position.x).toBeLessThanOrEqual(2.05);
  });

  it('snaps immediately to authoritative server position on large divergence (> 1.2 tiles)', () => {
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
        gridRef,
        keysPressedRef,
        isMiningRef,
        miningTargetRef,
      })
    );

    // Server repositions player (e.g. respawn or teleport) to 8.0, 2.0
    targetServerPosRef.current = { x: 8.0, y: 2.0 };
    playerBodyRef.current.position = { x: 2.0, y: 4.0 };

    tickerCallbacks[0]();

    // Should snap instantly
    expect(playerBodyRef.current.position.x).toBe(8.0);
    expect(playerBodyRef.current.position.y).toBe(2.0);
    expect(playerContainer.x).toBe(8.0 * 64);
  });

  it('does not allow lagging server positions to pull player backwards when actively walking into a wall', () => {
    // Set a solid wall at tile (4, 4)
    gridRef.current[4][4].type = MiningTileType.DIRT;

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
        gridRef,
        keysPressedRef,
        isMiningRef,
        miningTargetRef,
      })
    );

    // Player resting at y=4.5625 (above floor y=5), right in front of wall at x=4
    const flushWallX = 4.0 - playerBodyRef.current.halfWidth;
    playerBodyRef.current.position.x = flushWallX;
    playerBodyRef.current.position.y = 5.0 - playerBodyRef.current.halfHeight;
    playerBodyRef.current.isGrounded = true;

    // Server is lagging behind at x=3.5
    targetServerPosRef.current = { x: 3.5, y: 5.0 - playerBodyRef.current.halfHeight };

    // Player continues holding right into the wall
    keysPressedRef.current.right = true;

    // Run 10 ticks
    for (let i = 0; i < 10; i++) {
      tickerCallbacks[0]();
    }

    // Player must remain flush against the wall and NOT get pulled backward to 3.5
    expect(playerBodyRef.current.position.x).toBeCloseTo(flushWallX, 3);
    expect(playerContainer.x).toBeCloseTo(flushWallX * 64, 2);
  });

  it('does not allow trailing server position to pull player backward during a jump (camera spasm fix)', () => {
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
        gridRef,
        keysPressedRef,
        isMiningRef,
        miningTargetRef,
      })
    );

    // Ground the player above floor at y=5
    const groundedY = 5.0 - playerBodyRef.current.halfHeight;
    playerBodyRef.current.position = { x: 2, y: groundedY };
    playerBodyRef.current.isGrounded = true;
    playerBodyRef.current.velocity = { x: 0, y: 0 };
    targetServerPosRef.current = { x: 2, y: groundedY };

    // Press jump
    keysPressedRef.current.jump = true;

    // Step one frame to initiate the jump
    tickerCallbacks[0]();

    // Player should now be airborne (moving upward)
    expect(playerBodyRef.current.isGrounded).toBe(false);
    expect(playerBodyRef.current.velocity.y).toBeLessThan(0);
    const posAfterJumpFrame = playerBodyRef.current.position.y;

    // Release jump key
    keysPressedRef.current.jump = false;

    // Simulate a stale server position that's still at the ground (server hasn't processed the jump yet)
    // This 0.3 tile error is well within the 0.8 tile airborne suppression threshold
    targetServerPosRef.current = { x: 2, y: posAfterJumpFrame + 0.3 };

    // Step several frames while airborne
    const positionsY: number[] = [];
    for (let i = 0; i < 5; i++) {
      tickerCallbacks[0]();
      positionsY.push(playerBodyRef.current.position.y);
    }

    // The player should continue following a smooth jump arc upward (positions getting smaller = going up)
    // WITHOUT being pulled back down toward the stale server position.
    // If reconciliation were active, positionsY would oscillate or move downward.
    for (let i = 1; i < positionsY.length; i++) {
      // During the upward phase of the jump, each frame's Y should be <= previous
      // (ascending = decreasing Y, or at worst the apex where it briefly equals)
      // We just need to confirm the trajectory is smooth, not jerked back down
      const delta = positionsY[i] - positionsY[i - 1];
      // Delta should be consistent frame-to-frame (no sudden reversal from reconciliation pull)
      expect(Math.abs(delta)).toBeLessThan(0.5); // No large jumps from reconciliation
    }

    // The client should NOT have been snapped to the stale server Y position
    expect(playerBodyRef.current.position.y).not.toBeCloseTo(posAfterJumpFrame + 0.3, 1);
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
  });
});

