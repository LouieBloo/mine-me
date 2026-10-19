import { describe, it, expect, vi } from 'vitest';
import { MiningReticleRenderer, QUEUED_BLOCK_COLOR, QUEUED_BLOCK_ALPHA } from './MiningReticleRenderer';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

const graphics = () => ({ clear: vi.fn(), position: { set: vi.fn() }, rect: vi.fn(), fill: vi.fn(), stroke: vi.fn() }) as any;
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
