import { Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { Prisma } from '@prisma/client';
import { validateExtractor, type ExtractorDefinition } from '@mine-me/shared';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';
import { getAssetsRoot } from '../../config/assetPaths';

/** The columns an admin may set. `key` is only set when an extractor is created; art arrives through the texture upload. */
const EDITABLE_FIELDS = [
  'name', 'description', 'width', 'height', 'entranceOffset', 'landingSeconds', 'shaftWidth', 'buildSecondsPerSegment', 'beltSpeed',
  'beltItemSpacing', 'depositItemsPerSecond', 'unloadItemsPerSecond', 'beltSegmentHealth', 'health', 'landingParticleEffectId', 'isDefault',
] as const;

const NUMERIC_FIELDS = [
  'width', 'height', 'entranceOffset', 'landingSeconds', 'shaftWidth', 'buildSecondsPerSegment', 'beltSpeed', 'beltItemSpacing',
  'depositItemsPerSecond', 'unloadItemsPerSecond', 'beltSegmentHealth', 'health',
] as const;

/** Writes the extractor table to the dev seed mirror, like the other admin saves do. */
async function mirrorToJson(): Promise<void> {
  const all = await prisma.extractor.findMany({ orderBy: { createdAt: 'asc' } });
  syncJson('extractors.json', all);
}

/** Numbers arrive as numbers or numeric strings; anything else is left for validation to reject. */
function readBody(body: Record<string, unknown>): Partial<ExtractorDefinition> {
  const out: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) if (body[field] !== undefined) out[field] = body[field];
  if (typeof body.key === 'string') out.key = body.key;
  for (const field of NUMERIC_FIELDS) {
    const value = out[field];
    if (typeof value === 'string' && value.trim() !== '') out[field] = Number(value);
  }
  return out as Partial<ExtractorDefinition>;
}

const findExtractor = (id: string) => prisma.extractor.findFirst({ where: { OR: [{ id }, { key: id.toLowerCase() }] } });

/** Only one extractor is the default: marking one clears the flag on the rest (in the same transaction). */
const clearOtherDefaults = (exceptId: string) => prisma.extractor.updateMany({ where: { id: { not: exceptId }, isDefault: true }, data: { isDefault: false } });

export const getExtractors = async (_req: Request, res: Response) => {
  try {
    res.json(await prisma.extractor.findMany({ orderBy: { createdAt: 'asc' } }));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch extractors' });
  }
};

export const getExtractor = async (req: Request, res: Response) => {
  try {
    const extractor = await findExtractor(req.params.id);
    if (!extractor) {
      res.status(404).json({ error: 'Extractor not found' });
      return;
    }
    res.json(extractor);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch extractor' });
  }
};

export const createExtractor = async (req: Request, res: Response) => {
  try {
    const input = readBody(req.body ?? {});
    const errors = validateExtractor(input);
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    if (await prisma.extractor.findUnique({ where: { key: input.key! } })) {
      res.status(409).json({ error: `An extractor with the key ${input.key} already exists` });
      return;
    }
    const extractor = await prisma.extractor.create({
      data: {
        key: input.key!,
        name: input.name!.trim(),
        description: input.description ?? null,
        width: input.width!,
        height: input.height!,
        entranceOffset: input.entranceOffset!,
        landingSeconds: input.landingSeconds!,
        shaftWidth: input.shaftWidth!,
        buildSecondsPerSegment: input.buildSecondsPerSegment!,
        beltSpeed: input.beltSpeed!,
        beltItemSpacing: input.beltItemSpacing!,
        depositItemsPerSecond: input.depositItemsPerSecond!,
        unloadItemsPerSecond: input.unloadItemsPerSecond!,
        beltSegmentHealth: input.beltSegmentHealth!,
        health: input.health!,
        landingParticleEffectId: input.landingParticleEffectId || null,
        isDefault: input.isDefault === true,
      },
    });
    if (extractor.isDefault) await clearOtherDefaults(extractor.id);
    await mirrorToJson();
    res.status(201).json(extractor);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create extractor' });
  }
};

export const updateExtractor = async (req: Request, res: Response) => {
  try {
    const existing = await findExtractor(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Extractor not found' });
      return;
    }
    const input = readBody(req.body ?? {});
    if (input.key !== undefined && input.key !== existing.key) {
      res.status(400).json({ error: 'An extractor\'s key cannot be changed once it exists' });
      return;
    }
    // Check the extractor as it would be after the change, so a partial update cannot leave it invalid
    const errors = validateExtractor({ ...existing, ...input } as Partial<ExtractorDefinition>);
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    const data: Prisma.ExtractorUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description;
    for (const field of NUMERIC_FIELDS) {
      if (input[field] !== undefined) (data as Record<string, unknown>)[field] = input[field];
    }
    if (input.isDefault !== undefined) data.isDefault = input.isDefault === true;
    if (input.landingParticleEffectId !== undefined) {
      data.landingParticleEffect = input.landingParticleEffectId ? { connect: { id: input.landingParticleEffectId } } : { disconnect: true };
    }
    const extractor = await prisma.extractor.update({ where: { id: existing.id }, data });
    if (extractor.isDefault) await clearOtherDefaults(extractor.id);
    await mirrorToJson();
    res.json(extractor);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update extractor' });
  }
};

/** Deletes an extractor. The game falls back to the built-in one when none is left. */
export const deleteExtractor = async (req: Request, res: Response) => {
  try {
    const existing = await findExtractor(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Extractor not found' });
      return;
    }
    await prisma.extractor.delete({ where: { id: existing.id } });
    await mirrorToJson();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete extractor' });
  }
};

// ---- Art -------------------------------------------------------------------------------------------------------------

/** Where an extractor's pictures live (one folder for the extractor family, files named after the extractor key and part). */
const spriteDir = (): string => path.join(getAssetsRoot(), 'sprites', 'extractors');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = spriteDir();
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const part = req.params.part === 'belt' ? 'belt' : 'body';
    cb(null, `${String(req.params.id).toLowerCase().replace(/[^a-z0-9_]/g, '')}-${part}${ext}`);
  },
});

const fileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') cb(null, true);
  else cb(new Error('Only PNG or JPG images are allowed'));
};

export const extractorTextureUpload = multer({ storage, fileFilter }).single('texture');

/** Validates the part before anything is written. */
export const requireTexturePart = (req: Request, res: Response, next: () => void) => {
  if (req.params.part !== 'body' && req.params.part !== 'belt') {
    res.status(400).json({ error: `Unknown extractor texture "${req.params.part}" (use body or belt)` });
    return;
  }
  next();
};

/** Saves an uploaded picture for the machine (`body`) or one belt segment (`belt`) and points the extractor at it. */
export const uploadExtractorTexture = async (req: Request, res: Response) => {
  try {
    const extractor = await findExtractor(req.params.id);
    if (!extractor) {
      res.status(404).json({ error: 'Extractor not found' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }
    const url = `/assets/sprites/extractors/${req.file.filename}`;
    const saved = await prisma.extractor.update({
      where: { id: extractor.id },
      data: req.params.part === 'belt' ? { beltTextureUrl: url } : { textureUrl: url },
    });
    await mirrorToJson();
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to upload the extractor texture' });
  }
};
