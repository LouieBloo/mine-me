import { describe, it, expect, vi } from 'vitest';
import type { Container } from 'pixi.js';
import type { ParticleEffectConfig } from '@mine-me/shared';
import { HeldItemParticles, type HeldParticleSource } from './HeldItemParticles';
import type { ParticleEngine } from './ParticleEngine';

const flame = { emitterType: 'continuous', rate: 30 } as unknown as ParticleEffectConfig;
const sparks = { emitterType: 'continuous', rate: 5 } as unknown as ParticleEffectConfig;
const space = {} as Container;

function makeEngine() {
  const emitters: { config: ParticleEffectConfig; position: { x: number; y: number }; destroyed: boolean; setPosition: any; destroy: any }[] = [];
  const engine = {
    addEmitter: vi.fn((config: ParticleEffectConfig, position: { x: number; y: number }) => {
      const e = {
        config,
        position: { ...position },
        destroyed: false,
        setPosition: vi.fn((p: { x: number; y: number }) => {
          e.position = { ...p };
        }),
        destroy: vi.fn(() => {
          e.destroyed = true;
        }),
      };
      emitters.push(e);
      return e;
    }),
  };
  return { engine: engine as unknown as ParticleEngine, emitters, addEmitter: engine.addEmitter };
}

function makeSource(effectId: string | null, pos: { x: number; y: number } | null = { x: 10, y: 20 }) {
  const state = { effectId, pos };
  const source: HeldParticleSource = {
    getHeldParticle: () => (state.effectId ? { effectId: state.effectId, offset: { x: 0, y: 0 } } : null),
    getHeldParticleWorldPosition: () => state.pos,
  };
  return { source, state };
}

const resolver = (id: string) => ({ flame, sparks } as Record<string, ParticleEffectConfig>)[id] ?? null;

describe('HeldItemParticles', () => {
  it('starts an emitter at the item position when the held item has an effect', () => {
    const { engine, emitters } = makeEngine();
    const { source } = makeSource('flame');
    const held = new HeldItemParticles(resolver);

    held.sync(engine, source, space);

    expect(emitters).toHaveLength(1);
    expect(emitters[0].config).toBe(flame);
    expect(emitters[0].position).toEqual({ x: 10, y: 20 });
  });

  it('does nothing for an item without an effect', () => {
    const { engine, addEmitter } = makeEngine();
    const held = new HeldItemParticles(resolver);
    held.sync(engine, makeSource(null).source, space);
    expect(addEmitter).not.toHaveBeenCalled();
    expect(held.hasEmitter()).toBe(false);
  });

  it('moves the same emitter with the item instead of creating more', () => {
    const { engine, emitters, addEmitter } = makeEngine();
    const { source, state } = makeSource('flame');
    const held = new HeldItemParticles(resolver);
    held.sync(engine, source, space);

    state.pos = { x: 30, y: 40 };
    held.sync(engine, source, space);

    expect(addEmitter).toHaveBeenCalledTimes(1);
    expect(emitters[0].position).toEqual({ x: 30, y: 40 });
  });

  it('replaces the emitter when the effect changes', () => {
    const { engine, emitters } = makeEngine();
    const { source, state } = makeSource('flame');
    const held = new HeldItemParticles(resolver);
    held.sync(engine, source, space);

    state.effectId = 'sparks';
    held.sync(engine, source, space);

    expect(emitters).toHaveLength(2);
    expect(emitters[0].destroyed).toBe(true);
    expect(emitters[1].config).toBe(sparks);
    expect(emitters[1].destroyed).toBe(false);
  });

  it('removes the emitter when the item is unequipped', () => {
    const { engine, emitters } = makeEngine();
    const { source, state } = makeSource('flame');
    const held = new HeldItemParticles(resolver);
    held.sync(engine, source, space);

    state.effectId = null;
    held.sync(engine, source, space);

    expect(emitters[0].destroyed).toBe(true);
    expect(held.hasEmitter()).toBe(false);
  });

  it('removes the emitter when the weapon has no position (sprite gone)', () => {
    const { engine, emitters } = makeEngine();
    const { source, state } = makeSource('flame');
    const held = new HeldItemParticles(resolver);
    held.sync(engine, source, space);

    state.pos = null;
    held.sync(engine, source, space);

    expect(emitters[0].destroyed).toBe(true);
  });

  it('retries an effect that is not loaded yet instead of giving up', () => {
    const { engine, emitters } = makeEngine();
    const { source } = makeSource('late');
    let loaded: ParticleEffectConfig | null = null;
    const held = new HeldItemParticles(() => loaded);

    held.sync(engine, source, space);
    expect(emitters).toHaveLength(0);

    loaded = flame;
    held.sync(engine, source, space);
    expect(emitters).toHaveLength(1);
  });

  it('drops the emitter when there is no particle engine', () => {
    const { engine, emitters } = makeEngine();
    const { source } = makeSource('flame');
    const held = new HeldItemParticles(resolver);
    held.sync(engine, source, space);

    held.sync(null, source, space);

    expect(emitters[0].destroyed).toBe(true);
  });

  it('moves to a new engine without leaking the old emitter', () => {
    const a = makeEngine();
    const b = makeEngine();
    const { source } = makeSource('flame');
    const held = new HeldItemParticles(resolver);
    held.sync(a.engine, source, space);

    held.sync(b.engine, source, space);

    expect(a.emitters[0].destroyed).toBe(true);
    expect(b.emitters).toHaveLength(1);
  });

  it('destroy stops emitting', () => {
    const { engine, emitters } = makeEngine();
    const held = new HeldItemParticles(resolver);
    held.sync(engine, makeSource('flame').source, space);
    held.destroy();
    expect(emitters[0].destroyed).toBe(true);
    expect(held.hasEmitter()).toBe(false);
  });
});
