export type CharacterClass = 'Warrior' | 'Mage' | 'Rogue';
export type Profession = 'Mining' | 'Herbalism' | 'Farming' | 'Lumberjack' | 'Chemistry' | 'Blacksmithing';

export interface ChatMessage {
  id: string;
  sender: string;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface PlayerAttributes {
  combatScore: number;
  defenseScore: number;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  ageInDays: number; // minimum unit of time
  experience: number;
}

export interface InventoryEntry {
  id: string;
  item: GameItem;
  quantity: number;
  equipped?: boolean;
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
  status: 'ACTIVE' | 'DEAD' | 'RETIRED';
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

/**
 * Partial update payload for character stats pushed via WebSocket.
 * Only the fields that changed are included.
 * Used by: server `broadcastStatUpdate()` → client `applyStatUpdate()`
 */
export interface CharacterStatUpdate {
  sol?: number;
  lear?: number;
  cityId?: string;
  combatScore?: number;
  defenseScore?: number;
  health?: number;
  maxHealth?: number;
  stamina?: number;
  maxStamina?: number;
  ageInDays?: number;
  experience?: number;
  inventory?: PlayerInventory;
  status?: 'ACTIVE' | 'DEAD' | 'RETIRED';
  gear?: PlayerState['gear'];
}

export type ItemRarity = 'LOW' | 'MEDIUM' | 'RARE' | 'VERY_RARE';

export type ItemType = 'GEAR' | 'MATERIAL' | 'CONSUMABLE';

export type GearSubType = 'HEAD' | 'SHOULDERS' | 'CHEST' | 'GAUNTLETS' | 'LEGGINGS' | 'BOOTS' | 'WEAPON';
export type MaterialSubType = 'LUMBER' | 'MINERAL' | 'AGRICULTURE' | 'HERB';
export type ConsumableSubType = 'POTION' | 'FOOD' | 'OTHER';

export type ItemSubType = GearSubType | MaterialSubType | ConsumableSubType;

export const ITEM_TYPES: ItemType[] = ['GEAR', 'MATERIAL', 'CONSUMABLE'];

export const ITEM_SUBTYPES: Record<ItemType, string[]> = {
  GEAR: ['HEAD', 'SHOULDERS', 'CHEST', 'GAUNTLETS', 'LEGGINGS', 'BOOTS', 'WEAPON'],
  MATERIAL: ['LUMBER', 'MINERAL', 'AGRICULTURE', 'HERB'],
  CONSUMABLE: ['POTION', 'FOOD', 'OTHER'],
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
  experience?: number;
  combatScore?: number;
  defenseScore?: number;
  itemEffects?: ObjectEffects[];
}

export interface GearItem extends GameItem {
  type: 'GEAR';
  subType: GearSubType;
  defenseBonus: number;
  itemEffects?: ObjectEffects[];
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
  experience: number;
  items: DropTableItem[];
}

export interface CityMaterial {
  id: string;
  cityId: string;
  itemId: string;
  item?: GameItem;

  createdAt?: Date;
  updatedAt?: Date;
}

export type CityObjectType = 'MINE' | 'FARM' | 'MARKET' | 'TRAINING_GROUNDS';

export const CITY_OBJECT_TYPES: CityObjectType[] = ['MINE', 'FARM', 'MARKET', 'TRAINING_GROUNDS'];

export interface CityObject {
  type: CityObjectType;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  label: string;
}

export interface GameCity {
  id: string;
  name: string;
  description: string;
  worldPositionX?: number;
  worldPositionY?: number;
  backgroundImageUrl?: string | null;
  mapIconUrl?: string | null;
  objectCoordinates?: CityObject[] | null;
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


export interface CharacterLevel {
  id: string;
  level: number;
  xpRequired: number;
  dropTable?: DropTable | null;
  createdAt: string;
  updatedAt: string;
}

export interface Effect {
  id: string;
  name: string;
  description: string;
  healthGain: boolean;
  staminaGain: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ObjectEffects {
  id: string;
  itemId?: string | null;
  effectId: string;
  effect?: Effect;
  value: number;
  createdAt: string;
  updatedAt: string;
}

export * from './professions';
export * from './trade';
export * from './gameEvents';
export * from './mining';
