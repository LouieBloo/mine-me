import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { quantizeFluidLevel, type FluidClientDefinition, type ItemLightConfig } from '@mine-me/shared';
import { FluidGlow, GLOW_BUCKET_SIZE, GLOW_SYNC_INTERVAL_MS, MAX_GLOW_LIGHTS } from './FluidGlow';
import { FluidRenderer } from './FluidRenderer';

const q = quantizeFluidLevel;
const LIGHT: ItemLightConfig = { enabled: true, type: 'POINT', effect: 'FLICKER', color: '#ff7a1c', radius: 4, intensity: 0.8 };
const LAVA: FluidClientDefinition = { id: 1, typeKey: 'LAVA', name: 'Lava', color: '#ff5500', opacity: 0.95, viscosity: 0.8, density: 3, light: LIGHT };
const WATER: FluidClientDefinition = { id: 2, typeKey: 'WATER', name: 'Water', color: '#3b82f6', opacity: 0.6, viscosity: 0.2, density: 1 };
const TILE = 64;

function setup(defs: FluidClientDefinition[] = [LAVA, WATER]) {
  const fluids = new FluidRenderer(new Container(), 120, 80, defs, TILE);
  const glow = new FluidGlow(fluids, TILE);
  const lights = new Map<string, any>();
  const lighting: any = {
    addLight: vi.fn((light: any) => lights.set(light.id, light)),
    removeLight: vi.fn((id: string) => lights.delete(id)),
  };
  glow.setEngine(lighting);
  let now = 1000;
  const sync = (focus = { x: 5, y: 5 }) => { now += GLOW_SYNC_INTERVAL_MS + 1; glow.sync(now, focus); };
  const fill = (x: number, y: number, w: number, h: number, id = 1, level = 1) => {
    const cells: Array<[number, number, number, number]> = [];
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) cells.push([xx, yy, id, q(level)]);
    fluids.apply(cells);
  };
  return { fluids, glow, lighting, lights, sync, fill };
}

describe('FluidGlow', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it('lights nothing when no fluid glows', () => {
    t.fill(4, 4, 3, 3, 2);
    t.sync();
    expect(t.glow.lightCount).toBe(0);
  });

  it('lights glowing fluid with its own light, once per bucket and not per cell', () => {
    t.fill(0, 0, GLOW_BUCKET_SIZE, GLOW_BUCKET_SIZE);
    t.sync();
    expect(t.glow.lightCount).toBe(1);
    const light = [...t.lights.values()][0];
    expect(light.id).toContain('fluid_glow');
  });

  it('a pool spanning several buckets gets a light in each', () => {
    t.fill(0, 0, GLOW_BUCKET_SIZE * 3, GLOW_BUCKET_SIZE);
    t.sync();
    expect(t.glow.lightCount).toBe(3);
  });

  it('removes the light when the fluid goes (evaporates or hardens)', () => {
    t.fill(0, 0, 2, 2);
    t.sync();
    expect(t.glow.lightCount).toBe(1);
    t.fluids.apply([[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0], [1, 1, 0, 0]]);
    t.sync();
    expect(t.glow.lightCount).toBe(0);
    expect(t.lighting.removeLight).toHaveBeenCalled();
  });

  it('keeps the same light while the fluid stays, and moves it as the fluid shifts', () => {
    t.fill(0, 0, 2, 2);
    t.sync();
    const added = t.lighting.addLight.mock.calls.length;
    t.sync();
    expect(t.lighting.addLight.mock.calls.length).toBe(added);
    t.fluids.apply([[3, 3, 1, q(1)], [0, 0, 0, 0]]);
    t.sync();
    expect(t.lighting.addLight.mock.calls.length).toBe(added); // same bucket: moved, not rebuilt
  });

  it('a thin film glows dimmer than a full bucket', () => {
    t.fill(0, 0, GLOW_BUCKET_SIZE, GLOW_BUCKET_SIZE);
    t.sync();
    const full = [...t.lights.values()][0].intensity ?? [...t.lights.values()][0].baseIntensity;
    const dim = setup();
    dim.fill(0, 0, 1, 1, 1, 0.3);
    dim.sync();
    const thin = [...dim.lights.values()][0].intensity ?? [...dim.lights.values()][0].baseIntensity;
    expect(thin).toBeLessThan(full);
  });

  it('never exceeds the light cap, keeping the nearest buckets', () => {
    for (let i = 0; i < MAX_GLOW_LIGHTS + 10; i++) t.fill(i * GLOW_BUCKET_SIZE % 80, Math.floor(i / 20) * GLOW_BUCKET_SIZE * 2, 1, 1);
    t.sync({ x: 40, y: 8 });
    expect(t.glow.lightCount).toBe(MAX_GLOW_LIGHTS);
  });

  it('ignores fluid far from the player', () => {
    t.fill(100, 70, 2, 2);
    t.sync({ x: 5, y: 5 });
    expect(t.glow.lightCount).toBe(0);
  });

  it('clear removes every light', () => {
    t.fill(0, 0, 8, 4);
    t.sync();
    t.glow.clear();
    expect(t.glow.lightCount).toBe(0);
    expect(t.lights.size).toBe(0);
  });
});
