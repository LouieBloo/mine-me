import {
  PLACED_ITEM_TILES,
  doodadCellKey,
  doodadNeedsSupport,
  doodadRect,
  doodadRectCells,
  doodadSupportCells,
  encodeDoodadPlacement,
  isTileSolid,
  orderDoodads,
  toClientDoodad,
  type DoodadClientDefinition,
  type DoodadDefinition,
  type DoodadPlacement,
  type DoodadPlacementWire,
  type DoodadRemovalWire,
  type MiningTileType,
} from '@mine-me/shared';
import type { MiningWorld } from '../MiningWorld';

/** One doodad standing in the room, with the cells it depends on worked out once. */
interface PlacedDoodad {
  placement: DoodadPlacement;
  /** Every cell of its footprint (a solid block arriving in one of them removes it). */
  footprint: number[];
  /** The cells it hangs from or stands on (losing one of them removes it). Empty for a free-floating doodad. */
  support: number[];
  /** Whether clients have been told about it. Doodads in unrevealed ground are never sent. */
  sent: boolean;
}

/**
 * The scenery in a room (tickets 100, 101, 105): which doodads stand where, which clients have been told about, and which
 * ones go when the block they hang from is mined, blown up or burnt away.
 *
 * Doodads are background only. Nothing here touches the grid; the room tells this subsystem when a tile changes
 * (`onTileChanged`, called from `pushTileUpdate`, the one place every change to a tile passes through) or is revealed.
 */
export class MiningDoodadSubsystem {
  /** The doodads the room knows, in the order placements index them (see `orderDoodads`). */
  public readonly definitions: readonly DoodadDefinition[];
  private readonly width: number;
  /** Standing doodads by the cell they start at (top-left of the footprint); unique since doodads never overlap. */
  private readonly byOrigin = new Map<number, PlacedDoodad>();
  /** Standing doodads by every cell of their footprint. */
  private readonly byFootprintCell = new Map<number, PlacedDoodad>();
  /** Standing doodads by each cell that holds them up. */
  private readonly bySupportCell = new Map<number, PlacedDoodad[]>();
  private pendingAdded: DoodadPlacementWire[] = [];
  private pendingRemoved: DoodadRemovalWire[] = [];

  constructor(private readonly world: MiningWorld, definitions: readonly DoodadDefinition[], placements: readonly DoodadPlacement[] = []) {
    this.definitions = orderDoodads(definitions);
    this.width = world.grid[0]?.length ?? 0;
    for (const placement of placements) this.index(placement);
  }

  /** How many doodads stand in the room (for the performance report). */
  public get count(): number {
    return this.byOrigin.size;
  }

  /** Every standing doodad, row by row. */
  public placements(): DoodadPlacement[] {
    return [...this.byOrigin.values()].map((d) => d.placement).sort((a, b) => a.y - b.y || a.x - b.x);
  }

  /** What the client needs to draw each doodad kind, sent once with the map. Undefined when the room has no doodad kinds. */
  public clientDefinitions(): DoodadClientDefinition[] | undefined {
    return this.definitions.length > 0 ? this.definitions.map((d, i) => toClientDoodad(d, i)) : undefined;
  }

  /** The doodads in the part of the mine already revealed, for a client that is just joining. Undefined when there are none. */
  public visibleSnapshot(): DoodadPlacementWire[] | undefined {
    const out: PlacedDoodad[] = [];
    for (const doodad of this.byOrigin.values()) {
      if (!doodad.sent && this.isRevealed(doodad)) doodad.sent = true;
      if (doodad.sent) out.push(doodad);
    }
    // Row by row, so the list does not depend on the order doodads were added in
    out.sort((a, b) => a.placement.y - b.placement.y || a.placement.x - b.placement.x);
    return out.length > 0 ? out.map((d) => encodeDoodadPlacement(d.placement)) : undefined;
  }

  /** Puts a doodad in the room now (the sandbox tool, ticket 107). False if it does not fit the room or overlaps another. */
  public add(placement: DoodadPlacement): boolean {
    const def = this.definitions[placement.typeIndex];
    if (!def) return false;
    const cells = doodadRectCells(doodadRect(def, placement));
    if (cells.some((c) => this.byFootprintCell.has(doodadCellKey(c.x, c.y, this.width)))) return false;
    const entry = this.index(placement);
    if (this.isRevealed(entry)) {
      entry.sent = true;
      this.pendingAdded.push(encodeDoodadPlacement(placement));
    }
    return true;
  }

  /** The doodad whose footprint covers a cell, if any (the sandbox remove tool clicks anywhere on it). */
  public placementCovering(x: number, y: number): DoodadPlacement | undefined {
    return this.byFootprintCell.get(doodadCellKey(x, y, this.width))?.placement;
  }

  /** Takes away the doodad that starts at a cell (the sandbox tool). Tells clients if they knew of it. False if none starts there. */
  public removeAt(x: number, y: number): boolean {
    const entry = this.byOrigin.get(doodadCellKey(x, y, this.width));
    if (!entry) return false;
    this.drop(entry);
    return true;
  }

  /** A tile in the room was revealed: the doodads standing in it come into view. */
  public onTileRevealed(x: number, y: number): void {
    const entry = this.byFootprintCell.get(doodadCellKey(x, y, this.width));
    if (!entry || entry.sent) return;
    entry.sent = true;
    this.pendingAdded.push(encodeDoodadPlacement(entry.placement));
  }

  /**
   * A tile changed to `type`. Doodads lose their hold when a cell they hang from, or stand on, stops being solid (mined, blown
   * up, burnt into something open); and are crushed when something solid arrives in their footprint (a falling rock, lava turning
   * to rock). A tile an item places (ladder, torch, bridge) never removes one: those are drawn in front of the scenery.
   */
  public onTileChanged(x: number, y: number, type: MiningTileType): void {
    const key = doodadCellKey(x, y, this.width);
    if (!isTileSolid(type)) {
      for (const entry of [...(this.bySupportCell.get(key) ?? [])]) this.drop(entry);
      return;
    }
    if (PLACED_ITEM_TILES.some((p) => p.tileType === type)) return;
    const crushed = this.byFootprintCell.get(key);
    if (crushed) this.drop(crushed);
  }

  /** What changed since the last call, to send to every client in the room. A client applies the additions first, then the removals. */
  public takeChanges(): { added: DoodadPlacementWire[]; removed: DoodadRemovalWire[] } {
    const changes = { added: this.pendingAdded, removed: this.pendingRemoved };
    this.pendingAdded = [];
    this.pendingRemoved = [];
    return changes;
  }

  private index(placement: DoodadPlacement): PlacedDoodad {
    const def = this.definitions[placement.typeIndex];
    const rect = doodadRect(def, placement);
    const footprint = doodadRectCells(rect).map((c) => doodadCellKey(c.x, c.y, this.width));
    const support = doodadNeedsSupport(def.anchor) ? doodadSupportCells(def.anchor, rect, placement.flip).map((c) => doodadCellKey(c.x, c.y, this.width)) : [];
    const entry: PlacedDoodad = { placement, footprint, support, sent: false };
    this.byOrigin.set(doodadCellKey(placement.x, placement.y, this.width), entry);
    for (const key of footprint) this.byFootprintCell.set(key, entry);
    for (const key of support) {
      const list = this.bySupportCell.get(key);
      if (list) list.push(entry);
      else this.bySupportCell.set(key, [entry]);
    }
    return entry;
  }

  private drop(entry: PlacedDoodad): void {
    this.byOrigin.delete(doodadCellKey(entry.placement.x, entry.placement.y, this.width));
    for (const key of entry.footprint) this.byFootprintCell.delete(key);
    for (const key of entry.support) {
      const list = this.bySupportCell.get(key);
      if (!list) continue;
      const rest = list.filter((e) => e !== entry);
      if (rest.length > 0) this.bySupportCell.set(key, rest);
      else this.bySupportCell.delete(key);
    }
    // Only a doodad clients were told about needs telling that it is gone
    if (entry.sent) this.pendingRemoved.push([entry.placement.x, entry.placement.y]);
    else this.pendingAdded = this.pendingAdded.filter((w) => !(w[1] === entry.placement.x && w[2] === entry.placement.y));
  }

  private isRevealed(entry: PlacedDoodad): boolean {
    return entry.footprint.some((key) => this.world.grid[Math.floor(key / this.width)][key % this.width].revealed);
  }
}
