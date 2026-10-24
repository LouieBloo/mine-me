import { Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { Prisma } from '@prisma/client';
import {
  BUILT_IN_DEFAULT_BIOME,
  DEFAULT_BIOME_BLEND_WIDTH,
  normalizeBiomes,
  validateBiome,
  type BiomeDefinition,
} from '@mine-me/shared';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';
import { getAssetsRoot } from '../../config/assetPaths';
import { generateMiningMapWithFluids } from '../../services/miningMap.service';
import { MiningDataManager, tileTypeForBlockKey } from '../../services/mining/subsystems/MiningDataManager';

/** The columns an admin may set. `key` is only set when a biome is created. */
const EDITABLE_FIELDS = [
  'name', 'description', 'isDefault', 'minDepth', 'maxDepth', 'weight', 'noiseScale',
  'blockPalette', 'fluidWeights', 'gasWeights', 'mobSpawns', 'ambient',
] as const;

const NUMERIC_FIELDS = ['minDepth', 'maxDepth', 'weight', 'noiseScale'] as const;

/** The size limits of a preview strip, in cells. */
const PREVIEW_MIN = 20;
const PREVIEW_MAX = 200;

/** Writes the biome table to the dev seed mirror, like the other admin saves do. */
async function mirrorToJson(): Promise<void> {
  const all = await prisma.biome.findMany({ orderBy: { key: 'asc' } });
  syncJson('biomes.json', all);
}

/** A Json column takes null as `Prisma.JsonNull`, never a bare null. */
const jsonOrNull = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

/** Numbers arrive as numbers or numeric strings; anything else is left for validation to reject. */
function readBody(body: Record<string, unknown>): Partial<BiomeDefinition> {
  const out: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) if (body[field] !== undefined) out[field] = body[field];
  if (typeof body.key === 'string') out.key = body.key;
  for (const field of NUMERIC_FIELDS) {
    const value = out[field];
    if (typeof value === 'string' && value.trim() !== '') out[field] = Number(value);
  }
  return out as Partial<BiomeDefinition>;
}

const findBiome = (id: string) => prisma.biome.findFirst({ where: { OR: [{ id }, { key: id.toLowerCase() }] } });

/**
 * Problems with what a biome points at: every block, fluid, gas and mob it names must exist, so a typo cannot
 * silently do nothing at generation time. One message each.
 */
export async function referenceErrors(biome: Partial<BiomeDefinition>): Promise<string[]> {
  const errors: string[] = [];
  const palette = biome.blockPalette;
  for (const key of Object.keys(palette?.weights ?? {})) {
    if (tileTypeForBlockKey(key) === undefined) errors.push(`blockPalette.weights names an unknown block: ${key}`);
  }
  for (const swap of palette?.swaps ?? []) {
    if (tileTypeForBlockKey(swap.from) === undefined) errors.push(`blockPalette.swaps names an unknown block: ${swap.from}`);
    if (tileTypeForBlockKey(swap.to) === undefined) errors.push(`blockPalette.swaps names an unknown block: ${swap.to}`);
  }
  const fluidKeys = Object.keys(biome.fluidWeights ?? {});
  if (fluidKeys.length > 0) {
    const known = new Set((await prisma.fluid.findMany({ select: { typeKey: true } })).map((f) => f.typeKey));
    for (const key of fluidKeys) if (!known.has(key)) errors.push(`fluidWeights names an unknown fluid: ${key}`);
  }
  const gasKeys = Object.keys(biome.gasWeights ?? {});
  if (gasKeys.length > 0) {
    const known = new Set((await prisma.gas.findMany({ select: { typeKey: true } })).map((g) => g.typeKey));
    for (const key of gasKeys) if (!known.has(key)) errors.push(`gasWeights names an unknown gas: ${key}`);
  }
  const mobIds = Object.keys(biome.mobSpawns ?? {});
  if (mobIds.length > 0) {
    const known = new Set((await prisma.mob.findMany({ select: { id: true } })).map((m) => m.id));
    for (const id of mobIds) if (!known.has(id)) errors.push(`mobSpawns names an unknown mob: ${id}`);
  }
  return errors;
}

export const getBiomes = async (_req: Request, res: Response) => {
  try {
    res.json(await prisma.biome.findMany({ orderBy: { key: 'asc' } }));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch biomes' });
  }
};

export const getBiome = async (req: Request, res: Response) => {
  try {
    const biome = await findBiome(req.params.id);
    if (!biome) {
      res.status(404).json({ error: 'Biome not found' });
      return;
    }
    res.json(biome);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch biome' });
  }
};

export const createBiome = async (req: Request, res: Response) => {
  try {
    const input = readBody(req.body ?? {});
    const errors = [...validateBiome(input), ...(await referenceErrors(input))];
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    if (await prisma.biome.findUnique({ where: { key: input.key! } })) {
      res.status(409).json({ error: `A biome with the key ${input.key} already exists` });
      return;
    }
    // The first biome made is the default; a new default takes the role from the old one
    const makeDefault = input.isDefault === true || (await prisma.biome.count()) === 0;
    if (makeDefault) await prisma.biome.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const biome = await prisma.biome.create({
      data: {
        key: input.key!,
        name: input.name!.trim(),
        description: input.description ?? null,
        isDefault: makeDefault,
        minDepth: input.minDepth!,
        maxDepth: input.maxDepth ?? null,
        weight: input.weight!,
        noiseScale: input.noiseScale!,
        blockPalette: jsonOrNull(input.blockPalette),
        fluidWeights: jsonOrNull(input.fluidWeights),
        gasWeights: jsonOrNull(input.gasWeights),
        mobSpawns: jsonOrNull(input.mobSpawns),
        ambient: jsonOrNull(input.ambient),
      },
    });
    await mirrorToJson();
    res.status(201).json(biome);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create biome' });
  }
};

export const updateBiome = async (req: Request, res: Response) => {
  try {
    const existing = await findBiome(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Biome not found' });
      return;
    }
    const input = readBody(req.body ?? {});
    if (input.key !== undefined && input.key !== existing.key) {
      res.status(400).json({ error: 'A biome\'s key cannot be changed once it exists' });
      return;
    }
    if (input.isDefault === false && existing.isDefault) {
      res.status(400).json({ error: 'There must always be a default biome: make another biome the default instead' });
      return;
    }
    // Check the biome as it would be after the change, so a partial update cannot leave it invalid
    const merged = { ...existing, ...input } as unknown as Partial<BiomeDefinition>;
    const errors = [...validateBiome(merged), ...(await referenceErrors(merged))];
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    const data: Prisma.BiomeUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description;
    for (const field of ['minDepth', 'weight', 'noiseScale'] as const) {
      if (input[field] !== undefined) (data as Record<string, unknown>)[field] = input[field];
    }
    if (input.maxDepth !== undefined) data.maxDepth = input.maxDepth;
    if (input.blockPalette !== undefined) data.blockPalette = jsonOrNull(input.blockPalette);
    if (input.fluidWeights !== undefined) data.fluidWeights = jsonOrNull(input.fluidWeights);
    if (input.gasWeights !== undefined) data.gasWeights = jsonOrNull(input.gasWeights);
    if (input.mobSpawns !== undefined) data.mobSpawns = jsonOrNull(input.mobSpawns);
    if (input.ambient !== undefined) data.ambient = jsonOrNull(input.ambient);
    if (input.isDefault === true && !existing.isDefault) {
      await prisma.biome.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      data.isDefault = true;
    }

    const biome = await prisma.biome.update({ where: { id: existing.id }, data });
    await mirrorToJson();
    res.json(biome);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update biome' });
  }
};

/** Deletes a biome. The default one stays: the generator needs it wherever no other biome fits. */
export const deleteBiome = async (req: Request, res: Response) => {
  try {
    const existing = await findBiome(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Biome not found' });
      return;
    }
    if (existing.isDefault) {
      res.status(400).json({ error: 'The default biome cannot be deleted: make another biome the default first' });
      return;
    }
    await prisma.biome.delete({ where: { id: existing.id } });
    await mirrorToJson();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete biome' });
  }
};

const clampSize = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, Math.round(n))) : fallback;
};

/**
 * Generates a small strip of mine with the biomes as sent (saved or not), so blending, region size and what each biome
 * makes can be judged before saving. Nothing is stored. The answer is row-major: a tile type and a primary biome index
 * per cell, plus the fluid and gas placed.
 */
export const previewBiomes = async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const drafts = Array.isArray(body.biomes) ? (body.biomes as Partial<BiomeDefinition>[]) : [];
    if (drafts.length > 40) {
      res.status(400).json({ error: 'Too many biomes to preview' });
      return;
    }
    const errors: string[] = [];
    const biomes: BiomeDefinition[] = [];
    drafts.forEach((draft, i) => {
      const problems = validateBiome(draft);
      if (problems.length > 0) errors.push(...problems.map((p) => `${draft?.key || `biome ${i + 1}`}: ${p}`));
      else biomes.push({ ...BUILT_IN_DEFAULT_BIOME, ...draft, id: draft.id ?? `draft_${i}`, isDefault: draft.isDefault === true } as BiomeDefinition);
    });
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    const width = clampSize(body.width, 135);
    const height = clampSize(body.height, 60);
    const blend = typeof body.blendWidth === 'number' && body.blendWidth >= 0 && body.blendWidth <= 0.5 ? body.blendWidth : DEFAULT_BIOME_BLEND_WIDTH;
    const seed = Number.isFinite(Number(body.seed)) ? Math.floor(Number(body.seed)) : 1;
    const data = MiningDataManager.isInitialized() ? MiningDataManager.getInstance() : null;

    const { grid, biomeField, fluidCells, gasCells } = generateMiningMapWithFluids({
      seed,
      config: { gridWidth: width, gridHeight: height, biomeBlendWidth: blend },
      biomes: normalizeBiomes(biomes),
      fluids: data?.getFluids(),
      gases: data?.getGases(),
    });
    res.json({
      width,
      height,
      biomes: biomeField.biomes.map((b, index) => ({ index, key: b.key, name: b.name, ambient: b.ambient ?? {} })),
      tiles: grid.flatMap((row) => row.map((tile) => tile.type)),
      biomeIndex: Array.from(biomeField.primaryGrid()),
      fluidCells,
      gasCells,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate the preview' });
  }
};

// ---- Wall texture ----------------------------------------------------------------------------------------------------

/** Where a biome's wall pictures live, named after the biome key. */
const wallDir = (): string => path.join(getAssetsRoot(), 'sprites', 'biomes');

const wallStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = wallDir();
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${String(req.params.id).toLowerCase().replace(/[^a-z0-9_]/g, '')}-wall${ext}`);
  },
});

const wallFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') cb(null, true);
  else cb(new Error('Only PNG or JPG images are allowed'));
};

export const biomeWallUpload = multer({ storage: wallStorage, fileFilter: wallFilter }).single('texture');

/** Saves an uploaded wall picture for the biome and points its ambient look at it. Returns the saved biome. */
export const uploadBiomeWallTexture = async (req: Request, res: Response) => {
  try {
    const biome = await findBiome(req.params.id);
    if (!biome) {
      res.status(404).json({ error: 'Biome not found' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }
    const url = `/assets/sprites/biomes/${req.file.filename}`;
    const ambient = { ...((biome.ambient as Record<string, unknown> | null) ?? {}), wallTextureUrl: url };
    const saved = await prisma.biome.update({ where: { id: biome.id }, data: { ambient: ambient as Prisma.InputJsonValue } });
    await mirrorToJson();
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to upload the wall texture' });
  }
};
