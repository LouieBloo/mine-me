import express from 'express';
import { prisma } from '../index';
import fs from 'fs';
import path from 'path';

import { adminMiddleware } from '../middleware/auth';

const adminRouter = express.Router();
adminRouter.use(adminMiddleware);
// Fixed path: we need to go up 4 directory levels from apps/server/src/routes -> apps/server/src -> apps/server -> apps -> root
const dataPath = path.join(__dirname, '../../../../packages/shared/src/data');

// Generic helper to sync JSON
const syncJson = (filename: string, data: any) => {
  const filePath = path.join(dataPath, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// CITIES
adminRouter.get('/cities', async (req, res) => {
  const cities = await prisma.city.findMany();
  res.json(cities);
});

adminRouter.get('/cities/:id', async (req, res) => {
  const city = await prisma.city.findUnique({ where: { id: req.params.id } });
  res.json(city);
});

adminRouter.post('/cities', async (req, res) => {
  const city = await prisma.city.create({ data: req.body });
  const allCities = await prisma.city.findMany();
  syncJson('cities.json', allCities);
  res.json(city);
});

adminRouter.put('/cities/:id', async (req, res) => {
  const city = await prisma.city.update({ where: { id: req.params.id }, data: req.body });
  const allCities = await prisma.city.findMany();
  syncJson('cities.json', allCities);
  res.json(city);
});

// ITEMS
adminRouter.get('/items', async (req, res) => {
  const items = await prisma.item.findMany();
  res.json(items);
});

adminRouter.get('/items/:id', async (req, res) => {
  const item = await prisma.item.findUnique({ where: { id: req.params.id } });
  res.json(item);
});

adminRouter.post('/items', async (req, res) => {
  const item = await prisma.item.create({ data: req.body });
  const allItems = await prisma.item.findMany();
  syncJson('items.json', allItems);
  res.json(item);
});

adminRouter.put('/items/:id', async (req, res) => {
  const item = await prisma.item.update({ where: { id: req.params.id }, data: req.body });
  const allItems = await prisma.item.findMany();
  syncJson('items.json', allItems);
  res.json(item);
});

// MOBS
adminRouter.get('/mobs', async (req, res) => {
  const mobs = await prisma.mob.findMany();
  res.json(mobs);
});

adminRouter.get('/mobs/:id', async (req, res) => {
  const mob = await prisma.mob.findUnique({ where: { id: req.params.id } });
  res.json(mob);
});

adminRouter.post('/mobs', async (req, res) => {
  const mob = await prisma.mob.create({ data: req.body });
  const allMobs = await prisma.mob.findMany();
  syncJson('mobs.json', allMobs);
  res.json(mob);
});

adminRouter.put('/mobs/:id', async (req, res) => {
  const mob = await prisma.mob.update({ where: { id: req.params.id }, data: req.body });
  const allMobs = await prisma.mob.findMany();
  syncJson('mobs.json', allMobs);
  res.json(mob);
});

// DUNGEONS
adminRouter.get('/dungeons', async (req, res) => {
  const dungeons = await prisma.dungeon.findMany({
    include: { levels: true }
  });
  res.json(dungeons);
});

adminRouter.get('/dungeons/:id', async (req, res) => {
  const dungeon = await prisma.dungeon.findUnique({ 
    where: { id: req.params.id },
    include: { levels: { orderBy: { orderIndex: 'asc' } } }
  });
  res.json(dungeon);
});

adminRouter.post('/dungeons', async (req, res) => {
  const dungeon = await prisma.dungeon.create({ data: req.body });
  const allDungeons = await prisma.dungeon.findMany({ include: { levels: true } });
  syncJson('dungeons.json', allDungeons);
  res.json(dungeon);
});

adminRouter.put('/dungeons/:id', async (req, res) => {
  const dungeon = await prisma.dungeon.update({ where: { id: req.params.id }, data: req.body });
  const allDungeons = await prisma.dungeon.findMany({ include: { levels: true } });
  syncJson('dungeons.json', allDungeons);
  res.json(dungeon);
});

// DUNGEON LEVELS
adminRouter.get('/dungeon-levels', async (req, res) => {
  const levels = await prisma.dungeonLevel.findMany();
  res.json(levels);
});

adminRouter.post('/dungeon-levels', async (req, res) => {
  const level = await prisma.dungeonLevel.create({ data: req.body });
  // Also sync dungeons.json when levels change
  const allDungeons = await prisma.dungeon.findMany({ include: { levels: true } });
  syncJson('dungeons.json', allDungeons);
  res.json(level);
});

adminRouter.put('/dungeon-levels/:id', async (req, res) => {
  const level = await prisma.dungeonLevel.update({ where: { id: req.params.id }, data: req.body });
  const allDungeons = await prisma.dungeon.findMany({ include: { levels: true } });
  syncJson('dungeons.json', allDungeons);
  res.json(level);
});

adminRouter.delete('/dungeon-levels/:id', async (req, res) => {
  await prisma.dungeonLevel.delete({ where: { id: req.params.id } });
  const allDungeons = await prisma.dungeon.findMany({ include: { levels: true } });
  syncJson('dungeons.json', allDungeons);
  res.json({ success: true });
});

// USERS
adminRouter.get('/users', async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

adminRouter.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  res.json(user);
});

adminRouter.post('/users', async (req, res) => {
  const user = await prisma.user.create({ data: req.body });
  res.json(user);
});

adminRouter.put('/users/:id', async (req, res) => {
  const user = await prisma.user.update({ where: { id: req.params.id }, data: req.body });
  res.json(user);
});

// INVENTORY ITEMS
adminRouter.get('/inventory-items', async (req, res) => {
  const items = await prisma.inventoryItem.findMany({
    include: { character: true } // Helpful for the grid
  });
  res.json(items);
});

adminRouter.get('/inventory-items/:id', async (req, res) => {
  const item = await prisma.inventoryItem.findUnique({ 
    where: { id: req.params.id },
    include: { character: true }
  });
  res.json(item);
});

adminRouter.post('/inventory-items', async (req, res) => {
  const item = await prisma.inventoryItem.create({ data: req.body });
  res.json(item);
});

adminRouter.put('/inventory-items/:id', async (req, res) => {
  const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: req.body });
  res.json(item);
});

adminRouter.delete('/inventory-items/:id', async (req, res) => {
  await prisma.inventoryItem.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export { adminRouter };
