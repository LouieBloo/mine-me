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

export interface InventoryEntry {
  item: GameItem;
  quantity: number;
}

export interface PlayerInventory {
  slots: number;
  items: InventoryEntry[];
}

export interface PlayerState {
  id: string; // character id
  familyName: string;
  characterName: string;
  characterClass: CharacterClass;
  profession?: Profession;
  sol: number;
  lear: number;
  cityId: string;
  attributes: PlayerAttributes;
  inventory: PlayerInventory;
  city?: GameCity; // populated by socket push
  gear: {
    head?: GearItem;
    shoulders?: GearItem;
    chest?: GearItem;
    gauntlets?: GearItem;
    leggings?: GearItem;
    boots?: GearItem;
    weapon?: WeaponItem;
  }
}

export type ItemRarity = 'LOW' | 'MEDIUM' | 'RARE' | 'VERY_RARE';

export type ItemType = 'GEAR' | 'MATERIAL' | 'POTION';

export type GearSubType = 'HEAD' | 'SHOULDERS' | 'CHEST' | 'GAUNTLETS' | 'LEGGINGS' | 'BOOTS' | 'WEAPON';
export type MaterialSubType = 'LUMBER' | 'MINERAL' | 'AGRICULTURE' | 'HERB';
export type PotionSubType = 'HEALTH' | 'STAMINA';

export type ItemSubType = GearSubType | MaterialSubType | PotionSubType;

export const ITEM_TYPES: ItemType[] = ['GEAR', 'MATERIAL', 'POTION'];

export const ITEM_SUBTYPES: Record<ItemType, string[]> = {
  GEAR: ['HEAD', 'SHOULDERS', 'CHEST', 'GAUNTLETS', 'LEGGINGS', 'BOOTS', 'WEAPON'],
  MATERIAL: ['LUMBER', 'MINERAL', 'AGRICULTURE', 'HERB'],
  POTION: ['HEALTH', 'STAMINA'],
};

export const ITEM_RARITIES: ItemRarity[] = ['LOW', 'MEDIUM', 'RARE', 'VERY_RARE'];

export interface GameItem {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  subType: ItemSubType;
  priceSol: number;
  rarity?: ItemRarity;
  iconUrl?: string | null;
  gearImageUrl?: string | null;
  isStartingPiece?: boolean;
}

export interface PotionItem extends GameItem {
  type: 'POTION';
  subType: PotionSubType;
  effectType: 'Health' | 'Stamina' | 'Attack' | 'Defense';
  duration: 'Instant' | 'Round' | 'Lasting';
  power: number;
}

export interface GearItem extends GameItem {
  type: 'GEAR';
  subType: GearSubType;
  defenseBonus: number;
}

export interface WeaponItem extends GearItem {
  subType: 'WEAPON';
  damage: number;
}

export interface MobAtlas {
  url: string;
  atlasUrl: string;
}

export interface DropTableItem {
  id?: string;
  itemId: string;
  chance: number; // 0 to 100
  minQuantity: number;
  maxQuantity: number;
  item?: GameItem; // populated sometimes by backend
}

export interface DropTable {
  id?: string;
  solMin: number;
  solMax: number;
  items: DropTableItem[];
}

export interface DungeonLevelMob {
  id?: string;
  mobId: string;
  mob?: Mob;
  dropTable?: DropTable;
}

export interface CityDungeon {
  id: string;
  cityId: string;
  dungeonId: string;
  dungeon?: {
    id: string;
    name: string;
    description: string;
    minLevel: number;
  };
}

export interface CityMaterial {
  id: string;
  cityId: string;
  itemId: string;
  item?: GameItem;
  
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GameCity {
  id: string;
  name: string;
  description: string;
  backgroundImageUrl?: string | null;
  cityDungeons?: CityDungeon[];
  cityMaterials?: CityMaterial[];
  
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Mob {
  id: string;
  name: string;
  level: number;
  health: number;
  attack: number;
  defense: number;
  dropTable?: DropTable;
  animations?: MobAtlas;
}


export * from './combat';
export * from './professions';
export * from './trade';
