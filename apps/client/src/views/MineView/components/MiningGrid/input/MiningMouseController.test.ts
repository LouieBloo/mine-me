import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MiningMouseController } from './MiningMouseController';
import { TorchPlacementAction, LadderPlacementAction, BridgePlacementAction, DynamiteThrowAction, ThrowableItemAction, ShootWeaponAction } from './MouseAction';
import { MINING_QUEUE_LENGTH, MiningTileType, MouseActionTriggerMode, type MiningClientTile } from '@mine-me/shared';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

/** The pixel a little inside tile `tile` (the tests click and hover by tile). */
const px = (tile: number) => tile * TILE_SIZE + 10;

describe('MiningMouseController and MouseAction', () => {
  let controller: MiningMouseController;
  let mockGrid: MiningClientTile[][];

  beforeEach(() => {
    controller = new MiningMouseController();
    mockGrid = Array.from({ length: 20 }, () =>
      Array.from({ length: 20 }, () => ({
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
      expect(action.canExecute({ x: 12, y: 12 }, { x: 5.5, y: 5.5 }, mockGrid)).toBe(false);

      // Already ladder
      mockGrid[5][5].type = MiningTileType.LADDER;
      expect(action.canExecute({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid)).toBe(false);

      const style = action.getReticleStyle({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid);
      expect(style.isValid).toBe(false);
      expect(style.showPreview).toBe(false);
    });

    it('rejects placement over any block, ore or chest', () => {
      const action = new LadderPlacementAction(vi.fn());
      for (const type of [MiningTileType.DIRT, MiningTileType.COPPERIUM, MiningTileType.CHEST, MiningTileType.TORCH]) {
        mockGrid[5][5].type = type;
        expect(action.canExecute({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid)).toBe(false);
        expect(new TorchPlacementAction(vi.fn()).canExecute({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid)).toBe(false);
      }
    });

    it('executes the onPlace callback on execute()', async () => {
      const onPlace = vi.fn().mockResolvedValue(true);
      const action = new LadderPlacementAction(onPlace);

      const res = await action.execute({ x: 5, y: 5 });
      expect(res).toBe(true);
      expect(onPlace).toHaveBeenCalledWith({ x: 5, y: 5 });
    });
  });

  describe('BridgePlacementAction', () => {
    it('holds to keep placing, and previews a bridge', () => {
      const action = new BridgePlacementAction(vi.fn());
      expect(action.triggerMode).toBe(MouseActionTriggerMode.HOLD);
      expect(action.name).toBe('place_bridge');
      // (two cells to the side: the player is 1.25 tiles wide, so the next cell over is partly inside them)
      const style = action.getReticleStyle({ x: 7, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid);
      expect(style.isValid).toBe(true);
      expect(style.previewType).toBe('BRIDGE');
    });

    it('only goes into empty space within reach', () => {
      const action = new BridgePlacementAction(vi.fn());
      const player = { x: 5.5, y: 5.5 };
      mockGrid[5][7].type = MiningTileType.DIRT;
      expect(action.canExecute({ x: 7, y: 5 }, player, mockGrid)).toBe(false);
      mockGrid[5][7].type = MiningTileType.BRIDGE;
      expect(action.canExecute({ x: 7, y: 5 }, player, mockGrid)).toBe(false);
      mockGrid[5][7].type = MiningTileType.EMPTY;
      expect(action.canExecute({ x: 7, y: 5 }, player, mockGrid)).toBe(true);
      expect(action.canExecute({ x: 12, y: 12 }, player, mockGrid)).toBe(false);
    });

    it('cannot be placed into the player\'s own space', () => {
      const action = new BridgePlacementAction(vi.fn());
      expect(action.canExecute({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid)).toBe(false);
      // Just below the feet is fine (the player is 1.75 tiles tall, so the feet are in the second cell down)
      expect(action.canExecute({ x: 5, y: 7 }, { x: 5.5, y: 5.5 }, mockGrid)).toBe(true);
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

    it('rejects placement if the target is out of reach of the player', () => {
      const onPlace = vi.fn();
      const action = new TorchPlacementAction(onPlace);

      // Target (12, 5) is 7 tiles away from player at (5.5, 5.5): past the 3.7 reach
      const canPlace = action.canExecute({ x: 12, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid);
      expect(canPlace).toBe(false);

      const style = action.getReticleStyle({ x: 12, y: 5 }, { x: 5.5, y: 5.5 }, mockGrid);
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

      // Out of reach (the reach is 5.55 tiles from the player's centre)
      expect(controller.isWithinReach({ x: 11, y: 4 })).toBe(false);
      expect(controller.isWithinReach({ x: 3, y: 12 })).toBe(false);
      expect(controller.isWithinReach({ x: 0, y: 14 })).toBe(false);

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

      // Pointer down at tile (2, 2)
      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: px(2), clientY: px(2) })
      );

      expect(controller.getIsMouseDown()).toBe(true);
      expect(miningSpy).toHaveBeenCalledWith(true, { x: 2, y: 2 }, false);

      // Pointer up -> stops mining
      window.dispatchEvent(
        new PointerEvent('pointerup', { button: 0, clientX: px(2), clientY: px(2) })
      );

      expect(controller.getIsMouseDown()).toBe(false);
      expect(miningSpy).toHaveBeenCalledWith(false, null, false);

      controller.detach();
    });

    describe('clicks outside the game canvas', () => {
      const setup = () => {
        const canvas = document.createElement('canvas');
        canvas.getBoundingClientRect = () => ({
          left: 0, top: 0, width: 320, height: 320, right: 320, bottom: 320, x: 0, y: 0, toJSON: () => {},
        });
        document.body.appendChild(canvas);
        controller.attach(canvas);
        controller.setCamera({ screenToWorld: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }) } as any);
        const miningSpy = vi.fn();
        controller.onMiningStateChange(miningSpy);
        return { canvas, miningSpy };
      };
      const down = (el: Element) =>
        el.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: px(2), clientY: px(2), bubbles: true }));

      it('ignores a pointerdown on the side panel (not the canvas)', () => {
        const { canvas, miningSpy } = setup();
        const panel = document.createElement('div');
        document.body.appendChild(panel);
        down(panel);
        expect(controller.getIsMouseDown()).toBe(false);
        expect(miningSpy).not.toHaveBeenCalled();
        panel.remove();
        canvas.remove();
      });

      it('still mines on a pointerdown that lands on the canvas', () => {
        const { canvas, miningSpy } = setup();
        down(canvas);
        expect(controller.getIsMouseDown()).toBe(true);
        expect(miningSpy).toHaveBeenCalledWith(true, { x: 2, y: 2 }, false);
        canvas.remove();
      });

      it('stops mining when the pointer is cancelled (e.g. a drag-and-drop takes over)', () => {
        const { canvas, miningSpy } = setup();
        down(canvas);
        window.dispatchEvent(new Event('pointercancel'));
        expect(controller.getIsMouseDown()).toBe(false);
        expect(miningSpy).toHaveBeenLastCalledWith(false, null, false);
        canvas.remove();
      });

      it('stops mining when a drag starts', () => {
        const { canvas, miningSpy } = setup();
        down(canvas);
        window.dispatchEvent(new Event('dragstart'));
        expect(controller.getIsMouseDown()).toBe(false);
        expect(miningSpy).toHaveBeenLastCalledWith(false, null, false);
        canvas.remove();
      });
    });

    it('returns appropriate reticle style for minable, out of reach, and rock tiles in mining mode', () => {
      // (6, 5) is DIRT and adjacent to player at (5.5, 5.5) -> valid in reach
      mockGrid[5][6] = { type: MiningTileType.DIRT, revealed: true };
      // (13, 5) is DIRT and out of reach
      mockGrid[5][13] = { type: MiningTileType.DIRT, revealed: true };
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
      // Below the blocks, so the line to each one runs through open air
      controller.setPlayerPosition({ x: 5.5, y: 8.5 });

      // Hover over in-reach dirt tile (6 * 64 + 10 = 394, 5 * 64 + 10 = 330)
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: px(6), clientY: px(5) }));
      const reticleInReach = controller.getReticleState();
      expect(reticleInReach.active).toBe(true);
      expect(reticleInReach.style?.isValid).toBe(true);
      expect(reticleInReach.style?.color).toBe(0xeab308); // Gold/amber

      // Hover over out-of-reach dirt tile (more than the 5.55 reach away)
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: px(13), clientY: px(5) }));
      const reticleOutOfReach = controller.getReticleState();
      expect(reticleOutOfReach.active).toBe(true);
      expect(reticleOutOfReach.style?.isValid).toBe(false);
      expect(reticleOutOfReach.style?.color).toBe(0xef4444); // Red

      // Hover over rock tile (5 * 64 + 10 = 330, 5 * 64 + 10 = 330), with nothing mineable beside it
      mockGrid[5][6] = { type: MiningTileType.EMPTY, revealed: true };
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: px(5), clientY: px(5) }));
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

      // Mouse is at clientX: px(2) (tile 2) and pressed down
      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: px(2), clientY: px(2) })
      );
      expect(miningSpy).toHaveBeenCalledWith(true, { x: 2, y: 2 }, false);

      // Now camera scrolls right by one tile, but NO pointer event is fired
      cameraOffset = TILE_SIZE;
      controller.update();

      // Should automatically re-target to tile 3 without moving mouse!
      expect(miningSpy).toHaveBeenCalledWith(true, { x: 3, y: 2 }, false);
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

      // Mouse down on tile (5, 5) -> clientX: 5 * 64 + 10 = 330, clientY: px(5)
      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: px(5), clientY: px(5) })
      );
      await flushPromises();

      expect(onPlace).toHaveBeenCalledTimes(1);
      expect(onPlace).toHaveBeenCalledWith({ x: 5, y: 5 });

      // Pointer moves to tile (6, 5) while holding mouse button down -> clientX: 6 * 64 + 10 = 394
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: px(6), clientY: px(5) }));
      controller.update();
      await flushPromises();

      // Should NOT have triggered again because triggerMode is SINGLE!
      expect(onPlace).toHaveBeenCalledTimes(1);

      // Releasing and clicking on (6, 5) triggers second torch
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: px(6), clientY: px(5) }));
      window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: px(6), clientY: px(5) }));
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
        new PointerEvent('pointerdown', { button: 0, clientX: px(5), clientY: px(5) })
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
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: px(5), clientY: px(6) }));
      controller.update();
      await flushPromises();

      // Automatically placed ladder on (5, 6)!
      expect(onPlace).toHaveBeenCalledTimes(2);
      expect(onPlace).toHaveBeenLastCalledWith({ x: 5, y: 6 });

      // Player moves down to tile (5, 7)
      controller.setPlayerPosition({ x: 5.5, y: 7.5 });
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: px(5), clientY: px(7) }));
      controller.update();
      await flushPromises();

      expect(onPlace).toHaveBeenCalledTimes(3);
      expect(onPlace).toHaveBeenLastCalledWith({ x: 5, y: 7 });

      // Releasing pointer stops hold placement
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: px(5), clientY: px(7) }));
      controller.setPlayerPosition({ x: 5.5, y: 8.5 });
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: px(5), clientY: px(8) }));
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
      // A ladder is a whole block tall, so it needs room around the cursor: use a taller map
      mockGrid = Array.from({ length: 20 }, () => Array.from({ length: 10 }, () => ({ type: MiningTileType.EMPTY, revealed: true })));
      controller.setGrid(mockGrid);

      // Player at (5.5, 1.5), clicks and holds at tile (5, 12) -> the ladder's middle is at 12.5, dy = 11.0 > 5.55 (out of reach)
      controller.setPlayerPosition({ x: 5.5, y: 1.5 });
      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: px(5), clientY: px(12) })
      );
      await flushPromises();

      // Cannot execute yet because out of reach
      expect(onPlace).not.toHaveBeenCalled();
      expect(controller.getIsMouseDown()).toBe(true);

      // Player starts climbing down to (5.5, 6.5) -> dy = 6.0 > 5.55
      controller.setPlayerPosition({ x: 5.5, y: 6.5 });
      controller.update();
      await flushPromises();
      expect(onPlace).not.toHaveBeenCalled();

      // Player moves closer to (5.5, 8.0) -> dy = 4.5 <= 5.55 (in reach!)
      controller.setPlayerPosition({ x: 5.5, y: 8.0 });
      controller.update();
      await flushPromises();

      // Automatically executes as soon as it becomes available!
      expect(onPlace).toHaveBeenCalledTimes(1);
      expect(onPlace).toHaveBeenCalledWith({ x: 5, y: 12 });

      controller.detach();
    });

    it('resets isMouseDown if activeAction changes or clears while holding mouse', () => {
      const onPlace = vi.fn();
      const ladderAction = new LadderPlacementAction(onPlace);
      controller.setActiveAction(ladderAction);

      window.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: px(5), clientY: px(5) })
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
        new PointerEvent('pointerdown', { button: 0, clientX: px(5), clientY: px(5) })
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

      // Move mouse to (clientX: 200, clientY: 150) -> world: (300, 200) -> continuous tiles: (300/TILE_SIZE, 200/TILE_SIZE)
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 150 }));
      controller.update();

      const reticle = controller.getReticleState();
      expect(reticle.active).toBe(true);
      expect(reticle.style?.isFreeAim).toBe(true);
      expect(reticle.target?.x).toBeCloseTo(300 / TILE_SIZE);
      expect(reticle.target?.y).toBeCloseTo(200 / TILE_SIZE);

      // Click and release to throw
      window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 200, clientY: 150 }));
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 200, clientY: 150 }));
      await flushPromises();

      expect(onThrow).toHaveBeenCalledTimes(1);
      const thrownTarget = onThrow.mock.calls[0][0];
      expect(thrownTarget.x).toBeCloseTo(300 / TILE_SIZE);
      expect(thrownTarget.y).toBeCloseTo(200 / TILE_SIZE);

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

    it('computes different trajectory arcs relative to cursor location', () => {
      const action = new ThrowableItemAction({ onThrow: vi.fn() });
      const playerPos = { x: 5, y: 5 };

      // Target close to player vs far from player
      const closeTarget = { x: 7, y: 5 };
      const farTarget = { x: 15, y: 5 };

      const closeTrajectory = action.computeTrajectory(playerPos, closeTarget, 1.0, mockGrid);
      const farTrajectory = action.computeTrajectory(playerPos, farTarget, 1.0, mockGrid);

      expect(closeTrajectory.length).toBeGreaterThan(1);
      expect(farTrajectory.length).toBeGreaterThan(1);

      // Initial step x-displacement should be smaller for closer target than further target
      const closeDx = closeTrajectory[1].x - closeTrajectory[0].x;
      const farDx = farTrajectory[1].x - farTrajectory[0].x;
      expect(closeDx).toBeLessThan(farDx);
    });
  });

  describe('ShootWeaponAction', () => {
    it('initializes with fireRate, cooldownMs, and freeAim reticle', () => {
      const onShoot = vi.fn();
      const action = new ShootWeaponAction({
        weaponItemId: 'cmn_revolver_6shooter',
        fireRate: 4.0,
        onShoot,
      });

      expect(action.weaponItemId).toBe('cmn_revolver_6shooter');
      expect(action.fireRate).toBe(4.0);
      expect(action.cooldownMs).toBe(250);

      const style = action.getReticleStyle({ x: 12.3, y: 8.7 }, { x: 5, y: 5 }, mockGrid);
      expect(style.isFreeAim).toBe(true);
      expect(style.isValid).toBe(true);
      expect(style.color).toBe(0xf97316);
    });

    describe('triggerMode behavior in ShootWeaponAction', () => {
      let mockCanvas: HTMLCanvasElement;
      let mockCamera: any;
      const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

      beforeEach(() => {
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

      it('defaults triggerMode to SINGLE and allows dynamic override from item definition', () => {
        const singleAction = new ShootWeaponAction({ onShoot: vi.fn() });
        expect(singleAction.triggerMode).toBe(MouseActionTriggerMode.SINGLE);

        const holdAction = new ShootWeaponAction({
          onShoot: vi.fn(),
          triggerMode: MouseActionTriggerMode.HOLD,
        });
        expect(holdAction.triggerMode).toBe(MouseActionTriggerMode.HOLD);
      });

      it('only fires once on pointerdown when triggerMode is SINGLE and does not fire repeatedly while held', async () => {
        const onShoot = vi.fn().mockResolvedValue(true);
        const action = new ShootWeaponAction({
          triggerMode: MouseActionTriggerMode.SINGLE,
          fireRate: 5, // 200ms cooldown
          onShoot,
        });

        controller.setActiveAction(action);

        // 1. Initial click
        window.dispatchEvent(
          new PointerEvent('pointerdown', { button: 0, clientX: 200, clientY: 200 })
        );
        await flushPromises();
        expect(onShoot).toHaveBeenCalledTimes(1);

        // 2. Mouse remains held down while moving or ticking update
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 210, clientY: 200 }));
        controller.update();
        await flushPromises();
        // Should NOT have fired again because triggerMode is SINGLE!
        expect(onShoot).toHaveBeenCalledTimes(1);

        // 3. Release mouse and advance past cooldown before clicking again
        window.dispatchEvent(
          new PointerEvent('pointerup', { button: 0, clientX: 210, clientY: 200 })
        );
        (controller as any).lastExecutedTime = 0;
        window.dispatchEvent(
          new PointerEvent('pointerdown', { button: 0, clientX: 220, clientY: 200 })
        );
        await flushPromises();
        expect(onShoot).toHaveBeenCalledTimes(2);
      });

      it('fires continuously when triggerMode is HOLD while mouse is held down', async () => {
        const onShoot = vi.fn().mockResolvedValue(true);
        const action = new ShootWeaponAction({
          triggerMode: MouseActionTriggerMode.HOLD,
          fireRate: 10, // 100ms cooldown
          onShoot,
        });

        controller.setActiveAction(action);

        // 1. Initial click
        window.dispatchEvent(
          new PointerEvent('pointerdown', { button: 0, clientX: 200, clientY: 200 })
        );
        await flushPromises();
        expect(onShoot).toHaveBeenCalledTimes(1);

        // Advance performance.now past cooldown
        const realNow = performance.now;
        let mockTime = 1000;
        performance.now = () => mockTime;
        (controller as any).lastExecutedTime = 1000;

        // Advance time by 150ms and trigger update
        mockTime = 1150;
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 205, clientY: 200 }));
        controller.update();
        await flushPromises();

        expect(onShoot).toHaveBeenCalledTimes(2);
        performance.now = realNow;
      });
    });
  });
});


describe('MiningMouseController pickaxe auto-target and Ctrl', () => {
  let controller: MiningMouseController;
  let grid: MiningClientTile[][];
  const canvas = () => {
    const c = document.createElement('canvas');
    c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 2000, height: 2000, right: 2000, bottom: 2000, x: 0, y: 0, toJSON: () => {} });
    return c;
  };

  beforeEach(() => {
    controller = new MiningMouseController();
    // Rows 9-11 are a wall of dirt left of the player, who stands at (20.5, 10.5)
    grid = Array.from({ length: 30 }, (_, y) => Array.from({ length: 30 }, (_, x) => ({ type: y >= 9 && y <= 11 && x < 20 ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true })));
    controller.setGrid(grid);
    controller.setPlayerPosition({ x: 20.5, y: 10.5 });
    controller.attach(canvas());
    controller.setCamera({ screenToWorld: (pos: { x: number; y: number }) => ({ x: pos.x, y: pos.y }) } as any);
  });
  afterEach(() => controller.destroy());

  it('lines up the face of the wall in front, the block nearest the cursor first, and shows it in the reticle', () => {
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: px(14), clientY: px(10) }));
    const queue = controller.miningQueue({ x: 14, y: 10 });
    expect(queue).toHaveLength(MINING_QUEUE_LENGTH);
    expect(queue[0]).toEqual({ x: 19, y: 10 });
    expect(queue.every((c) => c.x === 19)).toBe(true);
    expect(controller.miningQueue({ x: 19, y: 9 })[0]).toEqual({ x: 19, y: 9 });
    expect(controller.miningQueue({ x: 19, y: 11 })[0]).toEqual({ x: 19, y: 11 });
    const reticle = controller.getReticleState();
    expect(reticle.style?.miningQueue).toEqual(controller.miningQueue({ x: 14, y: 10 }));
    expect(reticle.style?.isValid).toBe(true);
  });

  it('sends the cursor cell, not the block, so the server can apply the same rule', () => {
    const spy = vi.fn();
    controller.onMiningStateChange(spy);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: px(14), clientY: px(10) }));
    expect(spy).toHaveBeenCalledWith(true, { x: 14, y: 10 }, false);
  });

  const ctrl = (type: 'keydown' | 'keyup' = 'keydown', repeat = false) =>
    window.dispatchEvent(new KeyboardEvent(type, { key: 'Control', repeat }));

  it('Ctrl switches to single-block mining and tells the server, even while the button is held', () => {
    const spy = vi.fn();
    controller.onMiningStateChange(spy);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: px(17), clientY: px(10) }));
    ctrl();
    expect(controller.isPreciseMining()).toBe(true);
    expect(spy).toHaveBeenLastCalledWith(true, { x: 17, y: 10 }, true);
    expect(controller.miningQueue({ x: 17, y: 10 })).toEqual([{ x: 17, y: 10 }]);
  });

  it('the mode stays after Ctrl is released, and the next Ctrl press switches back to auto-target', () => {
    const spy = vi.fn();
    controller.onMiningStateChange(spy);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: px(17), clientY: px(10) }));
    ctrl();
    ctrl('keyup');
    expect(controller.isPreciseMining()).toBe(true);
    expect(controller.miningQueue({ x: 17, y: 10 })).toHaveLength(1);
    ctrl();
    expect(controller.isPreciseMining()).toBe(false);
    expect(spy).toHaveBeenLastCalledWith(true, { x: 17, y: 10 }, false);
    expect(controller.miningQueue({ x: 17, y: 10 }).length).toBeGreaterThan(1);
  });

  it('holding Ctrl down (key repeat) switches only once', () => {
    ctrl();
    ctrl('keydown', true);
    ctrl('keydown', true);
    expect(controller.isPreciseMining()).toBe(true);
  });

  it('a click does not change the mode, with Ctrl down or not, and losing focus keeps the mode', () => {
    const spy = vi.fn();
    controller.onMiningStateChange(spy);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: px(17), clientY: px(10), ctrlKey: true }));
    expect(spy).toHaveBeenCalledWith(true, { x: 17, y: 10 }, false);
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: px(17), clientY: px(10) }));
    ctrl();
    window.dispatchEvent(new Event('blur'));
    expect(controller.isPreciseMining()).toBe(true);
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: px(17), clientY: px(10) }));
    expect(spy).toHaveBeenLastCalledWith(true, { x: 17, y: 10 }, true);
  });

  it('pressing Ctrl with the button up changes nothing to send, but tells mode listeners', () => {
    const spy = vi.fn();
    const modeSpy = vi.fn();
    controller.onMiningStateChange(spy);
    const unsubscribe = controller.onPreciseModeChange(modeSpy);
    ctrl();
    expect(spy).not.toHaveBeenCalled();
    expect(modeSpy).toHaveBeenCalledWith(true);
    unsubscribe();
    ctrl();
    expect(modeSpy).toHaveBeenCalledTimes(1);
  });

  it('setPreciseMode sets the mode directly, for the on-screen button', () => {
    const modeSpy = vi.fn();
    controller.onPreciseModeChange(modeSpy);
    controller.setPreciseMode(true);
    controller.setPreciseMode(true);
    expect(modeSpy).toHaveBeenCalledTimes(1);
    controller.togglePreciseMode();
    expect(controller.isPreciseMining()).toBe(false);
  });

  it('shows no queue and the blocked colour for a block with nothing minable in the way within reach', () => {
    controller.setPlayerPosition({ x: 40.5, y: 10.5 });
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: px(5), clientY: px(10) }));
    const reticle = controller.getReticleState();
    expect(reticle.style?.miningQueue).toBeUndefined();
    expect(reticle.style?.isValid).toBe(false);
  });
});
