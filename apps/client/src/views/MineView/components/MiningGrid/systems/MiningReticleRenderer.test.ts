import { describe, it, expect, vi } from 'vitest';
import { MiningReticleRenderer, SHOW_MINING_QUEUE_PREVIEW } from './MiningReticleRenderer';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

const graphics = () => ({ clear: vi.fn(), position: { set: vi.fn() }, rect: vi.fn(), fill: vi.fn(), stroke: vi.fn() }) as any;
const controller = (style: object, target = { x: 4, y: 5 }) => ({ getReticleState: () => ({ active: true, target, style }) }) as any;

describe('MiningReticleRenderer pickaxe reticle', () => {
  const queue = [{ x: 3, y: 5 }, { x: 3, y: 4 }, { x: 3, y: 6 }];
  const style = { color: 0xeab308, alpha: 0.2, strokeColor: 0xfde047, isValid: true, miningQueue: queue };

  it('highlights only the block under the cursor while the queue preview is off', () => {
    expect(SHOW_MINING_QUEUE_PREVIEW).toBe(false);
    const g = graphics();
    MiningReticleRenderer.render({ reticleGraphics: g, mouseController: controller(style), animTime: 0, isMining: false, miningTarget: null });
    expect(g.rect).toHaveBeenCalledTimes(1);
    expect(g.rect).toHaveBeenCalledWith(4 * TILE_SIZE, 5 * TILE_SIZE, TILE_SIZE, TILE_SIZE);
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
