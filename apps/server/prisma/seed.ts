import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Path to shared data
  const dataPath = path.join(__dirname, '../../../packages/shared/src/data');

  // Seed Cities
  const cities = JSON.parse(fs.readFileSync(path.join(dataPath, 'cities.json'), 'utf-8'));
  for (const city of cities) {
    await prisma.city.upsert({
      where: { id: city.id },
      update: city,
      create: city,
    });
  }
  console.log('Cities seeded.');

  // Seed Items
  const items = JSON.parse(fs.readFileSync(path.join(dataPath, 'items.json'), 'utf-8'));
  for (const item of items) {
    await prisma.item.upsert({
      where: { id: item.id },
      update: item,
      create: item,
    });
  }
  console.log('Items seeded.');

  // Seed Mobs
  const mobs = JSON.parse(fs.readFileSync(path.join(dataPath, 'mobs.json'), 'utf-8'));
  for (const mob of mobs) {
    await prisma.mob.upsert({
      where: { id: mob.id },
      update: mob,
      create: mob,
    });
  }
  console.log('Mobs seeded.');

  // Seed Dungeons
  const dungeons = JSON.parse(fs.readFileSync(path.join(dataPath, 'dungeons.json'), 'utf-8'));
  for (const dungeon of dungeons) {
    await prisma.dungeon.upsert({
      where: { id: dungeon.id },
      update: dungeon,
      create: dungeon,
    });
  }
  console.log('Dungeons seeded.');

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
