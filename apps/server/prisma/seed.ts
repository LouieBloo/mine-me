import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function seedDropTable(dropTableData: any, relations: { mobId?: string | null; dungeonId?: string | null; dungeonLevelId?: string | null; dungeonLevelMobId?: string | null; characterLevelId?: string | null }) {
  if (!dropTableData) return;
  const { items, ...dropTableRoot } = dropTableData;

  // Clean relation keys to match Prisma schema constraints (remove undefined/null values where not needed, ensure schema-valid properties)
  const cleanRelations: any = {};
  if (relations.mobId) cleanRelations.mobId = relations.mobId;
  if (relations.dungeonId) cleanRelations.dungeonId = relations.dungeonId;
  if (relations.dungeonLevelId) cleanRelations.dungeonLevelId = relations.dungeonLevelId;
  if (relations.dungeonLevelMobId) cleanRelations.dungeonLevelMobId = relations.dungeonLevelMobId;
  if (relations.characterLevelId) cleanRelations.characterLevelId = relations.characterLevelId;

  await prisma.dropTable.upsert({
    where: { id: dropTableRoot.id },
    update: {
      solMin: dropTableRoot.solMin,
      solMax: dropTableRoot.solMax,
      experience: dropTableRoot.experience,
      ...cleanRelations
    },
    create: {
      id: dropTableRoot.id,
      solMin: dropTableRoot.solMin,
      solMax: dropTableRoot.solMax,
      experience: dropTableRoot.experience,
      ...cleanRelations
    }
  });

  if (items && items.length > 0) {
    for (const item of items) {
      await prisma.dropTableItem.upsert({
        where: { id: item.id },
        update: {
          dropTableId: item.dropTableId,
          itemId: item.itemId,
          chance: item.chance,
          minQuantity: item.minQuantity,
          maxQuantity: item.maxQuantity
        },
        create: {
          id: item.id,
          dropTableId: item.dropTableId,
          itemId: item.itemId,
          chance: item.chance,
          minQuantity: item.minQuantity,
          maxQuantity: item.maxQuantity
        }
      });
    }
  }
}

async function main() {
  console.log('🚀 Starting robust database seed...');

  const dataPath = path.join(__dirname, '../../../packages/shared/src/data');

  // 1. Seed Items
  const items = JSON.parse(fs.readFileSync(path.join(dataPath, 'items.json'), 'utf-8'));
  for (const itemData of items) {
    const { dropTableItems, cityMaterials, inventoryItems, ...itemRoot } = itemData;
    await prisma.item.upsert({
      where: { id: itemRoot.id },
      update: itemRoot,
      create: itemRoot,
    });
  }
  console.log('✅ Items seeded.');

  // 2. Seed Character Levels
  const characterLevels = JSON.parse(fs.readFileSync(path.join(dataPath, 'character_levels.json'), 'utf-8'));
  for (const lvl of characterLevels) {
    const { dropTable, ...lvlRoot } = lvl;
    await prisma.characterLevel.upsert({
      where: { id: lvlRoot.id },
      update: {
        level: lvlRoot.level,
        xpRequired: lvlRoot.xpRequired
      },
      create: {
        id: lvlRoot.id,
        level: lvlRoot.level,
        xpRequired: lvlRoot.xpRequired
      }
    });

    if (dropTable) {
      await seedDropTable(dropTable, { characterLevelId: lvlRoot.id });
    }
  }
  console.log('✅ Character levels seeded.');

  // 3. Seed Mobs
  const mobs = JSON.parse(fs.readFileSync(path.join(dataPath, 'mobs.json'), 'utf-8'));
  for (const mobData of mobs) {
    const { dropTable, dungeonLevelMobs, ...mobRoot } = mobData;
    await prisma.mob.upsert({
      where: { id: mobRoot.id },
      update: mobRoot,
      create: mobRoot,
    });

    if (dropTable) {
      await seedDropTable(dropTable, { mobId: mobRoot.id });
    }
  }
  console.log('✅ Mobs seeded.');

  // 4. Seed Dungeons and Levels
  const dungeons = JSON.parse(fs.readFileSync(path.join(dataPath, 'dungeons.json'), 'utf-8'));
  for (const dungeonData of dungeons) {
    const { levels, cityDungeons, completionDropTable, ...dungeonRoot } = dungeonData;
    await prisma.dungeon.upsert({
      where: { id: dungeonRoot.id },
      update: dungeonRoot,
      create: dungeonRoot,
    });

    if (completionDropTable) {
      await seedDropTable(completionDropTable, { dungeonId: dungeonRoot.id });
    }

    if (levels && levels.length > 0) {
      for (const level of levels) {
        const { completionDropTable: lvlDrops, mobs: lvlMobs, battles, ...lvlRoot } = level;
        await prisma.dungeonLevel.upsert({
          where: { id: lvlRoot.id },
          update: {
            dungeonId: lvlRoot.dungeonId,
            name: lvlRoot.name,
            orderIndex: lvlRoot.orderIndex,
            staminaCost: lvlRoot.staminaCost
          },
          create: {
            id: lvlRoot.id,
            dungeonId: lvlRoot.dungeonId,
            name: lvlRoot.name,
            orderIndex: lvlRoot.orderIndex,
            staminaCost: lvlRoot.staminaCost
          }
        });

        if (lvlDrops) {
          await seedDropTable(lvlDrops, { dungeonLevelId: lvlRoot.id });
        }

        if (lvlMobs && lvlMobs.length > 0) {
          for (const levelMob of lvlMobs) {
            const { dropTable: mobLvlDrops, ...levelMobRoot } = levelMob;
            await prisma.dungeonLevelMob.upsert({
              where: { id: levelMobRoot.id },
              update: {
                dungeonLevelId: levelMobRoot.dungeonLevelId,
                mobId: levelMobRoot.mobId
              },
              create: {
                id: levelMobRoot.id,
                dungeonLevelId: levelMobRoot.dungeonLevelId,
                mobId: levelMobRoot.mobId
              }
            });

            if (mobLvlDrops) {
              await seedDropTable(mobLvlDrops, { dungeonLevelMobId: levelMobRoot.id });
            }
          }
        }
      }
    }
  }
  console.log('✅ Dungeons and levels seeded.');

  // 5. Seed Cities, Materials, and City Dungeons
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

    if (cityDungeons && cityDungeons.length > 0) {
      for (const cd of cityDungeons) {
        await prisma.cityDungeon.upsert({
          where: {
            cityId_dungeonId: {
              cityId: cd.cityId,
              dungeonId: cd.dungeonId
            }
          },
          update: {
            cityId: cd.cityId,
            dungeonId: cd.dungeonId,
            orderIndex: cd.orderIndex
          },
          create: {
            id: cd.id,
            cityId: cd.cityId,
            dungeonId: cd.dungeonId,
            orderIndex: cd.orderIndex
          }
        });
      }
    }
  }
  console.log('✅ Cities, materials, and city dungeons seeded.');

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
