import { describe, it, expect } from 'vitest';
import { MINING_CONFIG, doodadRect, orderDoodads, type DoodadDefinition } from '@mine-me/shared';
import { buildMapForMode } from './mapSources';
import { MiningDataManager } from './subsystems/MiningDataManager';

const data = () => MiningDataManager.getInstance();
const doodads = (): DoodadDefinition[] => data().getDoodads();
const options = (extra: object = {}) => ({
  seed: 11,
  mapConfig: { mobSpawnCount: 0 },
  fluids: data().getFluids(),
  gases: data().getGases(),
  biomes: data().getBiomes(),
  doodads: doodads(),
  ...extra,
});

describe('surface props in the built map (ticket 135)', () => {
  const surface = {
    environment: { props: [{ doodadKey: 'grass_tuft', density: 30 }, { doodadKey: 'firefly', density: 4, minHeight: 5, maxHeight: 15 }] },
    extractor: data().getDefaultExtractor(),
  };

  it('adds no surface props without a surface, and does not change the underground doodads', () => {
    const plain = buildMapForMode('singleplayer', options());
    const withSurface = buildMapForMode('singleplayer', options({ surface }));
    const belowGround = (map: typeof plain) => (map.doodads ?? []).filter((p) => p.y >= (map.surfaceRow ?? 0));
    // The surface props have their own random stream: the scenery underground is exactly what it was
    expect(belowGround(withSurface)).toEqual(belowGround(plain));
    expect(plain.doodads!.every((p) => p.y >= (plain.surfaceRow ?? 0))).toBe(true);
    expect(withSurface.doodads!.length).toBeGreaterThan(plain.doodads!.length);
  });

  it('stands floor props on the ground and flies air props in the sky rows', () => {
    const map = buildMapForMode('singleplayer', options({ surface }));
    const ordered = orderDoodads(doodads());
    const surfaceRow = map.surfaceRow!;
    const sky = (map.doodads ?? []).filter((p) => p.y < surfaceRow);
    expect(sky.length).toBeGreaterThan(3);
    for (const p of sky) {
      const def = ordered[p.typeIndex];
      const rect = doodadRect(def, p);
      expect(rect.y + rect.height).toBeLessThanOrEqual(surfaceRow);
      if (def.anchor === 'FLOOR') expect(rect.y + rect.height).toBe(surfaceRow);
    }
    expect(sky.some((p) => ordered[p.typeIndex].key === 'grass_tuft')).toBe(true);
    expect(sky.some((p) => ordered[p.typeIndex].key === 'firefly')).toBe(true);
  });

  it('keeps the exit and the extractor pad clear', () => {
    const map = buildMapForMode('singleplayer', options({ surface }));
    const ordered = orderDoodads(doodads());
    const surfaceRow = map.surfaceRow!;
    for (const p of (map.doodads ?? []).filter((q) => q.y < surfaceRow)) {
      const rect = doodadRect(ordered[p.typeIndex], p);
      if (ordered[p.typeIndex].anchor !== 'FLOOR') continue;
      expect(Math.abs(rect.x + rect.width / 2 - MINING_CONFIG.ENTRANCE_X)).toBeGreaterThan(2);
    }
  });

  it('is the same for the same seed', () => {
    expect(buildMapForMode('singleplayer', options({ surface })).doodads).toEqual(buildMapForMode('singleplayer', options({ surface })).doodads);
  });

  it('puts the props in the sandbox only when its doodad generation is on', () => {
    const off = buildMapForMode('sandbox', options({ surface }));
    expect((off.doodads ?? []).length).toBe(0);
    const on = buildMapForMode('sandbox', options({ surface, sandboxDoodads: true }));
    expect((on.doodads ?? []).some((p) => p.y < (on.surfaceRow ?? 0))).toBe(true);
  });

  it('adds nothing for an environment with no props', () => {
    const none = buildMapForMode('singleplayer', options({ surface: { environment: { props: [] }, extractor: null } }));
    expect(none.doodads).toEqual(buildMapForMode('singleplayer', options()).doodads);
  });
});
