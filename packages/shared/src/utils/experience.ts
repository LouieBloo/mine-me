/**
 * Experience-to-level calculation utilities.
 * 
 * Max level: 50
 * XP formula: Each level requires `level^2 * 100` total cumulative XP.
 *   Level  1 →       0 XP
 *   Level  2 →     100 XP
 *   Level  3 →     400 XP
 *   Level  5 →   1,600 XP
 *   Level 10 →   8,100 XP
 *   Level 25 →  57,600 XP
 *   Level 50 → 240,100 XP
 */

const MAX_LEVEL = 50;

/**
 * Pre-compute cumulative XP thresholds for each level.
 * Index 0 = level 1 (0 XP), index 1 = level 2 (100 XP), etc.
 */
const XP_TABLE: number[] = [];
for (let level = 1; level <= MAX_LEVEL; level++) {
  XP_TABLE.push((level - 1) * (level - 1) * 100);
}

/**
 * Returns the XP required to reach a given level.
 */
export function getXpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL) return XP_TABLE[MAX_LEVEL - 1];
  return XP_TABLE[level - 1];
}

/**
 * Calculates the character's level from their total experience points.
 * Returns a value between 1 and MAX_LEVEL.
 */
export function calculateLevel(experience: number): number {
  for (let i = MAX_LEVEL - 1; i >= 0; i--) {
    if (experience >= XP_TABLE[i]) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Returns progress information for the current level.
 */
export function getLevelProgress(experience: number): {
  level: number;
  currentXp: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpIntoLevel: number;
  xpNeededForNext: number;
  progress: number; // 0-1
  isMaxLevel: boolean;
} {
  const level = calculateLevel(experience);
  const isMaxLevel = level >= MAX_LEVEL;
  const xpForCurrentLevel = getXpForLevel(level);
  const xpForNextLevel = isMaxLevel ? xpForCurrentLevel : getXpForLevel(level + 1);
  const xpIntoLevel = experience - xpForCurrentLevel;
  const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
  const progress = isMaxLevel ? 1 : xpNeededForNext > 0 ? xpIntoLevel / xpNeededForNext : 0;

  return {
    level,
    currentXp: experience,
    xpForCurrentLevel,
    xpForNextLevel,
    xpIntoLevel,
    xpNeededForNext,
    progress: Math.min(1, Math.max(0, progress)),
    isMaxLevel,
  };
}

export const MAX_CHARACTER_LEVEL = MAX_LEVEL;
