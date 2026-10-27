import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import { DoodadField, type DoodadClientDefinition, type DoodadLightConfig, type ParticleEffectConfig } from '@mine-me/shared';
import { DoodadRenderer, type DoodadTextureLoader } from '../renderers/DoodadRenderer';
import { DOODAD_EFFECTS_SYNC_MS, DoodadEffects, doodadCentre, MAX_DOODAD_EMITTERS, doodadEffectPoint } from './DoodadEffects';

const T = 21;
const LIGHT: DoodadLightConfig = { enabled: true, type: 'POINT', effect: 'STATIC', color: '#88ffcc', radius: 3, intensity: 0.6 };
const FX = { rate: 10 } as unknown as ParticleEffectConfig;
const def = (over: Partial<DoodadClientDefinition> = {}): DoodadClientDefinition => ({ index: 0, key: 'd', name: 'd', anchor: 'FLOOR', width: 1, height: 1, zOffset: 0, ...over });
const noPictures: DoodadTextureLoader = () => Promise.resolve(null);
const VIEW = { x0: 0, y0: 0, x1: 200, y1: 60 };

function setup(definition: DoodadClientDefinition, placements: Array<[number, number]>, maxLights = 12) {
  const field = new DoodadField([definition], placements.map(([x, y]) => [0, x, y, 0]));
  const renderer = new DoodadRenderer(new Container(), field, noPictures, T);
  renderer.update(0, VIEW, 0.016);
  const lights = new Map<string, any>();
  const lighting: any = { addLight: vi.fn((l: any) => lights.set(l.id, l)), removeLight: vi.fn((id: string) => lights.delete(id)) };
  const emitters: any[] = [];
  const particles: any = {
    addEmitter: vi.fn((config: any, position: any) => {
      const handle: any = { config, position, destroy: vi.fn(), setPosition: vi.fn((p: any) => (handle.position = p)) };
      emitters.push(handle);
      return handle;
    }),
    spawnBurst: vi.fn(),
  };
  const effects = new DoodadEffects(renderer, maxLights, () => FX, T);
  effects.setEngines(particles, lighting);
  let now = 10_000;
  const sync = (focus = { x: 5, y: 5 }) => {
    now += DOODAD_EFFECTS_SYNC_MS + 1;
    effects.sync(now, focus);
  };
  return { field, renderer, effects, lighting, lights, particles, emitters, sync, clock: () => now, setNow: (n: number) => (now = n) };
}

describe('doodadEffectPoint', () => {
  it('offsets from the base point by picture pixels, scaled to the drawing, and mirrored with a wall doodad', () => {
    const info = { anchorX: 100, anchorY: 200, artScale: 0.5, mirror: 1 } as any;
    expect(doodadEffectPoint(info, 10, -20)).toEqual({ x: 105, y: 190 });
    expect(doodadEffectPoint({ ...info, mirror: -1 }, 10, -20)).toEqual({ x: 95, y: 190 });
    expect(doodadEffectPoint(info, undefined, undefined)).toEqual({ x: 100, y: 200 });
  });
});

describe('DoodadEffects lights', () => {
  it('lights the doodads that have a light, at their base plus the offset, and only them', () => {
    const t = setup(def({ light: { ...LIGHT, offsetY: -32 } }), [[5, 5], [8, 5]]);
    t.sync();
    expect(t.effects.lightCount).toBe(2);
    const light = [...t.lights.values()].find((l) => l.id === 'doodad_light_5,5');
    // base point (5.5 cells, 6 cells), 32 picture pixels up at 21/64 draw pixels each
    expect(light.position.x).toBeCloseTo(5.5);
    expect(light.position.y).toBeCloseTo(6 - (32 * (T / 64)) / T);
    const none = setup(def(), [[5, 5]]);
    none.sync();
    expect(none.effects.lightCount).toBe(0);
  });

  it('keeps only the nearest to the player within the map setting', () => {
    const t = setup(def({ light: LIGHT }), [[5, 5], [20, 5], [40, 5], [60, 5]], 2);
    t.sync({ x: 5, y: 5 });
    expect([...t.lights.keys()].sort()).toEqual(['doodad_light_20,5', 'doodad_light_5,5']);
    t.sync({ x: 60, y: 5 });
    expect([...t.lights.keys()].sort()).toEqual(['doodad_light_40,5', 'doodad_light_60,5']);
    expect(t.lighting.removeLight).toHaveBeenCalled();
  });

  it('lights nothing when the map allows no doodad lights', () => {
    const t = setup(def({ light: LIGHT }), [[5, 5]], 0);
    t.sync();
    expect(t.effects.lightCount).toBe(0);
  });

  it('takes the light away with the doodad', () => {
    const t = setup(def({ light: LIGHT }), [[5, 5]]);
    t.sync();
    expect(t.effects.lightCount).toBe(1);
    t.field.apply([], [[5, 5]]);
    t.renderer.update(1, VIEW, 1);
    t.sync();
    expect(t.effects.lightCount).toBe(0);
  });

  it('lights a pulsing doodad with a pulsing light, and does the update only a few times a second', () => {
    const t = setup(def({ light: LIGHT, motion: { preset: 'pulse', speed: 1 } }), [[5, 5]]);
    t.sync();
    expect([...t.lights.values()][0].pulse).toBeDefined();
    const adds = t.lighting.addLight.mock.calls.length;
    t.field.apply([[0, 9, 5, 0]], []);
    t.renderer.update(1, VIEW, 0.016);
    t.effects.sync(t.clock() + 10, { x: 5, y: 5 }); // too soon after the last sync
    expect(t.lighting.addLight.mock.calls.length).toBe(adds);
  });

  it('clears its lights when the lighting engine goes', () => {
    const t = setup(def({ light: LIGHT }), [[5, 5]]);
    t.sync();
    t.effects.setEngines(t.particles, null);
    expect(t.lights.size).toBe(0);
    expect(t.effects.lightCount).toBe(0);
  });
});

describe('DoodadEffects particles', () => {
  it('runs an emitter on each doodad with an effect, at its offset, and stops it with the doodad', () => {
    const t = setup(def({ particleEffectId: 'fx', particleOffsetY: 64 }), [[5, 5]]);
    t.sync();
    expect(t.effects.emitterCount).toBe(1);
    expect(t.emitters[0].position.x).toBeCloseTo(5.5 * T);
    expect(t.emitters[0].position.y).toBeCloseTo(6 * T + T); // 64 picture pixels is a whole cell
    t.field.apply([], [[5, 5]]);
    t.renderer.update(1, VIEW, 1);
    t.sync();
    expect(t.emitters[0].destroy).toHaveBeenCalled();
    expect(t.effects.emitterCount).toBe(0);
  });

  it('makes no emitter for an effect that does not exist', () => {
    const field = new DoodadField([def({ particleEffectId: 'nope' })], [[0, 5, 5, 0]]);
    const renderer = new DoodadRenderer(new Container(), field, noPictures, T);
    renderer.update(0, VIEW, 0.016);
    const particles: any = { addEmitter: vi.fn(), spawnBurst: vi.fn() };
    const effects = new DoodadEffects(renderer, 12, () => null, T);
    effects.setEngines(particles, null);
    effects.sync(1000, { x: 0, y: 0 });
    expect(particles.addEmitter).not.toHaveBeenCalled();
  });

  it(`never keeps more than ${MAX_DOODAD_EMITTERS} emitters, the nearest first`, () => {
    const spots: Array<[number, number]> = Array.from({ length: MAX_DOODAD_EMITTERS + 10 }, (_, i) => [3 + i * 3, 5]);
    const t = setup(def({ particleEffectId: 'fx' }), spots);
    t.sync({ x: 0, y: 5 });
    expect(t.effects.emitterCount).toBe(MAX_DOODAD_EMITTERS);
    expect(t.emitters.every((e) => e.position.x < (3 + MAX_DOODAD_EMITTERS * 3) * T)).toBe(true);
  });

  it('splashes a drip where its drop lands instead of running an emitter', () => {
    const t = setup(def({ anchor: 'CEILING', particleEffectId: 'fx', motion: { preset: 'drip', speed: 1, phase: 0 } }), [[5, 5]]);
    t.setNow(0);
    t.effects.sync(900, { x: 5, y: 5 }); // the drop is falling
    expect(t.particles.spawnBurst).not.toHaveBeenCalled();
    t.effects.sync(1100, { x: 5, y: 5 }); // ...and has landed
    expect(t.particles.spawnBurst).toHaveBeenCalledTimes(1);
    expect(t.effects.emitterCount).toBe(0);
    t.effects.sync(1500, { x: 5, y: 5 });
    expect(t.particles.spawnBurst).toHaveBeenCalledTimes(1);
  });
});

describe('DoodadEffects with wandering and brushed doodads (tickets 104, 106)', () => {
  const terrain = { isSolid: (x: number, y: number) => y >= 6 || y < 0 || x < 0 || x > 80 };
  const bug = def({ width: 1, height: 1, light: LIGHT, particleEffectId: 'fx', wander: { mode: 'CRAWL', radius: 4, speed: 2, pauseMs: 200 } });

  it('moves the light and the emitter of a wandering doodad along with it', () => {
    const t = setup(bug, [[10, 5]]);
    t.renderer.setTerrain(terrain);
    t.sync();
    const light = [...t.lights.values()][0];
    const startX = light.position.x;
    expect(t.emitters).toHaveLength(1);
    const startEmitterX = t.emitters[0].position.x;
    for (let i = 1; i <= 600; i++) {
      t.renderer.update(i / 30, VIEW, 1 / 30, []);
      t.effects.sync(t.clock() + i * 10, { x: 10, y: 5 }); // (frames; the lights are only re-chosen now and then)
    }
    expect(light.position.x).not.toBeCloseTo(startX, 1);
    expect(t.emitters[0].setPosition).toHaveBeenCalled();
    expect(t.emitters[0].position.x).not.toBe(startEmitterX);
    // The light stays where the doodad is, in tiles
    const info = t.renderer.visible()[0];
    expect(light.position.x).toBeCloseTo(info.anchorX / T);
  });

  it('leaves the lights of a doodad that does not wander where they were', () => {
    const t = setup(def({ light: LIGHT, particleEffectId: 'fx' }), [[10, 5]]);
    t.sync();
    for (let i = 1; i <= 50; i++) t.effects.sync(t.clock() + i * 10, { x: 10, y: 5 });
    expect(t.emitters[0].setPosition).not.toHaveBeenCalled();
  });

  it('puffs the effect it is given where the doodad gives off its particles', () => {
    const t = setup(def({ particleEffectId: 'fx', particleOffsetY: -10 }), [[10, 5]]);
    const info = t.renderer.visible()[0];
    t.effects.puff(info, 'spores');
    expect(t.particles.spawnBurst).toHaveBeenCalledWith(FX, doodadEffectPoint(info, undefined, -10));
  });

  it('puffs nothing when the effect is unknown or there is no particle engine', () => {
    const t = setup(def(), [[10, 5]]);
    const info = t.renderer.visible()[0];
    const none = new DoodadEffects(t.renderer, 1, () => null, T);
    none.setEngines(t.particles, t.lighting);
    none.puff(info, 'spores');
    new DoodadEffects(t.renderer, 1, () => FX, T).puff(info, 'spores');
    expect(t.particles.spawnBurst).not.toHaveBeenCalled();
  });
});


describe('DoodadEffects death burst (ticket 143)', () => {
  it('bursts the death effect at the middle of a floor doodad, and of a ceiling one', () => {
    const t = setup(def({ deathParticleEffectId: 'splat', width: 2, height: 4 }), [[10, 5]]);
    const info = t.renderer.visible()[0];
    t.effects.deathBurst(info);
    expect(t.particles.spawnBurst).toHaveBeenLastCalledWith(FX, { x: info.anchorX, y: info.anchorY - 2 * T });
    expect(doodadCentre({ ...info, entry: { ...info.entry, definition: { ...info.entry.definition, anchor: 'CEILING' } } }, T)).toEqual({ x: info.anchorX, y: info.anchorY + 2 * T });
    const wall = { ...info, entry: { ...info.entry, flip: true, definition: { ...info.entry.definition, anchor: 'WALL' as const } } };
    expect(doodadCentre(wall, T)).toEqual({ x: info.anchorX - T, y: info.anchorY });
    expect(doodadCentre({ ...info, entry: { ...info.entry, definition: { ...info.entry.definition, anchor: 'AIR' as const } } }, T)).toEqual({ x: info.anchorX, y: info.anchorY });
  });

  it('bursts nothing when the doodad has no death effect or the effect is unknown', () => {
    const none = setup(def(), [[10, 5]]);
    none.effects.deathBurst(none.renderer.visible()[0]);
    expect(none.particles.spawnBurst).not.toHaveBeenCalled();
    const t = setup(def({ deathParticleEffectId: 'gone' }), [[10, 5]]);
    const unknown = new DoodadEffects(t.renderer, 1, () => null, T);
    unknown.setEngines(t.particles, t.lighting);
    unknown.deathBurst(t.renderer.visible()[0]);
    expect(t.particles.spawnBurst).not.toHaveBeenCalled();
  });
});
