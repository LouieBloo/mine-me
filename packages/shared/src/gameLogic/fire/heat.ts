/** How fire hurts: the numbers in the map config's fire rule. */
export interface FireDamageRule {
  /** Damage per second while burning. */
  burnDamagePerSecond: number;
  /** How long burning lasts after the last touch of fire, in seconds. */
  burnSeconds: number;
  /** How far (tiles) a fire's heat reaches. */
  heatRadius: number;
  /** Damage per second right at a fire whose material has heat 1. */
  heatDamagePerSecond: number;
}

/** A box in tile units: centre and half extents. */
export interface BodyBox {
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
}

/** Whether a body's box overlaps cell (cx, cy) (touching edges does not count). */
export function bodyTouchesCell(box: BodyBox, cx: number, cy: number): boolean {
  return (
    box.x + box.halfWidth > cx &&
    box.x - box.halfWidth < cx + 1 &&
    box.y + box.halfHeight > cy &&
    box.y - box.halfHeight < cy + 1
  );
}

/** Distance in tiles from a body's box to the nearest point of cell (cx, cy); 0 when they touch or overlap. */
export function distanceToCell(box: BodyBox, cx: number, cy: number): number {
  const dx = Math.max(cx - (box.x + box.halfWidth), 0, box.x - box.halfWidth - (cx + 1));
  const dy = Math.max(cy - (box.y + box.halfHeight), 0, box.y - box.halfHeight - (cy + 1));
  return Math.hypot(dx, dy);
}

/** Share of a fire's heat felt at `distance` tiles: full at the fire, fading in a straight line to nothing at the radius. */
export function heatFalloff(distance: number, radius: number): number {
  if (!(radius > 0) || !(distance >= 0)) return 0;
  return Math.max(0, 1 - distance / radius);
}

/** Damage per second from one fire of the given material heat, `distance` tiles away. */
export function heatDamageRate(heat: number, distance: number, rule: Pick<FireDamageRule, 'heatRadius' | 'heatDamagePerSecond'>): number {
  if (!(heat > 0) || !(rule.heatDamagePerSecond > 0)) return 0;
  return heat * rule.heatDamagePerSecond * heatFalloff(distance, rule.heatRadius);
}
