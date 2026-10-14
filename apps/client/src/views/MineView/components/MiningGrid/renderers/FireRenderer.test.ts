import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { FireField, quantizeFluidLevel, type FluidClientDefinition, type ItemLightConfig } from '@mine-me/shared';
import { FIRE_SYNC_INTERVAL_MS, FireRenderer, MAX_FIRE_LIGHTS, MAX_FLAME_EMITTERS } from './FireRenderer';
import { FluidRenderer } from './FluidRenderer';

const q = quantizeFluidLevel;
const FLAME = { emitterType: 'continuous', rate: 30 } as any;
const LIGHT: ItemLightConfig = { enabled: true, type: 'POINT', effect: 'FLICKER', color: '#ff8a2a', radius: 3, intensity: 0.8 };
const OIL: FluidClientDefinition = { id: 1, typeKey: 'OIL', name: 'Oil', color: '#000000', opacity: 0.9, viscosity: 0.6, density: 0.8, flame: { effect: FLAME, light: LIGHT } };
const TILE = 64;

function fakeEngines() {
  const emitters: Array<{ config: unknown; position: { x: number; y: number }; destroyed: boolean; setPosition: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
  const particles: any = {
    addEmitter: vi.fn((config: unknown, position: { x: number; y: number }) => {
      const e = { config, position: { ...position }, destroyed: false, setPosition: vi.fn((p: { x: number; y: number }) => { e.position = { ...p }; }), destroy: vi.fn(() => { e.destroyed = true; }) };
      emitters.push(e);
      return e;
    }),
  };
  const lights = new Map<string, any>();
  const lighting: any = {
    addLight: vi.fn((light: any) => lights.set(light.id, light)),
    removeLight: vi.fn((id: string) => lights.delete(id)),
  };
  return { particles, lighting, emitters, lights };
}

function setup(defs: FluidClientDefinition[] = [OIL]) {
  const fluids = new FluidRenderer(new Container(), 40, 40, defs, TILE);
  const fire = new FireField(40, 40);
  const renderer = new FireRenderer(fire, fluids, TILE);
  const engines = fakeEngines();
  renderer.setEngines(engines.particles, engines.lighting);
  let now = 1000;
  const sync = (focus = { x: 5, y: 5 }) => { now += FIRE_SYNC_INTERVAL_MS + 1; renderer.sync(now, focus); };
  const burn = (x: number, y: number, level = 1, fluidId = 1) => {
    fluids.apply([[x, y, fluidId, q(level)]]);
    fire.set(x, y, true);
  };
  return { fluids, fire, renderer, engines, sync, burn };
}

describe('FireRenderer', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it('draws nothing when nothing burns', () => {
    t.sync();
    expect(t.renderer.emitterCount).toBe(0);
    expect(t.renderer.lightCount).toBe(0);
  });

  it('puts the fluid\'s flames and light on a burning cell, at the burning surface', () => {
    t.burn(5, 6, 0.5);
    t.sync();
    expect(t.engines.particles.addEmitter).toHaveBeenCalledTimes(1);
    const [config, position] = t.engines.particles.addEmitter.mock.calls[0];
    expect(config).toBe(FLAME);
    expect(position).toEqual({ x: 5.5 * TILE, y: 6 * TILE + TILE / 2 }); // half-full cell: surface halfway up
    expect(t.renderer.lightCount).toBe(1);
    const light = [...t.engines.lights.values()][0];
    expect(light.position.x).toBeCloseTo(5.5, 5);
  });

  it('removes the flames and light when the fire goes out', () => {
    t.burn(5, 6);
    t.sync();
    t.fire.set(5, 6, false);
    t.sync();
    expect(t.renderer.emitterCount).toBe(0);
    expect(t.renderer.lightCount).toBe(0);
    expect(t.engines.emitters[0].destroy).toHaveBeenCalled();
    expect(t.engines.lights.size).toBe(0);
  });

  it('puts flames on the fluid as it is drawn: packed onto its floor, not hanging at a cell\'s raw level', () => {
    // Half a cell over half a cell: drawn as one full cell resting on the floor of row 7
    t.fluids.apply([[5, 6, 1, q(0.5)], [5, 7, 1, q(0.5)]]);
    t.fire.set(5, 6, true);
    t.sync();
    expect(t.engines.particles.addEmitter.mock.calls[0][1]).toEqual({ x: 5.5 * TILE, y: 7 * TILE });
  });

  it('follows the drawn surface while it eases, so flames move with the fluid you see', () => {
    t.burn(5, 6, 0.5);
    t.sync();
    t.fluids.apply([[5, 6, 1, q(0.1)]], true); // the oil burns down
    t.sync();
    expect(t.engines.emitters[0].position.y).toBe(6 * TILE + TILE / 2); // nothing has eased yet
    t.fluids.update(0);
    t.fluids.update(0.1);
    t.sync();
    const y = t.engines.emitters[0].position.y;
    expect(y).toBeGreaterThan(6 * TILE + TILE / 2);
    expect(y).toBeLessThan(7 * TILE - 0.1 * TILE);
  });

  it('moves the flames down as the burning surface sinks', () => {
    t.burn(5, 6, 1);
    t.sync();
    t.fluids.apply([[5, 6, 1, q(0.25)]]);
    t.sync();
    expect(t.engines.emitters[0].setPosition).toHaveBeenCalledWith({ x: 5.5 * TILE, y: 6 * TILE + TILE * 0.75 });
    expect(t.engines.particles.addEmitter).toHaveBeenCalledTimes(1);
  });

  it('only does its work a few times a second', () => {
    t.burn(5, 6);
    t.renderer.sync(5000, { x: 5, y: 5 });
    t.burn(6, 6);
    t.renderer.sync(5000 + FIRE_SYNC_INTERVAL_MS / 2, { x: 5, y: 5 });
    expect(t.renderer.emitterCount).toBe(1);
    t.renderer.sync(5000 + FIRE_SYNC_INTERVAL_MS + 1, { x: 5, y: 5 });
    expect(t.renderer.emitterCount).toBe(2);
  });

  it('draws nothing for a burning cell whose fluid has no flame settings', () => {
    const none = setup([{ ...OIL, flame: undefined }]);
    none.burn(5, 6);
    none.sync();
    expect(none.renderer.emitterCount).toBe(0);
    expect(none.renderer.lightCount).toBe(0);
  });

  it('can have flames without a light and a light without flames', () => {
    const flamesOnly = setup([{ ...OIL, flame: { effect: FLAME, light: null } }]);
    flamesOnly.burn(5, 6);
    flamesOnly.sync();
    expect([flamesOnly.renderer.emitterCount, flamesOnly.renderer.lightCount]).toEqual([1, 0]);
    const lightOnly = setup([{ ...OIL, flame: { effect: null, light: LIGHT } }]);
    lightOnly.burn(5, 6);
    lightOnly.sync();
    expect([lightOnly.renderer.emitterCount, lightOnly.renderer.lightCount]).toEqual([0, 1]);
  });

  it('skips a light that is switched off', () => {
    const off = setup([{ ...OIL, flame: { effect: FLAME, light: { ...LIGHT, enabled: false } } }]);
    off.burn(5, 6);
    off.sync();
    expect(off.renderer.lightCount).toBe(0);
  });

  it('caps flames and lights, keeping the ones nearest the player', () => {
    for (let x = 0; x < 40; x++) for (let y = 10; y < 14; y++) t.burn(x, y);
    t.sync({ x: 0, y: 10 });
    expect(t.renderer.emitterCount).toBe(MAX_FLAME_EMITTERS);
    expect(t.renderer.lightCount).toBe(MAX_FIRE_LIGHTS);
    const farthest = Math.max(...t.engines.emitters.map((e) => e.position.x));
    expect(farthest / TILE).toBeLessThan(35); // the far end of the 40-wide fire got none
    // the nearest cell definitely got a light
    expect(t.engines.lights.has(`fire_light_${10 * 40 + 0}`)).toBe(true);
  });

  it('hands flames to cells that become nearer when the player moves', () => {
    for (let x = 0; x < 40; x++) for (let y = 10; y < 14; y++) t.burn(x, y);
    t.sync({ x: 0, y: 10 });
    expect(t.engines.lights.has(`fire_light_${10 * 40 + 39}`)).toBe(false);
    t.sync({ x: 39, y: 10 });
    expect(t.engines.lights.has(`fire_light_${10 * 40 + 39}`)).toBe(true);
    expect(t.renderer.lightCount).toBe(MAX_FIRE_LIGHTS);
  });

  it('rebuilds a light whose settings change', () => {
    t.burn(5, 6);
    t.sync();
    t.fluids.setDefinitions([{ ...OIL, flame: { effect: FLAME, light: { ...LIGHT, radius: 5 } } }]);
    t.sync();
    expect(t.engines.lights.size).toBe(1);
    expect(t.engines.lighting.removeLight).toHaveBeenCalled();
    expect([...t.engines.lights.values()][0].radius).toBe(5);
  });

  it('replaces flames whose effect changes', () => {
    t.burn(5, 6);
    t.sync();
    const next = { emitterType: 'continuous', rate: 99 } as any;
    t.fluids.setDefinitions([{ ...OIL, flame: { effect: next, light: LIGHT } }]);
    t.sync();
    expect(t.engines.emitters[0].destroy).toHaveBeenCalled();
    expect(t.engines.particles.addEmitter).toHaveBeenLastCalledWith(next, expect.anything());
  });

  describe('burning blocks', () => {
    const WOOD = { effect: { emitterType: 'continuous', rate: 12 } as any, light: { ...LIGHT, color: '#ffaa55' } };

    it('draws flames on a burning block from its block type\'s look, at the middle of the block', () => {
      const types = new Map<string, number>([['7,8', 20]]);
      t.renderer.setBlockFlames([{ tileType: 20, flame: WOOD }]);
      t.renderer.setTileTypeSource((x, y) => types.get(`${x},${y}`));
      t.fire.set(7, 8, true);
      t.sync();
      expect(t.engines.particles.addEmitter).toHaveBeenCalledWith(WOOD.effect, { x: 7.5 * TILE, y: 8.5 * TILE });
      expect(t.renderer.lightCount).toBe(1);
    });

    it('draws nothing on a burning cell of a block type with no look, or when it cannot tell the tile type', () => {
      t.renderer.setBlockFlames([{ tileType: 20, flame: WOOD }]);
      t.renderer.setTileTypeSource(() => 21);
      t.fire.set(7, 8, true);
      t.sync();
      expect(t.renderer.emitterCount).toBe(0);
      t.renderer.setTileTypeSource(null);
      t.sync();
      expect(t.renderer.emitterCount).toBe(0);
    });

    it('prefers the fluid\'s look when the cell holds fluid', () => {
      t.renderer.setBlockFlames([{ tileType: 20, flame: WOOD }]);
      t.renderer.setTileTypeSource(() => 20);
      t.burn(7, 8);
      t.sync();
      expect(t.engines.particles.addEmitter).toHaveBeenCalledWith(FLAME, expect.anything());
    });

    it('replaces the block looks when they are set again', () => {
      t.renderer.setBlockFlames([{ tileType: 20, flame: WOOD }]);
      t.renderer.setTileTypeSource(() => 20);
      t.fire.set(7, 8, true);
      t.sync();
      expect(t.renderer.emitterCount).toBe(1);
      t.renderer.setBlockFlames([]);
      t.sync();
      expect(t.renderer.emitterCount).toBe(0);
    });
  });

  it('draws nothing without engines, and clears when they go', () => {
    t.burn(5, 6);
    t.sync();
    t.renderer.setEngines(null, null);
    expect(t.renderer.emitterCount).toBe(0);
    t.sync();
    expect(t.renderer.emitterCount).toBe(0);
  });

  it('destroy removes everything', () => {
    t.burn(5, 6);
    t.sync();
    t.renderer.destroy();
    expect(t.renderer.emitterCount).toBe(0);
    expect(t.engines.lights.size).toBe(0);
  });
});
