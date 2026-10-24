import type { DoodadAnchor, DoodadWander, DoodadWanderMode } from '../../types/doodad';

/**
 * Wandering doodads (ticket 106): bugs that crawl along their surface, flutter about in the air or hop. Purely cosmetic and
 * client-only, so nothing is synced; every client that sees the same cells and bodies sees (nearly) the same bug because the
 * random numbers come from a seed made from the doodad's cell.
 *
 * Everything here is pure: `stepWander` moves a `WanderState` by one frame given the terrain and, optionally, the place
 * a body is coming from. A mode is one entry in `DOODAD_WANDER_BEHAVIOURS` (like the motion presets of ticket 103), so adding
 * one needs no change anywhere else. Distances are in cells and the offsets are from the doodad's placed spot.
 */

/** Answers whether a cell blocks the way. Unknown (not yet revealed) cells should count as solid. */
export interface WanderTerrain {
  isSolid(x: number, y: number): boolean;
}

/** The doodad that wanders: its footprint (top-left cell and size), its anchor and which side the wall is on. */
export interface WanderSubject {
  anchor: DoodadAnchor;
  x: number;
  y: number;
  width: number;
  height: number;
  /** WALL only: the wall is on the right of the footprint. */
  flip: boolean;
}

export type WanderPhase = 'rest' | 'go' | 'flee';

export interface WanderState {
  /** How far it is from its placed spot, in cells (the ground track: a hop's lift is separate). */
  ox: number;
  oy: number;
  /** A hop's lift off the surface, in cells. */
  lx: number;
  ly: number;
  /** The way it is heading along x: 1 right, -1 left. */
  facing: 1 | -1;
  phase: WanderPhase;
  /** Where it is going. */
  tx: number;
  ty: number;
  /** Seconds left of the rest. */
  restLeft: number;
  /** Hop only: seconds left of the breath between two hops of the same trip. */
  gapLeft: number;
  /** After a scare it goes back to its spot before it wanders again. */
  goHome: boolean;
  /** Hop only: the leg being flown (from where, how far through). */
  hopFromX: number;
  hopFromY: number;
  hopToX: number;
  hopToY: number;
  hopProgress: number;
  /** Seed of the random numbers (changes as they are drawn). */
  rng: number;
}

/** How much faster a scared bug runs. */
export const WANDER_FLEE_SPEED_FACTOR = 2.5;
/** Seconds a scared bug waits where it ended up before it goes home. */
export const WANDER_RETURN_DELAY = 1.5;
/** How far, in cells, one hop goes and how high it lifts. */
export const WANDER_HOP_LENGTH = 1.5;
export const WANDER_HOP_HEIGHT = 0.7;
/** The shortest pause between two hops of the same trip. */
export const WANDER_HOP_GAP = 0.12;
/** A frame longer than this counts as this long (a tab coming back to life must not teleport a bug). */
export const WANDER_MAX_DT = 0.1;
/** How near, in cells, it has to get to count as arrived. */
const ARRIVED = 0.02;
/** A scared bug only runs if it can get at least this much (cells) further from the body. */
const FLEE_MIN_GAIN = 1;
/** Distance between the points tested along a path. */
const PATH_STEP = 0.05;

/** A fixed seed for a doodad from its cell, so a bug wanders the same way each time it comes on screen. */
export function wanderSeed(x: number, y: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ 0x0b06b06) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Mulberry32: the next number in [0, 1) from a state, and the state after it. */
function nextRandom(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
}

/** Draws a random number from the state's own stream. */
function random(state: WanderState): number {
  const next = nextRandom(state.rng);
  state.rng = next.state;
  return next.value;
}

export function createWander(seed: number): WanderState {
  return {
    ox: 0, oy: 0, lx: 0, ly: 0, facing: seed % 2 === 0 ? 1 : -1, phase: 'rest', tx: 0, ty: 0,
    // Start resting for a varied moment so a field of bugs does not set off together
    restLeft: 0.2 + nextRandom(seed >>> 0).value * 1.5, gapLeft: 0, goHome: false,
    hopFromX: 0, hopFromY: 0, hopToX: 0, hopToY: 0, hopProgress: 0, rng: seed >>> 0,
  };
}

/** Where the doodad is drawn relative to its placed spot, in cells (the ground track plus a hop's lift). */
export const wanderOffset = (state: WanderState): { x: number; y: number } => ({ x: state.ox + state.lx, y: state.oy + state.ly });

/** What a mode needs to know to move a doodad. */
export interface WanderBehaviour {
  mode: DoodadWanderMode;
  label: string;
  description: string;
  /** Whether it moves in bursts (hops) rather than gliding. */
  hops: boolean;
  /** Whether it must stay on the surface it is anchored to (otherwise it only has to stay out of solid cells). */
  clings: boolean;
  /** The directions it can go: along the surface for a clinger, any way for a flutterer. */
  directions(subject: WanderSubject): ReadonlyArray<{ x: number; y: number }>;
  /** Which way a hop lifts off the surface. */
  lift(subject: WanderSubject): { x: number; y: number };
}

const ALONG_X = [{ x: 1, y: 0 }, { x: -1, y: 0 }];
const ALONG_Y = [{ x: 0, y: 1 }, { x: 0, y: -1 }];
const ANY_WAY = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 0.707, y: 0.707 }, { x: -0.707, y: 0.707 }, { x: 0.707, y: -0.707 }, { x: -0.707, y: -0.707 }];

const alongSurface = (subject: WanderSubject) => (subject.anchor === 'WALL' ? ALONG_Y : ALONG_X);
const liftOff = (subject: WanderSubject): { x: number; y: number } => {
  switch (subject.anchor) {
    case 'CEILING':
      return { x: 0, y: 1 };
    case 'WALL':
      return { x: subject.flip ? -1 : 1, y: 0 };
    default:
      return { x: 0, y: -1 };
  }
};

export const DOODAD_WANDER_BEHAVIOURS: Readonly<Record<DoodadWanderMode, WanderBehaviour>> = {
  CRAWL: {
    mode: 'CRAWL',
    label: 'Crawl',
    description: 'Walks along the surface it is stuck to (a beetle on the floor, a snail on a wall) and never leaves it.',
    hops: false,
    clings: true,
    directions: alongSurface,
    lift: liftOff,
  },
  FLUTTER: {
    mode: 'FLUTTER',
    label: 'Flutter',
    description: 'Drifts about in the open air around its spot (fireflies, dust), keeping out of solid blocks.',
    hops: false,
    clings: false,
    directions: () => ANY_WAY,
    lift: liftOff,
  },
  HOP: {
    mode: 'HOP',
    label: 'Hop',
    description: 'Hops along its surface in short bounces, resting between trips (a cricket, a frog).',
    hops: true,
    clings: true,
    directions: alongSurface,
    lift: liftOff,
  },
};

const behaviourOf = (wander: DoodadWander): WanderBehaviour => DOODAD_WANDER_BEHAVIOURS[wander.mode];

/** Whether the doodad's footprint can stand at an offset: clear of solid cells and, for a clinger, still against its surface. */
export function canStandAt(subject: WanderSubject, behaviour: WanderBehaviour, terrain: WanderTerrain, ox: number, oy: number): boolean {
  const x0 = Math.round(subject.x + ox);
  const y0 = Math.round(subject.y + oy);
  for (let dy = 0; dy < subject.height; dy++) for (let dx = 0; dx < subject.width; dx++) if (terrain.isSolid(x0 + dx, y0 + dy)) return false;
  if (!behaviour.clings) return true;
  switch (subject.anchor) {
    case 'FLOOR':
      for (let dx = 0; dx < subject.width; dx++) if (!terrain.isSolid(x0 + dx, y0 + subject.height)) return false;
      return true;
    case 'CEILING':
      for (let dx = 0; dx < subject.width; dx++) if (!terrain.isSolid(x0 + dx, y0 - 1)) return false;
      return true;
    case 'WALL': {
      const wallX = subject.flip ? x0 + subject.width : x0 - 1;
      for (let dy = 0; dy < subject.height; dy++) if (!terrain.isSolid(wallX, y0 + dy)) return false;
      return true;
    }
    default:
      return true;
  }
}

/** The furthest point along a straight path from (fx, fy) to (tx, ty) that can still be stood on, stopping at the first one that cannot. */
export function clampPath(subject: WanderSubject, behaviour: WanderBehaviour, terrain: WanderTerrain, fx: number, fy: number, tx: number, ty: number): { x: number; y: number } {
  const length = Math.hypot(tx - fx, ty - fy);
  if (length < 1e-6) return { x: fx, y: fy };
  const steps = Math.ceil(length / PATH_STEP);
  let last = { x: fx, y: fy };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = fx + (tx - fx) * t;
    const y = fy + (ty - fy) * t;
    if (!canStandAt(subject, behaviour, terrain, x, y)) break;
    last = { x, y };
  }
  return last;
}

/** Picks somewhere new to go: a random direction and distance, cut short by anything in the way and kept inside the radius. */
function pickTarget(state: WanderState, wander: DoodadWander, subject: WanderSubject, terrain: WanderTerrain): { x: number; y: number } | null {
  const behaviour = behaviourOf(wander);
  const directions = behaviour.directions(subject);
  const dir = directions[Math.floor(random(state) * directions.length) % directions.length];
  const distance = (0.4 + random(state) * 0.6) * wander.radius * (behaviour.clings ? 1 : 0.8);
  let x = state.ox + dir.x * distance;
  let y = state.oy + dir.y * distance;
  // Keep inside the radius of the placed spot
  const far = Math.hypot(x, y);
  if (far > wander.radius) {
    x = (x / far) * wander.radius;
    y = (y / far) * wander.radius;
  }
  const end = clampPath(subject, behaviour, terrain, state.ox, state.oy, x, y);
  return Math.hypot(end.x - state.ox, end.y - state.oy) < 0.25 ? null : end;
}

/** Picks the place to run to when scared: of every direction it can go, the one that ends furthest from where the scare came from. */
function pickFleeTarget(state: WanderState, wander: DoodadWander, subject: WanderSubject, terrain: WanderTerrain, from: { x: number; y: number }): { x: number; y: number } | null {
  const behaviour = behaviourOf(wander);
  let best: { x: number; y: number } | null = null;
  let bestDistance = Math.hypot(subject.x + state.ox - from.x, subject.y + state.oy - from.y);
  for (const dir of behaviour.directions(subject)) {
    let x = state.ox + dir.x * wander.radius * 2;
    let y = state.oy + dir.y * wander.radius * 2;
    const far = Math.hypot(x, y);
    if (far > wander.radius) {
      x = (x / far) * wander.radius;
      y = (y / far) * wander.radius;
    }
    const end = clampPath(subject, behaviour, terrain, state.ox, state.oy, x, y);
    const d = Math.hypot(subject.x + end.x - from.x, subject.y + end.y - from.y);
    if (d > bestDistance + FLEE_MIN_GAIN) {
      bestDistance = d;
      best = end;
    }
  }
  return best;
}

function rest(state: WanderState, wander: DoodadWander, scale = 1): void {
  state.phase = 'rest';
  state.lx = 0;
  state.ly = 0;
  state.restLeft = Math.max(0, (wander.pauseMs / 1000) * (0.6 + random(state) * 0.8)) * scale;
}

function startLeg(state: WanderState, wander: DoodadWander): void {
  const behaviour = behaviourOf(wander);
  const dx = state.tx - state.ox;
  const dy = state.ty - state.oy;
  const length = Math.hypot(dx, dy);
  const leg = behaviour.hops ? Math.min(length, WANDER_HOP_LENGTH) : length;
  state.hopFromX = state.ox;
  state.hopFromY = state.oy;
  state.hopToX = state.ox + (dx / length) * leg;
  state.hopToY = state.oy + (dy / length) * leg;
  state.hopProgress = 0;
  if (Math.abs(dx) > 0.01) state.facing = dx > 0 ? 1 : -1;
}

/**
 * Moves a wandering doodad on by `dt` seconds. `spookFrom` is where a body that frightens it is (cells), or null.
 * A frightened bug drops what it was doing, runs away from the body as far as it can, waits a moment, then goes back to its
 * spot and carries on. A bug whose spot has become unfit (a block appeared on it) simply stays still.
 */
export function stepWander(state: WanderState, wander: DoodadWander, subject: WanderSubject, terrain: WanderTerrain, dt: number, spookFrom: { x: number; y: number } | null = null): void {
  const behaviour = behaviourOf(wander);
  let remaining = Math.min(Math.max(0, dt), WANDER_MAX_DT);
  if (remaining === 0) return;

  if (spookFrom && state.phase !== 'flee') {
    const target = pickFleeTarget(state, wander, subject, terrain, spookFrom);
    if (target) {
      state.phase = 'flee';
      state.tx = target.x;
      state.ty = target.y;
      state.goHome = true;
      state.gapLeft = 0;
      state.lx = 0;
      state.ly = 0;
      startLeg(state, wander);
    }
  }

  if (state.phase === 'rest') {
    state.restLeft -= remaining;
    if (state.restLeft > 0) return;
    remaining = -state.restLeft;
    state.restLeft = 0;
    if (state.goHome) {
      // Back towards its spot, as far as the way is open (a block that fell in the road ends the trip early)
      const home = clampPath(subject, behaviour, terrain, state.ox, state.oy, 0, 0);
      state.tx = home.x;
      state.ty = home.y;
      state.goHome = false;
      if (Math.hypot(state.tx - state.ox, state.ty - state.oy) < ARRIVED) {
        rest(state, wander);
        return;
      }
    } else {
      const target = pickTarget(state, wander, subject, terrain);
      if (!target) {
        rest(state, wander);
        return;
      }
      state.tx = target.x;
      state.ty = target.y;
    }
    state.phase = 'go';
    startLeg(state, wander);
  }

  const speed = Math.max(0.01, wander.speed) * (state.phase === 'flee' ? WANDER_FLEE_SPEED_FACTOR : 1);
  if (behaviour.hops) {
    if (state.gapLeft > 0) {
      state.gapLeft -= remaining;
      if (state.gapLeft > 0) return;
      remaining = -state.gapLeft;
      state.gapLeft = 0;
    }
    const length = Math.hypot(state.hopToX - state.hopFromX, state.hopToY - state.hopFromY);
    const duration = Math.max(0.15, length / speed);
    state.hopProgress = Math.min(1, state.hopProgress + remaining / duration);
    state.ox = state.hopFromX + (state.hopToX - state.hopFromX) * state.hopProgress;
    state.oy = state.hopFromY + (state.hopToY - state.hopFromY) * state.hopProgress;
    const lift = behaviour.lift(subject);
    const height = Math.sin(Math.PI * state.hopProgress) * WANDER_HOP_HEIGHT;
    state.lx = lift.x * height;
    state.ly = lift.y * height;
    if (state.hopProgress < 1) return;
    state.lx = 0;
    state.ly = 0;
    if (Math.hypot(state.tx - state.ox, state.ty - state.oy) >= ARRIVED) {
      // More hops to go on this trip: a breath (none when running), then the next
      startLeg(state, wander);
      state.gapLeft = state.phase === 'flee' ? 0 : WANDER_HOP_GAP;
      return;
    }
  } else {
    const dx = state.tx - state.ox;
    const dy = state.ty - state.oy;
    const distance = Math.hypot(dx, dy);
    const step = speed * remaining;
    if (Math.abs(dx) > 0.01) state.facing = dx > 0 ? 1 : -1;
    if (distance > step && distance > ARRIVED) {
      state.ox += (dx / distance) * step;
      state.oy += (dy / distance) * step;
      return;
    }
    state.ox = state.tx;
    state.oy = state.ty;
  }

  // The trip is over
  if (state.phase === 'flee') {
    state.phase = 'rest';
    state.restLeft = WANDER_RETURN_DELAY;
    state.goHome = true;
    return;
  }
  rest(state, wander);
}
