import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, getPagination, buildDropTableCreate, buildDropTableUpsert } from '../../services/admin.service';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

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

export const getMobs = async (req: Request, res: Response) => {
  const { skip, take, where } = getPagination(req, 'name');
  const mobs = await prisma.mob.findMany({ skip, take, where });
  res.json(mobs);
};

export const getMob = async (req: Request, res: Response) => {
  const mob = await prisma.mob.findUnique({ 
    where: { id: req.params.id },
    include: {
      dropTable: { include: { items: true } }
    }
  });
  res.json(mob);
};

export const createMob = async (req: Request, res: Response) => {
  const { dropTable, drops, ...mobData } = req.body;
  const mob = await prisma.mob.create({ 
    data: {
      ...mobData,
      dropTable: buildDropTableCreate(dropTable)
    } 
  });
  const allMobs = await prisma.mob.findMany({ include: { dropTable: { include: { items: true } } }});
  syncJson('mobs.json', allMobs);
  res.json(mob);
};

export const updateMob = async (req: Request, res: Response) => {
  const { dropTable, drops, ...mobData } = req.body;
  const mob = await prisma.mob.update({ 
    where: { id: req.params.id }, 
    data: {
      ...mobData,
      dropTable: buildDropTableUpsert(dropTable)
    } 
  });
  const allMobs = await prisma.mob.findMany({ include: { dropTable: { include: { items: true } } }});
  syncJson('mobs.json', allMobs);
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
    
    const allMobs = await prisma.mob.findMany();
    await syncJson('mobs.json', allMobs);
    
    res.json(updatedMob);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to upload sprite atlas' });
  }
};
