import { describe, it, expect } from 'vitest';
import { WEATHER_IDS } from './weatherTypes';
import { validateDoodad } from '../../types/doodad';

describe('weather ids and the doodad list', () => {
  it('every weather kind can be used in a doodad hiddenInWeather list', () => {
    for (const id of WEATHER_IDS) {
      expect(validateDoodad({ key: 'bird', name: 'Bird', anchor: 'AIR', width: 1, height: 1, biomes: [], hiddenInWeather: [id] })).toEqual([]);
    }
  });
});
