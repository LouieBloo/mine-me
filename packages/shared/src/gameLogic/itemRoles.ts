import type { GameItem } from '../types';

/**
 * What an item *does* in the mine, decided from the item table's own category data (type, subType,
 * flags) and never from names or ids. Any number of items can share a role - several kinds of
 * torch, different dynamite - and a new one only needs the right category in the admin app.
 */
export type ItemRole = 'TORCH' | 'LADDER' | 'THROWABLE' | 'CURRENCY' | 'RANGED_WEAPON';

type ItemCategory = Pick<GameItem, 'type' | 'subType' | 'throwable' | 'shootsProjectiles'> | null | undefined;

const sub = (item: ItemCategory) => (typeof item?.subType === 'string' ? item.subType.toUpperCase() : '');

/** A placeable torch (subType TORCH). */
export const isTorchItem = (item: ItemCategory): boolean => sub(item) === 'TORCH';

/** A placeable ladder (subType LADDER). */
export const isLadderItem = (item: ItemCategory): boolean => sub(item) === 'LADDER';

/** Can be thrown: flagged `throwable`, or dynamite. */
export const isThrowableItem = (item: ItemCategory): boolean => item?.throwable === true || sub(item) === 'DYNAMITE';

/** A currency item (wallet money rather than an inventory slot). */
export const isCurrencyItem = (item: ItemCategory): boolean => item?.type === 'CURRENCY';

/** A gun: fires projectiles. */
export const isRangedWeaponItem = (item: ItemCategory): boolean => item?.shootsProjectiles === true;

/** All roles an item has. */
export function getItemRoles(item: ItemCategory): ItemRole[] {
  const roles: ItemRole[] = [];
  if (isTorchItem(item)) roles.push('TORCH');
  if (isLadderItem(item)) roles.push('LADDER');
  if (isThrowableItem(item)) roles.push('THROWABLE');
  if (isCurrencyItem(item)) roles.push('CURRENCY');
  if (isRangedWeaponItem(item)) roles.push('RANGED_WEAPON');
  return roles;
}

/** The currency subType used for Sol (the realm's main money). */
export const SOL_CURRENCY_SUBTYPE = 'SOL';

/** The first currency item with the given subType (e.g. the Sol item), if the item table has one. */
export function findCurrencyItem<T extends ItemCategory>(items: readonly T[], currencySubType: string): T | undefined {
  const wanted = currencySubType.toUpperCase();
  return items.find((item) => isCurrencyItem(item) && sub(item) === wanted);
}

/**
 * The same roles as database filters (Prisma `where` fragments for `item`), so queries and the
 * helpers above can never disagree. Plain objects: this package does not depend on Prisma.
 */
export const ITEM_ROLE_WHERE = {
  torch: { subType: { equals: 'TORCH', mode: 'insensitive' } },
  ladder: { subType: { equals: 'LADDER', mode: 'insensitive' } },
  throwable: {
    OR: [{ throwable: true }, { subType: { equals: 'DYNAMITE', mode: 'insensitive' } }],
  },
} as const;
