/**
 * One-off, idempotent data migration for the audio overhaul (ticket 032).
 *
 *  1. Back-fills the sound library: every audio file under assets/sounds with no `Sound` row gets
 *     one (category from its folder: items/, blocks/, mobs/). Rows whose file is gone are reported,
 *     never deleted.
 *  2. Links mobs to the library: a mob with no `soundEffects` yet, whose seed-JSON `sounds` point at
 *     files that have a library row, gets those slots linked by sound id.
 *
 * It touches nothing else (unlike `prisma db seed`, which overwrites admin edits).
 *
 *   npx tsx prisma/migrate-sound-library.ts           # dry run: prints what it would do
 *   npx tsx prisma/migrate-sound-library.ts --apply   # does it
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { isMobSoundSlot, type MobSoundSlotRefs } from '@mine-me/shared';
import { syncSoundLibrary } from '../src/services/soundLibrary.service';

const SHARED = path.join(__dirname, '../../../packages/shared');

export interface MobLinkPlan {
  mobId: string;
  mobName: string;
  soundEffects: MobSoundSlotRefs;
}

/**
 * Pure planner: for mobs with no stored sound references, turns the seed JSON's slot urls into
 * references to the library sounds that have those urls. Slots whose url has no library row are skipped.
 */
export function planMobSoundLinks(
  mobs: { id: string; name: string; soundEffects?: unknown }[],
  seedSounds: Record<string, Record<string, { url?: string | null } | undefined> | undefined>,
  library: { id: string; url: string }[]
): MobLinkPlan[] {
  const idByUrl = new Map(library.map((s) => [s.url, s.id]));
  const plans: MobLinkPlan[] = [];
  for (const mob of mobs) {
    const hasRefs = mob.soundEffects && typeof mob.soundEffects === 'object' && Object.keys(mob.soundEffects).length > 0;
    if (hasRefs) continue;
    const soundEffects: MobSoundSlotRefs = {};
    for (const [slot, cfg] of Object.entries(seedSounds[mob.id] ?? {})) {
      const soundId = cfg?.url ? idByUrl.get(cfg.url) : undefined;
      if (isMobSoundSlot(slot) && soundId) soundEffects[slot] = { soundId };
    }
    if (Object.keys(soundEffects).length > 0) plans.push({ mobId: mob.id, mobName: mob.name, soundEffects });
  }
  return plans;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const soundsDir = path.join(SHARED, 'assets/sounds');
    const report = await syncSoundLibrary(prisma, soundsDir, { dryRun: !apply });
    for (const a of report.added) console.log(`${apply ? 'registered' : 'would register'} ${a.category.padEnd(7)} ${a.url}`);
    for (const m of report.missing) console.log(`WARNING library row has no file: "${m.name}" (${m.url}) - left alone`);

    const mobsJson = JSON.parse(fs.readFileSync(path.join(SHARED, 'src/data/mobs.json'), 'utf-8')) as any[];
    const seedSounds = Object.fromEntries(mobsJson.filter((m) => m.sounds).map((m) => [m.id, m.sounds]));
    // In a dry run the files above are not registered yet, so link against what exists after a real sync
    const library = await prisma.sound.findMany({ select: { id: true, url: true } });
    const mobs = await prisma.mob.findMany({ select: { id: true, name: true, soundEffects: true } });
    const links = planMobSoundLinks(mobs, seedSounds, library);
    for (const l of links) {
      console.log(`${apply ? 'linking' : 'would link'} "${l.mobName}": ${Object.keys(l.soundEffects).join(', ')}`);
    }

    if (report.added.length === 0 && links.length === 0) {
      console.log('Nothing to do: the sound library is already migrated.');
      return;
    }
    if (!apply) {
      console.log('\nDry run only. Re-run with --apply to make these changes.');
      return;
    }
    for (const l of links) {
      await prisma.mob.update({ where: { id: l.mobId }, data: { soundEffects: l.soundEffects as any } });
    }
    console.log('\nDone. Restart the server so it reloads definitions.');
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
