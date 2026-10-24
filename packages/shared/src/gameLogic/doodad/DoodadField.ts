import { PLACED_ITEM_TILES } from '../itemRoles';
import { doodadNeedsSupport, type DoodadClientDefinition } from '../../types/doodad';
import { isTileSolid, type MiningTileType } from '../../types/mining';
import {
  decodeDoodadPlacement,
  doodadRect,
  doodadRectCells,
  doodadSupportCells,
  type DoodadPlacementWire,
  type DoodadRect,
  type DoodadRemovalWire,
} from './doodadPlacement';

/** One doodad the client knows about: where it stands and what it is (the renderer of ticket 102 draws these). */
export interface DoodadEntry {
  /** Index into the definitions sent with the map. */
  typeIndex: number;
  definition: DoodadClientDefinition;
  /** Top-left cell of the footprint; unique among entries. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Which size choice it took. */
  variant: number;
  /** WALL only: the wall is on the right, so the picture is mirrored. */
  flip: boolean;
}

/** Cells along one side of a bucket of the lookup that finds the doodads in a rectangle. */
const BUCKET_CELLS = 16;

/** A number that names a cell (maps are far narrower than 65536 cells). */
const cellKey = (x: number, y: number): number => x * 65536 + y;

/**
 * The client's copy of the doodads in the part of the mine it has seen (tickets 101, 105). The server sends the kinds once
 * (with the map), then placements as the fog is revealed, and removals when an anchor goes; this keeps them, answers "which
 * doodads are in this rectangle" for the renderer, and applies the same removal rules the server does to every tile change
 * it is told about, so a doodad goes the moment its block does even before the server's delta is read.
 *
 * Pure data: nothing here draws.
 */
export class DoodadField {
  public readonly definitions: readonly DoodadClientDefinition[];
  private readonly byOrigin = new Map<number, DoodadEntry>();
  private readonly byFootprintCell = new Map<number, DoodadEntry>();
  private readonly bySupportCell = new Map<number, DoodadEntry[]>();
  private readonly buckets = new Map<number, Set<DoodadEntry>>();
  private changes = 0;

  constructor(definitions: readonly DoodadClientDefinition[] = [], placements: readonly DoodadPlacementWire[] = []) {
    this.definitions = definitions;
    this.apply(placements, []);
  }

  public get size(): number {
    return this.byOrigin.size;
  }

  /** Goes up by one every time a doodad is added or removed, so a renderer can tell cheaply whether anything changed. */
  public get version(): number {
    return this.changes;
  }

  /** Every doodad, in no particular order. */
  public all(): DoodadEntry[] {
    return [...this.byOrigin.values()];
  }

  /** The doodad that starts at a cell, if any. */
  public at(x: number, y: number): DoodadEntry | undefined {
    return this.byOrigin.get(cellKey(x, y));
  }

  /** The doodad that covers a cell, if any. */
  public covering(x: number, y: number): DoodadEntry | undefined {
    return this.byFootprintCell.get(cellKey(x, y));
  }

  /** The doodads whose footprint touches a rectangle of cells (inclusive), without repeats. For culling to the camera. */
  public inRect(x0: number, y0: number, x1: number, y1: number): DoodadEntry[] {
    const found = new Set<DoodadEntry>();
    for (let by = Math.floor(y0 / BUCKET_CELLS); by <= Math.floor(y1 / BUCKET_CELLS); by++) {
      for (let bx = Math.floor(x0 / BUCKET_CELLS); bx <= Math.floor(x1 / BUCKET_CELLS); bx++) {
        for (const entry of this.buckets.get(cellKey(bx, by)) ?? []) {
          if (entry.x <= x1 && entry.x + entry.width - 1 >= x0 && entry.y <= y1 && entry.y + entry.height - 1 >= y0) found.add(entry);
        }
      }
    }
    return [...found];
  }

  /**
   * Applies one tick's doodad changes: the additions first, then the removals (a doodad added and removed in the same tick
   * ends up gone). Returns what actually changed, so a renderer can create and retire sprites.
   * A placement of an unknown kind, or on top of one already here, is ignored.
   */
  public apply(added: readonly DoodadPlacementWire[], removed: readonly DoodadRemovalWire[]): { added: DoodadEntry[]; removed: DoodadEntry[] } {
    const result = { added: [] as DoodadEntry[], removed: [] as DoodadEntry[] };
    for (const wire of added) {
      const placement = decodeDoodadPlacement(wire);
      const definition = this.definitions[placement.typeIndex];
      if (!definition) continue;
      const rect = doodadRect(definition, placement);
      const cells = doodadRectCells(rect);
      // Sent again (a client that joined mid-tick): the same doodad, nothing to do
      if (this.byOrigin.has(cellKey(placement.x, placement.y))) continue;
      if (cells.some((c) => this.byFootprintCell.has(cellKey(c.x, c.y)))) continue;
      const entry: DoodadEntry = { typeIndex: placement.typeIndex, definition, x: rect.x, y: rect.y, width: rect.width, height: rect.height, variant: placement.variant, flip: placement.flip };
      this.index(entry, rect, cells);
      this.changes++;
      result.added.push(entry);
    }
    for (const [x, y] of removed) {
      const entry = this.byOrigin.get(cellKey(x, y));
      if (entry) {
        this.drop(entry);
        this.changes++;
        result.removed.push(entry);
      }
    }
    return result;
  }

  /**
   * A tile became `type`: removes the doodads that lose their hold (a cell they hang from or stand on stops being solid) or are
   * crushed (something solid arrives in their footprint). The same rules as the server's, so the two agree. Returns what went.
   * A ladder, torch or bridge never removes one: those are drawn in front of the scenery.
   */
  public onTileChanged(x: number, y: number, type: MiningTileType): DoodadEntry[] {
    const key = cellKey(x, y);
    const gone: DoodadEntry[] = [];
    if (!isTileSolid(type)) {
      for (const entry of [...(this.bySupportCell.get(key) ?? [])]) gone.push(entry);
    } else if (!PLACED_ITEM_TILES.some((p) => p.tileType === type)) {
      const crushed = this.byFootprintCell.get(key);
      if (crushed) gone.push(crushed);
    }
    for (const entry of gone) this.drop(entry);
    this.changes += gone.length;
    return gone;
  }

  private index(entry: DoodadEntry, rect: DoodadRect, cells: { x: number; y: number }[]): void {
    this.byOrigin.set(cellKey(entry.x, entry.y), entry);
    for (const c of cells) this.byFootprintCell.set(cellKey(c.x, c.y), entry);
    if (doodadNeedsSupport(entry.definition.anchor)) {
      for (const c of doodadSupportCells(entry.definition.anchor, rect, entry.flip)) {
        const list = this.bySupportCell.get(cellKey(c.x, c.y));
        if (list) list.push(entry);
        else this.bySupportCell.set(cellKey(c.x, c.y), [entry]);
      }
    }
    for (const bucket of this.bucketsOf(entry)) {
      const set = this.buckets.get(bucket);
      if (set) set.add(entry);
      else this.buckets.set(bucket, new Set([entry]));
    }
  }

  private drop(entry: DoodadEntry): void {
    const rect: DoodadRect = { x: entry.x, y: entry.y, width: entry.width, height: entry.height };
    this.byOrigin.delete(cellKey(entry.x, entry.y));
    for (const c of doodadRectCells(rect)) this.byFootprintCell.delete(cellKey(c.x, c.y));
    if (doodadNeedsSupport(entry.definition.anchor)) {
      for (const c of doodadSupportCells(entry.definition.anchor, rect, entry.flip)) {
        const list = this.bySupportCell.get(cellKey(c.x, c.y));
        if (!list) continue;
        const rest = list.filter((e) => e !== entry);
        if (rest.length > 0) this.bySupportCell.set(cellKey(c.x, c.y), rest);
        else this.bySupportCell.delete(cellKey(c.x, c.y));
      }
    }
    for (const bucket of this.bucketsOf(entry)) {
      const set = this.buckets.get(bucket);
      set?.delete(entry);
      if (set && set.size === 0) this.buckets.delete(bucket);
    }
  }

  private bucketsOf(entry: DoodadEntry): number[] {
    const keys: number[] = [];
    for (let by = Math.floor(entry.y / BUCKET_CELLS); by <= Math.floor((entry.y + entry.height - 1) / BUCKET_CELLS); by++) {
      for (let bx = Math.floor(entry.x / BUCKET_CELLS); bx <= Math.floor((entry.x + entry.width - 1) / BUCKET_CELLS); bx++) keys.push(cellKey(bx, by));
    }
    return keys;
  }
}
