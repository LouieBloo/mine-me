import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiningTileType, type MiningClientTile } from '@mine-me/shared';
import { MiningMouseController } from './MiningMouseController';
import { PourFluidAction, IgniteAction } from './SandboxActions';
import { TorchPlacementAction } from './MouseAction';

const TILE = 64;

describe('MiningMouseController: cursor outside the map', () => {
  let controller: MiningMouseController;
  let canvas: HTMLCanvasElement;
  const grid: MiningClientTile[][] = Array.from({ length: 6 }, () =>
    Array.from({ length: 8 }, () => ({ type: MiningTileType.EMPTY, revealed: true, damageStage: 0 })),
  );

  /** A camera that shows the world 1:1 with the screen, with the canvas at the screen origin. */
  beforeEach(() => {
    controller = new MiningMouseController({ tileSize: TILE });
    canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    document.body.appendChild(canvas);
    controller.attach(canvas);
    controller.setCamera({ screenToWorld: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }) } as any);
    controller.setGrid(grid);
    controller.setPlayerPosition({ x: 1, y: 1 });
  });

  const press = async (x: number, y: number) => {
    const ev = new Event('pointerdown', { bubbles: true }) as any;
    Object.assign(ev, { button: 0, clientX: x, clientY: y });
    canvas.dispatchEvent(ev);
    await Promise.resolve();
    await Promise.resolve();
  };

  it('maps a cursor above the map to the top edge tile of its column', () => {
    expect(controller.screenToGridTileClamped(3 * TILE + 5, -500)).toEqual({ x: 3, y: 0 });
    expect(controller.screenToGridTile(3 * TILE + 5, -500)).toBeNull(); // the normal lookup still says "off the map"
  });

  it('clamps beside and below the map too, and leaves inside points alone', () => {
    expect(controller.screenToGridTileClamped(-300, 2 * TILE)).toEqual({ x: 0, y: 2 });
    expect(controller.screenToGridTileClamped(9000, 9000)).toEqual({ x: 7, y: 5 });
    expect(controller.screenToGridTileClamped(2.5 * TILE, 3.5 * TILE)).toEqual({ x: 2, y: 3 });
  });

  it('pours at the edge tile when the cursor is above the map', async () => {
    const onPour = vi.fn().mockResolvedValue(true);
    controller.setActiveAction(new PourFluidAction('OIL', onPour));
    await press(4 * TILE + 10, -300);
    expect(onPour).toHaveBeenCalledWith({ x: 4, y: 0 });
  });

  it('lights at the edge tile when the cursor is above the map', async () => {
    const onIgnite = vi.fn().mockResolvedValue(true);
    controller.setActiveAction(new IgniteAction(onIgnite));
    await press(2 * TILE, -10);
    expect(onIgnite).toHaveBeenCalledWith({ x: 2, y: 0 });
  });

  it('still ignores a click outside the map for actions that do not ask for clamping', async () => {
    const onPlace = vi.fn();
    controller.setActiveAction(new TorchPlacementAction(onPlace));
    await press(4 * TILE, -300);
    expect(onPlace).not.toHaveBeenCalled();
  });

  it('reports the clamped tile as the hovered tile while a clamping tool is active', () => {
    controller.setActiveAction(new PourFluidAction('OIL', vi.fn()));
    window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 5 * TILE, clientY: -200 }));
    expect(controller.getHoveredTile()).toEqual({ x: 5, y: 0 });
  });
});
