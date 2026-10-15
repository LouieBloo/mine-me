/**
 * Maps typeKeys to the small numbers a grid cell stores (1..255; 0 is "empty") and back. Ids are handed
 * out in typeKey order, so the same set of definitions always gets the same numbers, whatever order the
 * database returns them in. Fluids and gases each extend this with their own parameter shape.
 */
export class CellIdRegistry<P extends { typeKey: string }> {
  private readonly byId: P[] = [];
  private readonly idByKey = new Map<string, number>();

  /** `noun` names what is registered (plural), for the error when there are too many. */
  constructor(definitions: readonly P[], noun: string) {
    const sorted = [...definitions].sort((a, b) => (a.typeKey < b.typeKey ? -1 : a.typeKey > b.typeKey ? 1 : 0));
    for (const def of sorted) {
      if (this.idByKey.has(def.typeKey)) continue;
      if (this.byId.length >= 255) throw new Error(`A grid cell can hold at most 255 different ${noun}`);
      this.byId.push(def);
      this.idByKey.set(def.typeKey, this.byId.length);
    }
  }

  /** Cell id for a typeKey, or undefined if there is no such definition. */
  public idOf(typeKey: string): number | undefined {
    return this.idByKey.get(typeKey);
  }

  /** The definition a cell id stands for (undefined for 0 or an unknown id). */
  public paramsOf(id: number): P | undefined {
    return this.byId[id - 1];
  }

  /** typeKey for a cell id. */
  public keyOf(id: number): string | undefined {
    return this.byId[id - 1]?.typeKey;
  }

  public get size(): number {
    return this.byId.length;
  }
}
