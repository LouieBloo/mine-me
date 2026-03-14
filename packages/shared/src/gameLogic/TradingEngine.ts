import type { 
  PlayerState, 
  GameItem, 
  MarketplaceListing, 
  TradeSession 
} from '../types';

export class TradingEngine {
  /**
   * Calculates the price an NPC will pay for an item.
   * PRD: "Players can choose to sell items to NPCs for more Sol than they can get through selling to a player."
   */
  static getNPCBuyPrice(item: GameItem): number {
    // Let's assume NPC pays 120% of base value or fixed premium
    return Math.floor(item.priceSol * 1.2);
  }

  /**
   * Calculates the price for the global marketplace.
   * Marketplace prices are fixed by developers.
   */
  static getMarketplacePrice(item: GameItem): number {
    // Let's assume marketplace is 80% of base value (to push Greed incentive)
    return Math.floor(item.priceSol * 0.8);
  }

  /**
   * Validates if a trade session can be completed.
   */
  static validateTrade(
    player: PlayerState,
    session: TradeSession
  ): { success: boolean; message: string } {
    // 1. Check if selling items player actually has
    if (session.type === 'NPC_Buy' || session.type === 'Marketplace_Sell') {
      for (const tradeItem of session.items) {
        const inventoryItem = player.inventory.items.find(i => i.id === tradeItem.itemId);
        // Simplified check: inventory might have multiple stacks etc, for now just presence
        if (!inventoryItem) {
          return { success: false, message: `Missing item: ${tradeItem.itemId}` };
        }
      }
    }

    // 2. Check if player has enough Sol for buying
    if (session.type === 'NPC_Sell' || session.type === 'Marketplace_Buy') {
      if (player.sol < session.totalPrice) {
        return { success: false, message: "Insufficient Sol." };
      }
    }

    return { success: true, message: "Trade valid." };
  }
}
