import { describe, it, expect, vi } from 'vitest';
import { MiningTileType, type MiningClientTile } from '@mine-me/shared';
import { MiningReticleRenderer, QUEUED_BLOCK_COLOR, QUEUED_BLOCK_ALPHA, traceCellShape } from './MiningReticleRenderer';
import { autotileVariants } from '../renderers/AutotileVariants';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

const graphics = () => ({ clear: vi.fn(), position: { set: vi.fn() }, rect: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn() }) as any;
const controller = (style: object, target = { x: 4, y: 5 }) => ({ getReticleState: () => ({ active: true, target, style }) }) as any;

describe('MiningReticleRenderer pickaxe reticle', () => {
  const queue = [{ x: 3, y: 5 }, { x: 3, y: 4 }, { x: 3, y: 6 }];
  const style = { color: 0xeab308, alpha: 0.2, strokeColor: 0xfde047, isValid: true, miningQueue: queue };

  it('lights the queued blocks white and keeps the cursor block in its normal look', () => {
    const g = graphics();
    MiningReticleRenderer.render({ reticleGraphics: g, mouseController: controller(style), animTime: 0, isMining: false, miningTarget: null });
    expect(g.rect).toHaveBeenCalledWith(3 * TILE_SIZE, 5 * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    expect(g.rect).toHaveBeenCalledWith(3 * TILE_SIZE, 4 * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    expect(g.rect).toHaveBeenCalledWith(4 * TILE_SIZE, 5 * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    expect(g.fill).toHaveBeenCalledWith({ color: QUEUED_BLOCK_COLOR, alpha: QUEUED_BLOCK_ALPHA });
    expect(g.fill).toHaveBeenCalledWith({ color: style.color, alpha: style.alpha });
  });

  it('does not draw the cursor block twice when it is in the queue', () => {
    const g = graphics();
    MiningReticleRenderer.render({ reticleGraphics: g, mouseController: controller(style, { x: 3, y: 5 }), animTime: 0, isMining: false, miningTarget: null });
    expect(g.rect.mock.calls.filter(([x, y]: number[]) => x === 3 * TILE_SIZE && y === 5 * TILE_SIZE)).toHaveLength(1);
  });

  it('still draws the cursor block for a reticle with no queue', () => {
    const g = graphics();
    const { miningQueue: _unused, ...plain } = style;
    MiningReticleRenderer.render({ reticleGraphics: g, mouseController: controller(plain), animTime: 0, isMining: false, miningTarget: null });
    expect(g.rect).toHaveBeenCalledWith(4 * TILE_SIZE, 5 * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  });

  it('draws nothing when there is no active reticle', () => {
    const g = graphics();
    MiningReticleRenderer.render({ reticleGraphics: g, mouseController: { getReticleState: () => ({ active: false, target: null, style: null }) } as any, animTime: 0, isMining: false, miningTarget: null });
    expect(g.rect).not.toHaveBeenCalled();
  });
});

describe('traceCellShape (the highlight follows the autotiled block)', () => {
  const dirt = (): MiningClientTile => ({ type: MiningTileType.DIRT, revealed: true });
  const air = (): MiningClientTile => ({ type: MiningTileType.EMPTY, revealed: true });
  const RADIUS = 0.3;

  it('is a plain square for a block with no exposed side, for air and with no grid', () => {
    const grid = [[dirt(), dirt(), dirt()], [dirt(), dirt(), dirt()], [dirt(), dirt(), dirt()]];
    const g = graphics();
    traceCellShape(g, grid, 1, 1);
    expect(g.rect).toHaveBeenCalledWith(TILE_SIZE, TILE_SIZE, TILE_SIZE, TILE_SIZE);
    const empty = graphics();
    traceCellShape(empty, [[air()]], 0, 0);
    expect(empty.rect).toHaveBeenCalled();
    const none = graphics();
    traceCellShape(none, undefined, 2, 3);
    expect(none.rect).toHaveBeenCalledWith(2 * TILE_SIZE, 3 * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    expect(none.arc).not.toHaveBeenCalled();
  });

  it('rounds exactly the corners the block is drawn with rounded', () => {
    autotileVariants.configure({ radius: RADIUS });
    // Air above and to the left of the middle block: its top-left corner is rounded, nothing else
    const grid = [[air(), air(), air()], [air(), dirt(), dirt()], [air(), dirt(), dirt()]];
    const g = graphics();
    traceCellShape(g, grid, 1, 1);
    expect(g.rect).not.toHaveBeenCalled();
    expect(g.arc).toHaveBeenCalledTimes(1);
    const r = RADIUS * TILE_SIZE;
    expect(g.arc).toHaveBeenCalledWith(TILE_SIZE + r, TILE_SIZE + r, r, Math.PI, Math.PI * 1.5);
    expect(g.closePath).toHaveBeenCalled();
  });

  it('rounds all four corners of a block with air all around it', () => {
    autotileVariants.configure({ radius: RADIUS });
    const g = graphics();
    traceCellShape(g, [[air(), air(), air()], [air(), dirt(), air()], [air(), air(), air()]], 1, 1);
    expect(g.arc).toHaveBeenCalledTimes(4);
  });

  it('is square when the look has no radius, and shrinks its corners with the inset', () => {
    const grid = [[air(), air()], [air(), dirt()]];
    autotileVariants.configure({ radius: 0 });
    const square = graphics();
    traceCellShape(square, grid, 1, 1);
    expect(square.rect).toHaveBeenCalled();
    autotileVariants.configure({ radius: RADIUS });
    const inset = graphics();
    traceCellShape(inset, grid, 1, 1, 3);
    expect(inset.arc).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), RADIUS * TILE_SIZE - 3, Math.PI, Math.PI * 1.5);
  });

  it('is used for the block under the cursor and the queued blocks', () => {
    autotileVariants.configure({ radius: RADIUS });
    // Two lone blocks with air all around: the cursor block at (1,1) and a queued one at (3,1)
    const row = () => [air(), air(), air(), air(), air()];
    const grid = [row(), [air(), dirt(), air(), dirt(), air()], row()];
    const g = graphics();
    const style = { color: 0xeab308, alpha: 0.2, strokeColor: 0xfde047, isValid: true, miningQueue: [{ x: 3, y: 1 }] };
    MiningReticleRenderer.render({ reticleGraphics: g, mouseController: controller(style, { x: 1, y: 1 }), animTime: 0, isMining: false, miningTarget: null, grid });
    expect(g.rect).not.toHaveBeenCalled();
    expect(g.arc).toHaveBeenCalledTimes(8);
  });

  it('keeps a placement reticle over a piece a plain rectangle', () => {
    autotileVariants.configure({ radius: RADIUS });
    const grid = [[air(), air()], [air(), air()]];
    const g = graphics();
    const style = { color: 0x22c55e, alpha: 0.2, strokeColor: 0x4ade80, isValid: true, pieceArea: { x: 0, y: 0, width: 3, height: 3 } };
    MiningReticleRenderer.render({ reticleGraphics: g, mouseController: controller(style, { x: 0, y: 0 }), animTime: 0, isMining: false, miningTarget: null, grid });
    expect(g.rect).toHaveBeenCalledWith(0, 0, 3 * TILE_SIZE, 3 * TILE_SIZE);
  });
});
