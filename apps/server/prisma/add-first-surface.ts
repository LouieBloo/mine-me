/**
 * One-off, idempotent data script (tickets 129-135): the first surface. Creates, only the ones that are missing, four surface
 * doodads (an oak, a pine, a bush and a bird) and three surface environments (a green valley, a snowfield and dusty plains),
 * with weather and props. They have NO pictures yet: the sky and scenery are drawn in code, and each doodad is a placeholder shape
 * until art is uploaded (the briefs are in `gemini_tasks/`). Existing rows (same key) are never touched. The first environment
 * made is the default only when there is no default yet.
 *
 * Sizes are in small blocks (original value x BLOCK_SCALE: the character is about 2.7 blocks tall). Densities are a first guess to
 * tune in the admin. After it writes, the dev mirrors (`doodads.json`, `surface_environments.json`) are refreshed.
 *
 *   npx tsx prisma/add-first-surface.ts           # dry run: prints what it would do
 *   npx tsx prisma/add-first-surface.ts --apply   # does it
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { validateDoodad, validateSurfaceEnvironment, type DoodadDefinition, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { toDoodadDefinition, toSurfaceEnvironment, type DoodadRow } from '../src/services/mining/definitionLoaders';

type FirstSurfaceDoodad = Omit<DoodadDefinition, 'id' | 'biomes' | 'createdAt' | 'updatedAt' | 'particleEffectId' | 'sounds' | 'soundEffects'>;
type FirstEnvironment = Omit<SurfaceEnvironmentDefinition, 'id' | 'createdAt' | 'updatedAt' | 'sounds' | 'soundEffects'>;

/** Surface doodads belong to no biome: the surface pass places them, the cave generator never does. */
export const FIRST_SURFACE_DOODADS: readonly FirstSurfaceDoodad[] = [
  {
    key: 'oak_tree',
    name: 'Oak Tree',
    description: 'A broad tree that sways in the wind.',
    anchor: 'FLOOR',
    width: 4,
    height: 8,
    sizeVariants: [{ width: 4, height: 8, weight: 3 }, { width: 3, height: 6, weight: 2 }, { width: 5, height: 10, weight: 1 }],
    zOffset: 0,
    motion: { preset: 'sway', speed: 0.35, amplitude: 0.04 },
  },
  {
    key: 'pine_tree',
    name: 'Pine Tree',
    description: 'A tall narrow tree for cold places.',
    anchor: 'FLOOR',
    width: 3,
    height: 9,
    sizeVariants: [{ width: 3, height: 9, weight: 3 }, { width: 2, height: 6, weight: 2 }],
    zOffset: 0,
    motion: { preset: 'sway', speed: 0.3, amplitude: 0.03 },
  },
  {
    key: 'bush',
    name: 'Bush',
    description: 'A low bush that rustles when someone walks past.',
    anchor: 'FLOOR',
    width: 3,
    height: 2,
    sizeVariants: [{ width: 3, height: 2, weight: 3 }, { width: 4, height: 3, weight: 1 }],
    zOffset: 1,
    motion: { preset: 'sway', speed: 0.5, amplitude: 0.05 },
    reacts: { strength: 0.5, radius: 4 },
  },
  {
    key: 'bird',
    name: 'Bird',
    description: 'A small bird that flutters about the sky and hides from storms.',
    anchor: 'AIR',
    width: 1,
    height: 1,
    zOffset: 0,
    wander: { mode: 'FLUTTER', radius: 10, speed: 3, pauseMs: 600 },
    hiddenInWeather: ['rain', 'storm'],
  },
];

export const FIRST_SURFACE_ENVIRONMENTS: readonly FirstEnvironment[] = [
  {
    key: 'green_valley',
    name: 'Green Valley',
    description: 'Blue skies over rolling green hills, with the odd shower.',
    weight: 6,
    isDefault: true,
    sky: { top: '#2f8fd8', horizon: '#a9dcff', sunColor: '#fff2b0', sunX: 0.72, sunHeight: 24, sunSize: 3 },
    ambientTint: null,
    layers: [
      { name: 'far mountains', parallaxFactor: 0.88, yOffset: 0, shape: 'mountains', height: 46, tint: '#8da2c2' },
      { name: 'hills', parallaxFactor: 0.62, yOffset: 0, shape: 'hills', height: 24, tint: '#6f9a6a' },
      { name: 'treeline', parallaxFactor: 0.4, yOffset: 0, shape: 'treeline', height: 14, tint: '#3f6b45' },
    ],
    clouds: { maxCount: 10, minHeight: 8, maxHeight: 24 },
    weather: { clear: 6, cloudy: 3, windy: 1, rain: 2, storm: 1 },
    props: [
      { doodadKey: 'oak_tree', density: 5, spacing: 4 },
      { doodadKey: 'bush', density: 7, spacing: 3 },
      { doodadKey: 'bird', density: 2, minHeight: 8, maxHeight: 22 },
    ],
  },
  {
    key: 'snowfield',
    name: 'Snowfield',
    description: 'A pale cold sky over white mountains, with snow and fog.',
    weight: 2,
    isDefault: false,
    sky: { top: '#7fa6c9', horizon: '#dbe8f2', sunColor: '#fff8e0', sunX: 0.3, sunHeight: 14, sunSize: 2 },
    ambientTint: '#eef4ff',
    layers: [
      { name: 'snow peaks', parallaxFactor: 0.88, yOffset: 0, shape: 'mountains', height: 52, tint: '#c9d8e8' },
      { name: 'pine hills', parallaxFactor: 0.6, yOffset: 0, shape: 'hills', height: 20, tint: '#9db4c8' },
      { name: 'pines', parallaxFactor: 0.4, yOffset: 0, shape: 'treeline', height: 16, tint: '#4d6b73' },
    ],
    clouds: { maxCount: 12, minHeight: 8, maxHeight: 26 },
    weather: { clear: 3, cloudy: 3, snow: 4, fog: 2, windy: 1 },
    props: [{ doodadKey: 'pine_tree', density: 5, spacing: 3 }],
  },
  {
    key: 'dusty_plains',
    name: 'Dusty Plains',
    description: 'A warm hazy sky over dry hills, mostly clear and windy.',
    weight: 2,
    isDefault: false,
    sky: { top: '#3d93c9', horizon: '#f2d9a8', sunColor: '#ffe9a0', sunX: 0.55, sunHeight: 28, sunSize: 4 },
    ambientTint: '#fff0d8',
    layers: [
      { name: 'mesas', parallaxFactor: 0.86, yOffset: 0, shape: 'mountains', height: 34, tint: '#c49a78' },
      { name: 'dunes', parallaxFactor: 0.55, yOffset: 0, shape: 'hills', height: 18, tint: '#d3b27c' },
    ],
    clouds: { maxCount: 6, minHeight: 10, maxHeight: 26 },
    weather: { clear: 8, windy: 3, cloudy: 2, rain: 0.5 },
    props: [{ doodadKey: 'bush', density: 3, spacing: 5 }, { doodadKey: 'bird', density: 1, minHeight: 10, maxHeight: 24 }],
  },
];

export interface SurfacePlan {
  doodads: Array<{ doodad: FirstSurfaceDoodad; action: 'create' | 'skip' }>;
  environments: Array<{ environment: FirstEnvironment; action: 'create' | 'skip'; asDefault: boolean }>;
}

/** What the script does: only rows whose key is missing are created, and the default goes to the first environment only if none exists. */
export function planSurface(existingDoodadKeys: readonly string[], existingEnvironmentKeys: readonly string[], hasDefaultEnvironment: boolean): SurfacePlan {
  let needsDefault = !hasDefaultEnvironment;
  return {
    doodads: FIRST_SURFACE_DOODADS.map((doodad) => ({ doodad, action: existingDoodadKeys.includes(doodad.key) ? 'skip' : 'create' })),
    environments: FIRST_SURFACE_ENVIRONMENTS.map((environment) => {
      const create = !existingEnvironmentKeys.includes(environment.key);
      const asDefault = create && needsDefault && environment.isDefault === true;
      if (asDefault) needsDefault = false;
      return { environment, action: create ? 'create' : 'skip', asDefault };
    }),
  };
}

/** Problems with the first surface itself (the shared validation, and every prop naming a doodad of the set). */
export function surfaceProblems(): string[] {
  const problems: string[] = [];
  for (const d of FIRST_SURFACE_DOODADS) validateDoodad({ ...d, biomes: [] }).forEach((e) => problems.push(`${d.key}: ${e}`));
  const keys = new Set(FIRST_SURFACE_DOODADS.map((d) => d.key));
  for (const e of FIRST_SURFACE_ENVIRONMENTS) {
    validateSurfaceEnvironment(e).forEach((p) => problems.push(`${e.key}: ${p}`));
    for (const prop of e.props ?? []) if (!keys.has(prop.doodadKey)) problems.push(`${e.key}: prop ${prop.doodadKey} is not one of the surface doodads`);
  }
  return problems;
}

const json = (value: unknown): Prisma.InputJsonValue => (value ?? Prisma.JsonNull) as Prisma.InputJsonValue;
const dataDir = path.join(__dirname, '../../../packages/shared/src/data');

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const problems = surfaceProblems();
    if (problems.length > 0) throw new Error(`The first surface is not valid:\n${problems.join('\n')}`);
    const doodadKeys = (await prisma.doodad.findMany({ select: { key: true } })).map((d) => d.key);
    const environments = await prisma.surfaceEnvironment.findMany({ select: { key: true, isDefault: true } });
    const plan = planSurface(doodadKeys, environments.map((e) => e.key), environments.some((e) => e.isDefault));
    for (const { doodad, action } of plan.doodads) console.log(`Doodad ${doodad.key} (${doodad.name}):`, action === 'create' ? 'will be created' : 'exists, skipped');
    for (const { environment, action, asDefault } of plan.environments) {
      console.log(`Environment ${environment.key} (${environment.name}):`, action === 'create' ? `will be created${asDefault ? ' as the default' : ''}` : 'exists, skipped');
    }
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const { doodad, action } of plan.doodads) {
      if (action !== 'create') continue;
      await prisma.doodad.create({
        data: {
          key: doodad.key,
          name: doodad.name,
          description: doodad.description ?? null,
          anchor: doodad.anchor,
          width: doodad.width,
          height: doodad.height,
          sizeVariants: json(doodad.sizeVariants),
          zOffset: doodad.zOffset,
          motion: json(doodad.motion),
          reacts: json(doodad.reacts),
          wander: json(doodad.wander),
          hiddenInWeather: doodad.hiddenInWeather ?? [],
        },
      });
    }
    for (const { environment, action, asDefault } of plan.environments) {
      if (action !== 'create') continue;
      await prisma.surfaceEnvironment.create({
        data: {
          key: environment.key,
          name: environment.name,
          description: environment.description ?? null,
          weight: environment.weight,
          isDefault: asDefault,
          sky: json(environment.sky),
          ambientTint: environment.ambientTint ?? null,
          layers: json(environment.layers),
          clouds: json(environment.clouds),
          weather: json(environment.weather),
          props: json(environment.props),
        },
      });
    }
    // Refresh the dev mirrors the admin writes on every save
    const allDoodads = await prisma.doodad.findMany({ orderBy: { key: 'asc' }, include: { biomes: { include: { biome: { select: { key: true } } } } } });
    fs.writeFileSync(path.join(dataDir, 'doodads.json'), JSON.stringify((allDoodads as unknown as DoodadRow[]).map(toDoodadDefinition), null, 2));
    const allEnvironments = await prisma.surfaceEnvironment.findMany({ orderBy: { key: 'asc' } });
    fs.writeFileSync(path.join(dataDir, 'surface_environments.json'), JSON.stringify(allEnvironments.map(toSurfaceEnvironment), null, 2));
    console.log('Done. Restart the server (or save anything in the admin) to load them.');
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
