import { describe, it, expect } from 'vitest';
import {
  DOODAD_ANCHORS, doodadNeedsSupport, doodadSizeChoices, toClientDoodad, validateDoodad, validateDoodadBiomes, validateDoodadMotion,
  validateDoodadParts, validateDoodadReacts, validateDoodadSizeVariants, validateDoodadSpawnRules, validateDoodadWander, validateDoodadLight,
  type DoodadDefinition,
} from './doodad';

const MUSHROOM: Partial<DoodadDefinition> = { key: 'glow_mushroom', name: 'Glow Mushroom', anchor: 'FLOOR', width: 3, height: 3, zOffset: 0, biomes: [] };
const withDoodad = (over: Record<string, unknown>) => ({ ...MUSHROOM, ...over }) as Partial<DoodadDefinition>;

describe('validateDoodad', () => {
  it('accepts a plain doodad and a fully loaded one', () => {
    expect(validateDoodad(MUSHROOM)).toEqual([]);
    expect(validateDoodad(withDoodad({
      description: 'x', textureUrl: '/assets/sprites/doodads/a.png', zOffset: 2,
      sizeVariants: [{ width: 3, height: 3, weight: 2 }, { width: 6, height: 6, weight: 1, textureUrl: '/assets/sprites/doodads/b.png' }],
      parts: [{ name: 'cap', file: '/assets/x.png', width: 64, height: 32, pivot_anchor: [32, 32], offset_from_anchor: [0, -40], z_index: 1 }],
      motion: { preset: 'sway', speed: 0.5, amplitude: 4, phase: 0.2, params: { lean: 2 } },
      reacts: { strength: 0.5, radius: 6, puffEffectId: 'fx1' },
      light: { enabled: true, type: 'POINT', effect: 'PULSE', color: '#66ffcc', radius: 6, intensity: 0.8, offsetX: 0, offsetY: -10 },
      particleOffsetX: 3, wander: { mode: 'CRAWL', radius: 6, speed: 1, pauseMs: 500 },
      spawn: { minDepth: 10, maxDepth: 90, blocks: ['STONE'], nearFluids: ['WATER'], nearGases: [], nearRadius: 6, darkOnly: true, minSpacing: 9 },
      biomes: [{ biomeId: 'b1', weight: 2, density: 1.5 }],
    }))).toEqual([]);
  });

  it('knows exactly four anchors, and only the three that hang on blocks need support', () => {
    expect(DOODAD_ANCHORS).toEqual(['FLOOR', 'CEILING', 'WALL', 'AIR']);
    expect(DOODAD_ANCHORS.filter(doodadNeedsSupport)).toEqual(['FLOOR', 'CEILING', 'WALL']);
    expect(validateDoodad(withDoodad({ anchor: 'SIDEWAYS' }))).toEqual(['anchor must be one of FLOOR, CEILING, WALL, AIR']);
    for (const anchor of DOODAD_ANCHORS) expect(validateDoodad(withDoodad({ anchor }))).toEqual([]);
  });

  it('needs a footprint with at least one whole cell each way', () => {
    for (const bad of [0, -1, 1.5, '3', NaN]) {
      expect(validateDoodad(withDoodad({ width: bad })), `width ${String(bad)}`).toEqual(['width must be a whole number of at least 1']);
      expect(validateDoodad(withDoodad({ height: bad })), `height ${String(bad)}`).toEqual(['height must be a whole number of at least 1']);
    }
    expect(validateDoodad(withDoodad({ width: 1, height: 1 }))).toEqual([]);
  });

  it('needs a good key and a name', () => {
    expect(validateDoodad(withDoodad({ key: 'Glow Mushroom' }))).toHaveLength(1);
    expect(validateDoodad(withDoodad({ key: '1abc' }))).toHaveLength(1);
    expect(validateDoodad(withDoodad({ name: '  ' }))).toEqual(['name is required']);
  });

  it('wants /assets urls and whole zOffsets', () => {
    expect(validateDoodad(withDoodad({ textureUrl: 'http://elsewhere/a.png' }))).toEqual(['textureUrl must be an /assets/... url']);
    expect(validateDoodad(withDoodad({ zOffset: 1.5 }))).toEqual(['zOffset must be a whole number']);
  });

  it('lists every problem at once', () => {
    expect(validateDoodad({ key: 'Bad', anchor: 'X' as never, width: 0, height: 0 }).length).toBeGreaterThanOrEqual(5);
  });
});

describe('the parts of a doodad', () => {
  const part = { name: 'cap', file: '/assets/a.png', width: 10, height: 10, pivot_anchor: [5, 5], offset_from_anchor: [0, 0], z_index: 0 };
  it('accept a good part and none', () => {
    expect(validateDoodadParts([part])).toEqual([]);
    expect(validateDoodadParts(null)).toEqual([]);
  });
  it('reject a bad pivot, a repeated name and a non-asset file', () => {
    expect(validateDoodadParts([{ ...part, pivot_anchor: [1] }])).toEqual(['parts[0].pivot_anchor must be [x, y]']);
    expect(validateDoodadParts([part, part])).toEqual(['parts[1].name "cap" is used twice']);
    expect(validateDoodadParts([{ ...part, file: 'a.png' }])).toEqual(['parts[0].file must be an /assets/... url']);
    expect(validateDoodadParts('x')).toEqual(['parts must be a list or null']);
  });
});

describe('size variants', () => {
  it('need whole sizes and at least one weight above 0', () => {
    expect(validateDoodadSizeVariants([{ width: 3, height: 3, weight: 1 }])).toEqual([]);
    expect(validateDoodadSizeVariants([{ width: 0, height: 3, weight: 1 }])).toEqual(['sizeVariants[0].width must be a whole number of at least 1']);
    expect(validateDoodadSizeVariants([{ width: 3, height: 3, weight: 0 }])).toEqual(['sizeVariants needs at least one with a weight above 0']);
    expect(validateDoodadSizeVariants([{ width: 3, height: 3, weight: -1 }])[0]).toContain('weight');
  });

  it('offer the variants as the sizes to pick from, or the own footprint when there are none', () => {
    expect(doodadSizeChoices({ width: 3, height: 6 })).toEqual([{ width: 3, height: 6, weight: 1 }]);
    expect(doodadSizeChoices({ width: 3, height: 6, sizeVariants: [] })).toEqual([{ width: 3, height: 6, weight: 1 }]);
    const variants = [{ width: 3, height: 3, weight: 1 }, { width: 6, height: 6, weight: 0 }, { width: 9, height: 9, weight: 2 }];
    expect(doodadSizeChoices({ width: 3, height: 6, sizeVariants: variants }).map((v) => v.width)).toEqual([3, 9]);
  });
});

describe('motion, reactions, wander, light and spawn rules', () => {
  it('motion needs a preset and sane numbers', () => {
    expect(validateDoodadMotion({ preset: 'sway' })).toEqual([]);
    expect(validateDoodadMotion({ preset: '' })).toEqual(['motion.preset is required']);
    expect(validateDoodadMotion({ preset: 'sway', phase: 2 })).toEqual(['motion.phase must be between 0 and 1']);
    expect(validateDoodadMotion({ preset: 'sway', params: { a: 'x' } })).toEqual(['motion.params.a must be a number']);
  });
  it('reactions need a strength from 0 to 1 and a radius', () => {
    expect(validateDoodadReacts({ strength: 1, radius: 3 })).toEqual([]);
    expect(validateDoodadReacts({ strength: 2, radius: 0 })).toHaveLength(2);
  });
  it('only an AIR doodad can flutter; crawling and hopping need a surface', () => {
    const wander = (mode: string) => ({ mode, radius: 3, speed: 1, pauseMs: 100 });
    expect(validateDoodad(withDoodad({ anchor: 'AIR', wander: wander('FLUTTER') }))).toEqual([]);
    expect(validateDoodad(withDoodad({ anchor: 'AIR', wander: wander('CRAWL') }))).toEqual([expect.stringContaining('CRAWL')]);
    expect(validateDoodad(withDoodad({ anchor: 'AIR', wander: wander('HOP') }))).toEqual([expect.stringContaining('HOP')]);
    expect(validateDoodad(withDoodad({ anchor: 'FLOOR', wander: wander('HOP') }))).toEqual([]);
  });
  it('wander needs a mode, a radius, a speed and a pause', () => {
    expect(validateDoodadWander({ mode: 'HOP', radius: 3, speed: 1, pauseMs: 0 })).toEqual([]);
    expect(validateDoodadWander({ mode: 'SWIM', radius: 0, speed: 0, pauseMs: -1 })).toHaveLength(4);
  });
  it('light needs a radius and an intensity', () => {
    expect(validateDoodadLight({ radius: 0, intensity: 1 })).toEqual(['light needs a radius and intensity above 0']);
  });
  it('spawn rules keep the depth window sane and the key lists real lists', () => {
    expect(validateDoodadSpawnRules({})).toEqual([]);
    expect(validateDoodadSpawnRules({ minDepth: 50, maxDepth: 10 })).toEqual(['spawn.minDepth cannot be greater than maxDepth']);
    expect(validateDoodadSpawnRules({ blocks: 'STONE' })).toEqual(['spawn.blocks must be a list of keys or null']);
    expect(validateDoodadSpawnRules({ darkOnly: 'yes' })).toEqual(['spawn.darkOnly must be true or false']);
    expect(validateDoodadSpawnRules({ nearRadius: 0 })).toEqual(['spawn.nearRadius must be greater than 0']);
  });
  it('group settings are shares between 0 and 1, whole sizes from 1 up, and a min that does not pass the max', () => {
    expect(validateDoodadSpawnRules({ groupChance: 0.8, groupSizeMin: 3, groupSizeMax: 8, groupSpread: 6, groupFill: 0.5, memberSpacing: 0, maxCount: 100 })).toEqual([]);
    expect(validateDoodadSpawnRules({ groupChance: 1.5 })).toEqual(['spawn.groupChance must be between 0 and 1']);
    expect(validateDoodadSpawnRules({ groupFill: -0.1 })).toEqual(['spawn.groupFill must be between 0 and 1']);
    expect(validateDoodadSpawnRules({ groupSizeMin: 0 })).toEqual(['spawn.groupSizeMin must be a whole number of 1 or more']);
    expect(validateDoodadSpawnRules({ groupSizeMax: 2.5 })).toEqual(['spawn.groupSizeMax must be a whole number of 1 or more']);
    expect(validateDoodadSpawnRules({ groupSizeMin: 9, groupSizeMax: 4 })).toEqual(['spawn.groupSizeMin cannot be greater than groupSizeMax']);
    expect(validateDoodadSpawnRules({ groupSpread: -1, maxCount: -1, memberSpacing: -1 })).toHaveLength(3);
  });
});

describe('biome links', () => {
  it('need a biome, a weight and density that are not negative, and no biome twice', () => {
    expect(validateDoodadBiomes([{ biomeId: 'a', weight: 0, density: 0 }])).toEqual([]);
    expect(validateDoodadBiomes([{ weight: 1 }])).toEqual(['biomes[0] needs a biomeId or biomeKey']);
    expect(validateDoodadBiomes([{ biomeId: 'a', weight: -1, density: -1 }])).toHaveLength(2);
    expect(validateDoodadBiomes([{ biomeId: 'a' }, { biomeId: 'a' }])).toEqual(['biomes[1] lists a twice']);
    expect(validateDoodadBiomes('x')).toEqual(['biomes must be a list']);
  });
});

describe('toClientDoodad', () => {
  const full = {
    ...MUSHROOM, id: 'd1', textureUrl: '/assets/a.png', motion: { preset: 'sway' }, spawn: { minDepth: 5 },
    biomes: [{ biomeId: 'b1', weight: 1, density: 1 }], sounds: { ambient: { url: '/assets/s.mp3', volume: 0.5 } },
    particleEffectId: 'fx', particleOffsetX: 4,
  } as DoodadDefinition;

  it('sends what the client draws and leaves the generator rules and biome links out', () => {
    const out = toClientDoodad(full, 3);
    expect(out).toMatchObject({ index: 3, key: 'glow_mushroom', anchor: 'FLOOR', width: 3, height: 3, textureUrl: '/assets/a.png', motion: { preset: 'sway' }, particleEffectId: 'fx', particleOffsetX: 4 });
    expect(out.sounds).toEqual(full.sounds);
    expect(out).not.toHaveProperty('spawn');
    expect(out).not.toHaveProperty('biomes');
  });

  it('leaves out what is not set, and a switched-off light', () => {
    const out = toClientDoodad({ ...MUSHROOM, id: 'd2', biomes: [], light: { enabled: false, radius: 5, intensity: 1 } } as unknown as DoodadDefinition, 0);
    expect(Object.keys(out).sort()).toEqual(['anchor', 'height', 'index', 'key', 'name', 'width', 'zOffset']);
  });
});

describe('health, fall damage and death effect (ticket 143)', () => {
  const base = { key: 'beetle', name: 'Beetle', anchor: 'FLOOR' as const, width: 3, height: 3, biomes: [] };

  it('accepts a doodad with no health, and one with whole health', () => {
    expect(validateDoodad(base)).toEqual([]);
    expect(validateDoodad({ ...base, health: 10, fallDamage: 4.5, deathParticleEffectId: 'fx1' })).toEqual([]);
    expect(validateDoodad({ ...base, health: null, fallDamage: null, deathParticleEffectId: null })).toEqual([]);
  });

  it('rejects health that is not a whole number of at least 1', () => {
    expect(validateDoodad({ ...base, health: 0 })).toContain('health must be a whole number of at least 1, or empty');
    expect(validateDoodad({ ...base, health: 2.5 })).toHaveLength(1);
    expect(validateDoodad({ ...base, health: -3 })).toHaveLength(1);
  });

  it('rejects a fall damage of 0 or less and an empty effect id', () => {
    expect(validateDoodad({ ...base, fallDamage: 0 })).toContain('fallDamage must be greater than 0, or empty');
    expect(validateDoodad({ ...base, deathParticleEffectId: '' })).toContain('deathParticleEffectId must be an effect id or null');
  });

  it('sends the client only the death effect, not the health', () => {
    const client = toClientDoodad({ ...base, id: 'd', zOffset: 0, health: 10, deathParticleEffectId: 'fx1' } as any, 0);
    expect(client.deathParticleEffectId).toBe('fx1');
    expect(client).not.toHaveProperty('health');
  });
});

describe('hiding in weather (ticket 135)', () => {
  const base = { key: 'bird', name: 'Bird', anchor: 'AIR' as const, width: 1, height: 1, biomes: [] };

  it('accepts weather kinds, none and an empty list', () => {
    expect(validateDoodad({ ...base, hiddenInWeather: ['storm', 'rain'] })).toEqual([]);
    expect(validateDoodad({ ...base, hiddenInWeather: [] })).toEqual([]);
    expect(validateDoodad({ ...base, hiddenInWeather: null })).toEqual([]);
  });

  it('rejects an unknown weather kind', () => {
    expect(validateDoodad({ ...base, hiddenInWeather: ['hail'] }).join()).toMatch(/hiddenInWeather/);
  });

  it('sends the client the weather it hides in, only when there is some', () => {
    expect(toClientDoodad({ ...base, id: 'd', zOffset: 0, hiddenInWeather: ['storm'] } as any, 0).hiddenInWeather).toEqual(['storm']);
    expect(toClientDoodad({ ...base, id: 'd', zOffset: 0, hiddenInWeather: [] } as any, 0)).not.toHaveProperty('hiddenInWeather');
  });
});
