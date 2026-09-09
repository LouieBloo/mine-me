import { describe, it, expect } from 'vitest';
import { CharacterModEngine } from '../src/gameLogic/CharacterModEngine';
import type { GameItem } from '../src/types';

describe('CharacterModEngine', () => {
  describe('getModifications', () => {
    it('returns zero scores when no items are equipped', () => {
      const items = [
        {
          item: {
            id: 'item1',
            name: 'Iron Helmet',
            type: 'GEAR',
            subType: 'HEAD',
            combatScore: 5,
            defenseScore: 10,
          } as GameItem,
          equipped: false,
        },
      ];

      const mods = CharacterModEngine.getModifications(items);
      expect(mods.combatScore).toBe(0);
      expect(mods.defenseScore).toBe(0);
      expect(mods.miningSpeed).toBe(0);
    });

    it('returns accumulated scores and mining speed from equipped gear with object effects', () => {
      const items = [
        {
          item: {
            id: 'item1',
            name: 'Iron Mining Helmet',
            type: 'GEAR',
            subType: 'HEAD',
            combatScore: 2,
            defenseScore: 5,
            itemEffects: [
              {
                id: 'objEff1',
                effectId: 'eff1',
                value: 25,
                effect: {
                  id: 'eff1',
                  name: 'Mining Speed',
                  description: 'Increases mining speed',
                  healthGain: false,
                  staminaGain: false,
                  miningSpeedModifier: true,
                  createdAt: '',
                  updatedAt: '',
                },
                createdAt: '',
                updatedAt: '',
              },
            ],
          } as GameItem,
          equipped: true,
        },
        {
          item: {
            id: 'item2',
            name: 'Bronze Pickaxe',
            type: 'GEAR',
            subType: 'WEAPON',
            combatScore: 10,
            defenseScore: 0,
            itemEffects: [
              {
                id: 'objEff2',
                effectId: 'eff1',
                value: 100,
                effect: {
                  id: 'eff1',
                  name: 'Mining Speed',
                  description: 'Increases mining speed',
                  healthGain: false,
                  staminaGain: false,
                  miningSpeedModifier: true,
                  createdAt: '',
                  updatedAt: '',
                },
                createdAt: '',
                updatedAt: '',
              },
            ],
          } as GameItem,
          equipped: true,
        },
        {
          item: {
            id: 'item3',
            name: 'Copper Ore',
            type: 'MATERIAL',
            subType: 'MINERAL',
            combatScore: 100, // should be ignored since type is MATERIAL
            defenseScore: 100,
            itemEffects: [
              {
                id: 'objEff3',
                effectId: 'eff1',
                value: 50,
                effect: {
                  id: 'eff1',
                  name: 'Mining Speed',
                  description: 'Increases mining speed',
                  healthGain: false,
                  staminaGain: false,
                  miningSpeedModifier: true,
                  createdAt: '',
                  updatedAt: '',
                },
                createdAt: '',
                updatedAt: '',
              },
            ],
          } as GameItem,
          equipped: true,
        },
      ];

      const mods = CharacterModEngine.getModifications(items);
      expect(mods.combatScore).toBe(12);
      expect(mods.defenseScore).toBe(5);
      expect(mods.miningSpeed).toBe(125);
    });
  });

  describe('calculateTotalAttributes', () => {
    it('correctly aggregates base attributes with modifications', () => {
      const base = {
        combatScore: 15,
        defenseScore: 12,
        health: 100,
        maxHealth: 100,
        stamina: 80,
        maxStamina: 100,
      };

      const mods = {
        combatScore: 10,
        defenseScore: 5,
        miningSpeed: 100,
      };

      const total = CharacterModEngine.calculateTotalAttributes(base, mods);
      expect(total.combatScore).toBe(25);
      expect(total.defenseScore).toBe(17);
      expect(total.miningSpeed).toBe(100);
      expect(total.health).toBe(100);
      expect(total.stamina).toBe(80);
    });
  });
});
