import type { PrismaClient } from '@prisma/client';
import { installDefinitionsFromDatabase } from './definitionLoaders';

type DefinitionDb = Pick<PrismaClient, 'item' | 'mob' | 'miningBlock' | 'sound'>;

export type ReloadResult = { ok: true } | { ok: false; error: string };

let db: DefinitionDb | null = null;
let running: Promise<ReloadResult> | null = null;
let queued: Promise<ReloadResult> | null = null;

/** Tells the reloader which database to read. Called once at startup; until then reloads are no-ops (tests). */
export function configureDefinitionReloader(prisma: DefinitionDb | null): void {
  db = prisma;
  running = null;
  queued = null;
}

async function runReload(): Promise<ReloadResult> {
  if (!db) return { ok: true };
  try {
    // Loading happens before installing, so a failed load leaves the current definitions in place
    await installDefinitionsFromDatabase(db);
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[Definitions] Reload failed, keeping the previous definitions:', error);
    return { ok: false, error };
  }
}

/**
 * Re-reads items, mobs, blocks and sounds from the database into the running server, so admin edits
 * apply without a restart. Reloads never overlap: callers that arrive while one is running share a
 * single follow-up reload, which starts after their writes have committed. Runs already in progress
 * keep the definitions they started with; new runs and newly seen mobs get the fresh ones.
 */
export function reloadDefinitions(): Promise<ReloadResult> {
  if (!running) {
    running = runReload().finally(() => {
      running = null;
    });
    return running;
  }
  if (!queued) {
    const current = running;
    queued = current.then(() => {
      queued = null;
      return reloadDefinitions();
    });
  }
  return queued;
}
