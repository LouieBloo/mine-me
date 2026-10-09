/**
 * One-off, idempotent data migration for the tool/weapon stat split (ticket 012).
 *
 *  1. Creates the Tool Damage, Pick Power and Knockback effects if they don't exist.
 *  2. Gives every mining tool the Tool Damage it effectively had before the split: an item that has
 *     both a Mining Speed and a Damage effect (and no Tool Damage yet) gets Tool Damage = its Damage value.
 *
 * It touches nothing else (unlike `prisma db seed`, which re-writes every item from the JSON files).
 *
 *   npx tsx prisma/migrate-combat-stats.ts           # dry run: prints what it would do
 *   npx tsx prisma/migrate-combat-stats.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

export const NEW_EFFECTS = [
  { id: 'eff_tool_damage', name: 'Tool Damage', description: 'Damage dealt to blocks per swing', flag: 'toolDamageModifier' },
  { id: 'eff_pick_power', name: 'Pick Power', description: 'The hardest block this tool can break', flag: 'pickPowerModifier' },
  { id: 'eff_knockback', name: 'Knockback', description: 'Melee knockback in tenths of tiles/s (45 = 4.5)', flag: 'knockbackModifier' },
] as const;

interface EffectRow { id: string; name: string; miningSpeedModifier: boolean; damageModifier: boolean; toolDamageModifier: boolean }
interface ItemRow { id: string; name: string; itemEffects: { effectId: string; value: number }[] }

export type PlannedOp =
  | { kind: 'create-effect'; id: string; name: string }
  | { kind: 'add-tool-damage'; itemId: string; itemName: string; effectId: string; value: number };

/** Pure planner: decides what to change from the current effects and items. */
export function planCombatStatMigration(effects: EffectRow[], items: ItemRow[]): PlannedOp[] {
  const ops: PlannedOp[] = [];
  const existingNames = new Set(effects.map((e) => e.name));
  for (const e of NEW_EFFECTS) {
    if (!existingNames.has(e.name)) ops.push({ kind: 'create-effect', id: e.id, name: e.name });
  }

  const byId = new Map(effects.map((e) => [e.id, e]));
  const toolDamageEffectId =
    effects.find((e) => e.toolDamageModifier)?.id ?? NEW_EFFECTS.find((e) => e.flag === 'toolDamageModifier')!.id;

  for (const item of items) {
    const kinds = item.itemEffects.map((ie) => ({ ie, effect: byId.get(ie.effectId) }));
    const speed = kinds.some(({ effect }) => effect?.miningSpeedModifier);
    const damage = kinds.filter(({ effect }) => effect?.damageModifier).reduce((sum, { ie }) => sum + (ie.value || 0), 0);
    const hasToolDamage = kinds.some(({ effect }) => effect?.toolDamageModifier);
    if (speed && damage > 0 && !hasToolDamage) {
      ops.push({ kind: 'add-tool-damage', itemId: item.id, itemName: item.name, effectId: toolDamageEffectId, value: damage });
    }
  }
  return ops;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const effects = await prisma.effect.findMany();
    const items = await prisma.item.findMany({ include: { itemEffects: true } });
    const ops = planCombatStatMigration(effects as any, items as any);

    if (ops.length === 0) {
      console.log('Nothing to do: the database is already migrated.');
      return;
    }
    for (const op of ops) {
      console.log(
        op.kind === 'create-effect'
          ? `${apply ? 'creating' : 'would create'} effect "${op.name}"`
          : `${apply ? 'adding' : 'would add'} Tool Damage ${op.value} to "${op.itemName}"`
      );
    }
    if (!apply) {
      console.log('\nDry run only. Re-run with --apply to make these changes.');
      return;
    }

    for (const op of ops) {
      if (op.kind === 'create-effect') {
        const def = NEW_EFFECTS.find((e) => e.name === op.name)!;
        await prisma.effect.upsert({
          where: { name: def.name },
          update: {},
          create: { id: def.id, name: def.name, description: def.description, [def.flag]: true } as any,
        });
      }
    }
    for (const op of ops) {
      if (op.kind === 'add-tool-damage') {
        await prisma.objectEffects.upsert({
          where: { itemId_effectId: { itemId: op.itemId, effectId: op.effectId } },
          update: { value: op.value },
          create: { itemId: op.itemId, effectId: op.effectId, value: op.value },
        });
      }
    }
    console.log('\nDone.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
