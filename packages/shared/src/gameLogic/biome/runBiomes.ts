import type { BiomeDefinition } from '../../types/biome';

/** The most biomes one run can pick; more than the game has is pointless and keeps the request small. */
export const MAX_RUN_BIOME_KEYS = 32;

const BIOME_KEY = /^[a-z][a-z0-9_]*$/;

/** The biome keys out of an untrusted value (a request): strings that look like keys, once each, at most `MAX_RUN_BIOME_KEYS`. */
export function sanitizeBiomeKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const keys: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && BIOME_KEY.test(entry) && !keys.includes(entry)) keys.push(entry);
    if (keys.length >= MAX_RUN_BIOME_KEYS) break;
  }
  return keys;
}

/**
 * The biomes of a run where the player chose which ones to see. Only the chosen biomes stay (the default biome is dropped
 * unless it was chosen), each at equal weight and with no depth window, so they fill the whole mine and share it by their
 * noise regions. The field needs exactly one default, so the first chosen biome by key takes that role. Keys that name no
 * biome are ignored; with nothing valid chosen the list comes back unchanged (a normal run).
 */
export function pickRunBiomes(biomes: readonly BiomeDefinition[] | undefined, keys: readonly string[] | undefined): BiomeDefinition[] | undefined {
  if (!biomes) return undefined;
  const wanted = new Set(keys ?? []);
  const picked = biomes.filter((b) => wanted.has(b.key)).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (picked.length === 0) return [...biomes];
  return picked.map((b, i) => ({ ...b, isDefault: i === 0, weight: 1, minDepth: 0, maxDepth: null }));
}

/** What the picker shows of a biome. */
export interface PickableBiome {
  key: string;
  name: string;
  description: string | null;
}

/** The biomes a player can pick, by name. Only names and descriptions leave the server: nothing about how a biome generates. */
export function listPickableBiomes(biomes: readonly BiomeDefinition[] | undefined): PickableBiome[] {
  return [...(biomes ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => ({ key: b.key, name: b.name, description: b.description ?? null }));
}
