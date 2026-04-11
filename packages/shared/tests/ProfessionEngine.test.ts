import { describe, it, expect } from 'vitest';
import { ProfessionEngine } from '../src/gameLogic/ProfessionEngine';
import { PlayerState, ResourceNode, ToolItem } from '../src/types';

describe('ProfessionEngine', () => {
  const mockPlayer: PlayerState = {
    id: 'player_1',
    familyName: 'Test',
    characterName: 'Gatherer',
    characterClass: 'Rogue',
    profession: 'Mining',
    sol: 0,
    lear: 0,
    cityId: 'city_1',
    attributes: {
      level: 1,
      combatScore: 5,
      defenseScore: 5,
      stamina: 100,
      maxStamina: 100,
      ageInDays: 7300
    },
    inventory: { slots: 25, items: [] },
    gear: {}
  };

  const mockNode: ResourceNode = {
    id: 'node_1',
    name: 'Copper Ore',
    type: 'Mining',
    requiredProfessionLevel: 1,
    staminaCost: 10,
    possibleDrops: [
      { itemId: 'copper_ore', chance: 100, quantity: [1, 2] }
    ]
  };

  const mockTool: ToolItem = {
    id: 'tool_1',
    name: 'Basic Pickaxe',
    description: 'A rusty pickaxe',
    type: 'MATERIAL',
    subType: 'MINERAL',
    priceSol: 5,
    durability: 10,
    maxDurability: 10,
    professionType: 'Mining'
  };

  it('should successfully gather from a matching node', () => {
    const result = ProfessionEngine.gather(mockPlayer, mockNode, mockTool);
    expect(result.success).toBe(true);
    expect(result.itemsGained.length).toBeGreaterThan(0);
    expect(result.staminaConsumed).toBe(10);
    expect(result.toolDurabilityConsumed).toBe(1);
    expect(result.experienceGained).toBeGreaterThan(0);
  });

  it('should fail if player has wrong profession', () => {
    const herbalist = { ...mockPlayer, profession: 'Herbalism' } as PlayerState;
    const result = ProfessionEngine.gather(herbalist, mockNode, mockTool);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Mining');
  });

  it('should fail if stamina is too low', () => {
    const tiredPlayer = { ...mockPlayer, attributes: { ...mockPlayer.attributes, stamina: 5 } };
    const result = ProfessionEngine.gather(tiredPlayer, mockNode, mockTool);
    expect(result.success).toBe(false);
    expect(result.message).toContain('too tired');
  });

  it('should fail if tool is broken', () => {
    const brokenTool = { ...mockTool, durability: 0 };
    const result = ProfessionEngine.gather(mockPlayer, mockNode, brokenTool);
    expect(result.success).toBe(false);
    expect(result.message).toContain('broken');
  });

  it('should successfully craft an item', () => {
    const mockRecipe = {
      id: 'r1',
      name: 'Iron Sword',
      profession: 'Blacksmithing',
      requiredLevel: 1,
      ingredients: [{ itemId: 'iron_ore', quantity: 2 }],
      resultItemId: 'iron_sword',
      resultQuantity: 1,
      staminaCost: 20
    } as any;

    const smith = { 
      ...mockPlayer, 
      profession: 'Blacksmithing',
      inventory: { slots: 25, items: [{ item: { id: 'iron_ore' }, quantity: 2 }] }
    } as any;

    const result = ProfessionEngine.craft(smith, mockRecipe);
    expect(result.success).toBe(true);
    expect(result.itemGained?.itemId).toBe('iron_sword');
  });

  it('should update forest health correctly', () => {
    expect(ProfessionEngine.updateForestHealth(50, 'Chop')).toBe(45);
    expect(ProfessionEngine.updateForestHealth(50, 'Plant')).toBe(55);
    expect(ProfessionEngine.updateForestHealth(0, 'Chop')).toBe(0);
    expect(ProfessionEngine.updateForestHealth(100, 'Plant')).toBe(100);
  });
});

