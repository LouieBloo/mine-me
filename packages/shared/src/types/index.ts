export type CharacterClass = 'Warrior' | 'Mage' | 'Rogue';
export type Profession = 'Mining' | 'Herbalism' | 'Farming' | 'Lumberjack' | 'Chemistry' | 'Blacksmithing';

export interface PlayerAttributes {
  level: number;
  combatScore: number;
  defenseScore: number;
  stamina: number;
  maxStamina: number;
  ageInDays: number; // minimum unit of time
}

export interface PlayerInventory {
  slots: number;
  items: GameItem[];
}

export interface PlayerState {
  id: string; // phone number based identifier hash
  familyName: string;
  characterName: string;
  characterClass: CharacterClass;
  profession?: Profession;
  sol: number;
  lear: number;
  attributes: PlayerAttributes;
  inventory: PlayerInventory;
  gear: {
    head?: GearItem;
    chest?: GearItem;
    leggings?: GearItem;
    boots?: GearItem;
    weapon?: WeaponItem;
  }
}

export type ItemRarity = 'Low' | 'Medium' | 'Rare' | 'Very Rare';

export interface GameItem {
  id: string;
  name: string;
  description: string;
  type: 'Material' | 'Potion' | 'Gear' | 'Weapon';
  priceSol: number;
  rarity?: ItemRarity;
}

export interface PotionItem extends GameItem {
  type: 'Potion';
  effectType: 'Health' | 'Stamina' | 'Attack' | 'Defense';
  duration: 'Instant' | 'Round' | 'Lasting';
  power: number; // The percentage boost or raw heal amount
}

export interface GearItem extends GameItem {
  type: 'Gear';
  slot: 'Head' | 'Chest' | 'Leggings' | 'Boots';
  defenseBonus: number;
}

export interface WeaponItem extends GameItem {
  type: 'Weapon';
  damage: number;
}

export * from './combat';
export * from './professions';
export * from './trade';
