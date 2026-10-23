/**
 * One-off, idempotent data script (ticket 119): adds the default "Basic Extractor" row if the table has no extractor.
 * The values mirror `DEFAULT_EXTRACTOR` in the shared package (the game falls back to it when the table is empty, so
 * running this is optional; it just gives the admin (ticket 126) something to edit).
 *
 *   npx tsx prisma/add-default-extractor.ts           # dry run
 *   npx tsx prisma/add-default-extractor.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_EXTRACTOR, validateExtractor } from '@mine-me/shared';

export interface ExtractorPlan {
  action: 'create' | 'skip-exists';
  key: string;
}

/** Creates the default only when no extractor exists (an extractor edited in the admin is never replaced). */
export function planDefaultExtractor(existingKeys: readonly string[]): ExtractorPlan {
  return existingKeys.length === 0 ? { action: 'create', key: DEFAULT_EXTRACTOR.key } : { action: 'skip-exists', key: DEFAULT_EXTRACTOR.key };
}

/** The row to insert: the built-in default without its placeholder id and timestamps. */
export function defaultExtractorData() {
  const { id: _id, createdAt: _c, updatedAt: _u, sounds: _s, soundEffects: _e, description, textureUrl, ...rest } = DEFAULT_EXTRACTOR;
  return { ...rest, description: description ?? null, textureUrl: textureUrl ?? null };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const problems = validateExtractor(DEFAULT_EXTRACTOR);
    if (problems.length > 0) throw new Error(`The built-in extractor is invalid: ${problems.join('; ')}`);
    const existing = await prisma.extractor.findMany({ select: { key: true } });
    const plan = planDefaultExtractor(existing.map((e) => e.key));
    console.log(plan.action === 'create' ? `Will create the "${plan.key}" extractor.` : `Extractors already exist (${existing.length}); nothing to do.`);
    if (!apply || plan.action !== 'create') {
      if (!apply) console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    await prisma.extractor.create({ data: defaultExtractorData() });
    console.log('Done. Restart the server (or save in the admin) so it loads.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
