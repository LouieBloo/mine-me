import { describe, it, expect } from 'vitest';
import { DEFAULT_SURFACE_ENVIRONMENT, validateSurfaceEnvironment, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { environmentToForm, formToEnvironment, moveItem, newEnvironment, newLayer, newProp, previewEnvironment } from './surfaceEnvironmentForm';

const valley: SurfaceEnvironmentDefinition = {
  ...DEFAULT_SURFACE_ENVIRONMENT,
  id: 'e1',
  key: 'green_valley',
  name: 'Green Valley',
  description: 'Rolling hills',
  weight: 3,
  isDefault: true,
  ambientTint: '#fff4e0',
  sky: { top: '#112233', horizon: '#445566', sunColor: '#ffeeaa', sunX: 0.4, sunHeight: 18, sunSize: 2 },
  layers: [{ name: 'far', parallaxFactor: 0.85, yOffset: 1, shape: 'mountains', height: 40, tint: '#8da2c2' }],
  clouds: { maxCount: 12, minHeight: 6, maxHeight: 25, textureUrls: ['/assets/sprites/surface/c.png'] },
  weather: { clear: 3, rain: 1 },
  props: [{ doodadKey: 'oak_tree', density: 5, spacing: 3 }],
};

describe('newEnvironment', () => {
  it('makes a valid starting point once it has a key and a name', () => {
    const body = formToEnvironment({ ...newEnvironment(), key: 'new_place', name: 'New place' });
    expect(validateSurfaceEnvironment(body)).toEqual([]);
  });

  it('starts mostly clear with some cloud and rain, and no scenery or props', () => {
    const f = newEnvironment();
    expect(f.weather.clear).toBeGreaterThan(f.weather.cloudy);
    expect(f.weather.storm).toBe(0);
    expect(f.layers).toEqual([]);
    expect(f.props).toEqual([]);
  });
});

describe('environmentToForm and formToEnvironment', () => {
  it('round-trips an environment', () => {
    const body = formToEnvironment(environmentToForm(valley));
    expect(body).toMatchObject({
      key: 'green_valley', name: 'Green Valley', description: 'Rolling hills', weight: 3, isDefault: true, ambientTint: '#fff4e0',
      sky: { top: '#112233', horizon: '#445566', sunColor: '#ffeeaa', sunX: 0.4, sunHeight: 18, sunSize: 2 },
      clouds: { maxCount: 12, minHeight: 6, maxHeight: 25, textureUrls: ['/assets/sprites/surface/c.png'] },
      weather: { clear: 3, rain: 1 },
      props: [{ doodadKey: 'oak_tree', density: 5, spacing: 3 }],
    });
    expect(body.layers).toEqual([{ name: 'far', parallaxFactor: 0.85, yOffset: 1, tint: '#8da2c2', shape: 'mountains', height: 40 }]);
    expect(validateSurfaceEnvironment(body)).toEqual([]);
  });

  it('leaves weather at zero out, so only the kinds in use are sent', () => {
    const f = environmentToForm(valley);
    f.weather.storm = 0;
    f.weather.snow = NaN;
    expect(formToEnvironment(f).weather).toEqual({ clear: 3, rain: 1 });
  });

  it('drops the sun colour when the sun is off, and an empty tint, description and picture list', () => {
    const f = { ...environmentToForm(valley), sunEnabled: false, ambientTint: '', description: '  ', cloudTextures: [] };
    const body = formToEnvironment(f);
    expect(body.sky?.sunColor).toBeNull();
    expect(body.ambientTint).toBeNull();
    expect(body.description).toBeNull();
    expect(body.clouds).not.toHaveProperty('textureUrls');
  });

  it('keeps the picture of a layer that has one, and a silhouette only for a layer that has none', () => {
    const f = environmentToForm(valley);
    f.layers = [{ name: 'near', parallaxFactor: 0.5, yOffset: 0, textureUrl: '/assets/sprites/surface/near.png', scale: 2 }, { name: 'bare', parallaxFactor: 0.3, yOffset: 0 }];
    const layers = formToEnvironment(f).layers!;
    expect(layers[0]).toEqual({ name: 'near', parallaxFactor: 0.5, yOffset: 0, textureUrl: '/assets/sprites/surface/near.png', scale: 2 });
    expect(layers[1]).toEqual({ name: 'bare', parallaxFactor: 0.3, yOffset: 0, shape: 'hills', height: 30 });
  });

  it('drops props with no doodad picked, and optional values at their defaults', () => {
    const f = environmentToForm(valley);
    f.props = [{ doodadKey: '', density: 3 }, { doodadKey: 'bird', density: 2, minHeight: 6, maxHeight: 20 }, { doodadKey: 'bush', density: 4, spacing: 0 }];
    expect(formToEnvironment(f).props).toEqual([{ doodadKey: 'bird', density: 2, minHeight: 6, maxHeight: 20 }, { doodadKey: 'bush', density: 4 }]);
  });

  it('trims the key and name', () => {
    const body = formToEnvironment({ ...newEnvironment(), key: ' sky ', name: ' Sky ' });
    expect(body.key).toBe('sky');
    expect(body.name).toBe('Sky');
  });

  it('copes with an environment saved with no clouds, weather or props', () => {
    const bare = { ...valley, clouds: null, weather: null, props: undefined, layers: undefined as never, ambientTint: undefined, description: undefined } as SurfaceEnvironmentDefinition;
    const f = environmentToForm(bare);
    expect(f.layers).toEqual([]);
    expect(f.cloudMax).toBe(8);
    expect(f.props).toEqual([]);
    expect(f.weather.clear).toBe(0);
    expect(f.ambientTint).toBe('');
  });
});

describe('newLayer', () => {
  it('starts with far mountains, then hills, then a treeline, each nearer than the one before', () => {
    const first = newLayer([]);
    expect(first.shape).toBe('mountains');
    const second = newLayer([first]);
    expect(second.shape).toBe('hills');
    expect(second.parallaxFactor).toBeLessThan(first.parallaxFactor);
    const third = newLayer([first, second]);
    expect(third.shape).toBe('treeline');
    expect(third.parallaxFactor).toBeLessThan(second.parallaxFactor);
    expect(third.parallaxFactor).toBeGreaterThanOrEqual(0.1);
  });

  it('makes a layer that passes validation', () => {
    expect(validateSurfaceEnvironment(formToEnvironment({ ...newEnvironment(), key: 'a', name: 'A', layers: [newLayer([])] }))).toEqual([]);
  });
});

describe('newProp and moveItem', () => {
  it('makes a prop with a sensible density and spacing', () => {
    expect(newProp('oak_tree')).toEqual({ doodadKey: 'oak_tree', density: 6, spacing: 4 });
  });

  it('moves an item within a list, and ignores moves that do nothing', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('previewEnvironment', () => {
  it('is the environment as edited, without props (the preview draws no doodads)', () => {
    const e = previewEnvironment(environmentToForm(valley));
    expect(e).toMatchObject({ key: 'green_valley', sky: { top: '#112233', horizon: '#445566' }, weather: { clear: 3, rain: 1 }, props: [] });
    expect(e.layers).toHaveLength(1);
  });

  it('stays drawable while a number is being typed: an empty box takes its default', () => {
    const f = environmentToForm(valley);
    f.sunX = NaN;
    f.cloudMax = NaN;
    f.cloudMinHeight = NaN;
    f.layers = [{ name: 'far', parallaxFactor: NaN, yOffset: NaN, shape: 'hills', height: NaN, scale: NaN, textureUrl: 'x' }];
    const e = previewEnvironment(f);
    expect(e.sky.sunX).toBe(0.7);
    expect(e.clouds?.maxCount).toBe(8);
    expect(e.clouds?.minHeight).toBe(8);
    expect(e.layers[0]).toMatchObject({ parallaxFactor: 0.5, yOffset: 0, scale: 1 });
  });

  it('keeps the cloud count in range and falls back for a new environment with no key', () => {
    const f = { ...newEnvironment(), cloudMax: 99 };
    const e = previewEnvironment(f);
    expect(e.clouds?.maxCount).toBe(24);
    expect(e.key).toBe('preview');
    expect(e.name).toBe('Preview');
  });
});
