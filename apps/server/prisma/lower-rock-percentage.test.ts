import { describe, it, expect } from 'vitest';
import { MINING_CONFIG } from '@mine-me/shared';
import { NEW_ROCK_PERCENTAGE, configsToLower } from './lower-rock-percentage';

describe('lower-rock-percentage', () => {
  it('changes only configs still at the old 6%, and matches the new default', () => {
    const rows = [{ id: 'a', name: 'Default', rockPercentage: 6 }, { id: 'b', name: 'Mine', rockPercentage: 9 }];
    expect(configsToLower(rows).map((r) => r.id)).toEqual(['a']);
    expect(NEW_ROCK_PERCENTAGE).toBe(MINING_CONFIG.ROCK_PERCENTAGE);
  });
});
