import {
  BLOCK_SCALE, DEFAULT_DOODAD_NEAR_RADIUS,
  type DoodadAnchor, type DoodadBiomeLink, type DoodadDefinition, type DoodadLightConfig, type DoodadMotion, type DoodadPartDef, type DoodadReacts,
  type DoodadSizeVariant, type DoodadSpawnRules, type DoodadWander,
} from '@mine-me/shared';

/** The edit state of a doodad. It mirrors `DoodadDefinition`, but numbers may be NaN while the field is empty. */
export interface DoodadForm {
  key: string;
  name: string;
  description: string;
  anchor: DoodadAnchor;
  width: number;
  height: number;
  sizeVariants: DoodadSizeVariant[];
  textureUrl: string | null;
  parts: DoodadPartDef[];
  zOffset: number;
  motion: DoodadMotion | null;
  reacts: DoodadReacts | null;
  light: DoodadLightConfig | null;
  particleEffectId: string | null;
  particleOffsetX: number;
  particleOffsetY: number;
  health: number | null;
  fallDamage: number | null;
  deathParticleEffectId: string | null;
  /** Weather kinds it hides in (birds in a storm); empty = never. */
  hiddenInWeather: string[];
  wander: DoodadWander | null;
  spawn: DoodadSpawnRules;
  biomes: DoodadBiomeLink[];
}

/** What a brand new doodad starts as: a small floor doodad of 1 original block that appears nowhere until a biome is assigned. */
export const NEW_DOODAD: DoodadForm = {
  key: '',
  name: '',
  description: '',
  anchor: 'FLOOR',
  width: BLOCK_SCALE,
  height: BLOCK_SCALE,
  sizeVariants: [],
  textureUrl: null,
  parts: [],
  zOffset: 0,
  motion: null,
  reacts: null,
  light: null,
  particleEffectId: null,
  particleOffsetX: 0,
  particleOffsetY: 0,
  health: null,
  fallDamage: null,
  deathParticleEffectId: null,
  hiddenInWeather: [],
  wander: null,
  spawn: {},
  biomes: [],
};

/** What a switched-on body reaction, wander or motion starts as. */
export const DEFAULT_REACTS: DoodadReacts = { strength: 0.6, radius: 2 * BLOCK_SCALE, puffEffectId: null };
export const DEFAULT_WANDER: DoodadWander = { mode: 'CRAWL', radius: 2 * BLOCK_SCALE, speed: 1, pauseMs: 1500 };
export const DEFAULT_MOTION: DoodadMotion = { preset: 'sway' };

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonEmpty = (list: string[] | null | undefined): string[] | null => (list && list.length > 0 ? list : null);

/** Spawn rules with nothing set are stored as null, so a doodad with no rules has no stray empty object. */
export function tidySpawn(spawn: DoodadSpawnRules): DoodadSpawnRules | null {
  const out: DoodadSpawnRules = {};
  if (isNumber(spawn.minDepth)) out.minDepth = spawn.minDepth;
  if (isNumber(spawn.maxDepth)) out.maxDepth = spawn.maxDepth;
  const blocks = nonEmpty(spawn.blocks);
  if (blocks) out.blocks = blocks;
  const fluids = nonEmpty(spawn.nearFluids);
  if (fluids) out.nearFluids = fluids;
  const gases = nonEmpty(spawn.nearGases);
  if (gases) out.nearGases = gases;
  if ((fluids || gases) && isNumber(spawn.nearRadius)) out.nearRadius = spawn.nearRadius;
  if (spawn.darkOnly) out.darkOnly = true;
  if (isNumber(spawn.minSpacing) && spawn.minSpacing > 0) out.minSpacing = spawn.minSpacing;
  // Group settings only mean something with a group share, so they are dropped without one
  if (isNumber(spawn.groupChance) && spawn.groupChance > 0) {
    out.groupChance = spawn.groupChance;
    if (isNumber(spawn.groupSizeMin)) out.groupSizeMin = spawn.groupSizeMin;
    if (isNumber(spawn.groupSizeMax)) out.groupSizeMax = spawn.groupSizeMax;
    if (isNumber(spawn.groupSpread)) out.groupSpread = spawn.groupSpread;
    if (isNumber(spawn.groupFill)) out.groupFill = spawn.groupFill;
    if (isNumber(spawn.memberSpacing) && spawn.memberSpacing > 0) out.memberSpacing = spawn.memberSpacing;
  }
  if (isNumber(spawn.maxCount) && spawn.maxCount >= 0) out.maxCount = spawn.maxCount;
  return Object.keys(out).length > 0 ? out : null;
}

/** The form turned into what the server stores (the shared `DoodadDefinition` shape, without the sound slots, which have their own route). */
export function formToDoodad(form: DoodadForm): Partial<DoodadDefinition> {
  return {
    key: form.key,
    name: form.name.trim(),
    description: form.description.trim() || null,
    anchor: form.anchor,
    width: form.width,
    height: form.height,
    sizeVariants: form.sizeVariants.length > 0 ? form.sizeVariants : null,
    textureUrl: form.textureUrl || null,
    parts: form.parts.length > 0 ? form.parts : null,
    zOffset: form.zOffset,
    motion: form.motion && form.motion.preset ? form.motion : null,
    reacts: form.reacts,
    light: form.light,
    particleEffectId: form.particleEffectId || null,
    particleOffsetX: form.particleOffsetX,
    particleOffsetY: form.particleOffsetY,
    health: form.health,
    fallDamage: form.fallDamage,
    deathParticleEffectId: form.deathParticleEffectId || null,
    hiddenInWeather: form.hiddenInWeather,
    wander: form.wander,
    spawn: tidySpawn(form.spawn),
    biomes: form.biomes,
  };
}

export function doodadToForm(doodad: DoodadDefinition): DoodadForm {
  return {
    key: doodad.key,
    name: doodad.name,
    description: doodad.description ?? '',
    anchor: doodad.anchor,
    width: doodad.width,
    height: doodad.height,
    sizeVariants: doodad.sizeVariants ?? [],
    textureUrl: doodad.textureUrl ?? null,
    parts: doodad.parts ?? [],
    zOffset: doodad.zOffset ?? 0,
    motion: doodad.motion ?? null,
    reacts: doodad.reacts ?? null,
    light: doodad.light ?? null,
    particleEffectId: doodad.particleEffectId ?? null,
    particleOffsetX: doodad.particleOffsetX ?? 0,
    particleOffsetY: doodad.particleOffsetY ?? 0,
    health: doodad.health ?? null,
    fallDamage: doodad.fallDamage ?? null,
    deathParticleEffectId: doodad.deathParticleEffectId ?? null,
    hiddenInWeather: doodad.hiddenInWeather ?? [],
    wander: doodad.wander ?? null,
    spawn: doodad.spawn ?? {},
    biomes: (doodad.biomes ?? []).map((b) => ({ biomeId: b.biomeId, biomeKey: b.biomeKey, weight: b.weight, density: b.density })),
  };
}

const whole = (n: number, min: number, fallback: number): number => (Number.isInteger(n) && n >= min ? n : fallback);
const finite = (n: number, fallback: number): number => (Number.isFinite(n) ? n : fallback);

/**
 * The doodad as the preview should see it: whatever is half typed is replaced by something safe, so a blank number never
 * turns the preview into an error while the owner is still editing.
 */
export function previewDoodad(form: DoodadForm, id = 'draft'): DoodadDefinition {
  const width = whole(form.width, 1, BLOCK_SCALE);
  const height = whole(form.height, 1, BLOCK_SCALE);
  const variants = form.sizeVariants
    .filter((v) => Number.isInteger(v.width) && v.width >= 1 && Number.isInteger(v.height) && v.height >= 1 && isNumber(v.weight) && v.weight > 0)
    .map((v) => ({ ...v }));
  const motion = form.motion && form.motion.preset
    ? {
        ...form.motion,
        speed: form.motion.speed !== undefined && Number.isFinite(form.motion.speed) && form.motion.speed >= 0 ? form.motion.speed : undefined,
        amplitude: form.motion.amplitude !== undefined && Number.isFinite(form.motion.amplitude) ? form.motion.amplitude : undefined,
      }
    : null;
  return {
    id,
    key: /^[a-z][a-z0-9_]*$/.test(form.key) ? form.key : 'new_doodad',
    name: form.name.trim() || 'New doodad',
    description: form.description,
    anchor: form.anchor,
    width,
    height,
    sizeVariants: variants.length > 0 ? variants : null,
    textureUrl: form.textureUrl || null,
    parts: form.parts.length > 0 ? form.parts : null,
    zOffset: whole(form.zOffset, -1000, 0),
    motion,
    reacts: form.reacts && Number.isFinite(form.reacts.strength) && Number.isFinite(form.reacts.radius) && form.reacts.radius > 0 ? form.reacts : null,
    light: form.light && Number.isFinite(form.light.radius) && form.light.radius > 0 && Number.isFinite(form.light.intensity) && form.light.intensity > 0 ? form.light : null,
    particleEffectId: form.particleEffectId || null,
    particleOffsetX: finite(form.particleOffsetX, 0),
    particleOffsetY: finite(form.particleOffsetY, 0),
    health: form.health,
    fallDamage: form.fallDamage,
    deathParticleEffectId: form.deathParticleEffectId || null,
    hiddenInWeather: form.hiddenInWeather,
    wander:
      form.wander && Number.isFinite(form.wander.radius) && form.wander.radius > 0 && Number.isFinite(form.wander.speed) && form.wander.speed > 0 && Number.isFinite(form.wander.pauseMs)
        ? form.wander.mode === 'FLUTTER' || form.anchor !== 'AIR'
          ? form.wander
          : { ...form.wander, mode: 'FLUTTER' }
        : null,
    spawn: tidySpawn(form.spawn),
    biomes: form.biomes,
  };
}

/** "Depth 3 - 9" style text for the list: the doodad's spawn depth in original blocks. */
export function spawnDepthText(spawn: DoodadSpawnRules | null | undefined): string {
  const min = spawn?.minDepth;
  const max = spawn?.maxDepth;
  if (!isNumber(min) && !isNumber(max)) return 'any depth';
  const from = isNumber(min) ? (min / BLOCK_SCALE).toFixed(0) : '0';
  return isNumber(max) ? `${from} - ${(max / BLOCK_SCALE).toFixed(0)}` : `${from} - bottom`;
}

/** The "near" radius shown when the rules do not set one. */
export const DEFAULT_NEAR_RADIUS = DEFAULT_DOODAD_NEAR_RADIUS;
