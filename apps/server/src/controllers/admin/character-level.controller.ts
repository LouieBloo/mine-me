import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, buildDropTableCreate, buildDropTableUpsert } from '../../services/admin.service';

export const getLevels = async (req: Request, res: Response) => {
  const levels = await prisma.characterLevel.findMany({
    orderBy: { level: 'asc' },
    include: {
      dropTable: {
        include: {
          items: {
            include: {
              item: true
            }
          }
        }
      }
    }
  });
  res.json(levels);
};

export const getLevel = async (req: Request, res: Response) => {
  const level = await prisma.characterLevel.findUnique({
    where: { id: req.params.id },
    include: {
      dropTable: {
        include: {
          items: {
            include: {
              item: true
            }
          }
        }
      }
    }
  });
  res.json(level);
};

export const createLevel = async (req: Request, res: Response) => {
  try {
    const { dropTable, ...levelData } = req.body;

    // Check if level already exists
    const existing = await prisma.characterLevel.findUnique({
      where: { level: levelData.level }
    });
    if (existing) {
      res.status(400).json({ errors: [{ path: 'level', msg: 'Level already exists' }] });
      return;
    }

    const level = await prisma.characterLevel.create({
      data: {
        level: levelData.level,
        xpRequired: levelData.xpRequired,
        dropTable: buildDropTableCreate(dropTable)
      },
      include: {
        dropTable: {
          include: {
            items: {
              include: {
                item: true
              }
            }
          }
        }
      }
    });

    const allLevels = await prisma.characterLevel.findMany({
      orderBy: { level: 'asc' },
      include: {
        dropTable: {
          include: {
            items: true
          }
        }
      }
    });
    syncJson('character_levels.json', allLevels);

    res.json(level);
  } catch (error: any) {
    console.error('[createLevel] error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateLevel = async (req: Request, res: Response) => {
  try {
    const { dropTable, ...levelData } = req.body;

    // Check if another level has this level number
    const existing = await prisma.characterLevel.findFirst({
      where: {
        level: levelData.level,
        NOT: { id: req.params.id }
      }
    });
    if (existing) {
      res.status(400).json({ errors: [{ path: 'level', msg: 'Level already exists' }] });
      return;
    }

    const level = await prisma.characterLevel.update({
      where: { id: req.params.id },
      data: {
        level: levelData.level,
        xpRequired: levelData.xpRequired,
        dropTable: buildDropTableUpsert(dropTable)
      },
      include: {
        dropTable: {
          include: {
            items: {
              include: {
                item: true
              }
            }
          }
        }
      }
    });

    const allLevels = await prisma.characterLevel.findMany({
      orderBy: { level: 'asc' },
      include: {
        dropTable: {
          include: {
            items: true
          }
        }
      }
    });
    syncJson('character_levels.json', allLevels);

    res.json(level);
  } catch (error: any) {
    console.error('[updateLevel] error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteLevel = async (req: Request, res: Response) => {
  try {
    // Delete character level. Associated dropTable is deleted by onDelete: Cascade.
    const level = await prisma.characterLevel.delete({
      where: { id: req.params.id }
    });

    const allLevels = await prisma.characterLevel.findMany({
      orderBy: { level: 'asc' },
      include: {
        dropTable: {
          include: {
            items: true
          }
        }
      }
    });
    syncJson('character_levels.json', allLevels);

    res.json(level);
  } catch (error: any) {
    console.error('[deleteLevel] error:', error);
    res.status(500).json({ error: error.message });
  }
};
