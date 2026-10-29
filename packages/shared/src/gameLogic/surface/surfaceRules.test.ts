import { describe, it, expect } from 'vitest';
import type { SurfaceEnvironmentDefinition } from '../../types/surface';
import { DEFAULT_SURFACE_ENVIRONMENT, MAX_SURFACE_LAYERS, pickSurfaceEnvironment, validateSurfaceEnvironment, validateSurfaceLayer } from './surfaceRules';

const env = (patch: Partial<SurfaceEnvironmentDefinition> = {}): SurfaceEnvironmentDefinition => ({ ...DEFAULT_SURFACE_ENVIRONMENT, id: patch.key ?? 'x', key: 'x', isDefault: false, ...patch });

describe('validateSurfaceEnvironment', () => {
  it('accepts the built-in default', () => {
    expect(validateSurfaceEnvironment(DEFAULT_SURFACE_ENVIRONMENT)).toEqual([]);
  });

  it('checks the key, name, weight and sky colours', () => {
    const errors = validateSurfaceEnvironment({ key: 'Bad Key', name: ' ', weight: 0, sky: { top: 'blue', horizon: '#abc' } });
    expect(errors.join('|')).toMatch(/key/);
    expect(errors.join('|')).toMatch(/name/);
    expect(errors.join('|')).toMatch(/weight/);
    expect(errors.join('|')).toMatch(/sky top/);
    expect(errors.join('|')).toMatch(/sky horizon/);
    expect(validateSurfaceEnvironment({ ...DEFAULT_SURFACE_ENVIRONMENT, sky: undefined as never })).toContain('the sky is missing');
  });

  it('checks the layers: parallax 0 to 1, picture urls, shape, tint', () => {
    expect(validateSurfaceLayer({ name: 'far', parallaxFactor: 0.8, yOffset: 0 })).toEqual([]);
    expect(validateSurfaceLayer({ name: 'far', parallaxFactor: 1.5, yOffset: 0 }).join()).toMatch(/parallax/);
    expect(validateSurfaceLayer({ name: 'far', parallaxFactor: -0.1, yOffset: 0 }).join()).toMatch(/parallax/);
    expect(validateSurfaceLayer({ name: 'far', parallaxFactor: 0.5, yOffset: 0, textureUrl: 'http://x/y.png' }).join()).toMatch(/assets/);
    expect(validateSurfaceLayer({ name: 'far', parallaxFactor: 0.5, yOffset: 0, shape: 'bogus' as never }).join()).toMatch(/shape/);
    expect(validateSurfaceLayer({ name: 'far', parallaxFactor: 0.5, yOffset: 0, tint: 'red' }).join()).toMatch(/tint/);
    expect(validateSurfaceLayer({ name: '', parallaxFactor: 0.5, yOffset: 0 }).join()).toMatch(/name/);
    const tooMany = Array.from({ length: MAX_SURFACE_LAYERS + 1 }, (_, i) => ({ name: `l${i}`, parallaxFactor: 0.5, yOffset: 0 }));
    expect(validateSurfaceEnvironment(env({ layers: tooMany })).join()).toMatch(/at most/);
    expect(validateSurfaceEnvironment(env({ layers: [{ name: 'a', parallaxFactor: 2, yOffset: 0 }] })).join()).toMatch(/layer 1: parallax/);
  });

  it('checks weather names and weights, clouds and props', () => {
    expect(validateSurfaceEnvironment(env({ weather: { rain: 2, clear: 1 } }))).toEqual([]);
    expect(validateSurfaceEnvironment(env({ weather: { bogus: 1 } as never })).join()).toMatch(/unknown kind/);
    expect(validateSurfaceEnvironment(env({ weather: { rain: -1 } })).join()).toMatch(/weight/);
    expect(validateSurfaceEnvironment(env({ clouds: { maxCount: 99 } })).join()).toMatch(/clouds/);
    expect(validateSurfaceEnvironment(env({ clouds: { minHeight: 10, maxHeight: 5 } })).join()).toMatch(/highest height/);
    expect(validateSurfaceEnvironment(env({ clouds: { textureUrls: ['x.png'] } })).join()).toMatch(/assets/);
    expect(validateSurfaceEnvironment(env({ props: [{ doodadKey: '', density: 5 }] })).join()).toMatch(/pick a doodad/);
    expect(validateSurfaceEnvironment(env({ props: [{ doodadKey: 'tree', density: -1 }] })).join()).toMatch(/density/);
    expect(validateSurfaceEnvironment(env({ props: [{ doodadKey: 'tree', density: 5, spacing: 3 }] }))).toEqual([]);
  });
});

describe('pickSurfaceEnvironment', () => {
  const a = env({ key: 'a', id: 'a', weight: 1 });
  const b = env({ key: 'b', id: 'b', weight: 1 });
  const c = env({ key: 'c', id: 'c', weight: 8 });

  it('picks the same environment for the same seed, whatever order they are listed in', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(pickSurfaceEnvironment(seed, [a, b, c]).key).toBe(pickSurfaceEnvironment(seed, [c, a, b]).key);
    }
  });

  it('follows the weights over many seeds', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let seed = 0; seed < 2000; seed++) counts[pickSurfaceEnvironment(seed, [a, b, c]).key]++;
    expect(counts.c).toBeGreaterThan(counts.a * 4);
    expect(counts.a).toBeGreaterThan(50);
    expect(counts.b).toBeGreaterThan(50);
  });

  it('falls back to the default, then the first, then the built-in plain day', () => {
    const zero = [env({ key: 'a', weight: 0 }), env({ key: 'd', weight: 0, isDefault: true })];
    expect(pickSurfaceEnvironment(1, zero).key).toBe('d');
    expect(pickSurfaceEnvironment(1, [env({ key: 'a', weight: 0 })]).key).toBe('a');
    expect(pickSurfaceEnvironment(1, []).key).toBe(DEFAULT_SURFACE_ENVIRONMENT.key);
    expect(pickSurfaceEnvironment(1, undefined).key).toBe(DEFAULT_SURFACE_ENVIRONMENT.key);
  });

  it('lets the sandbox choose one by key, and ignores a key that does not exist', () => {
    expect(pickSurfaceEnvironment(1, [a, b, c], 'b').key).toBe('b');
    expect(['a', 'b', 'c']).toContain(pickSurfaceEnvironment(1, [a, b, c], 'nope').key);
  });
});
