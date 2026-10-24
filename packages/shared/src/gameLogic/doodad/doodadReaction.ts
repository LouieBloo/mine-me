import type { DoodadAnchor, DoodadReacts } from '../../types/doodad';
import type { DoodadBody, DoodadBodyIndex } from './doodadBodies';

/**
 * Doodads that wiggle when a body walks past (ticket 104). Cosmetic and client-only: a damped spring turns the doodad about
 * its base, and a body moving through its reach pushes the spring. The spring is added to whatever the doodad's motion
 * preset does, and settles on its own, so a doodad nobody is near costs nothing.
 */

/** Slowest a body must move, in cells per second, to brush a doodad. A body standing still next to one leaves it alone. */
export const REACTION_MIN_SPEED = 0.5;
/** At this speed (cells per second) or more a body pushes with its full force. */
export const REACTION_FULL_SPEED = 5;
/** The spring's stiffness (1/s^2) and damping (1/s): about one swing a second, dying away in a couple of seconds. */
export const REACTION_STIFFNESS = 60;
export const REACTION_DAMPING = 3.6;
/** The push of a full-strength brush at full speed, right next to the doodad (radians per second squared). */
export const REACTION_DRIVE = 40;
/** The furthest a doodad leans, in radians. */
export const REACTION_MAX_ANGLE = 0.7;
/** Below this the spring is at rest and the doodad stops being tracked. */
const REST_ANGLE = 0.002;
const REST_VELOCITY = 0.02;
/** Seconds before a doodad puffs again after a puff. */
export const REACTION_PUFF_COOLDOWN = 1.5;

/** A damped spring on the doodad's angle. */
export interface DoodadSpring {
  angle: number;
  velocity: number;
}

/** One step of the spring under a push of `drive` (radians per second squared). Semi-implicit Euler, split into small steps so a long frame stays stable. */
export function stepSpring(spring: DoodadSpring, dt: number, drive = 0): DoodadSpring {
  let { angle, velocity } = spring;
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    velocity += (drive - REACTION_STIFFNESS * angle - REACTION_DAMPING * velocity) * h;
    angle += velocity * h;
  }
  angle = Math.max(-REACTION_MAX_ANGLE, Math.min(REACTION_MAX_ANGLE, angle));
  return { angle, velocity };
}

/** Whether the spring is still, so it can be forgotten. */
export const springAtRest = (spring: DoodadSpring): boolean => Math.abs(spring.angle) < REST_ANGLE && Math.abs(spring.velocity) < REST_VELOCITY;

/** The speed of a body, cells per second. */
export const bodySpeed = (body: DoodadBody): number => Math.hypot(body.vx, body.vy);

/**
 * Which way a body pushes a doodad (+1 clockwise on screen, -1 anticlockwise, 0 for no push). A floor or air doodad leans the
 * way the body goes. A ceiling doodad hangs from its top, so it swings the other way. A wall doodad sticks out sideways and is
 * pushed up or down: `mirror` is -1 when it points left.
 */
export function pushDirection(anchor: DoodadAnchor, body: DoodadBody, mirror: 1 | -1 = 1): number {
  const sign = (v: number) => (Math.abs(v) < 1e-6 ? 0 : Math.sign(v));
  switch (anchor) {
    case 'CEILING':
      return -sign(body.vx);
    case 'WALL':
      return sign(body.vy) * mirror;
    default:
      return sign(body.vx);
  }
}

/**
 * How hard one body pushes a doodad, as a signed drive for the spring: stronger the faster the body moves and the closer it is
 * to the doodad's middle, zero for a body that is out of reach or standing still.
 */
export function reactionDrive(reacts: DoodadReacts, anchor: DoodadAnchor, mirror: 1 | -1, x: number, y: number, body: DoodadBody): number {
  const speed = bodySpeed(body);
  if (speed < REACTION_MIN_SPEED) return 0;
  const reach = reacts.radius + body.radius;
  const distance = Math.hypot(body.x - x, body.y - y);
  if (distance > reach) return 0;
  const falloff = 1 - distance / reach;
  const pace = Math.min(1, speed / REACTION_FULL_SPEED);
  return pushDirection(anchor, body, mirror) * reacts.strength * falloff * pace * REACTION_DRIVE;
}

/** A doodad that may react, as the system sees it. */
export interface ReactiveDoodad {
  /** Unique and stable (the doodad's cell). */
  key: string;
  /** Where its base is, in cells. */
  x: number;
  y: number;
  anchor: DoodadAnchor;
  mirror: 1 | -1;
  reacts: DoodadReacts;
}

/** A puff of spores a brushed doodad gives off. */
export interface DoodadPuff {
  key: string;
  x: number;
  y: number;
  effectId: string;
}

interface Tracked {
  spring: DoodadSpring;
  /** Whether a moving body was in reach last frame (a puff happens when one comes in, not all the time). */
  inside: boolean;
  /** Seconds until it may puff again. */
  cooldown: number;
}

/**
 * Keeps the springs of the doodads that are wiggling. Each frame, `update` is given the reactive doodads on screen and the
 * body lookup; doodads nobody is near and that are still do not appear in the map at all.
 */
export class DoodadReactionSystem {
  private readonly tracked = new Map<string, Tracked>();

  /** How many doodads are being tracked (wiggling or with a body in reach). */
  public get activeCount(): number {
    return this.tracked.size;
  }

  /** The doodad's current lean in radians (0 when it is still). */
  public angleOf(key: string): number {
    return this.tracked.get(key)?.spring.angle ?? 0;
  }

  /** Forgets a doodad (it was removed or scrolled away). */
  public forget(key: string): void {
    this.tracked.delete(key);
  }

  /** Steps every spring by `dt` seconds under the bodies' pushes, and returns the puffs that started. */
  public update(dt: number, doodads: Iterable<ReactiveDoodad>, bodies: DoodadBodyIndex): DoodadPuff[] {
    const puffs: DoodadPuff[] = [];
    const seen = new Set<string>();
    for (const doodad of doodads) {
      const near = bodies.size > 0 ? bodies.near(doodad.x, doodad.y, doodad.reacts.radius) : [];
      let drive = 0;
      let moving = false;
      for (const body of near) {
        if (bodySpeed(body) >= REACTION_MIN_SPEED) moving = true;
        drive += reactionDrive(doodad.reacts, doodad.anchor, doodad.mirror, doodad.x, doodad.y, body);
      }
      let entry = this.tracked.get(doodad.key);
      if (!entry) {
        if (!moving && drive === 0) continue;
        entry = { spring: { angle: 0, velocity: 0 }, inside: false, cooldown: 0 };
        this.tracked.set(doodad.key, entry);
      }
      seen.add(doodad.key);
      entry.cooldown = Math.max(0, entry.cooldown - dt);
      if (moving && !entry.inside && entry.cooldown <= 0 && doodad.reacts.puffEffectId) {
        puffs.push({ key: doodad.key, x: doodad.x, y: doodad.y, effectId: doodad.reacts.puffEffectId });
        entry.cooldown = REACTION_PUFF_COOLDOWN;
      }
      entry.inside = moving;
      entry.spring = stepSpring(entry.spring, dt, drive);
      if (!moving && springAtRest(entry.spring)) this.tracked.delete(doodad.key);
    }
    // A doodad that was tracked but was not offered this frame has scrolled away or lost its reaction: let it go
    for (const key of [...this.tracked.keys()]) if (!seen.has(key)) this.tracked.delete(key);
    return puffs;
  }
}
