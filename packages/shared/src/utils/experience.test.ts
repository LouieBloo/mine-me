import { describe, it, expect } from 'vitest';
import { calculateLevel, getXpForLevel, getLevelProgress, MAX_CHARACTER_LEVEL } from './experience';

describe('experience utilities', () => {
  describe('calculateLevel', () => {
    it('returns level 1 for 0 experience', () => {
      expect(calculateLevel(0)).toBe(1);
    });

    it('returns level 1 for 99 XP (not enough for level 2)', () => {
      expect(calculateLevel(99)).toBe(1);
    });

    it('returns level 2 at exactly 100 XP', () => {
      expect(calculateLevel(100)).toBe(2);
    });

    it('returns level 3 at exactly 400 XP', () => {
      expect(calculateLevel(400)).toBe(3);
    });

    it('returns level 2 for 399 XP (not enough for level 3)', () => {
      expect(calculateLevel(399)).toBe(2);
    });

    it('caps at max level for extremely high XP', () => {
      expect(calculateLevel(999999999)).toBe(MAX_CHARACTER_LEVEL);
    });

    it('returns level 1 for negative experience', () => {
      expect(calculateLevel(-100)).toBe(1);
    });

    it('returns level 10 at exactly 8100 XP', () => {
      // (10-1)^2 * 100 = 81*100 = 8100
      expect(calculateLevel(8100)).toBe(10);
    });
  });

  describe('getXpForLevel', () => {
    it('returns 0 for level 1', () => {
      expect(getXpForLevel(1)).toBe(0);
    });

    it('returns 100 for level 2', () => {
      expect(getXpForLevel(2)).toBe(100);
    });

    it('returns 400 for level 3', () => {
      expect(getXpForLevel(3)).toBe(400);
    });

    it('returns 0 for level 0 or below', () => {
      expect(getXpForLevel(0)).toBe(0);
    });
  });

  describe('getLevelProgress', () => {
    it('returns correct progress at 0 XP', () => {
      const result = getLevelProgress(0);
      expect(result.level).toBe(1);
      expect(result.progress).toBe(0);
      expect(result.isMaxLevel).toBe(false);
      expect(result.xpNeededForNext).toBe(100);
    });

    it('returns 50% progress at 50 XP (level 1, need 100 for level 2)', () => {
      const result = getLevelProgress(50);
      expect(result.level).toBe(1);
      expect(result.progress).toBeCloseTo(0.5);
    });

    it('returns correct values right at level 2 boundary', () => {
      const result = getLevelProgress(100);
      expect(result.level).toBe(2);
      expect(result.xpIntoLevel).toBe(0);
      expect(result.progress).toBe(0);
    });

    it('returns isMaxLevel true at max level', () => {
      const maxXp = getXpForLevel(MAX_CHARACTER_LEVEL);
      const result = getLevelProgress(maxXp);
      expect(result.level).toBe(MAX_CHARACTER_LEVEL);
      expect(result.isMaxLevel).toBe(true);
      expect(result.progress).toBe(1);
    });
  });
});
