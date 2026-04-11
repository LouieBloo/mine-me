import type { 
  PlayerState,
  ResourceNode, 
  ToolItem, 
  GameItem,
  Recipe
} from '../types';

export interface GatheringResult {
  success: boolean;
  itemsGained: { itemId: string; quantity: number }[];
  experienceGained: number;
  staminaConsumed: number;
  toolDurabilityConsumed: number;
  message: string;
}

export interface CraftingResult {
  success: boolean;
  itemGained?: { itemId: string; quantity: number };
  experienceGained: number;
  staminaConsumed: number;
  message: string;
}

export class ProfessionEngine {
  /**
   * Processes a gathering action.
   */
  static gather(
    player: PlayerState,
    node: ResourceNode,
    tool?: ToolItem
  ): GatheringResult {
    // 1. Validate Profession
    if (player.profession !== node.type) {
      return {
        success: false,
        itemsGained: [],
        experienceGained: 0,
        staminaConsumed: 0,
        toolDurabilityConsumed: 0,
        message: `You do not have the ${node.type} profession.`
      };
    }

    // 2. Validate Stamina
    if (player.attributes.stamina < node.staminaCost) {
      return {
        success: false,
        itemsGained: [],
        experienceGained: 0,
        staminaConsumed: 0,
        toolDurabilityConsumed: 0,
        message: "You are too tired to gather resources."
      };
    }

    // 3. Validate Tool (if required)
    if (tool && (tool.durability <= 0 || tool.professionType !== node.type)) {
      return {
        success: false,
        itemsGained: [],
        experienceGained: 0,
        staminaConsumed: 0,
        toolDurabilityConsumed: 0,
        message: "Your tool is broken or incorrect for this action."
      };
    }

    // 4. Calculate Success and Drops
    const itemsGained: { itemId: string; quantity: number }[] = [];
    for (const drop of node.possibleDrops) {
      const rand = Math.random() * 100;
      if (rand <= drop.chance) {
        const quantity = Math.floor(Math.random() * (drop.quantity[1] - drop.quantity[0] + 1)) + drop.quantity[0];
        if (quantity > 0) {
          itemsGained.push({ itemId: drop.itemId, quantity });
        }
      }
    }

    // 5. Calculate XP and Stamina Cost
    const experienceGained = node.requiredProfessionLevel * 5 + 10;
    const toolDurabilityConsumed = tool ? 1 : 0;

    return {
      success: true,
      itemsGained,
      experienceGained,
      staminaConsumed: node.staminaCost,
      toolDurabilityConsumed,
      message: itemsGained.length > 0 ? "Gathering successful!" : "You gathered nothing this time."
    };
  }

  /**
   * Processes a crafting action.
   */
  static craft(
    player: PlayerState,
    recipe: Recipe
  ): CraftingResult {
    // 1. Validate Profession
    if (player.profession !== recipe.profession) {
      return {
        success: false,
        experienceGained: 0,
        staminaConsumed: 0,
        message: `You do not have the ${recipe.profession} profession.`
      };
    }

    // 2. Validate Level
    if (player.attributes.level < recipe.requiredLevel) {
      return {
        success: false,
        experienceGained: 0,
        staminaConsumed: 0,
        message: `Your level is too low to craft this (Required: ${recipe.requiredLevel}).`
      };
    }

    // 3. Validate Stamina
    if (player.attributes.stamina < recipe.staminaCost) {
      return {
        success: false,
        experienceGained: 0,
        staminaConsumed: 0,
        message: "You are too tired to craft."
      };
    }

    // 4. Validate Ingredients
    for (const ingredient of recipe.ingredients) {
      const playerItem = player.inventory.items.find(e => e.item.id === ingredient.itemId);
      // In a real implementation, we'd check total quantity across slots
      // For now, simple check
      if (!playerItem) {
         return {
          success: false,
          experienceGained: 0,
          staminaConsumed: 0,
          message: `Missing ingredient: ${ingredient.itemId}`
        };
      }
    }

    return {
      success: true,
      itemGained: { itemId: recipe.resultItemId, quantity: recipe.resultQuantity },
      experienceGained: recipe.requiredLevel * 10 + 20,
      staminaConsumed: recipe.staminaCost,
      message: "Crafting successful!"
    };
  }

  /**
   * Lumberjack specific: update forest health
   */
  static updateForestHealth(currentHealth: number, action: 'Chop' | 'Plant'): number {
    const delta = action === 'Chop' ? -5 : 5;
    return Math.min(100, Math.max(0, currentHealth + delta));
  }
}
