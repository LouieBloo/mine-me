import type { Profession, GameItem } from './index';

export interface ResourceNode {
  id: string;
  name: string;
  type: Profession;
  requiredProfessionLevel: number;
  possibleDrops: {
    itemId: string;
    chance: number; // 0-100
    quantity: [number, number]; // [min, max]
  }[];
  staminaCost: number;
}

export interface ToolItem extends GameItem {
  type: 'Material'; // Reusing type or adding 'Tool'? Let's check shared types.
  durability: number;
  maxDurability: number;
  professionType: Profession;
}

export interface ProfessionState {
  profession: Profession;
  level: number;
  experience: number;
}

export interface Recipe {
  id: string;
  name: string;
  profession: Profession;
  requiredLevel: number;
  ingredients: {
    itemId: string;
    quantity: number;
  }[];
  resultItemId: string;
  resultQuantity: number;
  staminaCost: number;
}

