import { describe, it, expect } from 'vitest';
import { validateDoodad, type DoodadDefinition } from '@mine-me/shared';
import { FIRST_DOODADS } from './add-first-doodads';
import { FIRST_DOODAD_HEALTH, planHealth } from './set-doodad-health';

describe('set-doodad-health', () => {
  it('gives health only to doodads of the first set, and a valid amount', () => {
    const keys = FIRST_DOODADS.map((d) => d.key);
    for (const [key, health] of Object.entries(FIRST_DOODAD_HEALTH)) {
      expect(keys, key).toContain(key);
      expect(validateDoodad({ key, name: 'x', anchor: 'FLOOR', width: 1, height: 1, health, biomes: [] } as Partial<DoodadDefinition>)).toEqual([]);
    }
  });

  it('makes every creature and every hanging doodad hurtable, and leaves plain scenery alone', () => {
    for (const d of FIRST_DOODADS) {
      const hurtable = d.key in FIRST_DOODAD_HEALTH;
      if (d.wander) expect(hurtable, d.key).toBe(true);
      if (d.anchor === 'CEILING') expect(hurtable, d.key).toBe(true);
      if (!d.wander && d.anchor !== 'CEILING') expect(hurtable, d.key).toBe(false);
    }
  });

  it('sets health where there is none, keeps what an admin set, and notes missing doodads', () => {
    const plan = planHealth([{ key: 'firefly', health: null }, { key: 'icicle', health: 99 }], { firefly: 1, icicle: 5, nope: 3 });
    expect(plan).toEqual([
      { key: 'firefly', action: 'set', health: 1, current: null },
      { key: 'icicle', action: 'keep', health: 5, current: 99 },
      { key: 'nope', action: 'missing', health: 3 },
    ]);
  });
});
