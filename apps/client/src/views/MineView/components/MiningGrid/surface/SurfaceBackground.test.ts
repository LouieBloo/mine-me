import { describe, it, expect, vi } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { DEFAULT_SURFACE_ENVIRONMENT, layerTileOffset, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { SurfaceBackground } from './SurfaceBackground';

const TILE = 10;
const SURFACE_Y = 300;
const env = (patch: Partial<SurfaceEnvironmentDefinition> = {}): SurfaceEnvironmentDefinition => ({ ...DEFAULT_SURFACE_ENVIRONMENT, ...patch });
const make = (e = env(), loadTexture = vi.fn().mockResolvedValue(null)) => {
  const parent = new Container();
  const bg = new SurfaceBackground(parent, e, { surfaceY: SURFACE_Y, mapWidth: 1000, seed: 4, tileSize: TILE, loadTexture });
  return { parent, bg, loadTexture };
};
const aboveGround = { left: 0, top: 100, width: 400, height: 300 };
const underground = { left: 0, top: 500, width: 400, height: 300 };

describe('SurfaceBackground', () => {
  it('is added to its parent, with the sun, clouds and scenery in order', () => {
    const { parent, bg } = make(env({ layers: [{ name: 'far', parallaxFactor: 0.8, yOffset: 0, shape: 'mountains', height: 20 }] }));
    expect(parent.children).toContain(bg.root);
    expect(bg.root.children[2]).toBe(bg.cloudLayer);
    expect(bg.objectCount).toBe(3);
  });

  it('draws only when the top of the view is above the horizon, and costs nothing underground', () => {
    const { bg } = make(env({ layers: [{ name: 'far', parallaxFactor: 0.8, yOffset: 0, height: 20 }] }));
    bg.update(aboveGround);
    expect(bg.active).toBe(true);
    bg.update(underground);
    expect(bg.active).toBe(false);
    bg.update({ ...underground, top: SURFACE_Y });
    expect(bg.active).toBe(false);
  });

  it('puts the sun where the environment says, above the horizon', () => {
    const { bg } = make(env({ sky: { top: '#2f8fd8', horizon: '#9fd6ff', sunColor: '#fff2b0', sunX: 0.5, sunHeight: 10, sunSize: 2 } }));
    bg.update(aboveGround);
    const sun = bg.root.children[1];
    expect(sun.visible).toBe(true);
    expect(sun.y).toBe(SURFACE_Y - 10 * TILE);
    expect(sun.x).toBeGreaterThan(aboveGround.left);
    expect(sun.x).toBeLessThan(aboveGround.left + aboveGround.width);
  });

  it('has no sun when the environment has none', () => {
    const { bg } = make(env({ sky: { top: '#2f8fd8', horizon: '#9fd6ff', sunColor: null } }));
    expect(bg.root.children[1].visible).toBe(false);
    const zero = make(env({ sky: { top: '#2f8fd8', horizon: '#9fd6ff', sunColor: '#ffffff', sunSize: 0 } }));
    expect(zero.bg.root.children[1].visible).toBe(false);
  });

  it('stands each strip on the horizon (plus its offset) and scrolls it by its parallax factor', () => {
    const { bg } = make(env({ layers: [
      { name: 'far', parallaxFactor: 0.9, yOffset: 0, shape: 'mountains', height: 20 },
      { name: 'near', parallaxFactor: 0.5, yOffset: 3, shape: 'hills', height: 8 },
    ] }));
    const view = { left: 200, top: 100, width: 400, height: 300 };
    bg.update(view);
    const [far, near] = (bg as unknown as { layers: { sprite: { y: number; height: number; tilePosition: { x: number }; width: number; x: number } }[] }).layers.map((l) => l.sprite);
    expect(far.y + far.height).toBe(SURFACE_Y);
    expect(near.y + near.height).toBe(SURFACE_Y + 3 * TILE);
    expect(far.tilePosition.x).toBeCloseTo(layerTileOffset(view.left - 64, 0.9));
    expect(near.tilePosition.x).toBeCloseTo(layerTileOffset(view.left - 64, 0.5));
    // Farther scenery moves less across the screen than nearer scenery when the camera moves
    expect(Math.abs(far.tilePosition.x)).toBeLessThan(Math.abs(near.tilePosition.x));
    expect(far.x).toBe(view.left - 64);
    expect(far.width).toBe(view.width + 128);
  });

  it('draws the layers in order, far first', () => {
    const { bg } = make(env({ layers: [{ name: 'far', parallaxFactor: 0.9, yOffset: 0 }, { name: 'near', parallaxFactor: 0.5, yOffset: 0 }] }));
    const labels = (bg.root.children[3] as Container).children.map((c) => c.label);
    expect(labels).toEqual(['surface-layer-far', 'surface-layer-near']);
  });

  it('loads a layer picture and uses it, tinting only when the layer asks', async () => {
    const picture = { height: 80, width: 800 } as Texture;
    const load = vi.fn().mockResolvedValue(picture);
    const { bg } = make(env({ layers: [{ name: 'far', parallaxFactor: 0.9, yOffset: 0, textureUrl: '/assets/sprites/surface/far.png', scale: 2 }] }), load);
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledWith('/assets/sprites/surface/far.png');
    bg.update(aboveGround);
    const sprite = (bg as unknown as { layers: { sprite: { texture: Texture; tint: number; height: number } }[] }).layers[0].sprite;
    expect(sprite.texture).toBe(picture);
    expect(sprite.tint).toBe(0xffffff);
    expect(sprite.height).toBe(160);
  });

  it('keeps the drawn silhouette when a picture fails to load', async () => {
    const { bg } = make(env({ layers: [{ name: 'far', parallaxFactor: 0.9, yOffset: 0, textureUrl: '/assets/missing.png', shape: 'mountains', height: 5 }] }), vi.fn().mockResolvedValue(null));
    await Promise.resolve();
    await Promise.resolve();
    bg.update(aboveGround);
    const sprite = (bg as unknown as { layers: { sprite: { texture: Texture; tint: number } }[] }).layers[0].sprite;
    // (the silhouette it was built with: still there, still tinted to the layer's colour)
    expect(sprite.texture).toBeDefined();
    expect(sprite.tint).not.toBe(0xffffff);
  });

  it('rebuilds for another environment, dropping the old strips', () => {
    const { bg } = make(env({ layers: [{ name: 'far', parallaxFactor: 0.9, yOffset: 0 }] }));
    expect(bg.objectCount).toBe(3);
    bg.setEnvironment(env({ layers: [] }));
    expect(bg.objectCount).toBe(2);
    expect((bg.root.children[3] as Container).children).toHaveLength(0);
  });

  it('greys the sky with the overcast, and only redraws when it moved enough to see', () => {
    const { bg } = make();
    const sky = bg.root.children[0] as unknown as { clear: () => void };
    const clear = vi.spyOn(sky, 'clear');
    bg.setOvercast(0);
    expect(clear).not.toHaveBeenCalled();
    bg.setOvercast(0.01);
    expect(clear).not.toHaveBeenCalled();
    bg.setOvercast(0.5);
    expect(clear).toHaveBeenCalledTimes(1);
    bg.setOvercast(0.52);
    expect(clear).toHaveBeenCalledTimes(1);
    bg.setOvercast(7);
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it('can be destroyed with its children, and ignores a picture that arrives afterwards', async () => {
    let resolve: (t: Texture) => void = () => undefined;
    const load = vi.fn().mockReturnValue(new Promise<Texture>((r) => { resolve = r; }));
    const { bg } = make(env({ layers: [{ name: 'far', parallaxFactor: 0.9, yOffset: 0, textureUrl: '/assets/x.png' }] }), load);
    bg.destroy();
    resolve({ height: 10 } as Texture);
    await Promise.resolve();
    expect(bg.root.destroyed).toBe(true);
  });
});
