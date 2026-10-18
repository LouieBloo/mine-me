/**
 * One-off data migration for ticket 086: blocks are now half the size they were (a character is about two blocks tall),
 * so every number in the game data that is measured in blocks must double, or the world and everything in it ends up
 * half-size: mobs half as fast, lights half as wide, caves half as deep.
 *
 * The rule (see ticket 085): anything that is a distance, speed, radius or depth in blocks doubles; times, percentages,
 * chances, counts, damage and pixel sizes stay. Damage per unit of speed halves, so the same impact does the same damage.
 *
 *   npx tsx prisma/migrate-half-size-blocks.ts           # dry run: prints every change, writes nothing
 *   npx tsx prisma/migrate-half-size-blocks.ts --apply   # does it (ask the owner first)
 *   ... --scale=1                                         # target another scale (1 = back to the original game)
 *
 * It records itself in the `DataMigration` table and refuses to run twice. The dev seed files in
 * `packages/shared/src/data/*.json` were converted with the same functions (`migrateSeedRows`) in the same change.
 * It touches nothing it is not told to (unlike `prisma db seed`, which must never be run on the dev database).
 */
import { PrismaClient } from '@prisma/client';
import { BLOCK_SCALE as GAME_BLOCK_SCALE } from '@mine-me/shared';

/** Key the first (2x) version of this migration left in the `DataMigration` ledger. */
export const MIGRATION_KEY = 'half-size-blocks-2x';

/** Ledger key for data scaled to `scale` small blocks per original block. */
export const ledgerKey = (scale: number): string => (scale === 2 ? MIGRATION_KEY : `block-scale-${scale}x`);

/** The scale the data is at, read from the ledger keys (the original game is 1). */
export function scaleFromLedger(keys: readonly string[]): number {
  let scale = 1;
  for (const key of keys) {
    const match = key === MIGRATION_KEY ? [key, '2'] : /^block-scale-(\d+(?:\.\d+)?)x$/.exec(key);
    if (match) scale = Math.max(scale, Number(match[1]));
  }
  return scale;
}

/**
 * How many small blocks make up one original block along a side. This is what the planners multiply by unless told
 * otherwise; the command line scales to the game's `BLOCK_SCALE` (shared `MINING_CONFIG`) from whatever the ledger says.
 */
export const BLOCK_SCALE = 2;

/** The factor the planners are using right now (set by `planDatabase`/`runMigration`; the planners are synchronous). */
const FACTOR = { value: BLOCK_SCALE };

type Json = Record<string, unknown>;

/** A change to one row: the fields to write (whole values, ready for Prisma) and a line per change for the report. */
export interface RowPlan {
  table: string;
  id: string;
  label: string;
  data: Json;
  changes: string[];
}

const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Scales a number, keeping a whole number whole. */
const scaled = (n: number, factor: number): number => round(n * factor);

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Scales the listed numeric keys of a flat record by `factor`, returning the new record and one note per change. */
function scaleKeys(source: Json, keys: readonly string[], factor: number, prefix: string): { next: Json; changes: string[] } {
  const next: Json = { ...source };
  const changes: string[] = [];
  for (const key of keys) {
    const value = source[key];
    if (!isNumber(value)) continue;
    const after = scaled(value, factor);
    if (after === value) continue;
    next[key] = after;
    changes.push(`${prefix}${key}: ${value} -> ${after}`);
  }
  return { next, changes };
}

/** An optional Json object (null stays null, anything else that is not an object is left alone). */
const asObject = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);

/** Scales `radius` on a light config (an ItemLightConfig, possibly with held offsets, which are pixels and stay). */
function scaleLight(light: unknown, prefix: string): { next: Json; changes: string[] } | null {
  const obj = asObject(light);
  if (!obj) return null;
  const { next, changes } = scaleKeys(obj, ['radius'], FACTOR.value, prefix);
  return changes.length > 0 ? { next, changes } : null;
}

/** Scales the tile-unit parts of a Flammability: the flame light, and for gases the explosion's blast radius and front speed. */
function scaleFlammability(value: unknown, prefix: string): { next: Json; changes: string[] } | null {
  const flammability = asObject(value);
  if (!flammability) return null;
  const next: Json = { ...flammability };
  const changes: string[] = [];
  const light = scaleLight(flammability.flameLight, `${prefix}flameLight.`);
  if (light) {
    next.flameLight = light.next;
    changes.push(...light.changes);
  }
  const explosion = asObject(flammability.explosion);
  if (explosion) {
    // blastRadius is in blocks; frontSpeed is blocks per gas step, so it doubles to cross the same distance in the same time
    const scaledExplosion = scaleKeys(explosion, ['blastRadius', 'frontSpeed'], FACTOR.value, `${prefix}explosion.`);
    if (scaledExplosion.changes.length > 0) {
      next.explosion = scaledExplosion.next;
      changes.push(...scaledExplosion.changes);
    }
  }
  return changes.length > 0 ? { next, changes } : null;
}

/** Scales a FluidGeneration / GasGeneration: pocket sizes and the depth range are in blocks. */
function scaleGeneration(value: unknown): { next: Json; changes: string[] } | null {
  const generation = asObject(value);
  if (!generation) return null;
  const { next, changes } = scaleKeys(generation, ['minSize', 'maxSize', 'minDepth', 'maxDepth'], FACTOR.value, 'generation.');
  return changes.length > 0 ? { next, changes } : null;
}

const plan = (table: string, id: string, label: string, data: Json, changes: string[]): RowPlan | null =>
  changes.length > 0 ? { table, id, label, data, changes } : null;

// ---------------------------------------------------------------------------
// One planner per table. Each takes a row (as Prisma returns it, or a seed JSON row) and returns what to change.
// ---------------------------------------------------------------------------

/** MiningMapConfig fields that double. */
export const MAP_CONFIG_DOUBLED = [
  'gridWidth', 'gridHeight', 'cavernMinDepth', 'tunnelMinLength', 'tunnelMaxLength', 'tunnelWidth', 'tunnelMinDepth',
  'silveriumMinDepth', 'mobSpawnMinDepth', 'gravity', 'dynamiteThrowPower', 'fallDamageMinSpeed', 'rockDamageMinSpeed', 'heatRadius',
] as const;

/** MiningMapConfig fields that halve: damage per tile/s, so the same impact does the same damage at twice the speed. */
export const MAP_CONFIG_HALVED = ['fallDamagePerSpeed', 'rockDamagePerSpeed'] as const;

/** MiningMapConfig columns that are whole numbers in the database. */
const MAP_CONFIG_INTEGERS = new Set(['gridWidth', 'gridHeight', 'cavernMinDepth', 'tunnelMinLength', 'tunnelMaxLength', 'tunnelWidth', 'tunnelMinDepth', 'silveriumMinDepth', 'mobSpawnMinDepth']);

export function planMapConfig(row: Json & { id: string; name?: string }): RowPlan | null {
  const doubled = scaleKeys(row, MAP_CONFIG_DOUBLED, FACTOR.value, '');
  for (const key of MAP_CONFIG_INTEGERS) if (isNumber(doubled.next[key])) doubled.next[key] = Math.round(doubled.next[key] as number);
  const halved = scaleKeys(doubled.next, MAP_CONFIG_HALVED, 1 / FACTOR.value, '');
  const data: Json = {};
  for (const key of [...MAP_CONFIG_DOUBLED, ...MAP_CONFIG_HALVED]) if (halved.next[key] !== row[key]) data[key] = halved.next[key];
  return plan('MiningMapConfig', row.id, String(row.name ?? row.id), data, [...doubled.changes, ...halved.changes]);
}

/** MobAIConfig keys measured in blocks. */
export const MOB_AI_DOUBLED = ['aggroRange', 'attackRange', 'mineRange', 'maxJumpTiles', 'patrolRadius', 'colliderWidth', 'colliderHeight'] as const;

export function planMob(row: Json & { id: string; name?: string }): RowPlan | null {
  const speeds = scaleKeys(row, ['moveSpeed', 'jumpForce'], FACTOR.value, '');
  const data: Json = {};
  for (const key of ['moveSpeed', 'jumpForce']) if (speeds.next[key] !== row[key]) data[key] = speeds.next[key];
  const changes = [...speeds.changes];
  const ai = asObject(row.aiConfig);
  if (ai) {
    const scaledAi = scaleKeys(ai, MOB_AI_DOUBLED, FACTOR.value, 'aiConfig.');
    if (scaledAi.changes.length > 0) {
      data.aiConfig = scaledAi.next;
      changes.push(...scaledAi.changes);
    }
  }
  return plan('Mob', row.id, String(row.name ?? row.id), data, changes);
}

export function planItem(row: Json & { id: string; name?: string }): RowPlan | null {
  const data: Json = {};
  const changes: string[] = [];
  const physics = asObject(row.physicsConfig);
  if (physics) {
    const s = scaleKeys(physics, ['throwPower'], FACTOR.value, 'physicsConfig.');
    if (s.changes.length > 0) { data.physicsConfig = s.next; changes.push(...s.changes); }
  }
  const light = scaleLight(row.lightConfig, 'lightConfig.');
  if (light) { data.lightConfig = light.next; changes.push(...light.changes); }
  const held = scaleLight(row.heldLightConfig, 'heldLightConfig.');
  if (held) { data.heldLightConfig = held.next; changes.push(...held.changes); }
  const projectile = asObject(row.projectileConfig);
  if (projectile) {
    const s = scaleKeys(projectile, ['projectileSpeed'], FACTOR.value, 'projectileConfig.');
    if (s.changes.length > 0) { data.projectileConfig = s.next; changes.push(...s.changes); }
  }
  return plan('Item', row.id, String(row.name ?? row.id), data, changes);
}

/** Fluid and Gas rows share the generation, light and flammability shapes. */
function planLooks(table: 'Fluid' | 'Gas', row: Json & { id: string; name?: string }): RowPlan | null {
  const data: Json = {};
  const changes: string[] = [];
  const generation = scaleGeneration(row.generation);
  if (generation) { data.generation = generation.next; changes.push(...generation.changes); }
  const light = scaleLight(row.light, 'light.');
  if (light) { data.light = light.next; changes.push(...light.changes); }
  const flammability = scaleFlammability(row.flammability, 'flammability.');
  if (flammability) { data.flammability = flammability.next; changes.push(...flammability.changes); }
  return plan(table, row.id, String(row.name ?? row.id), data, changes);
}

export const planFluid = (row: Json & { id: string; name?: string }): RowPlan | null => planLooks('Fluid', row);
export const planGas = (row: Json & { id: string; name?: string }): RowPlan | null => planLooks('Gas', row);

export function planBlock(row: Json & { id: string; name?: string }): RowPlan | null {
  const flammability = scaleFlammability(row.flammability, 'flammability.');
  return flammability ? plan('MiningBlock', row.id, String(row.name ?? row.id), { flammability: flammability.next }, flammability.changes) : null;
}

/** An effect link (ObjectEffects). The Explosion effect's value is a radius in blocks and the Knockback effect's is in tenths of blocks/s; both double. */
export function planObjectEffect(row: { id: string; value: number; effect: { name?: string; explodes?: boolean; knockbackModifier?: boolean } }, owner: string): RowPlan | null {
  if (!row.effect.explodes && !row.effect.knockbackModifier) return null;
  const after = scaled(row.value, FACTOR.value);
  if (after === row.value) return null;
  return plan('ObjectEffects', row.id, `${owner}: ${row.effect.name ?? 'effect'}`, { value: after }, [`value: ${row.value} -> ${after}`]);
}

// ---------------------------------------------------------------------------
// The seed JSON files (packages/shared/src/data) use the same planners.
// ---------------------------------------------------------------------------

/** The planner for each seed file that holds block-sized numbers. */
const SEED_PLANNERS: Record<string, (row: Json & { id: string }) => RowPlan | null> = {
  'mining_map_config.json': planMapConfig,
  'mobs.json': planMob,
  'items.json': planItem,
  'fluids.json': planFluid,
  'gases.json': planGas,
  'blocks.json': planBlock,
};

/** Applies a plan's data to a copy of the row. */
const withPlan = <T extends Json>(row: T, p: RowPlan | null): T => (p ? ({ ...row, ...p.data } as T) : row);

/**
 * Converts the rows of one seed file (the parsed JSON: an array, or one object for the map config). Returns the new rows
 * and the report lines. Effect values nested under `itemEffects` / `mobEffects` are converted too. A file that is not
 * listed (or already converted) comes back unchanged.
 */
export function migrateSeedRows(file: string, rows: unknown, factor: number = BLOCK_SCALE): { rows: unknown; changes: string[] } {
  FACTOR.value = factor;
  try {
    return migrateSeedRowsAtFactor(file, rows);
  } finally {
    FACTOR.value = BLOCK_SCALE;
  }
}

function migrateSeedRowsAtFactor(file: string, rows: unknown): { rows: unknown; changes: string[] } {
  const planner = SEED_PLANNERS[file];
  const list = Array.isArray(rows) ? rows : [rows];
  const changes: string[] = [];
  const out = list.map((raw) => {
    if (!planner || !raw || typeof raw !== 'object') return raw;
    const row = raw as Json & { id: string };
    const rowPlan = planner(row);
    if (rowPlan) changes.push(`${file}: ${rowPlan.label}: ${rowPlan.changes.join(', ')}`);
    let next = withPlan(row, rowPlan);
    for (const key of ['itemEffects', 'mobEffects']) {
      const links = row[key];
      if (!Array.isArray(links)) continue;
      next = {
        ...next,
        [key]: links.map((link: any) => {
          const linkPlan = link?.effect ? planObjectEffect(link, String(row.name ?? row.id)) : null;
          if (linkPlan) changes.push(`${file}: ${linkPlan.label}: ${linkPlan.changes.join(', ')}`);
          return withPlan(link, linkPlan);
        }),
      };
    }
    return next;
  });
  return { rows: Array.isArray(rows) ? out : out[0], changes };
}

// ---------------------------------------------------------------------------
// The database
// ---------------------------------------------------------------------------

/** Builds every row plan for the database. Pure over what `load` returns, so it can be tested without one. */
export interface DatabaseRows {
  mapConfigs: Array<Json & { id: string; name?: string }>;
  mobs: Array<Json & { id: string; name?: string }>;
  items: Array<Json & { id: string; name?: string }>;
  fluids: Array<Json & { id: string; name?: string }>;
  gases: Array<Json & { id: string; name?: string }>;
  blocks: Array<Json & { id: string; name?: string }>;
  itemEffects: Array<{ id: string; value: number; effect: { name?: string; explodes?: boolean; knockbackModifier?: boolean }; item?: { name?: string } | null; mob?: { name?: string } | null }>;
}

export function planDatabase(rows: DatabaseRows, factor: number = BLOCK_SCALE): RowPlan[] {
  FACTOR.value = factor;
  try {
    return planRows(rows);
  } finally {
    FACTOR.value = BLOCK_SCALE;
  }
}

function planRows(rows: DatabaseRows): RowPlan[] {
  const plans: Array<RowPlan | null> = [
    ...rows.mapConfigs.map(planMapConfig),
    ...rows.mobs.map(planMob),
    ...rows.items.map(planItem),
    ...rows.fluids.map(planFluid),
    ...rows.gases.map(planGas),
    ...rows.blocks.map(planBlock),
    ...rows.itemEffects.map((link) => planObjectEffect(link, link.item?.name ?? link.mob?.name ?? 'unknown')),
  ];
  return plans.filter((p): p is RowPlan => p !== null);
}

/** The Prisma model delegate name for each table in a plan. */
const DELEGATES: Record<string, string> = {
  MiningMapConfig: 'miningMapConfig',
  Mob: 'mob',
  Item: 'item',
  Fluid: 'fluid',
  Gas: 'gas',
  MiningBlock: 'miningBlock',
  ObjectEffects: 'objectEffects',
};

/** A summary line per table, for the report. */
export function summarize(plans: RowPlan[]): string {
  const counts = new Map<string, number>();
  for (const p of plans) counts.set(p.table, (counts.get(p.table) ?? 0) + 1);
  return [...counts.entries()].map(([table, n]) => `${table}: ${n}`).join(', ') || 'nothing to change';
}

/** What `main` needs from the database; the real one is Prisma. */
export interface MigrationStore {
  /** The keys in the `DataMigration` ledger. */
  ledgerKeys(): Promise<string[]>;
  load(): Promise<DatabaseRows>;
  /** Writes the plans, drops the old scale from the ledger and records `newScale`, all or nothing. */
  apply(plans: RowPlan[], summary: string, newScale: number): Promise<void>;
}

export interface MigrationResult {
  status: 'already-applied' | 'dry-run' | 'applied';
  plans: RowPlan[];
}

/**
 * Runs the migration against a store: a dry run unless `apply` is true. It scales the data from the scale the ledger
 * says it is at (the original game when empty) to `targetScale`, and does nothing when it is already there.
 */
export async function runMigration(
  store: MigrationStore,
  apply: boolean,
  log: (line: string) => void = console.log,
  targetScale: number = BLOCK_SCALE,
): Promise<MigrationResult> {
  const current = scaleFromLedger(await store.ledgerKeys());
  if (current === targetScale) {
    log(`Already applied: the data is at ${targetScale}x (${ledgerKey(targetScale)} is in the DataMigration ledger). Nothing to do.`);
    return { status: 'already-applied', plans: [] };
  }
  log(`Scaling the data from ${current}x to ${targetScale}x (a factor of ${round(targetScale / current)}).`);
  const plans = planDatabase(await store.load(), targetScale / current);
  for (const p of plans) log(`${p.table} ${p.label}: ${p.changes.join(', ')}`);
  const summary = summarize(plans);
  log(`\n${summary}`);
  if (!apply) {
    log('Dry run: nothing was written. Run again with --apply to write it.');
    return { status: 'dry-run', plans };
  }
  await store.apply(plans, `${current}x -> ${targetScale}x: ${summary}`, targetScale);
  log('Applied.');
  return { status: 'applied', plans };
}

/** The real database. */
export function prismaStore(prisma: PrismaClient): MigrationStore {
  const db = prisma as any;
  return {
    async ledgerKeys() {
      return (await db.dataMigration.findMany()).map((row: { key: string }) => row.key);
    },
    async load() {
      return {
        mapConfigs: await db.miningMapConfig.findMany(),
        mobs: await db.mob.findMany(),
        items: await db.item.findMany(),
        fluids: await db.fluid.findMany(),
        gases: await db.gas.findMany(),
        blocks: await db.miningBlock.findMany(),
        itemEffects: await db.objectEffects.findMany({ include: { effect: true, item: { select: { name: true } }, mob: { select: { name: true } } } }),
      };
    },
    async apply(plans, summary, newScale) {
      // All or nothing: a failure part-way leaves the data and the ledger as they were
      await db.$transaction([
        ...plans.map((p) => db[DELEGATES[p.table]].update({ where: { id: p.id }, data: p.data })),
        db.dataMigration.deleteMany({ where: { OR: [{ key: MIGRATION_KEY }, { key: { startsWith: 'block-scale-' } }] } }),
        db.dataMigration.create({ data: { key: ledgerKey(newScale), summary } }),
      ]);
    },
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    // `--scale=N` scales to N instead of the game's BLOCK_SCALE (`--scale=1` puts the data back to the original game)
    const flag = process.argv.find((arg) => arg.startsWith('--scale='));
    const target = flag ? Number(flag.slice('--scale='.length)) : GAME_BLOCK_SCALE;
    if (!(target > 0)) throw new Error(`Bad --scale: ${flag}`);
    await runMigration(prismaStore(prisma), apply, console.log, target);
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when started directly (importing it for the tests must not touch the database)
const invokedDirectly = typeof process !== 'undefined' && process.argv[1] !== undefined && /migrate-half-size-blocks\.[tj]s$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
