import { describe, it, expect } from 'vitest';
import { FIRST_BIOMES } from './add-first-biomes';
import { OIL_BASE_PERCENTAGE, OIL_MIN_DEPTH, planTune, withFullDirtSwaps, withoutOil } from './tune-biomes-and-oil';

describe('tune-biomes-and-oil', () => {
  it('makes only the dirt swaps total and leaves other swaps and weights alone', () => {
    const palette = { swaps: [{ from: 'DIRT', to: 'CLAY', chance: 0.3 }, { from: 'ROCK', to: 'STONE', chance: 0.4 }], weights: { COPPERIUM: 2 } };
    expect(withFullDirtSwaps(palette)).toEqual({ swaps: [{ from: 'DIRT', to: 'CLAY', chance: 1 }, { from: 'ROCK', to: 'STONE', chance: 0.4 }], weights: { COPPERIUM: 2 } });
    expect(withFullDirtSwaps({ swaps: [{ from: 'DIRT', to: 'CLAY', chance: 1 }] })).toBeNull();
    expect(withFullDirtSwaps(null)).toBeNull();
  });

  it('puts oil at none in the default biome once, keeping its other weights', () => {
    expect(withoutOil(null)).toEqual({ OIL: 0 });
    expect(withoutOil({ WATER: 2 })).toEqual({ WATER: 2, OIL: 0 });
    expect(withoutOil({ OIL: 0 })).toBeNull();
  });

  it('plans only what differs, and lowers oil only when it is above the new share', () => {
    const biomes = [
      { key: 'default', isDefault: true, blockPalette: null, fluidWeights: null },
      { key: 'clay', isDefault: false, blockPalette: { swaps: [{ from: 'DIRT', to: 'CLAY', chance: 0.85 }] }, fluidWeights: null },
    ];
    const plan = planTune(biomes, [{ id: 'o', typeKey: 'OIL', generation: { percentage: 10, minDepth: 6 } }]);
    expect(plan.biomePalettes.map((b) => b.key)).toEqual(['clay']);
    expect(plan.defaultOil).toEqual({ key: 'default', fluidWeights: { OIL: 0 } });
    expect(plan.oil).toEqual({ id: 'o', generation: { percentage: OIL_BASE_PERCENTAGE, minDepth: OIL_MIN_DEPTH } });
    const again = planTune([{ ...biomes[0], fluidWeights: { OIL: 0 } }], [{ id: 'o', typeKey: 'OIL', generation: { percentage: 2, minDepth: 40 } }]);
    expect(again).toEqual({ biomePalettes: [], defaultOil: null, oil: null });
  });

  it('seeds the first biomes with total dirt swaps and an oil-free default', () => {
    for (const b of FIRST_BIOMES) for (const s of b.blockPalette?.swaps ?? []) if (s.from === 'DIRT') expect(s.chance, b.key).toBe(1);
    expect(FIRST_BIOMES.find((b) => b.isDefault)?.fluidWeights?.OIL).toBe(0);
  });
});
