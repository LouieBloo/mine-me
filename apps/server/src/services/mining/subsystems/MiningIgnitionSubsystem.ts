import { MiningTileType, type DamageEvent, type Flammability } from '@mine-me/shared';
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

/** Radius (tiles) a placed torch reaches: the cell it is in and the ones touching it. */
const TORCH_IGNITION_RADIUS = 1.01;
/** Radius (tiles) around a player's centre that a carried item reaches: the cells their body is in. */
const HELD_IGNITION_RADIUS = 0.9;

/**
 * Where fire starts. Anything that emits sparks (an item with the Ignites effect striking, shooting or
 * exploding) reports it here; each flammable cell in reach rolls its own chance, and the cells that catch
 * are queued for the fire simulation to pick up. Which things emit sparks is data (the Ignites effect), and
 * which materials burn is data (their Flammability), so nothing here names an item or a material.
 */
export class MiningIgnitionSubsystem {
  private readonly ignited = new Map<number, IgnitedCell>();
  /** Placed torches: cell key to the id of the item that was placed, so its Ignites strength is read live. */
  private readonly torches = new Map<number, string>();

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

  /** A torch placed in this cell from this item. From now on it lights what it touches, by the item's Ignites effect. */
  public addTorch(x: number, y: number, itemId: string): void {
    if (isInBounds(x, y)) this.torches.set(y * this.world.grid[0].length + x, itemId);
  }

  /**
   * Sparks from things that stay lit, run on every fire step: each placed torch (its cell and the ones touching
   * it) and each living player's equipped item (the cells their body is in). Strength comes from the item's
   * Ignites effect, so a torch or a flame pick only lights what it can, and an item with no such effect lights
   * nothing. A torch that has been mined or blown away is forgotten. Returns how many cells caught.
   */
  public emitFromSources(): number {
    const width = this.world.grid[0]?.length ?? 0;
    let caught = 0;
    for (const [key, itemId] of this.torches) {
      const x = key % width;
      const y = Math.floor(key / width);
      if (this.world.grid[y]?.[x]?.type !== MiningTileType.TORCH) {
        this.torches.delete(key);
        continue;
      }
      caught += this.emit(x + 0.5, y + 0.5, TORCH_IGNITION_RADIUS, getIgnitionStrength(this.world.data.getItemData(itemId)));
    }
    for (const session of this.world.players.values()) {
      if (session.isDead || !session.equippedWeaponId) continue;
      const strength = getIgnitionStrength(this.world.data.getItemData(session.equippedWeaponId));
      if (strength > 0) caught += this.emit(session.playerBody.position.x, session.playerBody.position.y, HELD_IGNITION_RADIUS, strength);
    }
    return caught;
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
