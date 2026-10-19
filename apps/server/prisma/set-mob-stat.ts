/**
 * Sets one numeric stat column (`moveSpeed`, `jumpForce`, `hitStunMs`, `stunImmunityMs`) on one mob, found by name or id.
 * Touches nothing else (unlike `prisma db seed`, which overwrites admin edits). Dry run unless --apply. Speeds and
 * jumps are in the small blocks the game uses now (the 3x scale): the player runs at 13.5 and jumps with 25.5.
 *
 *   npx tsx prisma/set-mob-stat.ts "Mole Person" jumpForce 25.5           # dry run: prints the change
 *   npx tsx prisma/set-mob-stat.ts "Mole Person" jumpForce 25.5 --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

export const MOB_STATS = ['moveSpeed', 'jumpForce', 'hitStunMs', 'stunImmunityMs'] as const;
export type MobStat = (typeof MOB_STATS)[number];

export function parseStat(name: string | undefined, raw: string | undefined): { stat: MobStat; value: number } {
  if (!MOB_STATS.includes(name as MobStat)) throw new Error(`Stat must be one of: ${MOB_STATS.join(', ')}`);
  const value = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error('Give a number that is zero or more, e.g. 25.5');
  return { stat: name as MobStat, value };
}

async function main() {
  const [mob, name, raw] = process.argv.slice(2).filter((a) => a !== '--apply');
  if (!mob) throw new Error('Usage: set-mob-stat.ts "<mob name or id>" <stat> <value> [--apply]');
  const { stat, value } = parseStat(name, raw);
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const mobs = await prisma.mob.findMany({ where: { OR: [{ id: mob }, { name: mob }] } });
    if (mobs.length === 0) throw new Error(`No mob named or with id "${mob}"`);
    for (const row of mobs) {
      console.log(`${row.name} (${row.id}): ${stat} ${row[stat]} -> ${value}`);
      if (apply) await prisma.mob.update({ where: { id: row.id }, data: { [stat]: value } });
    }
    console.log(apply ? 'Applied.' : 'Dry run: nothing changed. Add --apply to do it.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
