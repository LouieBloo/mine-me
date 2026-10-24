import { describe, it, expect } from 'vitest';
import type { DoodadWander } from '../../types/doodad';
import {
  DOODAD_WANDER_BEHAVIOURS, WANDER_FLEE_SPEED_FACTOR, WANDER_MAX_DT, canStandAt, clampPath, createWander, stepWander, wanderOffset, wanderSeed,
  type WanderState, type WanderSubject, type WanderTerrain,
} from './doodadWander';

const DT = 1 / 30;

/** A world from rows of text: '#' is solid, anything else open. Outside the rows is solid. */
const world = (rows: string[]): WanderTerrain => ({
  isSolid: (x, y) => (rows[y]?.[x] ?? '#') === '#',
});

// A cave 21 wide: floor at row 5, ceiling at row 0, open between
const CAVE = [
  '#####################',
  '#                   #',
  '#                   #',
  '#                   #',
  '#                   #',
  '#                   #',
  '#####################',
];
const cave = world(CAVE);
const floorBug: WanderSubject = { anchor: 'FLOOR', x: 10, y: 5, width: 1, height: 1, flip: false };
const ceilingBug: WanderSubject = { anchor: 'CEILING', x: 10, y: 1, width: 1, height: 1, flip: false };
const airBug: WanderSubject = { anchor: 'AIR', x: 10, y: 3, width: 1, height: 1, flip: false };
const crawl: DoodadWander = { mode: 'CRAWL', radius: 4, speed: 1.5, pauseMs: 400 };
const flutter: DoodadWander = { mode: 'FLUTTER', radius: 3, speed: 2, pauseMs: 200 };
const hop: DoodadWander = { mode: 'HOP', radius: 5, speed: 4, pauseMs: 500 };

const simulate = (wander: DoodadWander, subject: WanderSubject, terrain: WanderTerrain, seconds: number, seed = wanderSeed(subject.x, subject.y), spook?: (t: number) => { x: number; y: number } | null) => {
  const state = createWander(seed);
  const trail: Array<{ x: number; y: number; phase: string }> = [];
  for (let t = 0; t < seconds; t += DT) {
    stepWander(state, wander, subject, terrain, DT, spook?.(t) ?? null);
    const o = wanderOffset(state);
    trail.push({ x: o.x, y: o.y, phase: state.phase });
  }
  return { state, trail };
};

describe('standing places', () => {
  const crawlBehaviour = DOODAD_WANDER_BEHAVIOURS.CRAWL;
  it('a floor crawler needs open air for its body and solid ground under every cell of its footprint', () => {
    expect(canStandAt(floorBug, crawlBehaviour, cave, 0, 0)).toBe(true);
    expect(canStandAt(floorBug, crawlBehaviour, cave, 0, -1)).toBe(false); // floating
    expect(canStandAt(floorBug, crawlBehaviour, cave, 0, 1)).toBe(false); // inside the floor
    const wide = { ...floorBug, width: 2 };
    const ledge = world(['#     ', '#     ', '#  ## ', '######']);
    expect(canStandAt({ ...wide, x: 1, y: 1 }, crawlBehaviour, ledge, 0, 0)).toBe(false); // second cell has air under it
    expect(canStandAt({ ...wide, x: 3, y: 1 }, crawlBehaviour, ledge, 0, 0)).toBe(true);
  });
  it('a ceiling and a wall crawler cling to their side', () => {
    expect(canStandAt(ceilingBug, crawlBehaviour, cave, 0, 0)).toBe(true);
    expect(canStandAt(ceilingBug, crawlBehaviour, cave, 0, 1)).toBe(false);
    const wallBug: WanderSubject = { anchor: 'WALL', x: 1, y: 2, width: 1, height: 1, flip: false };
    expect(canStandAt(wallBug, crawlBehaviour, cave, 0, 1)).toBe(true);
    expect(canStandAt(wallBug, crawlBehaviour, cave, 3, 0)).toBe(false);
    expect(canStandAt({ ...wallBug, x: 19, flip: true }, crawlBehaviour, cave, 0, 1)).toBe(true);
  });
  it('a path stops at the last good spot', () => {
    const wall = world(['#########', '#       #', '#   #   #', '#########']);
    const bug: WanderSubject = { anchor: 'AIR', x: 1, y: 1, width: 1, height: 1, flip: false };
    const end = clampPath(bug, DOODAD_WANDER_BEHAVIOURS.FLUTTER, wall, 0, 0, 6, 0);
    expect(end.x).toBeCloseTo(6);
    const blocked = clampPath({ ...bug, y: 2, x: 1 }, DOODAD_WANDER_BEHAVIOURS.FLUTTER, wall, 0, 0, 6, 0);
    expect(blocked.x).toBeLessThan(3);
  });
});

describe('crawling', () => {
  it('stays on its surface and within the radius, and does move', () => {
    const { trail } = simulate(crawl, floorBug, cave, 60);
    expect(trail.every((p) => p.y === 0)).toBe(true);
    expect(Math.max(...trail.map((p) => Math.abs(p.x)))).toBeLessThanOrEqual(crawl.radius + 1e-6);
    expect(Math.max(...trail.map((p) => Math.abs(p.x)))).toBeGreaterThan(1);
  });

  it('never walks off a ledge or into a block', () => {
    // The floor under the bug ends at column 6: past it there is a drop
    const t = world(['##########', '#        #', '#######  #', '##########']);
    const bug: WanderSubject = { anchor: 'FLOOR', x: 3, y: 1, width: 1, height: 1, flip: false };
    for (const seed of [1, 2, 3, 4, 5]) {
      const { trail } = simulate({ ...crawl, radius: 6 }, bug, t, 90, seed);
      for (const p of trail) expect(canStandAt(bug, DOODAD_WANDER_BEHAVIOURS.CRAWL, t, p.x, p.y)).toBe(true);
    }
  });

  it('a wall crawler walks up and down its wall', () => {
    const wallBug: WanderSubject = { anchor: 'WALL', x: 1, y: 3, width: 1, height: 1, flip: false };
    const { trail } = simulate({ ...crawl, radius: 2 }, wallBug, cave, 60);
    expect(trail.every((p) => p.x === 0)).toBe(true);
    expect(Math.max(...trail.map((p) => Math.abs(p.y)))).toBeGreaterThan(0.5);
  });

  it('rests between moves for about its pause', () => {
    const { trail } = simulate(crawl, floorBug, cave, 40);
    expect(trail.some((p) => p.phase === 'rest')).toBe(true);
    expect(trail.some((p) => p.phase === 'go')).toBe(true);
  });
});

describe('fluttering', () => {
  it('drifts in two directions, within the radius, out of solid cells', () => {
    const { trail } = simulate(flutter, airBug, cave, 90);
    for (const p of trail) {
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(flutter.radius + 1e-6);
      expect(cave.isSolid(Math.round(10 + p.x), Math.round(3 + p.y))).toBe(false);
    }
    expect(trail.some((p) => Math.abs(p.y) > 0.3)).toBe(true);
    expect(trail.some((p) => Math.abs(p.x) > 0.3)).toBe(true);
  });

  it('keeps clear of a block in its way', () => {
    const t = world(['#########', '#       #', '#   #   #', '#       #', '#########']);
    const bug: WanderSubject = { anchor: 'AIR', x: 2, y: 2, width: 1, height: 1, flip: false };
    for (const seed of [3, 9, 27]) {
      const { trail } = simulate({ ...flutter, radius: 5 }, bug, t, 60, seed);
      for (const p of trail) expect(t.isSolid(Math.round(2 + p.x), Math.round(2 + p.y))).toBe(false);
    }
  });
});

describe('hopping', () => {
  it('lifts off the surface in short bounces and lands back on it', () => {
    const state = createWander(7);
    let lifted = 0;
    let moved = 0;
    for (let t = 0; t < 60; t += DT) {
      stepWander(state, hop, floorBug, cave, DT);
      const o = wanderOffset(state);
      if (o.y < -0.05) lifted++;
      if (Math.abs(o.x) > 0.5) moved++;
      expect(o.y).toBeLessThanOrEqual(1e-9); // a floor hopper only ever goes up
    }
    expect(lifted).toBeGreaterThan(0);
    expect(moved).toBeGreaterThan(0);
    expect(DOODAD_WANDER_BEHAVIOURS.HOP.hops).toBe(true);
  });

  it('a ceiling hopper lifts downward and a wall hopper away from its wall', () => {
    expect(DOODAD_WANDER_BEHAVIOURS.HOP.lift(ceilingBug)).toEqual({ x: 0, y: 1 });
    expect(DOODAD_WANDER_BEHAVIOURS.HOP.lift({ ...floorBug, anchor: 'WALL', flip: false })).toEqual({ x: 1, y: 0 });
    expect(DOODAD_WANDER_BEHAVIOURS.HOP.lift({ ...floorBug, anchor: 'WALL', flip: true })).toEqual({ x: -1, y: 0 });
  });

  it('breaks one long trip into hops no longer than a hop', () => {
    const state = createWander(11);
    let last = wanderOffset(state).x;
    let biggest = 0;
    for (let t = 0; t < 80; t += DT) {
      stepWander(state, hop, floorBug, cave, DT);
      const x = state.ox;
      biggest = Math.max(biggest, Math.abs(x - last));
      last = x;
    }
    // A frame moves at most speed * frame = 4 / 30 cells
    expect(biggest).toBeLessThan(0.5);
  });
});

describe('determinism', () => {
  it('the same seed gives the same path, a different one a different path', () => {
    const a = simulate(crawl, floorBug, cave, 30, 42).trail;
    const b = simulate(crawl, floorBug, cave, 30, 42).trail;
    const c = simulate(crawl, floorBug, cave, 30, 43).trail;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('the seed comes from the cell', () => {
    expect(wanderSeed(3, 4)).toBe(wanderSeed(3, 4));
    expect(wanderSeed(3, 4)).not.toBe(wanderSeed(4, 3));
  });
  it('a long frame counts as a short one', () => {
    const a = createWander(5);
    const b = createWander(5);
    a.restLeft = 0;
    b.restLeft = 0;
    stepWander(a, crawl, floorBug, cave, 100);
    stepWander(b, crawl, floorBug, cave, WANDER_MAX_DT);
    expect(a).toEqual(b);
  });
});

describe('being scared', () => {
  const scare = { x: 6, y: 5 };
  it('runs away from the body, faster than it wanders', () => {
    const state = createWander(3);
    state.restLeft = 5;
    stepWander(state, crawl, floorBug, cave, DT, scare);
    expect(state.phase).toBe('flee');
    const start = state.ox;
    for (let i = 0; i < 12; i++) stepWander(state, crawl, floorBug, cave, DT, scare);
    // Right of the body (10 > 6), so it runs right, at the flee speed
    expect(state.ox).toBeGreaterThan(start);
    const speed = (state.ox - start) / (12 * DT);
    expect(speed).toBeGreaterThan(crawl.speed * 1.5);
    expect(speed).toBeLessThanOrEqual(crawl.speed * WANDER_FLEE_SPEED_FACTOR + 1e-6);
  });

  it('runs the other way when the body is on the other side', () => {
    const state = createWander(3);
    stepWander(state, crawl, floorBug, cave, DT, { x: 14, y: 5 });
    for (let i = 0; i < 12; i++) stepWander(state, crawl, floorBug, cave, DT, { x: 14, y: 5 });
    expect(state.ox).toBeLessThan(0);
  });

  it('scatters, waits, goes home and carries on wandering', () => {
    let { state, trail } = simulate(crawl, floorBug, cave, 4, 9, (t) => (t < 0.5 ? scare : null));
    const farthest = Math.max(...trail.map((p) => Math.abs(p.x)));
    expect(farthest).toBeGreaterThan(1.5);
    expect(trail.some((p) => p.phase === 'flee')).toBe(true);
    // ...later it is back at its spot at some point, and moving about again
    ({ state, trail } = simulate(crawl, floorBug, cave, 40, 9, (t) => (t < 0.5 ? scare : null)));
    const afterScare = trail.slice(Math.round(3 / DT));
    expect(afterScare.some((p) => Math.abs(p.x) < 0.05)).toBe(true);
    expect(afterScare.some((p) => p.phase === 'go' && Math.abs(p.x) > 0.5)).toBe(true);
    expect(state.phase).not.toBe('flee');
  });

  it('flees only where it can: cornered, it stays put', () => {
    const tight = world(['###', '# #', '###']);
    const bug: WanderSubject = { anchor: 'AIR', x: 1, y: 1, width: 1, height: 1, flip: false };
    const state = createWander(1);
    stepWander(state, flutter, bug, tight, DT, { x: 0, y: 1 });
    expect(state.phase).not.toBe('flee');
    expect(wanderOffset(state)).toEqual({ x: 0, y: 0 });
  });

  it('a hopper scared mid-trip flees without waiting between hops', () => {
    const state = createWander(2);
    state.restLeft = 5;
    stepWander(state, hop, floorBug, cave, DT, scare);
    expect(state.phase).toBe('flee');
    for (let i = 0; i < 20; i++) stepWander(state, hop, floorBug, cave, DT, scare);
    expect(state.ox).toBeGreaterThan(1);
  });
});

describe('modes', () => {
  it('has a behaviour for every mode, with a description', () => {
    for (const mode of ['CRAWL', 'FLUTTER', 'HOP'] as const) {
      expect(DOODAD_WANDER_BEHAVIOURS[mode].mode).toBe(mode);
      expect(DOODAD_WANDER_BEHAVIOURS[mode].description.length).toBeGreaterThan(10);
    }
  });
  it('faces the way it goes', () => {
    const state: WanderState = createWander(5);
    state.restLeft = 0;
    for (let i = 0; i < 90; i++) {
      stepWander(state, crawl, floorBug, cave, DT);
      if (state.phase === 'go' && Math.abs(state.tx - state.ox) > 0.1) expect(state.facing).toBe(state.tx > state.ox ? 1 : -1);
    }
  });
});
