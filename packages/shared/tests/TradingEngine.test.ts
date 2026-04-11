import { describe, it, expect } from 'vitest';
import { TradingEngine } from '../src/gameLogic/TradingEngine';
import { PlayerState, GameItem, TradeSession } from '../src/types';

describe('TradingEngine', () => {
  const mockItem: GameItem = {
    id: 'iron_ore',
    name: 'Iron Ore',
    description: 'Raw iron',
    type: 'MATERIAL',
    subType: 'MINERAL',
    priceSol: 10
  };

  const mockPlayer: PlayerState = {
    id: 'p1',
    familyName: 'Test',
    characterName: 'Trader',
    characterClass: 'Mage',
    sol: 100,
    lear: 0,
    cityId: 'city_1',
    attributes: { level: 1, combatScore: 0, defenseScore: 0, stamina: 100, maxStamina: 100, ageInDays: 7300 },
    inventory: { slots: 25, items: [{ item: { ...mockItem }, quantity: 1 }] },
    gear: {}
  };

  it('should calculate NPC buy price higher than marketplace', () => {
    const npcPrice = TradingEngine.getNPCBuyPrice(mockItem);
    const mktPrice = TradingEngine.getMarketplacePrice(mockItem);
    
    expect(npcPrice).toBe(12); // 1.2 * 10
    expect(mktPrice).toBe(8);   // 0.8 * 10
    expect(npcPrice).toBeGreaterThan(mktPrice);
  });

  it('should validate valid NPC buy trade (player selling)', () => {
    const session: TradeSession = {
      playerId: 'p1',
      type: 'NPC_Buy',
      items: [{ itemId: 'iron_ore', quantity: 1, unitPrice: 12 }],
      totalPrice: 12
    };
    const result = TradingEngine.validateTrade(mockPlayer, session);
    expect(result.success).toBe(true);
  });

  it('should reject trade if player lacks item', () => {
    const session: TradeSession = {
      playerId: 'p1',
      type: 'NPC_Buy',
      items: [{ itemId: 'diamond', quantity: 1, unitPrice: 100 }],
      totalPrice: 100
    };
    const result = TradingEngine.validateTrade(mockPlayer, session);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Missing item');
  });

  it('should reject trade if player lacks funds (buying)', () => {
    const session: TradeSession = {
      playerId: 'p1',
      type: 'Marketplace_Buy',
      items: [{ itemId: 'rare_item', quantity: 1, unitPrice: 500 }],
      totalPrice: 500
    };
    const result = TradingEngine.validateTrade(mockPlayer, session);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Insufficient Sol');
  });
});
