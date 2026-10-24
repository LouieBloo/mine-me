import { describe, it, expect } from 'vitest';
import { validateDoodad, type DoodadDefinition } from '@mine-me/shared';
import { NEW_DOODAD, DEFAULT_REACTS, DEFAULT_WANDER, doodadToForm, formToDoodad, previewDoodad, spawnDepthText, tidySpawn } from './doodadForm';

const SAVED: DoodadDefinition = {
  id: 'd1', key: 'glow_mushroom', name: 'Glow Mushroom', description: 'It glows', anchor: 'FLOOR', width: 3, height: 3,
  sizeVariants: [{ width: 3, height: 3, weight: 2 }], textureUrl: '/assets/sprites/doodads/glow.png', parts: null, zOffset: 1,
  motion: { preset: 'sway', speed: 0.5 }, reacts: DEFAULT_REACTS, light: null, particleEffectId: null, wander: null,
  spawn: { minDepth: 9, blocks: ['STONE'] }, biomes: [{ biomeId: 'b1', biomeKey: 'frozen_caves', weight: 2, density: 1.5 }],
};

describe('doodadForm', () => {
  it('turns a saved doodad into a form and back without changing it', () => {
    const body = formToDoodad(doodadToForm(SAVED));
    expect(body).toMatchObject({
      key: 'glow_mushroom', name: 'Glow Mushroom', anchor: 'FLOOR', width: 3, height: 3, zOffset: 1, textureUrl: '/assets/sprites/doodads/glow.png',
      sizeVariants: [{ width: 3, height: 3, weight: 2 }], motion: { preset: 'sway', speed: 0.5 }, spawn: { minDepth: 9, blocks: ['STONE'] },
    });
    expect(body.biomes).toEqual([{ biomeId: 'b1', biomeKey: 'frozen_caves', weight: 2, density: 1.5 }]);
    expect(validateDoodad(body)).toEqual([]);
  });

  it('a brand new doodad is a valid one apart from its key and name', () => {
    const errors = validateDoodad(formToDoodad(NEW_DOODAD));
    expect(errors).toHaveLength(2);
    expect(errors.join(' ')).toMatch(/key/);
    expect(errors.join(' ')).toMatch(/name/);
    expect(validateDoodad(formToDoodad({ ...NEW_DOODAD, key: 'moss', name: 'Moss' }))).toEqual([]);
  });

  it('stores what is empty as null, so a doodad with nothing set has no stray empty objects', () => {
    const body = formToDoodad({ ...NEW_DOODAD, key: 'moss', name: ' Moss ', description: '  ', motion: { preset: '' } });
    expect(body).toMatchObject({ name: 'Moss', description: null, sizeVariants: null, parts: null, motion: null, reacts: null, light: null, wander: null, spawn: null, textureUrl: null });
  });

  it('keeps a blank number as NaN in the form, which validation refuses', () => {
    const errors = validateDoodad(formToDoodad({ ...NEW_DOODAD, key: 'moss', name: 'Moss', width: NaN }));
    expect(errors.join(' ')).toMatch(/width/);
  });

  describe('tidySpawn', () => {
    it('drops empty lists, a radius nobody needs, and false flags', () => {
      expect(tidySpawn({ blocks: [], nearFluids: [], nearRadius: 6, darkOnly: false, minSpacing: 0 })).toBeNull();
      expect(tidySpawn({ nearFluids: ['WATER'], nearRadius: 6, darkOnly: true, minSpacing: 3 })).toEqual({ nearFluids: ['WATER'], nearRadius: 6, darkOnly: true, minSpacing: 3 });
    });
    it('ignores a number still being typed', () => {
      expect(tidySpawn({ minDepth: NaN, maxDepth: 30 })).toEqual({ maxDepth: 30 });
    });
  });

  describe('previewDoodad', () => {
    it('replaces half-typed values with safe ones so the preview never breaks', () => {
      const p = previewDoodad({ ...NEW_DOODAD, key: 'Bad Key', name: '', width: NaN, height: 0, particleOffsetX: NaN, zOffset: NaN, reacts: { strength: NaN, radius: 3 } });
      expect(p.key).toBe('new_doodad');
      expect(p.name).toBe('New doodad');
      expect(p.width).toBe(3);
      expect(p.height).toBe(3);
      expect(p.particleOffsetX).toBe(0);
      expect(p.zOffset).toBe(0);
      expect(p.reacts).toBeNull();
    });

    it('keeps real values, drops unusable size variants, and lets an AIR doodad only flutter', () => {
      const p = previewDoodad({
        ...NEW_DOODAD, key: 'fly', name: 'Fly', anchor: 'AIR', sizeVariants: [{ width: 3, height: 3, weight: 1 }, { width: NaN, height: 3, weight: 1 }, { width: 3, height: 3, weight: 0 }],
        wander: { ...DEFAULT_WANDER, mode: 'CRAWL' },
      });
      expect(p.sizeVariants).toEqual([{ width: 3, height: 3, weight: 1 }]);
      expect(p.wander?.mode).toBe('FLUTTER');
    });
  });

  it('writes the spawn depth in original blocks', () => {
    expect(spawnDepthText(null)).toBe('any depth');
    expect(spawnDepthText({ minDepth: 9 })).toBe('3 - bottom');
    expect(spawnDepthText({ maxDepth: 30 })).toBe('0 - 10');
    expect(spawnDepthText({ minDepth: 9, maxDepth: 30 })).toBe('3 - 10');
  });
});
