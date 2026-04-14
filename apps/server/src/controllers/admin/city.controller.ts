import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, getPagination } from '../../services/admin.service';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../../../../../packages/shared/assets/cities/backgrounds');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${req.params.id}_background${ext}`);
  }
});

const mapIconStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../../../../../packages/shared/assets/cities/icons');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${req.params.id}_mapicon${ext}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
    cb(null, true);
  } else {
    cb(new Error('Only PNG or JPG images are allowed'));
  }
};

const iconFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'image/png') {
    cb(null, true);
  } else {
    cb(new Error('Only PNG images are allowed for icons'));
  }
};

const upload = multer({ storage: storage, fileFilter });
const mapIconUpload = multer({ storage: mapIconStorage, fileFilter: iconFileFilter });

export const cityBackgroundUpload = upload.single('background');
export const cityMapIconUpload = mapIconUpload.single('icon');

export const getCities = async (req: Request, res: Response) => {
  const { skip, take, where } = getPagination(req, 'name');
  const cities = await prisma.city.findMany({ skip, take, where });
  res.json(cities);
};

export const getCity = async (req: Request, res: Response) => {
  const city = await prisma.city.findUnique({
    where: { id: req.params.id },
    include: {
      cityDungeons: { 
        orderBy: { orderIndex: 'asc' },
        include: { dungeon: true } 
      },
      cityMaterials: { include: { item: true } }
    }
  });
  res.json(city);
};

export const createCity = async (req: Request, res: Response) => {
  const city = await prisma.city.create({ data: req.body });
  const allCities = await prisma.city.findMany();
  syncJson('cities.json', allCities);
  res.json(city);
};

export const updateCity = async (req: Request, res: Response) => {
  const city = await prisma.city.update({ where: { id: req.params.id }, data: req.body });
  const allCities = await prisma.city.findMany();
  syncJson('cities.json', allCities);
  res.json(city);
};

export const updateCityCoordinates = async (req: Request, res: Response) => {
  const { worldPositionX, worldPositionY } = req.body;
  const city = await prisma.city.update({
    where: { id: req.params.id },
    data: { worldPositionX, worldPositionY },
    include: {
      cityDungeons: { 
        orderBy: { orderIndex: 'asc' },
        include: { dungeon: true } 
      },
      cityMaterials: { include: { item: true } }
    }
  });

  const allCities = await prisma.city.findMany({
    include: {
      cityDungeons: { 
        orderBy: { orderIndex: 'asc' },
        include: { dungeon: true } 
      },
      cityMaterials: { include: { item: true } }
    }
  });
  await syncJson('cities.json', allCities);
  
  res.json(city);
};

export const updateCityObjects = async (req: Request, res: Response) => {
  const { objectCoordinates } = req.body;
  const city = await prisma.city.update({
    where: { id: req.params.id },
    data: { objectCoordinates: objectCoordinates ?? [] },
    include: {
      cityDungeons: { 
        orderBy: { orderIndex: 'asc' },
        include: { dungeon: true } 
      },
      cityMaterials: { include: { item: true } }
    }
  });

  res.json(city);
};

// --- City Dungeons ---

export const getCityDungeons = async (req: Request, res: Response) => {
  const cityDungeons = await prisma.cityDungeon.findMany({
    where: { cityId: req.params.id },
    include: { dungeon: true }
  });
  res.json(cityDungeons);
};

export const addCityDungeon = async (req: Request, res: Response) => {
  const { dungeonId } = req.body;
  const count = await prisma.cityDungeon.count({ where: { cityId: req.params.id } });
  
  const cityDungeon = await prisma.cityDungeon.create({
    data: { cityId: req.params.id, dungeonId, orderIndex: count },
    include: { dungeon: true }
  });
  const allCities = await prisma.city.findMany({
    include: { 
      cityDungeons: { orderBy: { orderIndex: 'asc' }, include: { dungeon: true } }, 
      cityMaterials: { include: { item: true } } 
    }
  });
  syncJson('cities.json', allCities);
  res.json(cityDungeon);
};

export const removeCityDungeon = async (req: Request, res: Response) => {
  await prisma.cityDungeon.delete({
    where: { id: req.params.cityDungeonId }
  });
  const allCities = await prisma.city.findMany({
    include: { 
      cityDungeons: { orderBy: { orderIndex: 'asc' }, include: { dungeon: true } }, 
      cityMaterials: { include: { item: true } } 
    }
  });
  syncJson('cities.json', allCities);
  res.json({ success: true });
};

export const reorderCityDungeons = async (req: Request, res: Response) => {
  const { orderedIds } = req.body;
  
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array of ids' });
  }

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) =>
      prisma.cityDungeon.update({
        where: { id },
        data: { orderIndex: index }
      })
    )
  );

  const allCities = await prisma.city.findMany({
    include: { 
      cityDungeons: { orderBy: { orderIndex: 'asc' }, include: { dungeon: true } }, 
      cityMaterials: { include: { item: true } } 
    }
  });
  syncJson('cities.json', allCities);
  
  res.json({ success: true });
};

// --- City Materials ---

export const getCityMaterials = async (req: Request, res: Response) => {
  const cityMaterials = await prisma.cityMaterial.findMany({
    where: { cityId: req.params.id },
    include: { item: true }
  });
  res.json(cityMaterials);
};

export const addCityMaterial = async (req: Request, res: Response) => {
  const { itemId } = req.body;
  const cityMaterial = await prisma.cityMaterial.create({
    data: { cityId: req.params.id, itemId },
    include: { item: true }
  });
  const allCities = await prisma.city.findMany({
    include: { cityDungeons: { include: { dungeon: true } }, cityMaterials: { include: { item: true } } }
  });
  syncJson('cities.json', allCities);
  res.json(cityMaterial);
};

export const removeCityMaterial = async (req: Request, res: Response) => {
  await prisma.cityMaterial.delete({
    where: { id: req.params.cityMaterialId }
  });
  const allCities = await prisma.city.findMany({
    include: { cityDungeons: { include: { dungeon: true } }, cityMaterials: { include: { item: true } } }
  });
  syncJson('cities.json', allCities);
  res.json({ success: true });
};

export const uploadCityBackground = async (req: Request, res: Response) => {
  try {
    const cityId = req.params.id;
    const file = req.file;

    const city = await prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'No background file provided' });
      return;
    }

    const backgroundImageUrl = `/assets/cities/backgrounds/${file.filename}`;

    const updatedCity = await prisma.city.update({
      where: { id: cityId },
      data: { backgroundImageUrl },
      include: {
        cityDungeons: { 
          orderBy: { orderIndex: 'asc' },
          include: { dungeon: true } 
        },
        cityMaterials: { include: { item: true } }
      }
    });

    const allCities = await prisma.city.findMany({
      include: {
        cityDungeons: { 
          orderBy: { orderIndex: 'asc' },
          include: { dungeon: true } 
        },
        cityMaterials: { include: { item: true } }
      }
    });
    await syncJson('cities.json', allCities);

    res.json(updatedCity);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to upload city background' });
  }
};

export const uploadCityMapIcon = async (req: Request, res: Response) => {
  try {
    const cityId = req.params.id;
    const file = req.file;

    const city = await prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'No icon file provided' });
      return;
    }

    const mapIconUrl = `/assets/cities/icons/${file.filename}`;

    const updatedCity = await prisma.city.update({
      where: { id: cityId },
      data: { mapIconUrl },
      include: {
        cityDungeons: { 
          orderBy: { orderIndex: 'asc' },
          include: { dungeon: true } 
        },
        cityMaterials: { include: { item: true } }
      }
    });

    const allCities = await prisma.city.findMany({
      include: {
        cityDungeons: { 
          orderBy: { orderIndex: 'asc' },
          include: { dungeon: true } 
        },
        cityMaterials: { include: { item: true } }
      }
    });
    await syncJson('cities.json', allCities);

    res.json(updatedCity);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to upload map icon' });
  }
};
