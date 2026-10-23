import { describe, it, expect } from 'vitest';
import { DEFAULT_EXTRACTOR, validateExtractor } from '@mine-me/shared';
import { defaultExtractorData, planDefaultExtractor } from './add-default-extractor';

describe('add-default-extractor', () => {
  it('creates only when the table is empty', () => {
    expect(planDefaultExtractor([]).action).toBe('create');
    expect(planDefaultExtractor(['custom']).action).toBe('skip-exists');
  });

  it('inserts a valid row without the placeholder id', () => {
    const data = defaultExtractorData();
    expect(data).not.toHaveProperty('id');
    expect(data.key).toBe(DEFAULT_EXTRACTOR.key);
    expect(validateExtractor(data)).toEqual([]);
  });
});
