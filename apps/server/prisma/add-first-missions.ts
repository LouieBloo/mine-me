/**
 * One-off, idempotent data script (tickets 108-114): the first pass of missions. Creates, only the ones that are missing, eight
 * starter missions across the objective types and three tiers (collect ore, kill mobs, clear a gas or fluid, reach a depth, and
 * harder mixes of them), each with a coin, XP and item reward. Targets are named by item name, mob name, or fluid / gas type
 * key and resolved to ids when the rows are made, so nothing here is tied to one database. Existing missions (same key) are never
 * touched. Numbers are a first guess to tune in the admin Missions page.
 *
 *   npx tsx prisma/add-first-missions.ts           # dry run: prints what it would do
 *   npx tsx prisma/add-first-missions.ts --apply   # does it (and refreshes the dev seed file missions.json)
 */
import fs from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { validateMission, type MissionDefinition, type MissionLookups, type ObjectiveDefinition } from '@mine-me/shared';

/** An objective whose target is a name, resolved to an id later. */
export interface FirstObjective {
  type: ObjectiveDefinition['type'];
  /** Item name, mob name, or fluid / gas type key; absent for a goal with no target (depth, any mob). */
  target?: string;
  amount: number;
}

export interface FirstMission {
  key: string;
  name: string;
  description: string;
  minLevel: number;
  maxLevel: number;
  tier: number;
  weight: number;
  objectives: FirstObjective[];
  rewardCoins: number;
  rewardXp: number;
  /** Reward items by item name. */
  rewardItems: { item: string; chance: number; minQuantity: number; maxQuantity: number }[];
}

/** Depths are in small blocks: the original value x 3. */
export const FIRST_MISSIONS: readonly FirstMission[] = [
  { key: 'first_copper', name: 'Copper Run', description: 'The forge is hungry. Dig out some copperium and bring it home.', minLevel: 1, maxLevel: 3, tier: 1, weight: 3, objectives: [{ type: 'MINE_ITEM', target: 'Copperium', amount: 10 }], rewardCoins: 30, rewardXp: 20, rewardItems: [] },
  { key: 'mole_trouble', name: 'Mole Trouble', description: 'Mole people have been undermining the tunnels. Thin them out.', minLevel: 1, maxLevel: 3, tier: 1, weight: 2, objectives: [{ type: 'KILL_MOB', target: 'Mole Person', amount: 3 }], rewardCoins: 40, rewardXp: 30, rewardItems: [] },
  { key: 'clear_the_air', name: 'Clear the Air', description: 'A pocket of hydrogen is building up deep down. Vent it, burn it or blow it, but get rid of it.', minLevel: 1, maxLevel: 4, tier: 1, weight: 2, objectives: [{ type: 'CLEAR_GAS', target: 'HYDROGEN', amount: 10 }], rewardCoins: 50, rewardXp: 40, rewardItems: [{ item: 'Copperium', chance: 50, minQuantity: 1, maxQuantity: 3 }] },
  { key: 'first_descent', name: 'First Descent', description: 'Nobody has measured the mine in years. Go down and see how far it goes.', minLevel: 1, maxLevel: 3, tier: 1, weight: 2, objectives: [{ type: 'REACH_DEPTH', amount: 45 }], rewardCoins: 35, rewardXp: 25, rewardItems: [] },
  { key: 'silver_vein', name: 'The Silver Vein', description: 'Rumour has silverium below the copper. Find it, and get down to it.', minLevel: 2, maxLevel: 4, tier: 2, weight: 2, objectives: [{ type: 'MINE_ITEM', target: 'Silverium', amount: 8 }, { type: 'REACH_DEPTH', amount: 60 }], rewardCoins: 120, rewardXp: 80, rewardItems: [{ item: 'Copperium', chance: 100, minQuantity: 3, maxQuantity: 6 }] },
  { key: 'pest_control', name: 'Pest Control', description: 'Anything that moves down there is a problem. Clear out eight of them.', minLevel: 2, maxLevel: 4, tier: 2, weight: 2, objectives: [{ type: 'KILL_MOB', amount: 8 }], rewardCoins: 100, rewardXp: 70, rewardItems: [] },
  { key: 'burn_the_oil', name: 'Burn the Oil', description: 'Oil seeps through the lower tunnels and one spark would be a disaster. Get rid of a good part of it, on purpose.', minLevel: 2, maxLevel: 4, tier: 2, weight: 1, objectives: [{ type: 'CLEAR_FLUID', target: 'OIL', amount: 40 }], rewardCoins: 110, rewardXp: 75, rewardItems: [] },
  { key: 'deep_silver', name: 'Deep Silver', description: 'The richest silverium lies far down, and the moles guard it. Go deep, dig it out and deal with them.', minLevel: 3, maxLevel: 4, tier: 3, weight: 1, objectives: [{ type: 'MINE_ITEM', target: 'Silverium', amount: 15 }, { type: 'KILL_MOB', target: 'Mole Person', amount: 5 }, { type: 'REACH_DEPTH', amount: 90 }], rewardCoins: 300, rewardXp: 200, rewardItems: [{ item: 'Silverium', chance: 100, minQuantity: 2, maxQuantity: 4 }] },
];

/** What the database has, by the names the templates use. */
export interface Catalog {
  items: ReadonlyMap<string, string>;
  mobs: ReadonlyMap<string, string>;
  fluids: ReadonlyMap<string, string>;
  gases: ReadonlyMap<string, string>;
}

export interface MissionRow {
  key: string;
  name: string;
  description: string;
  minLevel: number;
  maxLevel: number;
  tier: number;
  weight: number;
  objectives: ObjectiveDefinition[];
  rewardCoins: number;
  rewardXp: number;
  rewardItems: { itemId: string; chance: number; minQuantity: number; maxQuantity: number }[];
}

const targetMap = (type: FirstObjective['type'], c: Catalog): ReadonlyMap<string, string> | null =>
  type === 'MINE_ITEM' ? c.items : type === 'KILL_MOB' ? c.mobs : type === 'CLEAR_FLUID' ? c.fluids : type === 'CLEAR_GAS' ? c.gases : null;

/** Turns a template into a row, or says what in it the database does not have. */
export function resolveMission(m: FirstMission, c: Catalog): { row: MissionRow } | { problems: string[] } {
  const problems: string[] = [];
  const objectives: ObjectiveDefinition[] = m.objectives.map((o) => {
    const map = targetMap(o.type, c);
    if (!o.target || !map) return { type: o.type, amount: o.amount };
    const id = map.get(o.target);
    if (!id) problems.push(`no ${o.type} target "${o.target}"`);
    return { type: o.type, targetId: id, amount: o.amount };
  });
  const rewardItems = m.rewardItems.flatMap((r) => {
    const itemId = c.items.get(r.item);
    if (!itemId) {
      problems.push(`no reward item "${r.item}"`);
      return [];
    }
    return [{ itemId, chance: r.chance, minQuantity: r.minQuantity, maxQuantity: r.maxQuantity }];
  });
  if (problems.length > 0) return { problems };
  return { row: { key: m.key, name: m.name, description: m.description, minLevel: m.minLevel, maxLevel: m.maxLevel, tier: m.tier, weight: m.weight, objectives, rewardCoins: m.rewardCoins, rewardXp: m.rewardXp, rewardItems } };
}

export interface PlanRow { mission: FirstMission; action: 'create' | 'skip' | 'problem'; row?: MissionRow; notes: string[] }

/** What the script does for each template: create it, skip one that exists, or report what the database lacks. */
export function planMissions(existingKeys: readonly string[], c: Catalog, lookups: MissionLookups, templates: readonly FirstMission[] = FIRST_MISSIONS): PlanRow[] {
  return templates.map((mission) => {
    if (existingKeys.includes(mission.key)) return { mission, action: 'skip' as const, notes: [] };
    const resolved = resolveMission(mission, c);
    if ('problems' in resolved) return { mission, action: 'problem' as const, notes: resolved.problems };
    const errors = validateMission(resolved.row as unknown as Partial<MissionDefinition>, lookups);
    return errors.length > 0 ? { mission, action: 'problem' as const, notes: errors } : { mission, action: 'create' as const, row: resolved.row, notes: [] };
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const [items, mobs, fluids, gases, blocks, existing] = await Promise.all([
      prisma.item.findMany({ select: { id: true, name: true } }),
      prisma.mob.findMany({ select: { id: true, name: true } }),
      prisma.fluid.findMany({ select: { id: true, typeKey: true } }),
      prisma.gas.findMany({ select: { id: true, typeKey: true } }),
      prisma.miningBlock.findMany({ select: { dropTable: { select: { items: { select: { itemId: true } } } } } }),
      prisma.mission.findMany({ select: { key: true } }),
    ]);
    const catalog: Catalog = {
      items: new Map(items.map((i) => [i.name, i.id])),
      mobs: new Map(mobs.map((m) => [m.name, m.id])),
      fluids: new Map(fluids.map((f) => [f.typeKey, f.id])),
      gases: new Map(gases.map((g) => [g.typeKey, g.id])),
    };
    const mineable = new Set(blocks.flatMap((b) => b.dropTable?.items.map((i) => i.itemId) ?? []));
    const ids = (map: ReadonlyMap<string, string>) => new Set(map.values());
    const lookups: MissionLookups = {
      hasItem: (id) => ids(catalog.items).has(id),
      hasMob: (id) => ids(catalog.mobs).has(id),
      hasFluid: (id) => ids(catalog.fluids).has(id),
      hasGas: (id) => ids(catalog.gases).has(id),
      nameOf: () => undefined,
      itemIsMineable: (id) => mineable.has(id),
    };
    const plan = planMissions(existing.map((e) => e.key), catalog, lookups);
    for (const p of plan) {
      console.log(`Mission ${p.mission.key} (${p.mission.name}, tier ${p.mission.tier}):`, p.action === 'create' ? 'will be created' : p.action === 'skip' ? 'exists, skipped' : `cannot be made - ${p.notes.join('; ')}`);
    }
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const p of plan) {
      if (p.action !== 'create' || !p.row) continue;
      await prisma.mission.create({
        data: {
          key: p.row.key, name: p.row.name, description: p.row.description, minLevel: p.row.minLevel, maxLevel: p.row.maxLevel, tier: p.row.tier, weight: p.row.weight,
          objectives: p.row.objectives as unknown as Prisma.InputJsonValue, rewardCoins: p.row.rewardCoins, rewardXp: p.row.rewardXp,
          rewardItems: p.row.rewardItems.length > 0 ? (p.row.rewardItems as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
    }
    // Refresh the dev seed mirror, like an admin save does
    const all = await prisma.mission.findMany({ orderBy: { key: 'asc' } });
    const mirror = all.map((m) => ({ ...m, objectives: m.objectives ?? [], rewardItems: m.rewardItems ?? [], soundEffects: m.soundEffects ?? null }));
    fs.writeFileSync(path.join(__dirname, '../../../packages/shared/src/data/missions.json'), JSON.stringify(mirror, null, 2));
    console.log('Done. Restart the server (or save any mission in the admin) to load them.');
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
