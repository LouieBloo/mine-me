import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningMouseController } from './MiningMouseController';
import { TorchPlacementAction, LadderPlacementAction, DynamiteThrowAction, ThrowableItemAction } from './MouseAction';
import { MiningTileType, MouseActionTriggerMode, type MiningClientTile } from '@mine-me/shared';

describe('MiningMouseController and MouseAction', () => {
  let controller: MiningMouseController;
  let mockGrid: MiningClientTile[][];

  beforeEach(() => {
    controller = new MiningMouseController();
    mockGrid = Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => ({
        type: MiningTileType.EMPTY,
        revealed: true,
      }))
    );
    controller.setGrid(mockGrid);
    controller.setPlayerPosition({ x: 5.5, y: 5.5 });
  });

  describe('LadderPlacementAction', () => {
    it('has triggerMode set to HOLD for continuous placement', () => {
      const onPlace = vi.fn();
      const action = new LadderPlacementAction(onPlace);
      expect(action.triggerMode).toBe(MouseActionTriggerMode.HOLD);
      expect(action.name).toBe('place_ladder');
    });

    it('allows overriding triggerMode dynamically from item config', () => {
      const onPlace = vi.fn();
      const action = new LadderPlacementAction(onPlace, MouseActionTriggerMode.SINGLE);
      expect(action.triggerMode).toBe(MouseActionTriggerMode.SINGLE);
    });

    it('allows placement on revealed empty tile within reach', () => {
      const onPlace = vi.fn().mockResolvedValue(true);
      const action = new LadderPlacementAction(onPlace);

      const target = { x: 5, y: 5 };
      expect(action.canExecute(target, { x: 5.5, y: 5.5 }, mockGrid)).toBe(true);

      const style = action.getReticleStyle(target, { x: 5.5, y: 5.5 }, mockGrid);
      expect(style.isValid).toBe(true);
      expect(style.showPreview).toBe(true);
      expect(style.previewType).toBe('LADDER');
    });

    it('rejects placement when tile is out of reach or already a ladder', () => {
      const onPlace = vi.fn();
      const action = new LadderPlacementAction(onPlace);

      // Out of reach
      expect(action.canExecute({ x: 0, y: 0 }, { x: 5.5, y: 5.5 }, mockGrid)).toBe(false);

      // Already ladder
      mockGrid[5][5].type = MiningTileType.LADDER;
      expect(action.canExecute({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid)).toBe(false);

      const style = action.getReticleStyle({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid);
      expect(style.isValid).toBe(false);
      expect(style.showPreview).toBe(false);
    });

    it('executes the onPlace callback on execute()', async () => {
      const onPlace = vi.fn().mockResolvedValue(true);
      const action = new LadderPlacementAction(onPlace);

      const res = await action.execute({ x: 5, y: 5 });
      expect(res).toBe(true);
      expect(onPlace).toHaveBeenCalledWith({ x: 5, y: 5 });
    });
  });

  describe('TorchPlacementAction', () => {
    it('has triggerMode set to SINGLE for single-click placement', () => {
      const onPlace = vi.fn();
      const action = new TorchPlacementAction(onPlace);
      expect(action.triggerMode).toBe(MouseActionTriggerMode.SINGLE);
      expect(action.name).toBe('place_torch');
    });

    it('allows overriding triggerMode dynamically from item config', () => {
      const onPlace = vi.fn();
      const action = new TorchPlacementAction(onPlace, MouseActionTriggerMode.HOLD);
      expect(action.triggerMode).toBe(MouseActionTriggerMode.HOLD);
    });

    it('allows placement on revealed empty tile within 1 tile distance', () => {
      const onPlace = vi.fn().mockResolvedValue(true);
      const action = new TorchPlacementAction(onPlace);

      // Target (6, 5) is adjacent (dx = 1, dy = 0)
      const canPlace = action.canExecute({ x: 6, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid);
      expect(canPlace).toBe(true);

      const style = action.getReticleStyle({ x: 6, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid);
      expect(style.isValid).toBe(true);
      expect(style.showPreview).toBe(true);
      expect(style.color).toBe(0x22c55e); // Green
    });

    it('rejects placement if target is more than 1 tile away from player', () => {
      const onPlace = vi.fn();
      const action = new TorchPlacementAction(onPlace);

      // Target (8, 5) is 3 tiles away from player at (5.5, 5.5)
      const canPlace = action.canExecute({ x: 8, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid);
      expect(canPlace).toBe(false);

      const style = action.getReticleStyle({ x: 8, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid);
      expect(style.isValid).toBe(false);
      expect(style.showPreview).toBe(false);
      expect(style.color).toBe(0xef4444); // Red
    });

    it('rejects placement on unrevealed or entrance tiles', () => {
      const onPlace = vi.fn();
      const action = new TorchPlacementAction(onPlace);

      // Unrevealed tile
      mockGrid[5][6] = { type: MiningTileType.EMPTY, revealed: false };
      expect(action.canExecute({ x: 6, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid)).toBe(false);

      // Entrance tile
      mockGrid[5][6] = { type: MiningTileType.ENTRANCE, revealed: true };
      expect(action.canExecute({ x: 6, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid)).toBe(false);

      // Already a torch tile
      mockGrid[5][6] = { type: MiningTileType.TORCH, revealed: true };
      expect(action.canExecute({ x: 6, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid)).toBe(false);
    });

    it('executes placement callback with target position', async () => {
      const onPlace = vi.fn().mockResolvedValue(true);
      const action = new TorchPlacementAction(onPlace);

      const res = await action.execute({ x: 6, y: 5 }, { x: 5.5, y: 5.5 });
      expect(res).toBe(true);
      expect(onPlace).toHaveBeenCalledWith({ x: 6, y: 5 });
    });
  });

  describe('MiningMouseController methods', () => {
    it('correctly validates isWithinReach for adjacent coordinates', () => {
      controller.setPlayerPosition({ x: 3.2, y: 4.8 }); // playerTile is (3, 4)

      // Adjacent / diagonals
      expect(controller.isWithinReach({ x: 3, y: 4 })).toBe(true);
      expect(controller.isWithinReach({ x: 4, y: 4 })).toBe(true);
      expect(controller.isWithinReach({ x: 2, y: 4 })).toBe(true);
      expect(controller.isWithinReach({ x: 4, y: 5 })).toBe(true);
      expect(controller.isWithinReach({ x: 2, y: 3 })).toBe(true);

      // Out of reach (2 tiles away)
      expect(controller.isWithinReach({ x: 6, y: 4 })).toBe(false);
      expect(controller.isWithinReach({ x: 3, y: 7 })).toBe(false);
      expect(controller.isWithinReach({ x: 0, y: 2 })).toBe(false);

      // Player at far right edge of block (x = 3.8) can still reach block to the left (x = 2)
      controller.setPlayerPosition({ x: 3.8, y: 4.5 });
      expect(controller.isWithinReach({ x: 2, y: 4 })).toBe(true);
      expect(controller.isWithinReach({ x: 4, y: 4 })).toBe(true);
    });

    it('notifies listeners when action is set and reticle state is computed', () => {
      const onPlace = vi.fn();
      const action = new TorchPlacementAction(onPlace);

      controller.setActiveAction(action);
      expect(controller.getActiveAction()).toBe(action);
    });

    it('emits onMiningStateChange when pointerdown and pointerup occur on canvas in mining mode', () => {
      const mockCanvas = document.createElement('canvas');
      mockCanvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 320,
        right: 320,
        bottom: 320,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      const mockCamera = {
        screenToWorld: (pos: { x: number; y: number }) => ({ x: pos.x, y: pos.y }),
      } as any;

      controller.attach(mockCanvas);
      controller.setCamera(mockCamera);

      const miningSpy = vi.fn();
      controller.onMiningStateChange(miningSpy);

      // Pointer down at tile (2, 2): 2 * 64 + 10 = 138
      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: 138, clientY: 138 })
      );

      expect(controller.getIsMouseDown()).toBe(true);
      expect(miningSpy).toHaveBeenCalledWith(true, { x: 2, y: 2 });

      // Pointer up -> stops mining
      window.dispatchEvent(
        new PointerEvent('pointerup', { button: 0, clientX: 138, clientY: 138 })
      );

      expect(controller.getIsMouseDown()).toBe(false);
      expect(miningSpy).toHaveBeenCalledWith(false, null);

      controller.detach();
    });

    it('returns appropriate reticle style for minable, out of reach, and rock tiles in mining mode', () => {
      // (6, 5) is DIRT and adjacent to player at (5.5, 5.5) -> valid in reach
      mockGrid[5][6] = { type: MiningTileType.DIRT, revealed: true };
      // (9, 5) is DIRT and out of reach
      mockGrid[5][9] = { type: MiningTileType.DIRT, revealed: true };
      // (5, 5) is ROCK
      mockGrid[5][5] = { type: MiningTileType.ROCK, revealed: true };

      const mockCanvas = document.createElement('canvas');
      mockCanvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 1000,
        right: 1000,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => {},
      });
      const mockCamera = {
        screenToWorld: (pos: { x: number; y: number }) => ({ x: pos.x, y: pos.y }),
      } as any;
      controller.attach(mockCanvas);
      controller.setCamera(mockCamera);

      // Hover over in-reach dirt tile (6 * 64 + 10 = 394, 5 * 64 + 10 = 330)
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 394, clientY: 330 }));
      const reticleInReach = controller.getReticleState();
      expect(reticleInReach.active).toBe(true);
      expect(reticleInReach.style?.isValid).toBe(true);
      expect(reticleInReach.style?.color).toBe(0xeab308); // Gold/amber

      // Hover over out-of-reach dirt tile (9 * 64 + 10 = 586, 5 * 64 + 10 = 330)
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 586, clientY: 330 }));
      const reticleOutOfReach = controller.getReticleState();
      expect(reticleOutOfReach.active).toBe(true);
      expect(reticleOutOfReach.style?.isValid).toBe(false);
      expect(reticleOutOfReach.style?.color).toBe(0xef4444); // Red

      // Hover over rock tile (5 * 64 + 10 = 330, 5 * 64 + 10 = 330)
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 330, clientY: 330 }));
      const reticleRock = controller.getReticleState();
      expect(reticleRock.active).toBe(true);
      expect(reticleRock.style?.isValid).toBe(false);
      expect(reticleRock.style?.color).toBe(0x475569); // Slate

      controller.detach();
    });

    it('automatically re-targets on controller.update() when camera moves, even if mouse is stationary', () => {
      let cameraOffset = 0;
      const mockCanvas = document.createElement('canvas');
      mockCanvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 1000,
        right: 1000,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => {},
      });
      const mockCamera = {
        screenToWorld: (pos: { x: number; y: number }) => ({ x: pos.x + cameraOffset, y: pos.y }),
      } as any;
      controller.attach(mockCanvas);
      controller.setCamera(mockCamera);

      const miningSpy = vi.fn();
      controller.onMiningStateChange(miningSpy);

      // Mouse is at clientX: 138 (tile 2) and pressed down
      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: 138, clientY: 138 })
      );
      expect(miningSpy).toHaveBeenCalledWith(true, { x: 2, y: 2 });

      // Now camera scrolls right by 64px (1 tile), but NO pointer event is fired
      cameraOffset = 64;
      controller.update();

      // Should automatically re-target to tile 3 without moving mouse!
      expect(miningSpy).toHaveBeenCalledWith(true, { x: 3, y: 2 });
      expect(controller.getHoveredTile()).toEqual({ x: 3, y: 2 });

      controller.detach();
    });
  });

  describe('MouseActionTriggerMode handling in controller', () => {
    let mockCanvas: HTMLCanvasElement;
    let mockCamera: any;
    const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

    beforeEach(() => {
      mockGrid = Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => ({
          type: MiningTileType.EMPTY,
          revealed: true,
        }))
      );
      controller.setGrid(mockGrid);
      controller.setPlayerPosition({ x: 5.5, y: 5.5 });

      mockCanvas = document.createElement('canvas');
      mockCanvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 1000,
        right: 1000,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => {},
      });
      mockCamera = {
        screenToWorld: (pos: { x: number; y: number }) => ({ x: pos.x, y: pos.y }),
      };
      controller.attach(mockCanvas);
      controller.setCamera(mockCamera);
    });

    it('TorchPlacementAction (SINGLE): executes once on click, and does NOT execute repeatedly when held', async () => {
      const onPlace = vi.fn().mockResolvedValue(true);
      const torchAction = new TorchPlacementAction(onPlace);
      controller.setActiveAction(torchAction);

      // Mouse down on tile (5, 5) -> clientX: 5 * 64 + 10 = 330, clientY: 330
      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: 330, clientY: 330 })
      );
      await flushPromises();

      expect(onPlace).toHaveBeenCalledTimes(1);
      expect(onPlace).toHaveBeenCalledWith({ x: 5, y: 5 });

      // Pointer moves to tile (6, 5) while holding mouse button down -> clientX: 6 * 64 + 10 = 394
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 394, clientY: 330 }));
      controller.update();
      await flushPromises();

      // Should NOT have triggered again because triggerMode is SINGLE!
      expect(onPlace).toHaveBeenCalledTimes(1);

      // Releasing and clicking on (6, 5) triggers second torch
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 394, clientY: 330 }));
      window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 394, clientY: 330 }));
      await flushPromises();

      expect(onPlace).toHaveBeenCalledTimes(2);
      expect(onPlace).toHaveBeenLastCalledWith({ x: 6, y: 5 });

      controller.detach();
    });

    it('LadderPlacementAction (HOLD): continuously places ladders as mouse moves to new tiles while held', async () => {
      const onPlace = vi.fn().mockImplementation((target) => {
        // simulate placing ladder in grid
        mockGrid[target.y][target.x].type = MiningTileType.LADDER;
        return Promise.resolve(true);
      });
      const ladderAction = new LadderPlacementAction(onPlace);
      controller.setActiveAction(ladderAction);

      // Mouse down on tile (5, 5)
      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: 330, clientY: 330 })
      );
      await flushPromises();

      expect(onPlace).toHaveBeenCalledTimes(1);
      expect(onPlace).toHaveBeenCalledWith({ x: 5, y: 5 });

      // Calling update on the same tile (5, 5) does NOT duplicate placement
      controller.update();
      await flushPromises();
      expect(onPlace).toHaveBeenCalledTimes(1);

      // Player moves down 1 block and pointer moves down to tile (5, 6) -> clientY: 6 * 64 + 10 = 394
      controller.setPlayerPosition({ x: 5.5, y: 6.5 });
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 330, clientY: 394 }));
      controller.update();
      await flushPromises();

      // Automatically placed ladder on (5, 6)!
      expect(onPlace).toHaveBeenCalledTimes(2);
      expect(onPlace).toHaveBeenLastCalledWith({ x: 5, y: 6 });

      // Player moves down to tile (5, 7)
      controller.setPlayerPosition({ x: 5.5, y: 7.5 });
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 330, clientY: 458 }));
      controller.update();
      await flushPromises();

      expect(onPlace).toHaveBeenCalledTimes(3);
      expect(onPlace).toHaveBeenLastCalledWith({ x: 5, y: 7 });

      // Releasing pointer stops hold placement
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 330, clientY: 458 }));
      controller.setPlayerPosition({ x: 5.5, y: 8.5 });
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 330, clientY: 522 }));
      controller.update();
      await flushPromises();

      expect(onPlace).toHaveBeenCalledTimes(3);

      controller.detach();
    });

    it('LadderPlacementAction (HOLD): holding mouse while out of reach places ladder as soon as player moves into reach', async () => {
      const onPlace = vi.fn().mockImplementation((target) => {
        mockGrid[target.y][target.x].type = MiningTileType.LADDER;
        return Promise.resolve(true);
      });
      const ladderAction = new LadderPlacementAction(onPlace);
      controller.setActiveAction(ladderAction);

      // Player at (5.5, 3.5), clicks and holds at tile (5, 6) -> dy = Math.abs(6.5 - 3.5) = 3.0 > 1.85 (out of reach)
      controller.setPlayerPosition({ x: 5.5, y: 3.5 });
      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: 330, clientY: 394 })
      );
      await flushPromises();

      // Cannot execute yet because out of reach
      expect(onPlace).not.toHaveBeenCalled();
      expect(controller.getIsMouseDown()).toBe(true);

      // Player starts climbing down to (5.5, 4.5) -> dy = 2.0 > 1.85
      controller.setPlayerPosition({ x: 5.5, y: 4.5 });
      controller.update();
      await flushPromises();
      expect(onPlace).not.toHaveBeenCalled();

      // Player moves closer to (5.5, 5.0) -> dy = 1.5 <= 1.85 (in reach!)
      controller.setPlayerPosition({ x: 5.5, y: 5.0 });
      controller.update();
      await flushPromises();

      // Automatically executes as soon as it becomes available!
      expect(onPlace).toHaveBeenCalledTimes(1);
      expect(onPlace).toHaveBeenCalledWith({ x: 5, y: 6 });

      controller.detach();
    });

    it('resets isMouseDown if activeAction changes or clears while holding mouse', () => {
      const onPlace = vi.fn();
      const ladderAction = new LadderPlacementAction(onPlace);
      controller.setActiveAction(ladderAction);

      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: 330, clientY: 330 })
      );
      expect(controller.getIsMouseDown()).toBe(true);

      // Action is cleared (e.g. ran out of ladders)
      controller.setActiveAction(null);

      // isMouseDown must be reset to false to avoid immediately triggering mining mode
      expect(controller.getIsMouseDown()).toBe(false);

      controller.detach();
    });

    it('preserves isMouseDown when setActiveAction is called with the same action type (e.g. inventory re-render)', () => {
      const onPlace1 = vi.fn();
      const ladderAction1 = new LadderPlacementAction(onPlace1, MouseActionTriggerMode.HOLD);
      controller.setActiveAction(ladderAction1);

      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: 330, clientY: 330 })
      );
      expect(controller.getIsMouseDown()).toBe(true);

      // A re-render happens (e.g. character inventory quantity changes from 20 to 19),
      // instantiating a new LadderPlacementAction with the same name and triggerMode
      const onPlace2 = vi.fn();
      const ladderAction2 = new LadderPlacementAction(onPlace2, MouseActionTriggerMode.HOLD);
      controller.setActiveAction(ladderAction2);

      // isMouseDown must be preserved so hold-to-repeat continues uninterrupted!
      expect(controller.getIsMouseDown()).toBe(true);
      expect(controller.getActiveAction()).toBe(ladderAction2);

      controller.detach();
    });
  });

  describe('DynamiteThrowAction', () => {
    it('defaults triggerMode to SINGLE', () => {
      const onThrow = vi.fn();
      const action = new DynamiteThrowAction(onThrow);
      expect(action.triggerMode).toBe(MouseActionTriggerMode.SINGLE);
      expect(action.name).toBe('throw_dynamite');
    });

    it('can execute towards any coordinates and provides a red reticle style', () => {
      const onThrow = vi.fn().mockResolvedValue(true);
      const action = new DynamiteThrowAction(onThrow);

      const target = { x: 8, y: 3 };
      expect(action.canExecute(target, { x: 5.5, y: 5.5 }, mockGrid)).toBe(true);

      const style = action.getReticleStyle(target, { x: 5.5, y: 5.5 }, mockGrid);
      expect(style.isValid).toBe(true);
      expect(style.color).toBe(0xef4444);
      expect(style.showPreview).toBe(false);
    });

    it('has isContinuous set to true and style.isFreeAim set to true', () => {
      const onThrow = vi.fn();
      const action = new DynamiteThrowAction(onThrow);
      expect(action.isContinuous).toBe(true);

      const style = action.getReticleStyle({ x: 3.2, y: 7.8 }, { x: 5.5, y: 5.5 }, mockGrid);
      expect(style.isFreeAim).toBe(true);
    });

    it('executes throw with continuous world coordinates when clicking anywhere on canvas', async () => {
      const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
      const onThrow = vi.fn().mockResolvedValue(true);
      const action = new DynamiteThrowAction(onThrow);
      controller.setActiveAction(action);

      const mockCanvas = document.createElement('canvas');
      mockCanvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => {},
      });
      controller.attach(mockCanvas);

      const mockCamera = {
        screenToWorld: vi.fn().mockImplementation((pos) => ({ x: pos.x + 100, y: pos.y + 50 })),
      } as any;
      controller.setCamera(mockCamera);

      // Move mouse to (clientX: 200, clientY: 150) -> world: (300, 200) -> continuous tiles: (300/64, 200/64) = (4.6875, 3.125)
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 150 }));
      controller.update();

      const reticle = controller.getReticleState();
      expect(reticle.active).toBe(true);
      expect(reticle.style?.isFreeAim).toBe(true);
      expect(reticle.target?.x).toBeCloseTo(4.6875);
      expect(reticle.target?.y).toBeCloseTo(3.125);

      // Click and release to throw
      window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 200, clientY: 150 }));
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 200, clientY: 150 }));
      await flushPromises();

      expect(onThrow).toHaveBeenCalledTimes(1);
      const thrownTarget = onThrow.mock.calls[0][0];
      expect(thrownTarget.x).toBeCloseTo(4.6875);
      expect(thrownTarget.y).toBeCloseTo(3.125);

      controller.detach();
    });

    it('charges throw force while mouse is held down and executes on release', async () => {
      const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
      const onThrow = vi.fn().mockResolvedValue(true);
      const action = new ThrowableItemAction({
        onThrow,
        maxChargeTimeMs: 1000,
        maxHoldTimeMs: 2000,
      });
      controller.setActiveAction(action);

      const mockCanvas = document.createElement('canvas');
      mockCanvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => {},
      });
      controller.attach(mockCanvas);

      const mockCamera = {
        screenToWorld: vi.fn().mockImplementation((pos) => ({ x: pos.x, y: pos.y })),
      } as any;
      controller.setCamera(mockCamera);

      // 1. Pointerdown starts charging
      window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 200, clientY: 150 }));
      expect(action.isCharging).toBe(true);
      expect(action.isOvercharged).toBe(false);

      // Check reticle style shows charging and trajectory points
      const chargingReticle = controller.getReticleState();
      expect(chargingReticle.style?.isCharging).toBe(true);
      expect(chargingReticle.style?.trajectoryPoints?.length).toBeGreaterThan(0);

      // Simulate charge update
      action.updateCharge(performance.now() + 500);
      expect(action.chargeRatio).toBeGreaterThan(0.4);

      // 2. Pointerup releases and throws with forceRatio
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 200, clientY: 150 }));
      await flushPromises();

      expect(onThrow).toHaveBeenCalledTimes(1);
      expect(action.isCharging).toBe(false);

      controller.detach();
    });

    it('cancels throw and hides parabola when holding past maxHoldTimeMs (overcharge)', async () => {
      const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
      const onThrow = vi.fn().mockResolvedValue(true);
      const action = new ThrowableItemAction({
        onThrow,
        maxChargeTimeMs: 1000,
        maxHoldTimeMs: 2000,
      });
      controller.setActiveAction(action);

      const mockCanvas = document.createElement('canvas');
      mockCanvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => {},
      });
      controller.attach(mockCanvas);

      const mockCamera = {
        screenToWorld: vi.fn().mockImplementation((pos) => ({ x: pos.x, y: pos.y })),
      } as any;
      controller.setCamera(mockCamera);

      // Start charging
      window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 200, clientY: 150 }));
      expect(action.isCharging).toBe(true);

      // Simulate holding past 2000ms
      action.updateCharge(performance.now() + 2500);
      expect(action.isOvercharged).toBe(true);

      // Parabola disappears on overcharge
      const overchargedReticle = controller.getReticleState();
      expect(overchargedReticle.style?.trajectoryPoints).toBeUndefined();
      expect(overchargedReticle.style?.isValid).toBe(false);

      // Releasing pointerup does NOT execute throw
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 200, clientY: 150 }));
      await flushPromises();

      expect(onThrow).not.toHaveBeenCalled();
      expect(action.isCharging).toBe(false);

      controller.detach();
    });
  });
});

