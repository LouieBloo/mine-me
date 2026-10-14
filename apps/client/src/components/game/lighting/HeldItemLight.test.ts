import { describe, it, expect, vi } from 'vitest';
import type { Container } from 'pixi.js';
import type { HeldLightConfig } from '@mine-me/shared';
import { HeldItemLight, type HeldLightSource } from './HeldItemLight';
import type { LightingEngine } from './LightingEngine';

const space = {} as Container;
const torch: HeldLightConfig = { enabled: true, type: 'POINT', effect: 'FLICKER', color: '#ff8a2a', radius: 3, intensity: 0.6 };

function makeEngine() {
  const lights: any[] = [];
  const engine = {
    addLight: vi.fn((l: any) => lights.push(l)),
    removeLight: vi.fn(),
  };
  return { engine: engine as unknown as LightingEngine, raw: engine, lights };
}

function makeSource(config: HeldLightConfig | null, pos: { x: number; y: number } | null = { x: 64, y: 96 }) {
  const state = { config, pos };
  const source: HeldLightSource = {
    getHeldLight: () => state.config,
    getHeldLightWorldPosition: () => state.pos,
  };
  return { source, state };
}

describe('HeldItemLight', () => {
  it('adds a light at the item position, in tile coordinates', () => {
    const { engine, lights } = makeEngine();
    const held = new HeldItemLight('held_a', 32);
    held.sync(engine, makeSource(torch).source, space);

    expect(lights).toHaveLength(1);
    expect(lights[0].id).toBe('held_a');
    expect(lights[0].position).toEqual({ x: 2, y: 3 });
  });

  it('does nothing for an item with no light or a disabled one', () => {
    const { engine, raw } = makeEngine();
    const held = new HeldItemLight('held_a', 32);
    held.sync(engine, makeSource(null).source, space);
    held.sync(engine, makeSource({ ...torch, enabled: false }).source, space);
    expect(raw.addLight).not.toHaveBeenCalled();
  });

  it('moves the same light with the item', () => {
    const { engine, lights, raw } = makeEngine();
    const { source, state } = makeSource(torch);
    const held = new HeldItemLight('held_a', 32);
    held.sync(engine, source, space);
    state.pos = { x: 160, y: 32 };
    held.sync(engine, source, space);

    expect(raw.addLight).toHaveBeenCalledTimes(1);
    expect(lights[0].position).toEqual({ x: 5, y: 1 });
  });

  it('rebuilds the light when its config changes', () => {
    const { engine, raw } = makeEngine();
    const { source, state } = makeSource(torch);
    const held = new HeldItemLight('held_a', 32);
    held.sync(engine, source, space);

    state.config = { ...torch, radius: 5 };
    held.sync(engine, source, space);

    expect(raw.removeLight).toHaveBeenCalledWith('held_a');
    expect(raw.addLight).toHaveBeenCalledTimes(2);
  });

  it('removes the light on unequip, when the sprite has no position, and on destroy', () => {
    const { engine, raw } = makeEngine();
    const { source, state } = makeSource(torch);
    const held = new HeldItemLight('held_a', 32);
    held.sync(engine, source, space);

    state.config = null;
    held.sync(engine, source, space);
    expect(raw.removeLight).toHaveBeenCalledTimes(1);
    expect(held.hasLight()).toBe(false);

    state.config = torch;
    held.sync(engine, source, space);
    state.pos = null;
    held.sync(engine, source, space);
    expect(raw.removeLight).toHaveBeenCalledTimes(2);

    state.pos = { x: 0, y: 0 };
    held.sync(engine, source, space);
    held.destroy();
    expect(raw.removeLight).toHaveBeenCalledTimes(3);
  });

  it('drops the light when there is no lighting engine', () => {
    const { engine, raw } = makeEngine();
    const held = new HeldItemLight('held_a', 32);
    const { source } = makeSource(torch);
    held.sync(engine, source, space);
    held.sync(null, source, space);
    expect(raw.removeLight).toHaveBeenCalledWith('held_a');
  });
});
