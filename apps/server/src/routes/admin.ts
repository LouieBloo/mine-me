import express from 'express';
import { prisma } from '../index';
import fs from 'fs';
import path from 'path';

const adminRouter = express.Router();
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

export { adminRouter };
