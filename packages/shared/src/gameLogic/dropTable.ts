/** A drop table as stored for mobs and mining blocks (items, plus an optional Sol range). */
export interface DropTableData {
  items?: { itemId: string; chance: number; minQuantity: number; maxQuantity: number }[] | null;
  solMin?: number | null;
  solMax?: number | null;
}

export interface RolledDrop {
  itemId: string;
  quantity: number;
}

export interface RollDropTableOptions {
  /** Random source returning [0, 1). Defaults to Math.random; inject one for deterministic tests. */
  rng?: () => number;
  /**
   * Item id the table's Sol range pays out as (look it up in the item table, e.g. with
   * `findCurrencyItem`). Mob tables pay out Sol; block tables currently do not (their Sol range is
   * ignored), so pass this only when currency should be rolled. Without it no currency drops.
   */
  currencyItemId?: string;
}

/**
 * Rolls a drop table once.
 *  - Each item entry drops when `rng() * 100 < chance` (so 0% never drops and 100% always does),
 *    in a quantity between its min and max.
 *  - With a `currencyItemId`, a Sol range adds one more entry.
 * Entries that roll a non-positive quantity are skipped.
 */
export function rollDropTable(
  table: DropTableData | null | undefined,
  { rng = Math.random, currencyItemId }: RollDropTableOptions = {}
): RolledDrop[] {
  const drops: RolledDrop[] = [];
  if (!table) return drops;

  if (Array.isArray(table.items)) {
    for (const entry of table.items) {
      if (rng() * 100 < entry.chance) {
        const quantity = Math.floor(rng() * (entry.maxQuantity - entry.minQuantity + 1)) + entry.minQuantity;
        if (quantity > 0) drops.push({ itemId: entry.itemId, quantity });
      }
    }
  }

  const solMin = table.solMin ?? 0;
  const solMax = table.solMax ?? 0;
  if (currencyItemId && (solMin > 0 || solMax > 0)) {
    const max = solMax || solMin;
    const quantity = Math.floor(rng() * (max - solMin + 1)) + solMin;
    if (quantity > 0) drops.push({ itemId: currencyItemId, quantity });
  }

  return drops;
}
