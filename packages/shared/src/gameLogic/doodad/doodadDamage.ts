import type { DoodadDefinition } from '../../types/doodad';
import { rockMass } from '../rockShapes';
import type { DoodadRect } from './doodadPlacement';

/**
 * Hurting and dropping doodads (ticket 143). Everything here is pure: where a hit can land on a doodad, how heavy it is when
 * it falls, and how a falling doodad moves. The server applies it; the client only draws the result.
 */

/** Hit-test box in continuous cell coordinates (x0/y0 inclusive top-left, x1/y1 the far edge). */
export interface DoodadHurtBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Where a hit lands on a doodad: its footprint. A wandering doodad moves on the client only, so the server does not know where
 * it is now; its box grows by how far it may stray (`wander.radius`) so a hit on the bug where the player sees it counts.
 */
export function doodadHurtBox(rect: DoodadRect, wander?: DoodadDefinition['wander'] | null): DoodadHurtBox {
  const reach = wander && wander.radius > 0 ? wander.radius : 0;
  return { x0: rect.x - reach, y0: rect.y - reach, x1: rect.x + rect.width + reach, y1: rect.y + rect.height + reach };
}

export const boxContainsPoint = (box: DoodadHurtBox, x: number, y: number, margin = 0): boolean =>
  x >= box.x0 - margin && x <= box.x1 + margin && y >= box.y0 - margin && y <= box.y1 + margin;

/** Whether two boxes overlap. */
export const boxesOverlap = (a: DoodadHurtBox, b: DoodadHurtBox): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** The closest distance from a point to a box (0 inside it). */
export function distanceToBox(box: DoodadHurtBox, x: number, y: number): number {
  const dx = Math.max(box.x0 - x, 0, x - box.x1);
  const dy = Math.max(box.y0 - y, 0, y - box.y1);
  return Math.hypot(dx, dy);
}

/**
 * Whether a segment (a bullet's path this step, grown by `radius`) touches a box. Samples the path every quarter cell, which is
 * plenty at the speeds bullets fly; returns the fraction along the segment of the first touch, or null.
 */
export function segmentTouchesBox(box: DoodadHurtBox, from: { x: number; y: number }, to: { x: number; y: number }, radius = 0): number | null {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.25));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (boxContainsPoint(box, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radius)) return t;
  }
  return null;
}

/** How heavy a doodad is while it falls: its own `fallDamage` when set, else the mass of a rock of the same footprint. */
export function doodadFallMass(doodad: Pick<DoodadDefinition, 'fallDamage'>, size: { width: number; height: number }): number {
  return typeof doodad.fallDamage === 'number' && doodad.fallDamage > 0 ? doodad.fallDamage : rockMass(size);
}

/** Whether a doodad falls instead of just vanishing when it loses its hold (every ceiling doodad does). */
export const doodadFalls = (doodad: Pick<DoodadDefinition, 'anchor'>): boolean => doodad.anchor === 'CEILING';

/** Gravity of a falling doodad, in cells per second squared (the player's own, so a stalactite drops as fast as a rock). */
export const DOODAD_FALL_GRAVITY = 28 * 3;
/** The fastest a falling doodad goes, in cells per second. */
export const DOODAD_FALL_MAX_SPEED = 60 * 3;

export interface FallingState {
  /** Top-left of the footprint, in cells. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Cells per second, down. */
  vy: number;
}

/**
 * Moves a falling doodad by `dt` seconds. It stops at the first solid row under its footprint (`isSolid` answers for a cell) or
 * at the bottom of the map (`rows`). Returns the new state and whether it landed. The speed it had on the way down is `vy`.
 */
export function stepFall(state: FallingState, dt: number, isSolid: (x: number, y: number) => boolean, rows: number): { state: FallingState; landed: boolean } {
  const vy = Math.min(DOODAD_FALL_MAX_SPEED, state.vy + DOODAD_FALL_GRAVITY * dt);
  const x0 = Math.floor(state.x + 1e-9);
  const x1 = Math.ceil(state.x + state.width - 1e-9) - 1;
  let y = state.y;
  let remaining = vy * dt;
  // Move from row line to row line, so a fast fall cannot skip through a thin floor
  while (remaining > 1e-9) {
    const bottom = y + state.height;
    const line = Math.ceil(bottom - 1e-9);
    const gap = line - bottom;
    if (gap <= 1e-9) {
      if (blockedBelow(x0, x1, line, isSolid, rows)) return { state: { ...state, y: line - state.height, vy }, landed: true };
      const step = Math.min(remaining, 1);
      y += step;
      remaining -= step;
    } else {
      const step = Math.min(remaining, gap);
      y += step;
      remaining -= step;
    }
  }
  return { state: { ...state, y, vy }, landed: false };
}

function blockedBelow(x0: number, x1: number, row: number, isSolid: (x: number, y: number) => boolean, rows: number): boolean {
  if (row >= rows) return true;
  for (let x = x0; x <= x1; x++) if (isSolid(x, row)) return true;
  return false;
}
