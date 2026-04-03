import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, getPagination, buildDropTableCreate, buildDropTableUpsert } from '../../services/admin.service';

// --- DUNGEONS ---
export const getDungeons = async (req: Request, res: Response) => {
  const { skip, take, where } = getPagination(req, 'name');
  const dungeons = await prisma.dungeon.findMany({ skip, take, where, include: { levels: true, cityDungeons: { include: { city: true } } } });
  res.json(dungeons);
};

export const getDungeon = async (req: Request, res: Response) => {
  const dungeon = await prisma.dungeon.findUnique({ 
    where: { id: req.params.id },
    include: { 
      completionDropTable: { include: { items: true } },
      cityDungeons: { include: { city: true } },
      levels: { 
        orderBy: { orderIndex: 'asc' },
        include: {
          completionDropTable: { include: { items: true } },
          mobs: { include: { dropTable: { include: { items: true } } } }
        }
      } 
    }
  });
  res.json(dungeon);
};

export const createDungeon = async (req: Request, res: Response) => {
  const { completionDropTable, cityDungeons, cityId, ...dungeonData } = req.body;
  const dungeon = await prisma.dungeon.create({ 
    data: {
      ...dungeonData,
      completionDropTable: buildDropTableCreate(completionDropTable)
    } 
  });
  const allDungeons = await prisma.dungeon.findMany({ include: { levels: true } });
  syncJson('dungeons.json', allDungeons);
  res.json(dungeon);
};

export const updateDungeon = async (req: Request, res: Response) => {
  const { completionDropTable, cityDungeons, cityId, ...dungeonData } = req.body;
  const dungeon = await prisma.dungeon.update({ 
    where: { id: req.params.id }, 
    data: {
      ...dungeonData,
      completionDropTable: buildDropTableUpsert(completionDropTable)
    } 
  });
  const allDungeons = await prisma.dungeon.findMany({ include: { levels: true } });
  syncJson('dungeons.json', allDungeons);
  res.json(dungeon);
};

// --- DUNGEON LEVELS ---
export const getDungeonLevels = async (req: Request, res: Response) => {
  const levels = await prisma.dungeonLevel.findMany();
  res.json(levels);
};

export const createDungeonLevel = async (req: Request, res: Response) => {
  const { completionDropTable, mobs, ...levelData } = req.body;
  const level = await prisma.dungeonLevel.create({ 
    data: {
      ...levelData,
      completionDropTable: buildDropTableCreate(completionDropTable),
      mobs: {
        create: (mobs || []).map((m: any) => ({
          mobId: m.mobId || m,
          dropTable: buildDropTableCreate(m.dropTable)
        }))
      }
    },
    include: {
      completionDropTable: { include: { items: true } },
      mobs: { include: { dropTable: { include: { items: true } } } }
    }
  });
  const allDungeons = await prisma.dungeon.findMany({ include: { levels: true } });
  syncJson('dungeons.json', allDungeons);
  res.json(level);
};

export const updateDungeonLevel = async (req: Request, res: Response) => {
  const { completionDropTable, mobs, ...levelData } = req.body;
  const level = await prisma.dungeonLevel.update({ 
    where: { id: req.params.id }, 
    data: {
      ...levelData,
      completionDropTable: buildDropTableUpsert(completionDropTable),
      mobs: {
        deleteMany: {},
        create: (mobs || []).map((m: any) => ({
          mobId: m.mobId || m,
          dropTable: buildDropTableCreate(m.dropTable)
        }))
      }
    },
    include: {
      completionDropTable: { include: { items: true } },
      mobs: { include: { dropTable: { include: { items: true } } } }
    }
  });
  const allDungeons = await prisma.dungeon.findMany({ include: { levels: true } });
  syncJson('dungeons.json', allDungeons);
  res.json(level);
};

export const deleteDungeonLevel = async (req: Request, res: Response) => {
  await prisma.dungeonLevel.delete({ where: { id: req.params.id } });
  const allDungeons = await prisma.dungeon.findMany({ include: { levels: true } });
  syncJson('dungeons.json', allDungeons);
  res.json({ success: true });
};
