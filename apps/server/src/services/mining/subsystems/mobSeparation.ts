import { MINING_CONFIG, type MiningCollisionGrid, type MiningPhysicsBody } from '@mine-me/shared';

/** A body that takes part in separation. Immovable ones (stationary mobs, players) are never pushed. */
export interface SeparationParticipant {
  id: string;
  body: MiningPhysicsBody;
  movable: boolean;
}

/** Horizontal and vertical overlap of two bodies' boxes (both > 0 only when they intersect). */
export function overlapOf(a: MiningPhysicsBody, b: MiningPhysicsBody): { x: number; y: number } {
  return {
    x: a.halfWidth + b.halfWidth - Math.abs(a.position.x - b.position.x),
    y: a.halfHeight + b.halfHeight - Math.abs(a.position.y - b.position.y),
  };
}

function shift(body: MiningPhysicsBody, dx: number, grid: MiningCollisionGrid): boolean {
  if (dx === 0) return true;
  if (body.checkTileCollision(body.position.x + dx, body.position.y, grid)) return false;
  body.position.x += dx;
  return true;
}

/**
 * Soft collision: pushes overlapping bodies apart sideways, at most MOB_SEPARATION_SPEED * dt per
 * call (or half the overlap, if larger), so crowds spread out instead of stacking without snapping. Only movable bodies move;
 * a push that would shove a body into a wall is skipped (the other one takes it all instead).
 */
export function separateBodies(participants: SeparationParticipant[], dt: number, grid: MiningCollisionGrid): void {
  const maxPush = MINING_CONFIG.MOB_SEPARATION_SPEED * dt;
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i];
      const b = participants[j];
      if (!a.movable && !b.movable) continue;
      const overlap = overlapOf(a.body, b.body);
      if (overlap.x <= 0 || overlap.y <= 0) continue;

      // Which way a goes: away from b; exactly stacked bodies split by id so the choice is stable
      const away = Math.sign(a.body.position.x - b.body.position.x) || (a.id < b.id ? -1 : 1);
      // At least the separation speed, and half the overlap so a body walking into another is
      // held at the edge rather than sinking in
      const push = Math.min(overlap.x, Math.max(maxPush, overlap.x * 0.5));

      if (a.movable && b.movable) {
        const movedA = shift(a.body, (away * push) / 2, grid);
        const movedB = shift(b.body, (-away * push) / 2, grid);
        if (!movedA) shift(b.body, -away * push / 2, grid);
        if (!movedB) shift(a.body, away * push / 2, grid);
      } else if (a.movable) {
        shift(a.body, away * push, grid);
      } else {
        shift(b.body, -away * push, grid);
      }
    }
  }
}
