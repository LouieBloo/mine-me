import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Path to shared data
  const dataPath = path.join(__dirname, '../../../packages/shared/src/data');

  // Seed Items
  const items = JSON.parse(fs.readFileSync(path.join(dataPath, 'items.json'), 'utf-8'));
  for (const itemData of items) {
    const { dropTableItems, cityMaterials, inventoryItems, ...itemRoot } = itemData;
    await prisma.item.upsert({
      where: { id: itemRoot.id },
      update: itemRoot,
      create: itemRoot,
    });
  }
  console.log('Items seeded.');

  // Seed Cities
  const cities = JSON.parse(fs.readFileSync(path.join(dataPath, 'cities.json'), 'utf-8'));
  for (const cityData of cities) {
    const { cityDungeons, cityMaterials, characters, ...cityRoot } = cityData;
    await prisma.city.upsert({
      where: { id: cityRoot.id },
      update: cityRoot,
      create: cityRoot,
    });

    if (cityMaterials && cityMaterials.length > 0) {
      for (const cm of cityMaterials) {
        await prisma.cityMaterial.upsert({
          where: {
            cityId_itemId: {
              cityId: cm.cityId,
              itemId: cm.itemId
            }
          },
          update: {
            cityId: cm.cityId,
            itemId: cm.itemId,
          },
          create: {
            id: cm.id,
            cityId: cm.cityId,
            itemId: cm.itemId,
          }
        });
      }
    }
  }
  console.log('Cities and materials seeded.');

  // Seed Mobs
  const mobs = JSON.parse(fs.readFileSync(path.join(dataPath, 'mobs.json'), 'utf-8'));
  for (const mobData of mobs) {
    const { dropTable, dungeonLevelMobs, ...mobRoot } = mobData;
    await prisma.mob.upsert({
      where: { id: mobRoot.id },
      update: mobRoot,
      create: mobRoot,
    });
  }
  console.log('Mobs seeded.');

  // Seed Dungeons
  const dungeons = JSON.parse(fs.readFileSync(path.join(dataPath, 'dungeons.json'), 'utf-8'));
  for (const dungeonData of dungeons) {
    const { levels, cityDungeons, completionDropTable, ...dungeonRoot } = dungeonData;
    await prisma.dungeon.upsert({
      where: { id: dungeonRoot.id },
      update: dungeonRoot,
      create: dungeonRoot,
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
