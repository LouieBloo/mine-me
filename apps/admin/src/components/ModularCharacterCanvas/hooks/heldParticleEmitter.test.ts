import { describe, it, expect, vi } from 'vitest';
import type { ParticleEffectConfig } from '@mine-me/shared';
import type { ParticleEngine } from '../../ParticleCanvas/ParticleEngine';
import { HeldParticleEmitter } from './heldParticleEmitter';

const flame = { emitterType: 'continuous', rate: 30 } as unknown as ParticleEffectConfig;
const sparks = { emitterType: 'continuous', rate: 5 } as unknown as ParticleEffectConfig;

function makeEngine() {
  const emitters: any[] = [];
  const engine = {
    addEmitter: vi.fn((config: ParticleEffectConfig, position: { x: number; y: number }) => {
      const e = { config, position: { ...position }, setPosition: vi.fn((p: any) => (e.position = { ...p })), destroy: vi.fn() };
      emitters.push(e);
      return e;
    }),
  };
  return { engine: engine as unknown as ParticleEngine, emitters, addEmitter: engine.addEmitter };
}

describe('HeldParticleEmitter', () => {
  it('starts at the origin, then follows it without creating more emitters', () => {
    const { engine, emitters, addEmitter } = makeEngine();
    const held = new HeldParticleEmitter();

    held.sync(engine, flame, { x: 1, y: 2 });
    held.sync(engine, flame, { x: 5, y: 6 });

    expect(addEmitter).toHaveBeenCalledTimes(1);
    expect(emitters[0].position).toEqual({ x: 5, y: 6 });
  });

  it('swaps the emitter when the effect changes', () => {
    const { engine, emitters } = makeEngine();
    const held = new HeldParticleEmitter();
    held.sync(engine, flame, { x: 0, y: 0 });

    held.sync(engine, sparks, { x: 0, y: 0 });

    expect(emitters[0].destroy).toHaveBeenCalledTimes(1);
    expect(emitters).toHaveLength(2);
    expect(emitters[1].config).toBe(sparks);
  });

  it('removes the emitter when the effect is cleared or the sprite has no position', () => {
    const { engine, emitters } = makeEngine();
    const held = new HeldParticleEmitter();
    held.sync(engine, flame, { x: 0, y: 0 });

    held.sync(engine, null, { x: 0, y: 0 });
    expect(emitters[0].destroy).toHaveBeenCalledTimes(1);
    expect(held.hasEmitter()).toBe(false);

    held.sync(engine, flame, { x: 0, y: 0 });
    held.sync(engine, flame, null);
    expect(emitters[1].destroy).toHaveBeenCalledTimes(1);
    expect(held.hasEmitter()).toBe(false);
  });

  it('does nothing without an effect', () => {
    const { engine, addEmitter } = makeEngine();
    new HeldParticleEmitter().sync(engine, null, null);
    expect(addEmitter).not.toHaveBeenCalled();
  });
});
