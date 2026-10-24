import { Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { Prisma } from '@prisma/client';
import { validateDoodad, type DoodadBiomeLink, type DoodadDefinition } from '@mine-me/shared';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';
import { getAssetsRoot } from '../../config/assetPaths';
import { tileTypeForBlockKey } from '../../services/mining/subsystems/MiningDataManager';
import { toDoodadDefinition, type DoodadRow } from '../../services/mining/definitionLoaders';

/** The columns an admin may set. `key` is only set when a doodad is created; sounds have their own route and art its upload. */
const EDITABLE_FIELDS = [
  'name', 'description', 'anchor', 'width', 'height', 'sizeVariants', 'textureUrl', 'parts', 'zOffset', 'motion', 'reacts', 'light',
  'particleEffectId', 'particleOffsetX', 'particleOffsetY', 'wander', 'spawn',
] as const;

const NUMERIC_FIELDS = ['width', 'height', 'zOffset', 'particleOffsetX', 'particleOffsetY'] as const;
const JSON_FIELDS = ['sizeVariants', 'parts', 'motion', 'reacts', 'light', 'wander', 'spawn'] as const;

/** A doodad with the biome each link points at, so the biome's key travels with it. */
const WITH_BIOMES = { biomes: { include: { biome: { select: { key: true } } } } } as const;

/** Writes the doodad table to the dev seed mirror, like the other admin saves do. */
export async function mirrorDoodadsToJson(): Promise<void> {
  const all = await prisma.doodad.findMany({ orderBy: { key: 'asc' }, include: WITH_BIOMES });
  syncJson('doodads.json', (all as unknown as DoodadRow[]).map(toDoodadDefinition));
}

/** A Json column takes null as `Prisma.JsonNull`, never a bare null. */
const jsonOrNull = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

interface DoodadInput extends Partial<Omit<DoodadDefinition, 'biomes'>> {
  /** Present only when the request sets the biome list; absent leaves the links alone. */
  biomes?: Array<Partial<DoodadBiomeLink>>;
}

/** Numbers arrive as numbers or numeric strings; anything else is left for validation to reject. */
function readBody(body: Record<string, unknown>): DoodadInput {
  const out: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) if (body[field] !== undefined) out[field] = body[field];
  if (typeof body.key === 'string') out.key = body.key;
  if (body.biomes !== undefined) out.biomes = body.biomes;
  for (const field of NUMERIC_FIELDS) {
    const value = out[field];
    if (typeof value === 'string' && value.trim() !== '') out[field] = Number(value);
  }
  return out as DoodadInput;
}

const findDoodad = (id: string) => prisma.doodad.findFirst({ where: { OR: [{ id }, { key: id.toLowerCase() }] }, include: WITH_BIOMES });

/** The biome links as the definition shape wants them, so the same validation covers a stored doodad and a draft. */
export const asDoodadDefinition = (row: unknown): DoodadDefinition => toDoodadDefinition(row as DoodadRow);

/**
 * Problems with what a doodad points at: every block, fluid, gas, particle effect and biome it names must exist, so a
 * typo cannot silently do nothing at generation time. One message each. Also turns each biome link into a biome id.
 */
export async function referenceErrors(
  doodad: DoodadInput
): Promise<{ errors: string[]; links: Array<{ biomeId: string; weight: number; density: number }> | undefined }> {
  const errors: string[] = [];
  const spawn = doodad.spawn;
  for (const key of spawn?.blocks ?? []) if (tileTypeForBlockKey(key) === undefined) errors.push(`spawn.blocks names an unknown block: ${key}`);
  if ((spawn?.nearFluids ?? []).length > 0) {
    const known = new Set((await prisma.fluid.findMany({ select: { typeKey: true } })).map((f) => f.typeKey));
    for (const key of spawn!.nearFluids!) if (!known.has(key)) errors.push(`spawn.nearFluids names an unknown fluid: ${key}`);
  }
  if ((spawn?.nearGases ?? []).length > 0) {
    const known = new Set((await prisma.gas.findMany({ select: { typeKey: true } })).map((g) => g.typeKey));
    for (const key of spawn!.nearGases!) if (!known.has(key)) errors.push(`spawn.nearGases names an unknown gas: ${key}`);
  }
  const effectIds = [
    ['particleEffectId', doodad.particleEffectId],
    ['reacts.puffEffectId', doodad.reacts?.puffEffectId],
  ] as const;
  for (const [field, id] of effectIds) {
    if (id && !(await prisma.particleEffect.findUnique({ where: { id } }))) errors.push(`${field} names an unknown particle effect: ${id}`);
  }

  let links: Array<{ biomeId: string; weight: number; density: number }> | undefined;
  if (doodad.biomes !== undefined) {
    const biomes = await prisma.biome.findMany({ select: { id: true, key: true } });
    links = [];
    for (const link of doodad.biomes) {
      const biome = biomes.find((b) => b.id === link.biomeId) ?? biomes.find((b) => b.key === link.biomeKey) ?? biomes.find((b) => b.key === link.biomeId);
      if (!biome) errors.push(`biomes names an unknown biome: ${link.biomeId ?? link.biomeKey}`);
      else links.push({ biomeId: biome.id, weight: link.weight ?? 1, density: link.density ?? 1 });
    }
  }
  return { errors, links };
}

export const getDoodads = async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.doodad.findMany({ orderBy: { key: 'asc' }, include: WITH_BIOMES });
    res.json(rows.map(asDoodadDefinition));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch doodads' });
  }
};

export const getDoodad = async (req: Request, res: Response) => {
  try {
    const doodad = await findDoodad(req.params.id);
    if (!doodad) {
      res.status(404).json({ error: 'Doodad not found' });
      return;
    }
    res.json(asDoodadDefinition(doodad));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch doodad' });
  }
};

export const createDoodad = async (req: Request, res: Response) => {
  try {
    const input = readBody(req.body ?? {});
    const draft = { anchor: 'FLOOR', width: 3, height: 3, zOffset: 0, ...input } as unknown as Partial<DoodadDefinition>;
    const refs = await referenceErrors(input);
    const errors = [...validateDoodad(draft), ...refs.errors];
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    if (await prisma.doodad.findUnique({ where: { key: input.key! } })) {
      res.status(409).json({ error: `A doodad with the key ${input.key} already exists` });
      return;
    }
    const created = await prisma.doodad.create({
      data: {
        key: input.key!,
        name: input.name!.trim(),
        description: input.description ?? null,
        anchor: draft.anchor!,
        width: draft.width!,
        height: draft.height!,
        sizeVariants: jsonOrNull(input.sizeVariants),
        textureUrl: input.textureUrl ?? null,
        parts: jsonOrNull(input.parts),
        zOffset: draft.zOffset!,
        motion: jsonOrNull(input.motion),
        reacts: jsonOrNull(input.reacts),
        light: jsonOrNull(input.light),
        particleEffectId: input.particleEffectId ?? null,
        particleOffsetX: input.particleOffsetX ?? 0,
        particleOffsetY: input.particleOffsetY ?? 0,
        wander: jsonOrNull(input.wander),
        spawn: jsonOrNull(input.spawn),
        ...(refs.links && refs.links.length > 0 ? { biomes: { create: refs.links } } : {}),
      },
    });
    await mirrorDoodadsToJson();
    res.status(201).json(asDoodadDefinition((await findDoodad(created.id)) ?? created));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create doodad' });
  }
};

export const updateDoodad = async (req: Request, res: Response) => {
  try {
    const existing = await findDoodad(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Doodad not found' });
      return;
    }
    const input = readBody(req.body ?? {});
    if (input.key !== undefined && input.key !== existing.key) {
      res.status(400).json({ error: 'A doodad\'s key cannot be changed once it exists' });
      return;
    }
    // Check the doodad as it would be after the change, so a partial update cannot leave it invalid
    const merged = { ...asDoodadDefinition(existing), ...input } as unknown as Partial<DoodadDefinition>;
    const refs = await referenceErrors({ ...(merged as DoodadInput), biomes: input.biomes });
    const errors = [...validateDoodad(merged), ...refs.errors];
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    const data: Prisma.DoodadUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description;
    if (input.anchor !== undefined) data.anchor = input.anchor;
    if (input.textureUrl !== undefined) data.textureUrl = input.textureUrl;
    if (input.particleEffectId !== undefined) data.particleEffectId = input.particleEffectId;
    for (const field of NUMERIC_FIELDS) if (input[field] !== undefined) (data as Record<string, unknown>)[field] = input[field];
    for (const field of JSON_FIELDS) if (input[field] !== undefined) (data as Record<string, unknown>)[field] = jsonOrNull(input[field]);
    // The whole list is replaced, in one write, so a doodad never has half of its links
    if (refs.links) data.biomes = { deleteMany: {}, create: refs.links };

    await prisma.doodad.update({ where: { id: existing.id }, data });
    await mirrorDoodadsToJson();
    res.json(asDoodadDefinition((await findDoodad(existing.id)) ?? existing));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update doodad' });
  }
};

export const deleteDoodad = async (req: Request, res: Response) => {
  try {
    const existing = await findDoodad(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Doodad not found' });
      return;
    }
    await prisma.doodad.delete({ where: { id: existing.id } });
    await mirrorDoodadsToJson();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete doodad' });
  }
};

// ---- Art -------------------------------------------------------------------------------------------------------------

/** Where doodad pictures live (one folder, files named after the doodad key and what the picture is for). */
const spriteDir = (): string => path.join(getAssetsRoot(), 'sprites', 'doodads');

const clean = (value: unknown): string => String(value ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = spriteDir();
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    // The main picture is `<key>`; the pictures of parts and sizes are `<key>-<name>`
    const name = clean(req.params.name);
    cb(null, `${clean(req.params.id)}${name ? `-${name}` : ''}${ext}`);
  },
});

const fileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') cb(null, true);
  else cb(new Error('Only PNG or JPG images are allowed'));
};

export const doodadTextureUpload = multer({ storage, fileFilter }).single('texture');

/** Saves an uploaded picture for the doodad and points its main texture at it. Returns the saved doodad. */
export const uploadDoodadTexture = async (req: Request, res: Response) => {
  try {
    const doodad = await findDoodad(req.params.id);
    if (!doodad) {
      res.status(404).json({ error: 'Doodad not found' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }
    await prisma.doodad.update({ where: { id: doodad.id }, data: { textureUrl: `/assets/sprites/doodads/${req.file.filename}` } });
    await mirrorDoodadsToJson();
    res.json(asDoodadDefinition((await findDoodad(doodad.id)) ?? doodad));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to upload the doodad texture' });
  }
};

/**
 * Saves an extra named picture (a part, or a size's own art) and returns its url. The doodad is not changed: the admin
 * puts the url into `parts` or `sizeVariants` and saves.
 */
export const uploadDoodadImage = async (req: Request, res: Response) => {
  try {
    const doodad = await findDoodad(req.params.id);
    if (!doodad) {
      res.status(404).json({ error: 'Doodad not found' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }
    res.json({ url: `/assets/sprites/doodads/${req.file.filename}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to upload the doodad image' });
  }
};

/** Rejects a missing or odd image name before anything is written. */
export const requireImageName = (req: Request, res: Response, next: () => void) => {
  if (clean(req.params.name) === '' || clean(req.params.name) !== req.params.name.toLowerCase()) {
    res.status(400).json({ error: 'Name the picture with lower case letters, digits and underscores (e.g. cap)' });
    return;
  }
  next();
};
