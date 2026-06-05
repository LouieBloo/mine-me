import { prisma } from '../index';
import { CharacterService } from './character.service';
import { LootResult } from './loot.service';

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

    // 1. Give Item to Character Inventory
    const existing = await prisma.inventoryItem.findFirst({
      where: { characterId, itemId }
    });

    if (existing) {
      await prisma.inventoryItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity } }
      });
    } else {
      await prisma.inventoryItem.create({
        data: {
          characterId,
          itemId,
          quantity
        }
      });
    }

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
      isStartingPiece: item.isStartingPiece,
      experience: item.experience,
      combatScore: item.combatScore,
      defenseScore: item.defenseScore,
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
}
