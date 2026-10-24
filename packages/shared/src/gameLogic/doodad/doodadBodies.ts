/**
 * The bodies a doodad can react to (tickets 104, 106): the local player, remote players and mobs, as seen by the client
 * this frame. Positions are in cells, velocities in cells per second. Nothing here is on the wire: the client builds
 * the list from what it already draws.
 */
export interface DoodadBody {
  /** Stable id (the same body has the same id every frame), so a reaction can tell "still inside" from "just came in". */
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Half the width of the body, in cells: it touches a doodad that much before its centre does. */
  radius: number;
}

/** Cells along one side of a bucket of the body lookup. */
export const DOODAD_BODY_BUCKET_CELLS = 4;

const bucketKey = (bx: number, by: number): number => bx * 65536 + by;

/**
 * Finds the bodies near a point without looking at all of them. Built once a frame from the bodies in the scene (a handful),
 * then each doodad that reacts asks for the bodies around it: the cost of a query follows the number of nearby buckets, not
 * the number of bodies or doodads, and a frame with no bodies costs nothing.
 */
export class DoodadBodyIndex {
  private readonly buckets = new Map<number, DoodadBody[]>();
  public readonly size: number;
  private readonly maxRadius: number;

  constructor(bodies: readonly DoodadBody[]) {
    this.size = bodies.length;
    let maxRadius = 0;
    for (const body of bodies) {
      maxRadius = Math.max(maxRadius, body.radius);
      const key = bucketKey(Math.floor(body.x / DOODAD_BODY_BUCKET_CELLS), Math.floor(body.y / DOODAD_BODY_BUCKET_CELLS));
      const list = this.buckets.get(key);
      if (list) list.push(body);
      else this.buckets.set(key, [body]);
    }
    this.maxRadius = maxRadius;
  }

  /** The bodies whose edge is within `radius` cells of the point (a body's own radius counts towards reaching it). */
  public near(x: number, y: number, radius: number): DoodadBody[] {
    if (this.size === 0) return [];
    const reach = radius + this.maxRadius;
    const out: DoodadBody[] = [];
    const bx0 = Math.floor((x - reach) / DOODAD_BODY_BUCKET_CELLS);
    const bx1 = Math.floor((x + reach) / DOODAD_BODY_BUCKET_CELLS);
    const by0 = Math.floor((y - reach) / DOODAD_BODY_BUCKET_CELLS);
    const by1 = Math.floor((y + reach) / DOODAD_BODY_BUCKET_CELLS);
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const list = this.buckets.get(bucketKey(bx, by));
        if (!list) continue;
        for (const body of list) if (Math.hypot(body.x - x, body.y - y) <= radius + body.radius) out.push(body);
      }
    }
    return out;
  }
}
