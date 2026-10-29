import { describe, it, expect, vi } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { CLOUD_PERIOD_PX, cloudSpecs, cloudX, DEFAULT_SURFACE_ENVIRONMENT, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { CloudField } from './CloudField';

const TILE = 10;
const SURFACE_Y = 500;
const env = (clouds: SurfaceEnvironmentDefinition['clouds']): SurfaceEnvironmentDefinition => ({ ...DEFAULT_SURFACE_ENVIRONMENT, clouds });
const view = { left: 0, top: 0, width: 800, height: 500 };

const make = (e = env({ maxCount: 10 }), loadTexture = vi.fn().mockResolvedValue(null)) => {
  const container = new Container();
  return { container, field: new CloudField(container, e, { surfaceY: SURFACE_Y, seed: 6, tileSize: TILE, loadTexture }) };
};

describe('CloudField', () => {
  it('makes as many cloud sprites as the environment allows, hidden until the weather asks for them', () => {
    const { container, field } = make();
    expect(field.poolSize).toBe(10);
    expect(container.children).toHaveLength(10);
    expect(field.visibleCount).toBe(0);
    expect(container.children.every((c) => !c.visible)).toBe(true);
    expect(make(env({ maxCount: 0 })).field.poolSize).toBe(0);
    expect(make(env(null)).field.poolSize).toBe(8);
  });

  it('shows more clouds in thicker cover and none in a clear sky', () => {
    const { field } = make();
    field.update(view, { cloudDensity: 0, cloudDarkness: 0 }, 10);
    expect(field.visibleCount).toBe(0);
    field.update(view, { cloudDensity: 0.3, cloudDarkness: 0 }, 10);
    const some = field.visibleCount;
    field.update(view, { cloudDensity: 1, cloudDarkness: 0 }, 10);
    expect(field.visibleCount).toBeGreaterThanOrEqual(some);
    expect(field.visibleCount).toBeGreaterThan(3);
  });

  it('puts every cloud in the sky above the horizon and inside the stretch around the view', () => {
    const { container, field } = make();
    for (const t of [0, 77, 1234, 99999]) {
      field.update(view, { cloudDensity: 1, cloudDarkness: 0 }, t);
      for (const sprite of container.children.filter((c) => c.visible)) {
        expect(sprite.y + sprite.height).toBeLessThan(SURFACE_Y);
        expect(sprite.x).toBeGreaterThanOrEqual(view.left - sprite.width - 1);
        expect(sprite.x).toBeLessThanOrEqual(view.left + view.width + 1);
      }
    }
  });

  it('drifts with the clock, and is in the same place for the same time', () => {
    const { container, field } = make();
    // (a view as wide as the sky, so every cloud is in it)
    const wide = { left: 0, top: 0, width: CLOUD_PERIOD_PX, height: 500 };
    const positions = () => container.children.map((c) => (c.visible ? c.x : null));
    field.update(wide, { cloudDensity: 1, cloudDarkness: 0 }, 100);
    const first = positions();
    field.update(wide, { cloudDensity: 1, cloudDarkness: 0 }, 100);
    expect(positions()).toEqual(first);
    field.update(wide, { cloudDensity: 1, cloudDarkness: 0 }, 130);
    expect(positions()).not.toEqual(first);
  });

  it('puts a cloud where the shared maths says, so every client shows the same sky', () => {
    const { container, field } = make();
    field.update({ ...view, left: 0 }, { cloudDensity: 1, cloudDarkness: 0 }, 250);
    const spec = cloudSpecs(6, 10)[0];
    const sprite = container.children[0];
    const width = 16 * TILE * spec.scale;
    const along = cloudX(spec, 250, Math.max(CLOUD_PERIOD_PX, view.width * 1.6));
    if (sprite.visible) {
      const start = -width;
      const period = Math.max(CLOUD_PERIOD_PX, view.width * 1.6);
      expect(sprite.x).toBeCloseTo(start + (((along - start) % period) + period) % period);
    }
  });

  it('greys the clouds with the weather\'s darkness', () => {
    const { container, field } = make();
    field.update(view, { cloudDensity: 1, cloudDarkness: 0 }, 5);
    const white = container.children.find((c) => c.visible) as unknown as { tint: number };
    expect(white.tint).toBe(0xffffff);
    field.update(view, { cloudDensity: 1, cloudDarkness: 1 }, 5);
    expect(white.tint).toBe(0x4d5663);
  });

  it('uses the environment\'s pictures once they load, and keeps the drawn clouds if they fail', async () => {
    const picture = { width: 200, height: 100 } as Texture;
    const ok = make(env({ maxCount: 4, textureUrls: ['/assets/sprites/surface/cloud_a.png'] }), vi.fn().mockResolvedValue(picture));
    await Promise.resolve();
    await Promise.resolve();
    expect((ok.container.children[0] as unknown as { texture: Texture }).texture).toBe(picture);
    const failed = make(env({ maxCount: 4, textureUrls: ['/assets/missing.png'] }), vi.fn().mockResolvedValue(null));
    await Promise.resolve();
    await Promise.resolve();
    expect((failed.container.children[0] as unknown as { texture: Texture }).texture).not.toBe(picture);
  });

  it('rebuilds for another environment and can be destroyed', () => {
    const { container, field } = make();
    field.setEnvironment(env({ maxCount: 3 }));
    expect(container.children).toHaveLength(3);
    field.destroy();
    expect(field.poolSize).toBe(0);
  });
});
