import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function seedDropTable(dropTableData: any, relations: { mobId?: string | null; characterLevelId?: string | null }) {
  if (!dropTableData) return;
  const { items, ...dropTableRoot } = dropTableData;

  // Clean relation keys to match Prisma schema constraints
  const cleanRelations: any = {};
  if (relations.mobId) cleanRelations.mobId = relations.mobId;
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

  // 1. Seed Effects
  const effectsPath = path.join(dataPath, 'effects.json');
  if (fs.existsSync(effectsPath)) {
    const effects = JSON.parse(fs.readFileSync(effectsPath, 'utf-8'));
    for (const eff of effects) {
      const { objectEffects, ...effRoot } = eff;
      await prisma.effect.upsert({
        where: { id: effRoot.id },
        update: {
          name: effRoot.name,
          description: effRoot.description,
          healthGain: effRoot.healthGain ?? false,
          staminaGain: effRoot.staminaGain ?? false,
          miningSpeedModifier: effRoot.miningSpeedModifier ?? false,
          damageModifier: effRoot.damageModifier ?? false,
          explodes: effRoot.explodes ?? false,
        },
        create: {
          id: effRoot.id,
          name: effRoot.name,
          description: effRoot.description,
          healthGain: effRoot.healthGain ?? false,
          staminaGain: effRoot.staminaGain ?? false,
          miningSpeedModifier: effRoot.miningSpeedModifier ?? false,
          damageModifier: effRoot.damageModifier ?? false,
          explodes: effRoot.explodes ?? false,
        },
      });
    }
    console.log('✅ Effects seeded.');
  }

  // 1.5. Seed Particle Effects
  const particleEffectsPath = path.join(dataPath, 'particle_effects.json');
  if (fs.existsSync(particleEffectsPath)) {
    const particleEffects = JSON.parse(fs.readFileSync(particleEffectsPath, 'utf-8'));
    for (const pe of particleEffects) {
      await prisma.particleEffect.upsert({
        where: { id: pe.id },
        update: {
          name: pe.name,
          description: pe.description,
          type: pe.type,
          config: pe.config
        },
        create: {
          id: pe.id,
          name: pe.name,
          description: pe.description,
          type: pe.type,
          config: pe.config
        },
      });
    }
    console.log('✅ Particle effects seeded.');
  }

  // 2. Seed Items
  const items = JSON.parse(fs.readFileSync(path.join(dataPath, 'items.json'), 'utf-8'));
  for (const itemData of items) {
    const { dropTableItems, cityMaterials, inventoryItems, itemEffects, particleEffect, ...itemRoot } = itemData;
    await prisma.item.upsert({
      where: { id: itemRoot.id },
      update: itemRoot,
      create: itemRoot,
    });

    if (itemEffects && itemEffects.length > 0) {
      await prisma.objectEffects.deleteMany({
        where: { itemId: itemRoot.id }
      });
      for (const ie of itemEffects) {
        await prisma.objectEffects.create({
          data: {
            itemId: itemRoot.id,
            effectId: ie.effectId,
            value: ie.value
          }
        });
      }
    }
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
    const {
      dropTable,
      dungeonLevelMobs,
      sounds,
      maxHealth,
      spriteUrl,
      colliderWidth,
      colliderHeight,
      showHealthBar,
      ...mobRoot
    } = mobData;
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

  // 4. Seed Cities and Materials
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
  console.log('✅ Cities and materials seeded.');

  // 5. Seed Mining Blocks
  const blocksPath = path.join(dataPath, 'blocks.json');
  if (fs.existsSync(blocksPath)) {
    const blocks = JSON.parse(fs.readFileSync(blocksPath, 'utf-8'));
    for (const blockData of blocks) {
      await prisma.miningBlock.upsert({
        where: { typeKey: blockData.typeKey },
        update: {
          name: blockData.name,
          description: blockData.description,
          textureUrl: blockData.textureUrl,
          health: (blockData.health ?? 100) as any,
          staminaCost: blockData.staminaCost,
          idleParticleEffectId: blockData.idleParticleEffectId || null,
        },
        create: {
          id: blockData.id,
          typeKey: blockData.typeKey,
          name: blockData.name,
          description: blockData.description,
          textureUrl: blockData.textureUrl,
          health: (blockData.health ?? 100) as any,
          staminaCost: blockData.staminaCost,
          idleParticleEffectId: blockData.idleParticleEffectId || null,
        },
      });
    }
    console.log('✅ Mining blocks seeded.');
  }

  // 6. Seed Sounds
  const soundsPath = path.join(dataPath, 'sounds.json');
  if (fs.existsSync(soundsPath)) {
    const sounds = JSON.parse(fs.readFileSync(soundsPath, 'utf-8'));
    for (const soundData of sounds) {
      await prisma.sound.upsert({
        where: { id: soundData.id },
        update: soundData,
        create: soundData,
      });
    }
    console.log('✅ Sounds seeded.');
  }

  // 7. Seed Mining Map Config
  const mapConfigPath = path.join(dataPath, 'mining_map_config.json');
  if (fs.existsSync(mapConfigPath)) {
    const mapConfig = JSON.parse(fs.readFileSync(mapConfigPath, 'utf-8'));
    const existingActive = await prisma.miningMapConfig.findFirst({
      where: { isActive: true },
    });
    if (existingActive) {
      await prisma.miningMapConfig.update({
        where: { id: existingActive.id },
        data: mapConfig,
      });
    } else {
      await prisma.miningMapConfig.create({
        data: mapConfig,
      });
    }
    console.log('✅ Mining map config seeded.');
  }

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
