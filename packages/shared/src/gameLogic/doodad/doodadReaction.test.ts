import { describe, it, expect } from 'vitest';
import { DoodadBodyIndex, type DoodadBody } from './doodadBodies';
import {
  DoodadReactionSystem, REACTION_MAX_ANGLE, REACTION_MIN_SPEED, REACTION_PUFF_COOLDOWN, bodySpeed, pushDirection, reactionDrive, springAtRest, stepSpring,
  type ReactiveDoodad,
} from './doodadReaction';

const DT = 1 / 60;
const body = (x: number, vx: number, extra: Partial<DoodadBody> = {}): DoodadBody => ({ id: 'p', x, y: 0, vx, vy: 0, radius: 0.5, ...extra });
const mushroom = (extra: Partial<ReactiveDoodad> = {}): ReactiveDoodad => ({
  key: '5,0', x: 5, y: 0, anchor: 'FLOOR', mirror: 1, reacts: { strength: 1, radius: 3 }, ...extra,
});
const run = (system: DoodadReactionSystem, doodad: ReactiveDoodad, bodies: DoodadBody[], seconds: number) => {
  const index = new DoodadBodyIndex(bodies);
  for (let t = 0; t < seconds; t += DT) system.update(DT, [doodad], index);
};

describe('the spring', () => {
  it('swings back and dies away by itself', () => {
    let spring = { angle: 0.5, velocity: 0 };
    let crossed = false;
    for (let t = 0; t < 5; t += DT) {
      spring = stepSpring(spring, DT);
      if (spring.angle < 0) crossed = true;
    }
    expect(crossed).toBe(true);
    expect(springAtRest(spring)).toBe(true);
  });

  it('never leans past its limit, and stays stable over a long frame', () => {
    const spring = stepSpring({ angle: 0, velocity: 0 }, 0.5, 1000);
    expect(Math.abs(spring.angle)).toBeLessThanOrEqual(REACTION_MAX_ANGLE);
    expect(Number.isFinite(spring.velocity)).toBe(true);
  });
});

describe('which way a body pushes', () => {
  it('floor and air doodads lean the way the body goes, ceiling doodads swing the other way, wall doodads are pushed up or down', () => {
    const right = body(0, 4);
    expect(pushDirection('FLOOR', right)).toBe(1);
    expect(pushDirection('AIR', right)).toBe(1);
    expect(pushDirection('CEILING', right)).toBe(-1);
    expect(pushDirection('WALL', body(0, 0, { vy: 3 }))).toBe(1);
    expect(pushDirection('WALL', body(0, 0, { vy: 3 }), -1)).toBe(-1);
    expect(pushDirection('FLOOR', body(0, -4))).toBe(-1);
  });
});

describe('reactionDrive', () => {
  const reacts = { strength: 1, radius: 3 };
  it('is stronger the closer and the faster the body is', () => {
    const near = reactionDrive(reacts, 'FLOOR', 1, 5, 0, body(5.5, 5));
    const far = reactionDrive(reacts, 'FLOOR', 1, 5, 0, body(7, 5));
    const slow = reactionDrive(reacts, 'FLOOR', 1, 5, 0, body(5.5, 1));
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(slow);
  });
  it('is zero for a body out of reach or standing still', () => {
    expect(reactionDrive(reacts, 'FLOOR', 1, 5, 0, body(20, 5))).toBe(0);
    expect(reactionDrive(reacts, 'FLOOR', 1, 5, 0, body(5.2, REACTION_MIN_SPEED / 2))).toBe(0);
  });
  it('scales with the doodad strength', () => {
    const weak = reactionDrive({ strength: 0.25, radius: 3 }, 'FLOOR', 1, 5, 0, body(5.5, 5));
    const strong = reactionDrive({ strength: 1, radius: 3 }, 'FLOOR', 1, 5, 0, body(5.5, 5));
    expect(strong / weak).toBeCloseTo(4);
  });
});

describe('DoodadReactionSystem', () => {
  it('leans the way a body walks past, then settles and is forgotten', () => {
    const system = new DoodadReactionSystem();
    const doodad = mushroom();
    const index = new DoodadBodyIndex([body(4.5, 4)]);
    for (let i = 0; i < 20; i++) system.update(DT, [doodad], index);
    expect(system.angleOf(doodad.key)).toBeGreaterThan(0.05);
    expect(system.activeCount).toBe(1);
    run(system, doodad, [], 6);
    expect(system.angleOf(doodad.key)).toBe(0);
    expect(system.activeCount).toBe(0);
  });

  it('leans the other way for a body walking left, and mobs and remote players count like the player', () => {
    const system = new DoodadReactionSystem();
    run(system, mushroom(), [body(5.5, -4, { id: 'mob-1' })], 0.3);
    expect(system.angleOf('5,0')).toBeLessThan(-0.05);
  });

  it('ignores a body standing still next to it and one far away, and tracks nothing', () => {
    const system = new DoodadReactionSystem();
    run(system, mushroom(), [body(5.5, 0), body(50, 5, { id: 'far' })], 1);
    expect(system.angleOf('5,0')).toBe(0);
    expect(system.activeCount).toBe(0);
  });

  it('puffs once when a moving body comes into reach, not every frame, and again after the cooldown', () => {
    const system = new DoodadReactionSystem();
    const doodad = mushroom({ reacts: { strength: 1, radius: 3, puffEffectId: 'spores' } });
    const index = new DoodadBodyIndex([body(5.5, 3)]);
    const puffs = Array.from({ length: 30 }, () => system.update(DT, [doodad], index)).flat();
    expect(puffs).toEqual([{ key: '5,0', x: 5, y: 0, effectId: 'spores' }]);
    // The body leaves and returns before the cooldown ends: no second puff; after it: one
    const away = new DoodadBodyIndex([]);
    system.update(DT, [doodad], away);
    expect(system.update(DT, [doodad], index)).toEqual([]);
    for (let t = 0; t < REACTION_PUFF_COOLDOWN; t += DT) system.update(DT, [doodad], away);
    expect(system.update(DT, [doodad], index)).toHaveLength(1);
  });

  it('does not puff for a doodad with no puff effect', () => {
    const system = new DoodadReactionSystem();
    const index = new DoodadBodyIndex([body(5.5, 3)]);
    expect(system.update(DT, [mushroom()], index)).toEqual([]);
  });

  it('drops a doodad that is no longer offered (scrolled away)', () => {
    const system = new DoodadReactionSystem();
    const index = new DoodadBodyIndex([body(5.5, 4)]);
    system.update(DT, [mushroom()], index);
    expect(system.activeCount).toBe(1);
    system.update(DT, [], index);
    expect(system.activeCount).toBe(0);
  });

  it('speed helper', () => {
    expect(bodySpeed(body(0, 3, { vy: 4 }))).toBe(5);
  });
});
