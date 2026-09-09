import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningMouseController } from './MiningMouseController';
import { TorchPlacementAction, LadderPlacementAction } from './MouseAction';
import { MiningTileType, type MiningClientTile } from '@mine-me/shared';

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
});
