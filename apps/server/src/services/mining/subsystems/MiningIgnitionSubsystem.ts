import type { DamageEvent, Flammability } from '@mine-me/shared';
import { isInBounds } from '../../miningMap.service';
import { getIgnitionStrength, ignitionChance } from '../ignition';
import type { MiningWorld } from '../MiningWorld';

/** A cell that caught alight this tick, with the material that burns there. */
export interface IgnitedCell {
  x: number;
  y: number;
  flammability: Flammability;
}

/** Radius (tiles) of the sparks from a tool or bullet hitting something: the cell hit and the ones touching it. */
const HIT_IGNITION_RADIUS = 1.01;

/**
 * Where fire starts. Anything that emits sparks (an item with the Ignites effect striking, shooting or
 * exploding) reports it here; each flammable cell in reach rolls its own chance, and the cells that catch
 * are queued for the fire simulation to pick up. Which things emit sparks is data (the Ignites effect), and
 * which materials burn is data (their Flammability), so nothing here names an item or a material.
 */
export class MiningIgnitionSubsystem {
  private readonly ignited = new Map<number, IgnitedCell>();

  /** `random` gives a number in [0, 1); injected so tests (and a seeded room) control the dice. */
  constructor(
    private readonly world: MiningWorld,
    private readonly random: () => number = Math.random
  ) {}

  /** What burns in a cell: the fluid in it if there is some, otherwise the block there (if it can burn). */
  public flammabilityAt(x: number, y: number): Flammability | null {
    if (!isInBounds(x, y)) return null;
    const fluids = this.world.fluids;
    if (fluids.grid.getLevel(x, y) > 0) {
      const key = fluids.registry.keyOf(fluids.grid.getFluidId(x, y));
      return (key && this.world.data.getFluid(key)?.flammability) || null;
    }
    const tile = this.world.grid[y]?.[x];
    return (tile && this.world.data.getBlockConfig(tile.type)?.flammability) || null;
  }

  /**
   * Sparks at (x, y), reaching `radius` tiles, with `strength` (see `getIgnitionStrength`). Every flammable
   * cell whose centre is in reach rolls once. Returns how many caught.
   */
  public emit(x: number, y: number, radius: number, strength: number): number {
    if (!(strength > 0) || !(radius >= 0)) return 0;
    let caught = 0;
    const reach = Math.ceil(radius);
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let ty = cy - reach; ty <= cy + reach; ty++) {
      for (let tx = cx - reach; tx <= cx + reach; tx++) {
        if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > radius) continue;
        const flammability = this.flammabilityAt(tx, ty);
        if (!flammability) continue;
        const key = ty * this.world.grid[0].length + tx;
        if (this.ignited.has(key)) continue;
        if (this.random() < ignitionChance(flammability, strength)) {
          this.ignited.set(key, { x: tx, y: ty, flammability });
          caught++;
        }
      }
    }
    return caught;
  }

  /** A hit made by an item: sparks at the point hit if the item ignites. */
  public fromHit(event: Pick<DamageEvent, 'source'>, x: number, y: number): number {
    const itemId = event.source.itemId;
    if (!itemId) return 0;
    const strength = getIgnitionStrength(this.world.data.getItemData(itemId));
    return strength > 0 ? this.emit(x, y, HIT_IGNITION_RADIUS, strength) : 0;
  }

  /** An explosion of an item: sparks across the whole blast if the item ignites. */
  public fromExplosion(itemId: string | undefined, x: number, y: number, radius: number): number {
    if (!itemId) return 0;
    const strength = getIgnitionStrength(this.world.data.getItemData(itemId));
    return strength > 0 ? this.emit(x, y, radius, strength) : 0;
  }

  /** The cells that caught since the last call, then forgets them. The fire simulation (ticket 057) takes these. */
  public takeIgnited(): IgnitedCell[] {
    const out = [...this.ignited.values()];
    this.ignited.clear();
    return out;
  }

  /** Cells waiting to be taken. */
  public get pendingCount(): number {
    return this.ignited.size;
  }
}
