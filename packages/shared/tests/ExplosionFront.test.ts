import { describe, it, expect } from 'vitest';
import { ExplosionFront, validateExplosion, validateFlammability, type ExplosionSettings, type ExplosionWorld } from '../src/index';

const HYDROGEN: ExplosionSettings = { blastRadius: 3, damage: 40, frontSpeed: 3 };

/** A row or block of gas drawn as digits: each digit is a tenth of a concentration ('.' is clear air). */
function makeWorld(rows: string[], explosion: ExplosionSettings = HYDROGEN) {
  const level = rows.map((r) => r.split('').map((c) => (c === '.' ? 0 : Number(c) / 10)));
  const consumed: string[] = [];
  const world: ExplosionWorld = {
    explosiveAt: (x, y) => {
      const c = level[y]?.[x] ?? 0;
      return c > 0 ? { gasId: 1, concentration: c, explosion } : null;
    },
    consume: (x, y) => {
      level[y][x] = 0;
      consumed.push(`${x},${y}`);
    },
  };
  return { world, level, consumed };
}

const keys = (cells: Array<{ x: number; y: number }>) => cells.map((c) => `${c.x},${c.y}`);

describe('ExplosionFront', () => {
  it('goes off at the cell that was lit and nowhere else when nothing is connected', () => {
    const { world } = makeWorld(['..9..']);
    const front = new ExplosionFront(world);
    expect(front.ignite(2, 0)).toBe(true);
    const cells = front.step();
    expect(keys(cells)).toEqual(['2,0']);
    expect(front.pendingCount).toBe(0);
    expect(front.step()).toEqual([]);
  });

  it('refuses to light clear air, or gas that is already lined up', () => {
    const { world } = makeWorld(['.9.']);
    const front = new ExplosionFront(world);
    expect(front.ignite(0, 0)).toBe(false);
    expect(front.ignite(5, 5)).toBe(false);
    expect(front.ignite(1, 0)).toBe(true);
    expect(front.ignite(1, 0)).toBe(false);
  });

  it('moves frontSpeed cells a step, so a long pocket is a wave that takes several steps to cross', () => {
    const { world } = makeWorld(['999999999999']);
    const front = new ExplosionFront(world);
    front.ignite(0, 0);
    const first = front.step();
    // Lit at cell 0, then 1, 2: three cells in the first step
    expect(keys(first)).toEqual(['0,0', '1,0', '2,0']);
    expect(keys(front.step())).toEqual(['3,0', '4,0', '5,0']);
    expect(front.pendingCount).toBeGreaterThan(0);
    front.step();
    expect(keys(front.step())).toEqual(['9,0', '10,0', '11,0']);
    expect(front.pendingCount).toBe(0);
  });

  it('spreads both ways from a cell in the middle, and in all four directions', () => {
    const { world } = makeWorld(['99999', '99999', '99999']);
    const front = new ExplosionFront(world);
    front.ignite(2, 1);
    const cells = front.step();
    expect(keys(cells.slice(0, 1))).toEqual(['2,1']);
    // Second wave is the four neighbours, in row then column order
    expect(keys(cells.slice(1, 5))).toEqual(['2,0', '1,1', '3,1', '2,2']);
    // The third wave is the six cells beyond them; the four corners go in the next step
    expect(cells).toHaveLength(11);
    expect(front.step()).toHaveLength(4);
    expect(front.pendingCount).toBe(0);
  });

  it('every cell detonates once and its gas is consumed', () => {
    const { world, consumed, level } = makeWorld(['99999', '99999']);
    const front = new ExplosionFront(world);
    front.ignite(0, 0);
    const all: string[] = [];
    for (let n = 0; n < 10; n++) all.push(...keys(front.step()));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(10);
    expect(consumed.sort()).toEqual([...all].sort());
    expect(level.flat().every((c) => c === 0)).toBe(true);
  });

  it('does not cross a gap, so a disconnected pocket is left alone', () => {
    const { world, level } = makeWorld(['999.999']);
    const front = new ExplosionFront(world);
    front.ignite(0, 0);
    for (let n = 0; n < 5; n++) front.step();
    expect(level[0].slice(0, 3)).toEqual([0, 0, 0]);
    expect(level[0].slice(4)).toEqual([0.9, 0.9, 0.9]);
  });

  it('does not burn gas thinner than the minimum, and the front cannot cross it', () => {
    const thin = makeWorld(['99', '..', '99'], { ...HYDROGEN, minConcentration: 0.4 });
    const front = new ExplosionFront(thin.world);
    expect(front.ignite(0, 0)).toBe(true);
    for (let n = 0; n < 4; n++) front.step();
    expect(thin.level[2]).toEqual([0.9, 0.9]);
    // Wisps of gas under the minimum cannot even be lit
    const wisp = makeWorld(['3'], { ...HYDROGEN, minConcentration: 0.4 });
    expect(new ExplosionFront(wisp.world).ignite(0, 0)).toBe(false);
    // ...and a thin cell in the path stops the front dead
    const bridge = makeWorld(['9939999'], { ...HYDROGEN, minConcentration: 0.4 });
    const f2 = new ExplosionFront(bridge.world);
    f2.ignite(0, 0);
    for (let n = 0; n < 5; n++) f2.step();
    expect(bridge.level[0]).toEqual([0, 0, 0.3, 0.9, 0.9, 0.9, 0.9]);
  });

  it('uses the default minimum when the settings give none', () => {
    const wisp = makeWorld(['1']);
    expect(new ExplosionFront(wisp.world).ignite(0, 0)).toBe(true);
    const fainter: ExplosionWorld = { explosiveAt: () => ({ gasId: 1, concentration: 0.05, explosion: HYDROGEN }), consume: () => {} };
    expect(new ExplosionFront(fainter).ignite(0, 0)).toBe(false);
  });

  it('gas that was blown out or thinned between being lined up and going off does not explode', () => {
    const { world, level } = makeWorld(['999']);
    const front = new ExplosionFront(world);
    front.ignite(0, 0);
    front.ignite(1, 0);
    level[0][1] = 0;
    const cells = front.step();
    expect(keys(cells)).toContain('0,0');
    expect(keys(cells)).not.toContain('1,0');
  });

  it('moves at the speed of the fastest gas in the front', () => {
    const slow = makeWorld(['99999999'], { ...HYDROGEN, frontSpeed: 1 });
    const fast = makeWorld(['99999999'], { ...HYDROGEN, frontSpeed: 4 });
    const a = new ExplosionFront(slow.world);
    const b = new ExplosionFront(fast.world);
    a.ignite(0, 0);
    b.ignite(0, 0);
    expect(a.step()).toHaveLength(1);
    expect(b.step()).toHaveLength(4);
  });

  it('is deterministic: the same gas gives the same order of cells', () => {
    const run = () => {
      const { world } = makeWorld(['99999', '99.99', '99999']);
      const front = new ExplosionFront(world);
      front.ignite(2, 0);
      const out: string[] = [];
      for (let n = 0; n < 6; n++) out.push(...keys(front.step()));
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe('explosion settings validation', () => {
  const ok = { blastRadius: 3, damage: 40, frontSpeed: 3 };
  const burns = { ignitionChance: 1, spreadChance: 1, burnDuration: 1, heat: 1 };

  it('accepts none, a full set, and a set with a minimum concentration', () => {
    expect(validateExplosion(null)).toEqual([]);
    expect(validateExplosion(undefined)).toEqual([]);
    expect(validateExplosion(ok)).toEqual([]);
    expect(validateExplosion({ ...ok, minConcentration: 0.2 })).toEqual([]);
    expect(validateFlammability({ ...burns, explosion: ok })).toEqual([]);
  });

  it.each([
    ['blastRadius', { blastRadius: 0 }],
    ['blastRadius', { blastRadius: -2 }],
    ['damage', { damage: 0 }],
    ['frontSpeed', { frontSpeed: 0 }],
    ['frontSpeed', { frontSpeed: 2.5 }],
    ['minConcentration', { minConcentration: 0 }],
    ['minConcentration', { minConcentration: 1.5 }],
  ])('rejects a bad %s', (field, patch) => {
    const errors = validateExplosion({ ...ok, ...patch });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(field);
  });

  it('is checked as part of flammability, and must be an object', () => {
    expect(validateFlammability({ ...burns, explosion: { ...ok, damage: 0 } })[0]).toContain('explosion.damage');
    expect(validateExplosion('boom')).toEqual(['flammability.explosion must be an object or null']);
    expect(validateExplosion([])).toEqual(['flammability.explosion must be an object or null']);
  });
});
