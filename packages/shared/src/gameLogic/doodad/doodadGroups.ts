import type { DoodadSpawnRules } from '../../types/doodad';

/** What an unset group setting means once `groupChance` is above 0 (ticket 146). Sizes are doodads, the spread is small blocks. */
export const DEFAULT_DOODAD_GROUP_SIZE_MIN = 3;
export const DEFAULT_DOODAD_GROUP_SIZE_MAX = 8;
export const DEFAULT_DOODAD_GROUP_SPREAD = 6;
export const DEFAULT_DOODAD_GROUP_FILL = 0.5;

/** How far a group reaches across a surface (floor, ceiling or wall) compared with along it, at most, in small blocks: slopes and steps, not other caves. */
export const DOODAD_GROUP_ACROSS_REACH = 3;

/** A kind's group settings with every default filled in. */
export interface DoodadGroupRules {
  /** Share (0-1) of its placements that stand in a group. */
  chance: number;
  sizeMin: number;
  sizeMax: number;
  spread: number;
  fill: number;
  memberSpacing: number;
}

const num = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** The group settings of a spawn rule set, or null when the kind does not group (no `groupChance`, or 0). */
export function resolveDoodadGroups(spawn: DoodadSpawnRules | null | undefined): DoodadGroupRules | null {
  if (!spawn || !num(spawn.groupChance) || spawn.groupChance <= 0) return null;
  const sizeMin = Math.max(1, Math.floor(num(spawn.groupSizeMin) ? spawn.groupSizeMin : DEFAULT_DOODAD_GROUP_SIZE_MIN));
  const sizeMax = Math.max(sizeMin, Math.floor(num(spawn.groupSizeMax) ? spawn.groupSizeMax : Math.max(sizeMin, DEFAULT_DOODAD_GROUP_SIZE_MAX)));
  return {
    chance: Math.min(1, spawn.groupChance),
    sizeMin,
    sizeMax,
    spread: Math.max(0, num(spawn.groupSpread) ? spawn.groupSpread : DEFAULT_DOODAD_GROUP_SPREAD),
    fill: Math.min(1, Math.max(0, num(spawn.groupFill) ? spawn.groupFill : DEFAULT_DOODAD_GROUP_FILL)),
    memberSpacing: Math.max(0, num(spawn.memberSpacing) ? spawn.memberSpacing : 0),
  };
}

/** The average number in a group, which the chance of starting one is divided by so a kind's overall amount does not change. */
export const doodadGroupMeanSize = (groups: Pick<DoodadGroupRules, 'sizeMin' | 'sizeMax'>): number => (groups.sizeMin + groups.sizeMax) / 2;

/**
 * Per cell, the chance of a lone doodad and of the centre of a group, from the chance `base` that a plain scatter would
 * place one there. Together they expect the same amount as the scatter: the lone share keeps `1 - chance` of it and a
 * centre stands for a whole group, so it is `chance` of it divided by the group's average size.
 */
export function splitGroupChance(base: number, groups: DoodadGroupRules): { single: number; centre: number } {
  const single = base * (1 - groups.chance);
  const centre = (base * groups.chance) / doodadGroupMeanSize(groups);
  return { single, centre };
}

/**
 * The chance that a free spot at `distance` from the centre of a group joins it, in a biome mix of `density`. It is the group's
 * fill at the centre, thinning to half at the edge of the spread, and a denser biome fills more (by the square root, so a
 * density of 4 doubles it and nothing exceeds 1).
 */
export function groupFillChance(groups: Pick<DoodadGroupRules, 'fill' | 'spread'>, distance: number, density: number): number {
  const edge = groups.spread > 0 ? Math.min(1, Math.max(0, distance / groups.spread)) : 0;
  const falloff = 1 - 0.5 * edge;
  return Math.min(1, Math.max(0, groups.fill * falloff * Math.sqrt(Math.max(0, density))));
}
