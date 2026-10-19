import { describe, it, expect } from 'vitest';
import { generateMiningMap, type ServerMiningGrid } from './miningMap.service';
import { MINING_CONFIG, MiningTileType, ROCK_SHAPES, isTileSolid, pieceFootprint } from '@mine-me/shared';

/** Every rock in the grid as { x, y, width, height } of its top-left cell, read back from the cells' pieces. */
function rocksIn(grid: ServerMiningGrid) {
  const rocks: { x: number; y: number; width: number; height: number }[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      const tile = grid[y][x];
      if (tile.type !== MiningTileType.ROCK) continue;
      const footprint = pieceFootprint(tile.type, tile.piece);
      if (!tile.piece || (tile.piece[0] === 0 && tile.piece[1] === 0)) rocks.push({ x, y, ...footprint });
    }
  }
  return rocks;
}

describe('generated rocks come in several sizes', () => {
  const grid = generateMiningMap({ seed: 2024, config: { rockPercentage: 12 } });
  const rocks = rocksIn(grid);

  it('places rocks of more than one size, with small ones the most common', () => {
    const sizes = new Set(rocks.map((r) => `${r.width}x${r.height}`));
    expect(sizes.size).toBeGreaterThanOrEqual(3);
    expect([...sizes].every((s) => ROCK_SHAPES.some((shape) => shape.id === s))).toBe(true);
    const count = (id: string) => rocks.filter((r) => `${r.width}x${r.height}` === id).length;
    expect(count('1x1')).toBeGreaterThan(count('3x3'));
  });

  it('a rock bigger than one cell is a whole piece: every cell is rock and knows its place and the rock size', () => {
    const big = rocks.filter((r) => r.width > 1 || r.height > 1);
    expect(big.length).toBeGreaterThan(0);
    for (const rock of big) {
      for (let oy = 0; oy < rock.height; oy++) {
        for (let ox = 0; ox < rock.width; ox++) {
          const tile = grid[rock.y + oy][rock.x + ox];
          expect(tile.type).toBe(MiningTileType.ROCK);
          expect(tile.piece).toEqual([ox, oy, rock.width, rock.height]);
        }
      }
    }
  });

  it('a single-cell rock carries no piece', () => {
    for (const rock of rocks.filter((r) => r.width === 1 && r.height === 1)) expect(grid[rock.y][rock.x].piece).toBeUndefined();
  });

  it('no rock starts without ground under its whole bottom edge', () => {
    for (const rock of rocks) {
      const below = rock.y + rock.height;
      if (below >= grid.length) continue;
      for (let x = rock.x; x < rock.x + rock.width; x++) expect(isTileSolid(grid[below][x].type)).toBe(true);
    }
  });

  it('no rock is placed beside the entrance', () => {
    for (const rock of rocks) {
      for (let x = rock.x; x < rock.x + rock.width; x++) {
        if (rock.y <= 3) expect(Math.abs(x - MINING_CONFIG.ENTRANCE_X)).toBeGreaterThan(3);
      }
    }
  });

  it('rock cells stay within the share of solid cells that was asked for', () => {
    let rockCells = 0;
    let solid = 0;
    for (let y = 1; y < grid.length; y++) {
      for (const tile of grid[y]) {
        if (isTileSolid(tile.type)) solid++;
        if (tile.type === MiningTileType.ROCK) rockCells++;
      }
    }
    expect(rockCells / solid).toBeLessThanOrEqual(0.12 + 0.001);
    expect(rockCells / solid).toBeGreaterThan(0.08);
  });

  it('is the same every time for the same seed', () => {
    expect(rocksIn(generateMiningMap({ seed: 2024, config: { rockPercentage: 12 } }))).toEqual(rocks);
  });

  it('a lower rock percentage means fewer rock cells', () => {
    const few = rocksIn(generateMiningMap({ seed: 2024, config: { rockPercentage: 3 } }));
    const cells = (list: typeof rocks) => list.reduce((sum, r) => sum + r.width * r.height, 0);
    expect(cells(few)).toBeLessThan(cells(rocks));
  });
});
