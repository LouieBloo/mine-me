import { describe, it, expect } from 'vitest';
import { validationResult } from 'express-validator';
import { itemValidation } from '../src/validations/admin.validation';

const run = async (body: Record<string, unknown>) => {
  const req: any = { body };
  for (const rule of itemValidation) await (rule as any).run(req);
  return validationResult(req).array().filter((e: any) => e.path === 'weight');
};

describe('item weight validation', () => {
  it('accepts 0, decimals and a missing weight', async () => {
    expect(await run({ weight: 0 })).toHaveLength(0);
    expect(await run({ weight: 2.5 })).toHaveLength(0);
    expect(await run({})).toHaveLength(0);
  });

  it('rejects negative and non-numeric weights', async () => {
    expect(await run({ weight: -1 })).toHaveLength(1);
    expect(await run({ weight: 'heavy' })).toHaveLength(1);
  });
});
