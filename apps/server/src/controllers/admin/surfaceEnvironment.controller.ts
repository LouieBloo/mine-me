import { Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { Prisma } from '@prisma/client';
import { validateSurfaceEnvironment, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';
import { getAssetsRoot } from '../../config/assetPaths';
import { toSurfaceEnvironment } from '../../services/mining/definitionLoaders';

/** The columns an admin may set. `key` is only set when an environment is created; sounds have their own route and pictures their upload. */
const EDITABLE_FIELDS = ['name', 'description', 'weight', 'isDefault', 'sky', 'ambientTint', 'layers', 'clouds', 'weather', 'props'] as const;
const JSON_FIELDS = ['sky', 'layers', 'clouds', 'weather', 'props'] as const;

/** A Json column takes null as `Prisma.JsonNull`, never a bare null. */
const jsonOrNull = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

/** Writes the table to the dev seed mirror, like the other admin saves do. */
export async function mirrorSurfaceEnvironmentsToJson(): Promise<void> {
  const all = await prisma.surfaceEnvironment.findMany({ orderBy: { key: 'asc' } });
  syncJson('surface_environments.json', all.map(toSurfaceEnvironment));
}

/** The environment as the shared shape wants it. */
export const asSurfaceEnvironment = (row: unknown): SurfaceEnvironmentDefinition => toSurfaceEnvironment(row);

function readBody(body: Record<string, unknown>): Partial<SurfaceEnvironmentDefinition> {
  const out: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) if (body[field] !== undefined) out[field] = body[field];
  if (typeof body.key === 'string') out.key = body.key;
  if (typeof out.weight === 'string' && out.weight.trim() !== '') out.weight = Number(out.weight);
  return out as Partial<SurfaceEnvironmentDefinition>;
}

const findEnvironment = (id: string) => prisma.surfaceEnvironment.findFirst({ where: { OR: [{ id }, { key: id.toLowerCase() }] } });

/**
 * Problems with what an environment points at: every prop's doodad must exist and be one that can stand on the ground (a
 * floor doodad) or fly (an air doodad), so a typo or a wall doodad cannot silently do nothing.
 */
export async function referenceErrors(env: Partial<SurfaceEnvironmentDefinition>): Promise<string[]> {
  const props = Array.isArray(env.props) ? env.props : [];
  if (props.length === 0) return [];
  const doodads = await prisma.doodad.findMany({ select: { key: true, anchor: true } });
  const byKey = new Map(doodads.map((d) => [d.key, d.anchor]));
  const errors: string[] = [];
  for (const prop of props) {
    const anchor = byKey.get(prop?.doodadKey);
    if (anchor === undefined) errors.push(`props names an unknown doodad: ${prop?.doodadKey}`);
    else if (anchor !== 'FLOOR' && anchor !== 'AIR') errors.push(`props: ${prop.doodadKey} hangs on a ceiling or wall; only floor doodads (trees, bushes) and air doodads (birds) can be surface props`);
  }
  return errors;
}

export const getSurfaceEnvironments = async (_req: Request, res: Response) => {
  try {
    const all = await prisma.surfaceEnvironment.findMany({ orderBy: { key: 'asc' } });
    res.json(all.map(asSurfaceEnvironment));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch surface environments' });
  }
};

export const getSurfaceEnvironment = async (req: Request, res: Response) => {
  try {
    const env = await findEnvironment(req.params.id);
    if (!env) {
      res.status(404).json({ error: 'Surface environment not found' });
      return;
    }
    res.json(asSurfaceEnvironment(env));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch the surface environment' });
  }
};

export const createSurfaceEnvironment = async (req: Request, res: Response) => {
  try {
    const input = readBody(req.body ?? {});
    const draft = { weight: 1, layers: [], ...input } as Partial<SurfaceEnvironmentDefinition>;
    const errors = [...validateSurfaceEnvironment(draft), ...(await referenceErrors(draft))];
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    if (await prisma.surfaceEnvironment.findUnique({ where: { key: draft.key! } })) {
      res.status(409).json({ error: `A surface environment with the key ${draft.key} already exists` });
      return;
    }
    // The first one made is the default; a new default takes the role from the old one
    const makeDefault = draft.isDefault === true || (await prisma.surfaceEnvironment.count()) === 0;
    if (makeDefault) await prisma.surfaceEnvironment.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const created = await prisma.surfaceEnvironment.create({
      data: {
        key: draft.key!,
        name: draft.name!.trim(),
        description: draft.description ?? null,
        weight: draft.weight!,
        isDefault: makeDefault,
        sky: draft.sky as unknown as Prisma.InputJsonValue,
        ambientTint: draft.ambientTint ?? null,
        layers: jsonOrNull(draft.layers),
        clouds: jsonOrNull(draft.clouds),
        weather: jsonOrNull(draft.weather),
        props: jsonOrNull(draft.props),
      },
    });
    await mirrorSurfaceEnvironmentsToJson();
    res.status(201).json(asSurfaceEnvironment(created));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create the surface environment' });
  }
};

export const updateSurfaceEnvironment = async (req: Request, res: Response) => {
  try {
    const existing = await findEnvironment(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Surface environment not found' });
      return;
    }
    const input = readBody(req.body ?? {});
    if (input.key !== undefined && input.key !== existing.key) {
      res.status(400).json({ error: 'A surface environment\'s key cannot be changed once it exists' });
      return;
    }
    if (input.isDefault === false && existing.isDefault) {
      res.status(400).json({ error: 'There must always be a default surface environment: make another one the default instead' });
      return;
    }
    // Check it as it would be after the change, so a partial update cannot leave it invalid
    const merged = { ...asSurfaceEnvironment(existing), ...input } as Partial<SurfaceEnvironmentDefinition>;
    const errors = [...validateSurfaceEnvironment(merged), ...(await referenceErrors(merged))];
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    const data: Prisma.SurfaceEnvironmentUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description;
    if (input.weight !== undefined) data.weight = input.weight;
    if (input.ambientTint !== undefined) data.ambientTint = input.ambientTint;
    for (const field of JSON_FIELDS) if (input[field] !== undefined) (data as Record<string, unknown>)[field] = jsonOrNull(input[field]);
    if (input.isDefault === true && !existing.isDefault) {
      await prisma.surfaceEnvironment.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      data.isDefault = true;
    }
    const saved = await prisma.surfaceEnvironment.update({ where: { id: existing.id }, data });
    await mirrorSurfaceEnvironmentsToJson();
    res.json(asSurfaceEnvironment(saved));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update the surface environment' });
  }
};

/** Deletes an environment. The default one stays: a run needs something to pick when nothing else can be. */
export const deleteSurfaceEnvironment = async (req: Request, res: Response) => {
  try {
    const existing = await findEnvironment(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Surface environment not found' });
      return;
    }
    if (existing.isDefault) {
      res.status(400).json({ error: 'The default surface environment cannot be deleted: make another one the default first' });
      return;
    }
    await prisma.surfaceEnvironment.delete({ where: { id: existing.id } });
    await mirrorSurfaceEnvironmentsToJson();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete the surface environment' });
  }
};

// ---- Pictures --------------------------------------------------------------------------------------------------------

/** Where surface pictures live (one folder, files named after the environment key and what the picture is). */
const surfaceDir = (): string => path.join(getAssetsRoot(), 'sprites', 'surface');

const clean = (value: unknown): string => String(value ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = surfaceDir();
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${clean(req.params.id)}-${clean(req.params.name)}${ext}`);
  },
});

const fileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') cb(null, true);
  else cb(new Error('Only PNG or JPG images are allowed'));
};

export const surfaceImageUpload = multer({ storage, fileFilter }).single('texture');

/** Rejects a missing or odd picture name before anything is written. */
export const requireSurfaceImageName = (req: Request, res: Response, next: () => void) => {
  if (clean(req.params.name) === '' || clean(req.params.name) !== req.params.name.toLowerCase()) {
    res.status(400).json({ error: 'Name the picture with lower case letters, digits and underscores (e.g. far_mountains)' });
    return;
  }
  next();
};

/**
 * Saves a picture for the environment (a scenery strip, a cloud) and returns its url. The environment is not changed: the
 * admin puts the url into a layer or the cloud list and saves. A re-upload keeps the file name, so the url carries a
 * version to make browsers and the game fetch the new picture.
 */
export const uploadSurfaceImage = async (req: Request, res: Response) => {
  try {
    const env = await findEnvironment(req.params.id);
    if (!env) {
      res.status(404).json({ error: 'Surface environment not found' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }
    res.json({ url: `/assets/sprites/surface/${req.file.filename}?v=${Date.now()}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to upload the picture' });
  }
};
