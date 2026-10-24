import { DoodadBodyIndex, MINING_CONFIG, isTileSolid, type DoodadBody, type MiningClientTile, type WanderTerrain } from '@mine-me/shared';

/** Where a body is this frame, as the scene knows it. The velocity is optional: without it the tracker works it out from how the body moved. */
export interface BodySample {
  id: string;
  /** Position in cells. */
  x: number;
  y: number;
  /** Velocity in cells per second, when the source has one (the local player's physics body does). */
  vx?: number;
  vy?: number;
  /** Half the body's width in cells (absent: a player's). */
  radius?: number;
}

/** A body that jumped further than this (cells) in one frame was moved, not walked: it has no speed that frame. */
export const TELEPORT_CELLS = 4;
/** How much of a derived velocity is kept from frame to frame (the rest is the new reading), to steady the jitter of interpolated positions. */
const VELOCITY_SMOOTHING = 0.6;

/** The half width of a player's collider, in cells. */
export const PLAYER_BODY_RADIUS = MINING_CONFIG.PLAYER_COLLIDER_WIDTH_TILES / 2;

/**
 * Gathers the bodies doodads can react to (tickets 104, 106): the local player, remote players and mobs. The scene already has
 * their positions; the velocity of those that do not report one is worked out here from how far they moved since last frame.
 * Nothing leaves the client.
 */
export class DoodadBodyTracker {
  private previous = new Map<string, { x: number; y: number; vx: number; vy: number }>();

  /** Reads this frame's bodies and returns the lookup for them. */
  public update(dtSeconds: number, samples: readonly BodySample[]): DoodadBodyIndex {
    const bodies: DoodadBody[] = [];
    const next = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    for (const sample of samples) {
      const before = this.previous.get(sample.id);
      let vx = sample.vx;
      let vy = sample.vy;
      if (vx === undefined || vy === undefined) {
        vx = 0;
        vy = 0;
        if (before && dtSeconds > 0 && Math.hypot(sample.x - before.x, sample.y - before.y) <= TELEPORT_CELLS) {
          const rawX = (sample.x - before.x) / dtSeconds;
          const rawY = (sample.y - before.y) / dtSeconds;
          vx = before.vx * VELOCITY_SMOOTHING + rawX * (1 - VELOCITY_SMOOTHING);
          vy = before.vy * VELOCITY_SMOOTHING + rawY * (1 - VELOCITY_SMOOTHING);
        }
      }
      next.set(sample.id, { x: sample.x, y: sample.y, vx, vy });
      bodies.push({ id: sample.id, x: sample.x, y: sample.y, vx, vy, radius: sample.radius ?? PLAYER_BODY_RADIUS });
    }
    this.previous = next;
    return new DoodadBodyIndex(bodies);
  }
}

/** The bodies of this frame: the local player, then the remote players, then the mobs. */
export function collectBodySamples(
  self: { x: number; y: number; vx?: number; vy?: number } | null,
  remotePlayers: Iterable<{ characterId: string; currentPos: { x: number; y: number } }> | null | undefined,
  mobs: Iterable<{ id: string; currentPos: { x: number; y: number }; colliderWidth?: number }> | null | undefined
): BodySample[] {
  const out: BodySample[] = [];
  if (self) out.push({ id: 'self', x: self.x, y: self.y, vx: self.vx, vy: self.vy });
  if (remotePlayers) for (const p of remotePlayers) out.push({ id: `player:${p.characterId}`, x: p.currentPos.x, y: p.currentPos.y });
  if (mobs) for (const m of mobs) out.push({ id: `mob:${m.id}`, x: m.currentPos.x, y: m.currentPos.y, radius: m.colliderWidth ? m.colliderWidth / 2 : undefined });
  return out;
}

/** What blocks a wandering bug: solid blocks, and cells the player has not seen (nothing is known to be there, and the map's edge). */
export function gridWanderTerrain(getGrid: () => MiningClientTile[][] | null | undefined): WanderTerrain {
  return {
    isSolid: (x, y) => {
      const tile = getGrid()?.[y]?.[x];
      return !tile || !tile.revealed || isTileSolid(tile.type);
    },
  };
}
