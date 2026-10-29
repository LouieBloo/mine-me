import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BiomeDefinition } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningDataManager, type GameDefinitions } from './subsystems/MiningDataManager';

const biome = (key: string, over: Partial<BiomeDefinition> = {}): BiomeDefinition => ({
  id: `b_${key}`, key, name: key, isDefault: false, minDepth: 0, maxDepth: null, weight: 1, noiseScale: 24, ...over,
});

/** A default, a deep-only biome and a second one with a narrow window: without picking, 'deep' only exists far down. */
const BIOMES = [biome('base', { isDefault: true }), biome('deep', { minDepth: 90 }), biome('frozen', { minDepth: 20, maxDepth: 40 })];

describe('a Single Player run that picked its biomes (ticket 144)', () => {
  let original: MiningDataManager;
  let engine: MiningGameEngine | undefined;

  const install = (biomes: BiomeDefinition[]) => {
    const raw = original as unknown as { items: GameDefinitions['items']; mobs: GameDefinitions['mobs']; blocksByTypeKey: Map<string, GameDefinitions['blocks'][number]> };
    MiningDataManager.initialize({ items: raw.items, mobs: raw.mobs, blocks: [...raw.blocksByTypeKey.values()], fluids: original.getFluids(), gases: original.getGases(), biomes });
  };
  const make = (biomeKeys?: string[], gameMode: 'singleplayer' | 'multiplayer' | 'sandbox' = 'singleplayer', mapConfig: Record<string, unknown> = {}) => {
    engine = new MiningGameEngine({
      characterId: 'pick-char', cityId: 'c', seed: 6, gameMode, biomeKeys,
      socket: { connected: true, emit: vi.fn() } as any,
      mapConfig: { mobSpawnCount: 0, ...mapConfig },
    });
    return engine;
  };
  /** The keys of the biomes that are the primary biome of some cell. */
  const present = (room: MiningGameEngine): string[] => {
    const field = room.biomeField!;
    const used = new Set<number>();
    for (const index of room.biomeGrid ?? field.primaryGrid()) used.add(index);
    return [...used].map((i) => field.biomes[i].key).sort();
  };

  beforeEach(() => {
    original = MiningDataManager.getInstance();
    install(BIOMES);
  });
  afterEach(() => {
    engine?.stop();
    engine = undefined;
    install([]);
  });

  it('fills the whole mine with the one biome picked, even a deep one, and drops the default', () => {
    expect(present(make(['deep']))).toEqual(['deep']);
  });

  it('shares the mine between several picked biomes, without the default', () => {
    const keys = present(make(['deep', 'frozen']));
    expect(keys).toEqual(['deep', 'frozen']);
  });

  it('keeps the default when it is one of the picks', () => {
    expect(present(make(['base', 'deep']))).toEqual(['base', 'deep']);
  });

  it('is a normal map with nothing picked: the depth windows still apply', () => {
    const room = make();
    const field = room.biomeField!;
    const deep = field.biomes.findIndex((b) => b.key === 'deep');
    // Near the surface the deep biome is never the primary biome
    for (let x = 0; x < room.grid[0].length; x += 7) expect(field.primaryAt(x, 5)).not.toBe(deep);
    expect(present(room)).toContain('base');
  });

  it('is a normal map when the picks name no biome', () => {
    expect(present(make(['nope']))).toEqual(present(make()));
  });

  it('ignores the map config biome weights for a run that picked', () => {
    expect(present(make(['deep', 'frozen'], 'singleplayer', { biomeWeights: { deep: 1 } }))).toEqual(['deep', 'frozen']);
  });

  it('is ignored by multiplayer rooms', () => {
    const room = make(['deep'], 'multiplayer');
    expect(room.runBiomeKeys).toEqual([]);
    expect(present(room)).toContain('base');
  });

  it('is ignored by the sandbox, which lays out its own biomes', () => {
    expect(make(['deep'], 'sandbox').runBiomeKeys).toEqual([]);
  });

  it('only trusts well formed keys', () => {
    expect(make(['deep', 5 as any, 'Bad Key', 'deep']).runBiomeKeys).toEqual(['deep']);
  });

  it('tells the client about the picked biomes only, so their look follows the player', () => {
    const room = make(['deep', 'frozen']);
    const list = room.clientBiomes()!;
    expect(list.map((b) => b.key).sort()).toEqual(['deep', 'frozen']);
  });
});
