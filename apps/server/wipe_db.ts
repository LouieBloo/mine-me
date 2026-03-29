import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Wiping database...");
  await prisma.inventoryItem.deleteMany();
  await prisma.character.deleteMany();
  await prisma.dungeonLevel.deleteMany();
  await prisma.dungeon.deleteMany();
  await prisma.city.deleteMany();
  await prisma.item.deleteMany();
  await prisma.mob.deleteMany();
  console.log("Database wiped (except User table).");
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
