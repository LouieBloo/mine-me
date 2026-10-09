import { prisma } from '../index';
import { CharacterService } from './character.service';
import { LootResult } from './loot.service';
import { CharacterModEngine } from '@mine-me/shared';

/** Prisma client or interactive-transaction client; both expose the models we write to. */
type DbClient = Pick<typeof prisma, 'character' | 'inventoryItem'>;

export class InventoryService {
  /**
   * Awards an item to a character, persists it to the database,
   * and awards experience associated with the item to the character.
   * Returns the quantity given, experience points granted, and any level-up loot.
   */
  public static async giveItemToCharacter(
    characterId: string,
    itemId: string,
    quantity: number
  ): Promise<{ quantity: number; experienceGranted: number; itemDetails: any; levelUpLoot?: LootResult }> {
    const item = await prisma.item.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    const experienceGranted = (item.experience || 0) * quantity;

    // 1. Award to Character (Wallet balance for CURRENCY, inventory slot for others)
    await InventoryService.applyItemGrant(prisma, characterId, item, quantity);

    let levelUpLoot: LootResult | undefined = undefined;

    // 2. Give Experience to Character
    if (experienceGranted > 0) {
      const result = await CharacterService.addExperience(characterId, experienceGranted);
      levelUpLoot = result.levelUpLoot;
    }

    return {
      quantity,
      experienceGranted,
      itemDetails: item,
      levelUpLoot
    };
  }

  /**
   * Writes a single item grant (wallet increment for CURRENCY, inventory row otherwise)
   * using the supplied client, so callers can run it inside a transaction.
   */
  private static async applyItemGrant(
    client: DbClient,
    characterId: string,
    item: { id: string; type: unknown; subType?: string | null; name?: string | null },
    quantity: number
  ): Promise<void> {
    if ((item.type as string) === 'CURRENCY') {
      const isLear = item.subType?.toUpperCase() === 'LEAR' || item.name?.toUpperCase() === 'LEAR';
      await client.character.update({
        where: { id: characterId },
        data: isLear
          ? { lear: { increment: quantity } }
          : { sol: { increment: quantity } },
      });
      return;
    }

    const existing = await client.inventoryItem.findFirst({
      where: { characterId, itemId: item.id },
    });

    if (existing) {
      await client.inventoryItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity } },
      });
    } else {
      await client.inventoryItem.create({
        data: { characterId, itemId: item.id, quantity },
      });
    }
  }

  /**
   * Awards several items atomically: every inventory/wallet write happens in one
   * transaction (all or nothing). Items are matched by database ID only; unknown IDs and
   * non-positive / non-integer quantities are skipped and reported. Experience is granted
   * after the transaction commits.
   */
  public static async giveItemsToCharacter(
    characterId: string,
    grants: { itemId: string; quantity: number }[]
  ): Promise<{
    granted: { itemId: string; quantity: number }[];
    skipped: { itemId: string; quantity: number; reason: string }[];
    experienceGranted: number;
    levelUpLoot?: LootResult;
  }> {
    const skipped: { itemId: string; quantity: number; reason: string }[] = [];
    const merged = new Map<string, number>();
    for (const g of grants) {
      if (!Number.isInteger(g.quantity) || g.quantity <= 0) {
        skipped.push({ itemId: g.itemId, quantity: g.quantity, reason: 'invalid quantity' });
        continue;
      }
      merged.set(g.itemId, (merged.get(g.itemId) ?? 0) + g.quantity);
    }

    const { granted, experienceGranted } = await prisma.$transaction(async (tx) => {
      const granted: { itemId: string; quantity: number }[] = [];
      let xp = 0;
      for (const [itemId, quantity] of merged) {
        const item = await tx.item.findUnique({ where: { id: itemId } });
        if (!item) {
          skipped.push({ itemId, quantity, reason: 'item not found' });
          continue;
        }
        await InventoryService.applyItemGrant(tx, characterId, item, quantity);
        xp += (item.experience || 0) * quantity;
        granted.push({ itemId, quantity });
      }
      return { granted, experienceGranted: xp };
    });

    let levelUpLoot: LootResult | undefined;
    if (experienceGranted > 0) {
      const result = await CharacterService.addExperience(characterId, experienceGranted);
      levelUpLoot = result.levelUpLoot;
    }

    return { granted, skipped, experienceGranted, levelUpLoot };
  }

  /**
   * Translates a database Item to a shared GameItem.
   */
  public static mapItem(item: any) {
    if (!item) return undefined;
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      type: item.type as any,
      subType: item.subType as any,
      priceSol: item.vendorSellPrice,
      rarity: item.rarity as any,
      iconUrl: item.iconUrl,
      gearImageUrl: item.gearImageUrl,
      inGameSpriteUrl: item.inGameSpriteUrl,
      soundEffectUrl: item.soundEffectUrl,
      soundEffects: item.soundEffects ?? null,
      isStartingPiece: item.isStartingPiece,
      experience: item.experience,
      triggerMode: item.triggerMode,
      combatScore: item.combatScore,
      defenseScore: item.defenseScore,
      canBeDamaged: item.canBeDamaged,
      canBeClimbed: item.canBeClimbed,
      throwable: item.throwable,
      particleEffectId: item.particleEffectId,
      particleEffect: item.particleEffect,
      physicsConfig: item.physicsConfig,
      lightConfig: item.lightConfig,
      shootsProjectiles: item.shootsProjectiles,
      projectileConfig: item.projectileConfig,
      itemKey: item.itemKey,
      inGameScale: typeof item.inGameScale === 'number' ? item.inGameScale : 1.0,
      holdOffsetX: typeof item.holdOffsetX === 'number' ? item.holdOffsetX : 0,
      holdOffsetY: typeof item.holdOffsetY === 'number' ? item.holdOffsetY : 0,
      holdRotation: typeof item.holdRotation === 'number' ? item.holdRotation : 0,
      muzzleOffsetX: typeof item.muzzleOffsetX === 'number' ? item.muzzleOffsetX : 0,
      muzzleOffsetY: typeof item.muzzleOffsetY === 'number' ? item.muzzleOffsetY : 0,
      itemEffects: (item.itemEffects || []).map((ie: any) => ({
        id: ie.id,
        itemId: ie.itemId,
        effectId: ie.effectId,
        value: ie.value,
        effect: ie.effect ? {
          id: ie.effect.id,
          name: ie.effect.name,
          description: ie.effect.description,
          healthGain: ie.effect.healthGain,
          staminaGain: ie.effect.staminaGain,
          miningSpeedModifier: ie.effect.miningSpeedModifier,
          damageModifier: ie.effect.damageModifier,
          toolDamageModifier: ie.effect.toolDamageModifier,
          pickPowerModifier: ie.effect.pickPowerModifier,
          knockbackModifier: ie.effect.knockbackModifier,
          explodes: ie.effect.explodes,
        } : undefined
      })),
    };
  }

  /**
   * Translates a database InventoryItem to a shared InventoryEntry.
   */
  public static mapInventoryEntry(inv: any) {
    if (!inv) return undefined;
    return {
      id: inv.id,
      item: InventoryService.mapItem(inv.item) as any,
      quantity: inv.quantity,
      equipped: inv.equipped,
    };
  }

  /**
   * Translates character inventory to shared format.
   */
  public static mapCharacterInventory(character: { maxInventorySlots: number; inventory: any[] }) {
    return {
      slots: character.maxInventorySlots,
      items: character.inventory.map(inv => InventoryService.mapInventoryEntry(inv) as any),
    };
  }

  /**
   * Translates character equipped inventory items to gear subtype mappings.
   */
  public static mapCharacterGear(inventory: any[]) {
    const getEquippedItem = (subType: string) => {
      const inv = inventory.find(i => i.equipped && i.item.type === 'GEAR' && i.item.subType === subType);
      return inv ? InventoryService.mapItem(inv.item) : undefined;
    };

    return {
      head: getEquippedItem('HEAD') as any,
      shoulders: getEquippedItem('SHOULDERS') as any,
      chest: getEquippedItem('CHEST') as any,
      gauntlets: getEquippedItem('GAUNTLETS') as any,
      leggings: getEquippedItem('LEGGINGS') as any,
      boots: getEquippedItem('BOOTS') as any,
      weapon: getEquippedItem('WEAPON') as any,
    };
  }

  /**
   * Calculates the current effective mining attributes (speed and damage) of a character in real-time.
   */
  public static async getCharacterMiningStats(characterId: string): Promise<{ miningSpeed: number; toolDamage: number; weaponDamage: number; pickPower: number; knockback: number }> {
    const inventory = await prisma.inventoryItem.findMany({
      where: {
        characterId,
        equipped: true,
        item: { type: 'GEAR' }
      },
      include: {
        item: {
          include: {
            itemEffects: {
              include: {
                effect: true
              }
            }
          }
        }
      }
    });

    const mappedEntries = inventory.map(inv => InventoryService.mapInventoryEntry(inv)!);
    const mods = CharacterModEngine.getModifications(mappedEntries);
    return {
      miningSpeed: mods.miningSpeed,
      toolDamage: mods.toolDamage || 25,
      weaponDamage: mods.weaponDamage,
      pickPower: mods.pickPower,
      knockback: mods.knockback,
    };
  }

  /**
   * Calculates the current effective mining speed of a character from database in real-time.
   */
  public static async getCharacterMiningSpeed(characterId: string): Promise<number> {
    const stats = await InventoryService.getCharacterMiningStats(characterId);
    return stats.miningSpeed;
  }

  /**
   * Calculates the current effective damage per swing to blocks (tool damage) of a character in real-time.
   */
  public static async getCharacterToolDamage(characterId: string): Promise<number> {
    const stats = await InventoryService.getCharacterMiningStats(characterId);
    return stats.toolDamage;
  }
}
