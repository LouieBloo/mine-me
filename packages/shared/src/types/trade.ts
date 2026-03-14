export interface MarketplaceListing {
  itemId: string;
  fixedPriceSol: number;
  availableQuantity: number;
}

export interface TradeSession {
  playerId: string;
  npcId?: string;
  type: 'NPC_Buy' | 'NPC_Sell' | 'Marketplace_Buy' | 'Marketplace_Sell';
  items: {
    itemId: string;
    quantity: number;
    unitPrice: number;
  }[];
  totalPrice: number;
}

export interface MarketplaceState {
  listings: MarketplaceListing[];
}
