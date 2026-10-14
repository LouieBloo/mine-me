import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BurningBodies } from './BurningBodies';

const EFFECT = { emitterType: 'continuous', rate: 40 } as any;

function fakeParticles() {
  const handles: any[] = [];
  const engine: any = {
    addEmitter: vi.fn((config: unknown, position: { x: number; y: number }) => {
      const h = { config, position: { ...position }, setPosition: vi.fn((p: any) => { h.position = { ...p }; }), destroy: vi.fn() };
      handles.push(h);
      return h;
    }),
  };
  return { engine, handles };
}

describe('BurningBodies', () => {
  let bodies: BurningBodies;
  let p: ReturnType<typeof fakeParticles>;
  beforeEach(() => {
    bodies = new BurningBodies(64);
    p = fakeParticles();
    bodies.setup(p.engine, EFFECT);
  });

  it('puts the burning effect on everyone who is burning, at their position', () => {
    bodies.sync([{ id: 'self', x: 2, y: 3 }, { id: 'mob_1', x: 5, y: 6 }]);
    expect(bodies.count).toBe(2);
    expect(p.engine.addEmitter).toHaveBeenCalledWith(EFFECT, { x: 128, y: 192 });
    expect(p.engine.addEmitter).toHaveBeenCalledWith(EFFECT, { x: 320, y: 384 });
  });

  it('follows a body that moves, without making a new effect', () => {
    bodies.sync([{ id: 'mob_1', x: 5, y: 6 }]);
    bodies.sync([{ id: 'mob_1', x: 6, y: 6 }]);
    expect(p.engine.addEmitter).toHaveBeenCalledTimes(1);
    expect(p.handles[0].setPosition).toHaveBeenLastCalledWith({ x: 384, y: 384 });
  });

  it('stops the effect on a body that is no longer burning', () => {
    bodies.sync([{ id: 'a', x: 1, y: 1 }, { id: 'b', x: 2, y: 2 }]);
    bodies.sync([{ id: 'b', x: 2, y: 2 }]);
    expect(p.handles[0].destroy).toHaveBeenCalled();
    expect(p.handles[1].destroy).not.toHaveBeenCalled();
    expect(bodies.count).toBe(1);
    bodies.sync([]);
    expect(bodies.count).toBe(0);
  });

  it('moves one body between ticks (the local player moves every frame)', () => {
    bodies.sync([{ id: 'self', x: 1, y: 1 }]);
    bodies.move('self', 1.5, 1.25);
    expect(p.handles[0].setPosition).toHaveBeenLastCalledWith({ x: 96, y: 80 });
    expect(() => bodies.move('nobody', 1, 1)).not.toThrow();
  });

  it('draws nothing when no effect is set, or there is no particle engine', () => {
    bodies.setup(p.engine, null);
    bodies.sync([{ id: 'a', x: 1, y: 1 }]);
    expect(bodies.count).toBe(0);
    bodies.setup(null, EFFECT);
    bodies.sync([{ id: 'a', x: 1, y: 1 }]);
    expect(bodies.count).toBe(0);
  });

  it('clears the old effect when a different one is set', () => {
    bodies.sync([{ id: 'a', x: 1, y: 1 }]);
    bodies.setup(p.engine, { emitterType: 'continuous', rate: 5 } as any);
    expect(bodies.count).toBe(0);
    expect(p.handles[0].destroy).toHaveBeenCalled();
  });

  it('destroy removes everything', () => {
    bodies.sync([{ id: 'a', x: 1, y: 1 }]);
    bodies.destroy();
    expect(bodies.count).toBe(0);
  });
});
