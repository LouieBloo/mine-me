import { describe, it, expect, vi } from 'vitest';
import { MiningTileType, type MiningClientTile } from '../types/mining';
import {
  AUTOTILE_BOTTOM, AUTOTILE_LEFT, AUTOTILE_RIGHT, AUTOTILE_TOP,
  DEFAULT_AUTOTILE_STYLE, autotileCorners, autotileHasEffect, autotileMask, drawAutotileVariant, isAutotileTerrain,
  resolveAutotileStyle, validateAutotileConfig,
} from './autotile';

const tile = (type: number, revealed = true, piece?: MiningClientTile['piece']): MiningClientTile => ({ type: type as MiningTileType, revealed, ...(piece ? { piece } : {}) });
const D = MiningTileType.DIRT;
const E = MiningTileType.EMPTY;

/** A grid from rows of letters: D dirt, . empty, ? fog (dirt, unrevealed), L ladder piece, R rock, C chest, S stone-ish ore (mineral). */
const gridOf = (rows: string[]): MiningClientTile[][] =>
  rows.map((row) => [...row].map((c) => {
    switch (c) {
      case 'D': return tile(D);
      case '.': return tile(E);
      case '?': return tile(D, false);
      case 'x': return tile(E, false); // fog over open space
      case 'L': return tile(MiningTileType.LADDER, true, [0, 0]);
      case 'R': return tile(MiningTileType.ROCK);
      case 'C': return tile(MiningTileType.CHEST);
      case 'M': return tile(MiningTileType.MINERAL);
      default: throw new Error(c);
    }
  }));

describe('autotileMask', () => {
  it('has no exposed side inside solid terrain', () => {
    expect(autotileMask(gridOf(['DDD', 'DDD', 'DDD']), 1, 1)).toBe(0);
  });

  it('marks each side that faces empty space, and only that side', () => {
    const grid = gridOf(['D.D', 'DDD', 'DDD']);
    expect(autotileMask(grid, 1, 1)).toBe(AUTOTILE_TOP);
    expect(autotileMask(gridOf(['DDD', 'D.D', 'DDD']), 0, 1)).toBe(AUTOTILE_RIGHT);
    expect(autotileMask(gridOf(['DDD', 'DD.', 'DDD']), 1, 1)).toBe(AUTOTILE_RIGHT);
    expect(autotileMask(gridOf(['DDD', 'DDD', 'D.D']), 1, 1)).toBe(AUTOTILE_BOTTOM);
    expect(autotileMask(gridOf(['DDD', '.DD', 'DDD']), 1, 1)).toBe(AUTOTILE_LEFT);
  });

  it('ignores diagonal neighbours', () => {
    expect(autotileMask(gridOf(['.DD', 'DDD', 'DDD']), 1, 1)).toBe(0);
  });

  it('treats the edge of the map as joined', () => {
    expect(autotileMask(gridOf(['D']), 0, 0)).toBe(0);
  });

  it('treats unrevealed cells (fog) as joined, so no edge is drawn against them', () => {
    expect(autotileMask(gridOf(['?D?', '?D?', '?D?']), 1, 1)).toBe(0);
    // Even fog that hides open space shows no edge until it is revealed
    expect(autotileMask(gridOf(['xxx', 'xDx', 'xxx']), 1, 1)).toBe(0);
    expect(autotileMask(gridOf(['...', '.D.', '...']), 1, 1)).toBe(15);
  });

  it('treats another terrain block as joined (dirt next to ore has no edge)', () => {
    expect(autotileMask(gridOf(['DMD', 'DDD', 'DDD']), 1, 1)).toBe(0);
  });

  it('treats pieces, rocks and chests as open air', () => {
    expect(autotileMask(gridOf(['DLD', 'DDD', 'DDD']), 1, 1)).toBe(AUTOTILE_TOP);
    expect(autotileMask(gridOf(['DRD', 'DDD', 'DDD']), 1, 1)).toBe(AUTOTILE_TOP);
    expect(autotileMask(gridOf(['DCD', 'DDD', 'DDD']), 1, 1)).toBe(AUTOTILE_TOP);
  });

  it('gives every one of the 16 patterns its own mask', () => {
    const seen = new Set<number>();
    for (let bits = 0; bits < 16; bits++) {
      const rows = [
        ['D', bits & AUTOTILE_TOP ? '.' : 'D', 'D'],
        [bits & AUTOTILE_LEFT ? '.' : 'D', 'D', bits & AUTOTILE_RIGHT ? '.' : 'D'],
        ['D', bits & AUTOTILE_BOTTOM ? '.' : 'D', 'D'],
      ].map((r) => r.join(''));
      const mask = autotileMask(gridOf(rows), 1, 1);
      expect(mask).toBe(bits);
      seen.add(mask);
    }
    expect(seen.size).toBe(16);
  });
});

describe('isAutotileTerrain', () => {
  it('is true for solid blocks and false for air, pieces, rocks and chests', () => {
    expect(isAutotileTerrain(tile(D))).toBe(true);
    expect(isAutotileTerrain(tile(MiningTileType.COPPERIUM))).toBe(true);
    expect(isAutotileTerrain(tile(MiningTileType.LAVAROCK))).toBe(true);
    expect(isAutotileTerrain(tile(E))).toBe(false);
    expect(isAutotileTerrain(tile(MiningTileType.LADDER))).toBe(false);
    expect(isAutotileTerrain(tile(MiningTileType.BRIDGE, true, [0, 0]))).toBe(false);
    expect(isAutotileTerrain(tile(MiningTileType.ROCK))).toBe(false);
    expect(isAutotileTerrain(tile(MiningTileType.CHEST))).toBe(false);
    expect(isAutotileTerrain(tile(D, true, [0, 0]))).toBe(false);
  });
});

describe('autotileCorners', () => {
  it('rounds a corner only where both sides that meet there are exposed', () => {
    expect(autotileCorners(AUTOTILE_TOP)).toEqual({ topLeft: false, topRight: false, bottomRight: false, bottomLeft: false });
    expect(autotileCorners(AUTOTILE_TOP | AUTOTILE_LEFT)).toEqual({ topLeft: true, topRight: false, bottomRight: false, bottomLeft: false });
    expect(autotileCorners(15)).toEqual({ topLeft: true, topRight: true, bottomRight: true, bottomLeft: true });
  });
});

describe('autotile style', () => {
  it('layers default, map and block, field by field', () => {
    const style = resolveAutotileStyle({ radius: 0.1, rimColor: '#112233' }, { radius: 0.4 });
    expect(style).toEqual({ ...DEFAULT_AUTOTILE_STYLE, radius: 0.4, rimColor: '#112233' });
  });

  it('keeps the default for null layers and clamps out-of-range numbers', () => {
    expect(resolveAutotileStyle(null, undefined)).toEqual(DEFAULT_AUTOTILE_STYLE);
    expect(resolveAutotileStyle({ radius: 9, rimStrength: -1 }).radius).toBe(0.5);
    expect(resolveAutotileStyle({ radius: 9, rimStrength: -1 }).rimStrength).toBe(0);
    expect(resolveAutotileStyle({ rimColor: 'red' }).rimColor).toBe(DEFAULT_AUTOTILE_STYLE.rimColor);
  });

  it('knows when a style changes nothing', () => {
    expect(autotileHasEffect(DEFAULT_AUTOTILE_STYLE)).toBe(true);
    expect(autotileHasEffect({ ...DEFAULT_AUTOTILE_STYLE, radius: 0, rimStrength: 0 })).toBe(false);
  });

  it('validates configs', () => {
    expect(validateAutotileConfig(null)).toEqual([]);
    expect(validateAutotileConfig({})).toEqual([]);
    expect(validateAutotileConfig({ radius: 0.3, rimColor: '#aabbcc' })).toEqual([]);
    expect(validateAutotileConfig({ radius: 0.9 })).toHaveLength(1);
    expect(validateAutotileConfig({ rimStrength: 'a' })).toHaveLength(1);
    expect(validateAutotileConfig({ rimColor: 'red' })).toHaveLength(1);
    expect(validateAutotileConfig({ bogus: 1 })).toHaveLength(1);
    expect(validateAutotileConfig([])).toHaveLength(1);
    expect(validateAutotileConfig('x')).toHaveLength(1);
  });
});

describe('drawAutotileVariant', () => {
  const fakeContext = () => {
    const calls: string[] = [];
    const gradient = { addColorStop: vi.fn() };
    const ctx: any = {
      fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: 'butt',
      save: () => calls.push('save'), restore: () => calls.push('restore'), clearRect: () => calls.push('clear'),
      beginPath: () => calls.push('begin'), moveTo: () => calls.push('moveTo'), lineTo: () => calls.push('lineTo'),
      arc: () => calls.push('arc'), closePath: () => calls.push('close'), clip: () => calls.push('clip'),
      drawImage: () => calls.push('image'), createLinearGradient: () => { calls.push('gradient'); return gradient; },
      fillRect: () => calls.push('fillRect'), stroke: () => calls.push('stroke'),
    };
    return { ctx, calls };
  };
  const draw = (mask: number, style = DEFAULT_AUTOTILE_STYLE) => {
    const { ctx, calls } = fakeContext();
    drawAutotileVariant(ctx, {} as CanvasImageSource, 64, 64, mask, style);
    return calls;
  };

  it('draws just the image, with no rim and no rounding, when no side is exposed', () => {
    const calls = draw(0);
    expect(calls).toContain('image');
    expect(calls).not.toContain('gradient');
    expect(calls).not.toContain('stroke');
    expect(calls).not.toContain('arc');
  });

  it('adds one rim gradient per exposed side and a line along them', () => {
    expect(draw(AUTOTILE_TOP).filter((c) => c === 'gradient')).toHaveLength(1);
    expect(draw(AUTOTILE_TOP | AUTOTILE_BOTTOM | AUTOTILE_LEFT).filter((c) => c === 'gradient')).toHaveLength(3);
    expect(draw(AUTOTILE_TOP)).toContain('stroke');
  });

  it('rounds a corner only where two exposed sides meet', () => {
    expect(draw(AUTOTILE_TOP).filter((c) => c === 'arc')).toHaveLength(0);
    // clip arc + outline arc for the one rounded corner
    expect(draw(AUTOTILE_TOP | AUTOTILE_LEFT).filter((c) => c === 'arc')).toHaveLength(2);
    expect(draw(15).filter((c) => c === 'arc')).toHaveLength(8);
  });

  it('draws no rim when the strength is zero', () => {
    const calls = draw(AUTOTILE_TOP, { ...DEFAULT_AUTOTILE_STYLE, rimStrength: 0 });
    expect(calls).not.toContain('gradient');
    expect(calls).not.toContain('stroke');
  });
});
