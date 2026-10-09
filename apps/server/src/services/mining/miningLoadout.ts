import { CharacterModEngine, type MiningCombatStats, type MiningGearLayer } from '@mine-me/shared';
import { InventoryService } from '../inventory.service';

export interface MiningLoadout extends MiningCombatStats {
  miningSpeed: number;
  gearLayers: MiningGearLayer[];
  /** Item id of the equipped WEAPON-slot gear, or null if none. */
  equippedWeaponId: string | null;
}

/**
 * Derives everything the mining engine needs to know about a character's equipment.
 * Used at mining_start and whenever equipment changes so the live session never goes stale.
 * `character.inventory` must include each entry's `item` with `itemEffects.effect`.
 */
export function buildMiningLoadout(character: { inventory: any[] }): MiningLoadout & {
  clientInventory: ReturnType<typeof InventoryService.mapCharacterInventory>;
} {
  const clientInventory = InventoryService.mapCharacterInventory(character as any);
  const mods = CharacterModEngine.getModifications(clientInventory.items);

  const equippedGear = character.inventory.filter((inv) => inv.equipped && inv.item.type === 'GEAR');

  const gearLayers: MiningGearLayer[] = equippedGear
    .filter((inv) => inv.item.gearImageUrl)
    .map((inv) => ({
      url: inv.item.gearImageUrl!,
      subType: inv.item.subType as any,
      shootsProjectiles: Boolean(inv.item.shootsProjectiles),
      throwable: Boolean(inv.item.throwable),
      holdOffsetX: inv.item.holdOffsetX ?? 0,
      holdOffsetY: inv.item.holdOffsetY ?? 0,
      holdRotation: inv.item.holdRotation ?? 0,
      muzzleOffsetX: inv.item.muzzleOffsetX ?? 0,
      muzzleOffsetY: inv.item.muzzleOffsetY ?? 0,
    }));

  const weapon = equippedGear.find((inv) => inv.item.subType === 'WEAPON');

  return {
    clientInventory,
    miningSpeed: mods.miningSpeed,
    toolDamage: mods.toolDamage,
    weaponDamage: mods.weaponDamage,
    pickPower: mods.pickPower,
    knockback: mods.knockback,
    gearLayers,
    equippedWeaponId: weapon?.item.id ?? null,
  };
}
