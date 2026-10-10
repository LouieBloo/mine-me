import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, getPagination, buildDropTableCreate, buildDropTableUpsert } from '../../services/admin.service';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { normalizeMobSoundRefs } from '@mine-me/shared';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../../../../../packages/shared/assets/sprites/mobs');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const fieldName = file.fieldname;
    cb(null, `${req.params.id}_${fieldName}${ext}`);
  }
});

const upload = multer({ storage: storage });
export const mobSpriteUpload = upload.fields([
  { name: 'sprite', maxCount: 1 },
  { name: 'atlas', maxCount: 1 }
]);

/** Everything the game and the seed JSON need to know about a mob (drops and its effects). */
export const MOB_INCLUDE = {
  dropTable: { include: { items: true } },
  mobEffects: { include: { effect: true } },
} as const;

/** Rewrites mobs.json from the database so the seed mirror matches admin edits. */
export const syncMobsJson = async () => {
  const allMobs = await prisma.mob.findMany({ include: MOB_INCLUDE });
  await syncJson('mobs.json', allMobs);
};

const toEffectCreates = (mobEffects: unknown) =>
  Array.isArray(mobEffects)
    ? mobEffects.map((me: any) => ({ effectId: me.effectId, value: Number(me.value) }))
    : [];

export const getMobs = async (req: Request, res: Response) => {
  const { skip, take, where } = getPagination(req, 'name');
  const mobs = await prisma.mob.findMany({ skip, take, where, include: { mobEffects: { include: { effect: true } } } });
  res.json(mobs);
};

export const getMob = async (req: Request, res: Response) => {
  const mob = await prisma.mob.findUnique({ 
    where: { id: req.params.id },
    include: MOB_INCLUDE
  });
  res.json(mob);
};

/** Fields the admin may send back that are not stored columns (`sounds` is resolved at load). */
const withCleanSounds = (mobData: Record<string, any>): any => {
  const { sounds, soundEffects, ...rest } = mobData;
  return soundEffects === undefined ? rest : { ...rest, soundEffects: normalizeMobSoundRefs(soundEffects) };
};

export const createMob = async (req: Request, res: Response) => {
  const { dropTable, drops, mobEffects, ...rawMobData } = req.body;
  const mobData = withCleanSounds(rawMobData);
  const mob = await prisma.mob.create({ 
    data: {
      ...mobData,
      dropTable: buildDropTableCreate(dropTable),
      mobEffects: { create: toEffectCreates(mobEffects) },
    },
    include: MOB_INCLUDE,
  });
  await syncMobsJson();
  res.json(mob);
};

export const updateMob = async (req: Request, res: Response) => {
  const { dropTable, drops, mobEffects, ...rawMobData } = req.body;
  const dataToUpdate: any = withCleanSounds(rawMobData);
  if (dropTable !== undefined) {
    dataToUpdate.dropTable = buildDropTableUpsert(dropTable);
  }
  // Omitted = leave the effects alone; an array (even empty) replaces them
  if (mobEffects !== undefined) {
    dataToUpdate.mobEffects = { deleteMany: {}, create: toEffectCreates(mobEffects) };
  }
  const mob = await prisma.mob.update({ 
    where: { id: req.params.id }, 
    data: dataToUpdate,
    include: MOB_INCLUDE,
  });
  await syncMobsJson();
  res.json(mob);
};

export const uploadMobSpriteAtlas = async (req: Request, res: Response) => {
  try {
    const mobId = req.params.id;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const spriteFile = files?.sprite?.[0];
    const atlasFile = files?.atlas?.[0];

    const mob = await prisma.mob.findUnique({ where: { id: mobId } });
    if (!mob) {
       res.status(404).json({ error: 'Mob not found' });
       return;
    }
    
    const currentConfig: any = mob.animations ? (typeof mob.animations === 'string' ? JSON.parse(mob.animations) : mob.animations) : {};
    
    let url = currentConfig.url;
    let atlasUrl = currentConfig.atlasUrl;

    if (spriteFile) {
       url = `/assets/sprites/mobs/${spriteFile.filename}`;
    }
    if (atlasFile) {
       atlasUrl = `/assets/sprites/mobs/${atlasFile.filename}`;
    }

    const atlasFileOnDisk = atlasFile 
      ? atlasFile.path 
      : (atlasUrl ? path.join(__dirname, '../../../../../../packages/shared', atlasUrl) : null);
    const spriteFilename = url ? url.split('/').pop() : null;

    if (atlasFileOnDisk && spriteFilename) {
      try {
        const raw = fs.readFileSync(atlasFileOnDisk, 'utf-8');
        const atlasJson = JSON.parse(raw);
        if (atlasJson.meta) {
          atlasJson.meta.image = spriteFilename;
        }
        fs.writeFileSync(atlasFileOnDisk, JSON.stringify(atlasJson, null, 2));
      } catch (e) {
        console.warn('Could not patch atlas meta.image:', e);
      }
    }
    
    const updatedConfig = {
      url: url || currentConfig.url,
      atlasUrl: atlasUrl || currentConfig.atlasUrl
    };
    
    const updatedMob = await prisma.mob.update({
      where: { id: mobId },
      data: { animations: updatedConfig }
    });
    
    await syncMobsJson();
    
    res.json(updatedMob);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to upload sprite atlas' });
  }
};

export const updateMobSkeleton = async (req: Request, res: Response) => {
  try {
    const mobId = req.params.id;
    const { manifest } = req.body;
    const skeletonManifest = manifest || req.body.animations;

    if (!skeletonManifest || !skeletonManifest.parts) {
      res.status(400).json({ error: 'Invalid skeleton manifest payload' });
      return;
    }

    const mob = await prisma.mob.update({
      where: { id: mobId },
      data: { animations: skeletonManifest }
    });

    await syncMobsJson();

    res.json(mob);
  } catch (error: any) {
    console.error('[Admin] Failed to update mob skeleton:', error);
    res.status(500).json({ error: error.message || 'Failed to update mob skeleton' });
  }
};
