import { describe, it, expect } from 'vitest';
import { BLOCK_SCALE, MiningTileType, doodadRect, orderDoodads, type DoodadDefinition, type SurfacePropDef } from '@mine-me/shared';
import { createSeededRng } from '../../miningMap.service';
import { SURFACE_ENTRANCE_CLEAR_RADIUS, SURFACE_EXTRACTOR_MARGIN, SURFACE_PROPS_SEED_SALT, generateSurfaceProps } from './SurfaceProps';

const SKY = 10;
const WIDTH = 120;

const grid = Array.from({ length: SKY + 6 }, (_, y) => Array.from({ length: WIDTH }, () => ({ type: y < SKY ? MiningTileType.EMPTY : MiningTileType.DIRT })));

const doodad = (patch: Partial<DoodadDefinition> & { key: string }): DoodadDefinition =>
  ({ id: patch.key, name: patch.key, anchor: 'FLOOR', width: 2, height: 3, zOffset: 0, biomes: [], ...patch }) as DoodadDefinition;

const tree = doodad({ key: 'tree', width: 3, height: 5 });
const bush = doodad({ key: 'bush', width: 2, height: 2 });
const bird = doodad({ key: 'bird', anchor: 'AIR', width: 1, height: 1 });
const moss = doodad({ key: 'moss', anchor: 'WALL' });

const run = (props: SurfacePropDef[], overrides: Partial<Parameters<typeof generateSurfaceProps>[0]> = {}, seed = 1) =>
  generateSurfaceProps({
    grid,
    surfaceRow: SKY,
    environment: { props },
    doodads: [tree, bush, bird, moss],
    rng: createSeededRng(seed ^ SURFACE_PROPS_SEED_SALT),
    entranceX: 60,
    blockKeyOf: () => 'DIRT',
    ...overrides,
  });

const indexOf = (key: string) => orderDoodads([tree, bush, bird, moss]).findIndex((d) => d.key === key);

describe('generateSurfaceProps', () => {
  it('places nothing without props, without a sky, or for an unknown doodad', () => {
    expect(run([])).toEqual([]);
    expect(run([{ doodadKey: 'nope', density: 50 }])).toEqual([]);
    expect(run([{ doodadKey: 'tree', density: 50 }], { surfaceRow: 0 })).toEqual([]);
  });

  it('stands floor props on the ground with their feet on the surface row', () => {
    const placements = run([{ doodadKey: 'tree', density: 30 }]);
    expect(placements.length).toBeGreaterThan(5);
    for (const p of placements) {
      const rect = doodadRect(tree, p);
      expect(rect.y + rect.height).toBe(SKY);
      expect(p.typeIndex).toBe(indexOf('tree'));
    }
  });

  it('is the same for the same seed and different for another', () => {
    expect(run([{ doodadKey: 'tree', density: 30 }], {}, 5)).toEqual(run([{ doodadKey: 'tree', density: 30 }], {}, 5));
    expect(run([{ doodadKey: 'tree', density: 30 }], {}, 5)).not.toEqual(run([{ doodadKey: 'tree', density: 30 }], {}, 6));
  });

  it('keeps the entrance and the extractor pad clear', () => {
    const avoid = [{ x0: 20, x1: 34 }];
    for (let seed = 1; seed < 8; seed++) {
      for (const p of run([{ doodadKey: 'tree', density: 60 }, { doodadKey: 'bush', density: 60 }], { avoid }, seed)) {
        const def = p.typeIndex === indexOf('tree') ? tree : bush;
        const rect = doodadRect(def, p);
        const right = rect.x + rect.width - 1;
        expect(right < 60 - SURFACE_ENTRANCE_CLEAR_RADIUS || rect.x > 60 + SURFACE_ENTRANCE_CLEAR_RADIUS).toBe(true);
        expect(right < 20 - SURFACE_EXTRACTOR_MARGIN || rect.x > 34 + SURFACE_EXTRACTOR_MARGIN).toBe(true);
      }
    }
  });

  it('never overlaps two props and keeps the spacing between props of a kind', () => {
    const placements = run([{ doodadKey: 'tree', density: 80, spacing: 4 }, { doodadKey: 'bush', density: 80 }], {}, 3);
    const seen = new Set<string>();
    for (const p of placements) {
      const def = p.typeIndex === indexOf('tree') ? tree : bush;
      for (let dy = 0; dy < doodadRect(def, p).height; dy++) {
        for (let dx = 0; dx < doodadRect(def, p).width; dx++) {
          const key = `${p.x + dx},${p.y + dy}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    }
    const trees = placements.filter((p) => p.typeIndex === indexOf('tree')).sort((a, b) => a.x - b.x);
    for (let i = 1; i < trees.length; i++) expect(trees[i].x - trees[i - 1].x).toBeGreaterThanOrEqual(3 + 4);
  });

  it('puts only as many as the density asks for, over the width', () => {
    const few = run([{ doodadKey: 'bush', density: 5 }]).length;
    const many = run([{ doodadKey: 'bush', density: 40 }]).length;
    expect(few).toBeLessThanOrEqual(8);
    expect(many).toBeGreaterThan(few);
  });

  it('flies air props in flocks in the sky, never in the ground or off the top', () => {
    const placements = run([{ doodadKey: 'bird', density: 10, minHeight: 3, maxHeight: 8 }], {}, 2);
    expect(placements.length).toBeGreaterThanOrEqual(2);
    for (const p of placements) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y + 1).toBeLessThanOrEqual(SKY);
      expect(SKY - p.y).toBeGreaterThanOrEqual(3);
      expect(SKY - p.y).toBeLessThanOrEqual(8 + 2);
    }
  });

  it('ignores wall doodads, and only stands on blocks a doodad may stand on', () => {
    expect(run([{ doodadKey: 'moss', density: 50 }])).toEqual([]);
    const picky = doodad({ key: 'tree', width: 3, height: 5, spawn: { blocks: ['STONE'] } });
    expect(run([{ doodadKey: 'tree', density: 50 }], { doodads: [picky, bush, bird, moss] })).toEqual([]);
  });
});
