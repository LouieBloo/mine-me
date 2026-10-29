import { describe, it, expect } from 'vitest';
import { weatherAt, WEATHER_IDS } from '@mine-me/shared';
import { FIRST_SURFACE_DOODADS, FIRST_SURFACE_ENVIRONMENTS, planSurface, surfaceProblems } from './add-first-surface';

describe('the first surface', () => {
  it('is valid: every doodad and environment passes the shared validation', () => {
    expect(surfaceProblems()).toEqual([]);
  });

  it('has exactly one default environment, with a weight that makes it the usual pick', () => {
    const defaults = FIRST_SURFACE_ENVIRONMENTS.filter((e) => e.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].weight).toBe(Math.max(...FIRST_SURFACE_ENVIRONMENTS.map((e) => e.weight)));
  });

  it('uses only floor and air doodads as props, and none of the surface doodads belongs to a cave biome', () => {
    const byKey = new Map(FIRST_SURFACE_DOODADS.map((d) => [d.key, d]));
    for (const env of FIRST_SURFACE_ENVIRONMENTS) {
      for (const prop of env.props ?? []) expect(['FLOOR', 'AIR']).toContain(byKey.get(prop.doodadKey)!.anchor);
    }
    for (const d of FIRST_SURFACE_DOODADS) expect(d).not.toHaveProperty('spawn');
  });

  it('gives a flying doodad a flutter and hides birds in rain and storms', () => {
    const bird = FIRST_SURFACE_DOODADS.find((d) => d.key === 'bird')!;
    expect(bird.anchor).toBe('AIR');
    expect(bird.wander?.mode).toBe('FLUTTER');
    expect(bird.hiddenInWeather).toEqual(['rain', 'storm']);
    for (const d of FIRST_SURFACE_DOODADS.filter((x) => x.anchor === 'FLOOR')) expect(d.motion?.preset).toBe('sway');
  });

  it('keeps each environment\'s weather to kinds it can actually have, and a snowfield that can snow', () => {
    for (const env of FIRST_SURFACE_ENVIRONMENTS) {
      for (const id of Object.keys(env.weather ?? {})) expect(WEATHER_IDS).toContain(id);
    }
    const snowfield = FIRST_SURFACE_ENVIRONMENTS.find((e) => e.key === 'snowfield')!;
    let snowed = false;
    for (let t = 0; t < 40000 && !snowed; t += 20) snowed = weatherAt(3, snowfield, t).snow > 0.3;
    expect(snowed).toBe(true);
    const dusty = FIRST_SURFACE_ENVIRONMENTS.find((e) => e.key === 'dusty_plains')!;
    expect(dusty.weather).not.toHaveProperty('snow');
  });
});

describe('planSurface', () => {
  it('creates everything on an empty database, with the default going to the green valley', () => {
    const plan = planSurface([], [], false);
    expect(plan.doodads.every((d) => d.action === 'create')).toBe(true);
    expect(plan.environments.map((e) => [e.environment.key, e.action, e.asDefault])).toEqual([
      ['green_valley', 'create', true],
      ['snowfield', 'create', false],
      ['dusty_plains', 'create', false],
    ]);
  });

  it('skips rows that exist and never touches them', () => {
    const plan = planSurface(['oak_tree', 'bird'], ['snowfield'], true);
    expect(plan.doodads.filter((d) => d.action === 'skip').map((d) => d.doodad.key)).toEqual(['oak_tree', 'bird']);
    expect(plan.environments.find((e) => e.environment.key === 'snowfield')!.action).toBe('skip');
  });

  it('makes no new default when the database already has one', () => {
    const plan = planSurface([], ['x'], true);
    expect(plan.environments.some((e) => e.asDefault)).toBe(false);
  });

  it('does not make the default again when its environment already exists (and none is marked)', () => {
    const plan = planSurface([], ['green_valley'], false);
    expect(plan.environments.some((e) => e.asDefault)).toBe(false);
  });

  it('is idempotent: a second run with everything there does nothing', () => {
    const plan = planSurface(FIRST_SURFACE_DOODADS.map((d) => d.key), FIRST_SURFACE_ENVIRONMENTS.map((e) => e.key), true);
    expect(plan.doodads.every((d) => d.action === 'skip')).toBe(true);
    expect(plan.environments.every((e) => e.action === 'skip')).toBe(true);
  });
});
