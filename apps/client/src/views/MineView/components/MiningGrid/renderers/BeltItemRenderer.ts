import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { MiningBeltClientState, MiningBeltItem } from '@mine-me/shared';
import { TILE_SIZE } from './MiningTileRenderer';

/** How big an item looks on the belt, in cells. */
export const BELT_ITEM_CELLS = 1.1;

export type ItemTextureLoader = (url: string) => Promise<Texture | null>;
const defaultLoadTexture: ItemTextureLoader = (url) => Assets.load<Texture>(url).catch(() => null);

interface RidingItem {
  item: MiningBeltItem;
  /** Distance from the top of the belt when the client heard of it, and the client time (seconds) that was. */
  startPos: number;
  startedAt: number;
  view: Container;
}

/** Where an item is on the belt now: it started at `startPos` and rides up at `speed` cells per second. */
export function beltItemPosition(startPos: number, speed: number, secondsRiding: number): number {
  return startPos - speed * Math.max(0, secondsRiding);
}

/**
 * Draws the items riding the conveyor belt: one sprite per item (its inventory icon, or a dot until it loads), moving up
 * at the belt's speed from where the server said it started. Only the start is sent, never a position per tick, so
 * this works out the rest; an item is removed when the server says it arrived or was lost (and never drawn above the
 * extractor if that message is late). Textures are shared between items of one kind.
 */
export class BeltItemRenderer {
  public readonly root = new Container();
  private readonly riding = new Map<string, RidingItem>();
  private readonly textures = new Map<string, Texture | null>();
  private readonly pending = new Set<string>();
  private now = 0;
  private destroyed = false;
  private readonly belt: Pick<MiningBeltClientState, 'shaftX' | 'shaftWidth' | 'startRow' | 'beltSpeed'>;
  private readonly loadTexture: ItemTextureLoader;

  constructor(container: Container, belt: Pick<MiningBeltClientState, 'shaftX' | 'shaftWidth' | 'startRow' | 'beltSpeed'>, loadTexture: ItemTextureLoader = defaultLoadTexture) {
    this.belt = belt;
    this.loadTexture = loadTexture;
    container.addChild(this.root);
  }

  public get count(): number {
    return this.riding.size;
  }

  /** Items that went onto the belt (also used for the ones already on it when the client joined). */
  public add(items: readonly MiningBeltItem[]): void {
    for (const item of items) {
      if (this.riding.has(item.id)) continue;
      const view = new Container();
      this.root.addChild(view);
      this.riding.set(item.id, { item, startPos: item.pos, startedAt: this.now, view });
      this.showIcon(item, view);
      this.place(this.riding.get(item.id)!);
    }
  }

  /** The world position, in cells, of a spot `pos` cells down the belt (for sounds). */
  public cellPosition(pos: number): { x: number; y: number } {
    return { x: this.belt.shaftX + this.belt.shaftWidth / 2, y: this.belt.startRow + pos };
  }

  /** Items that reached the extractor or were lost. */
  public remove(ids: readonly string[]): void {
    for (const id of ids) {
      const entry = this.riding.get(id);
      if (!entry) continue;
      entry.view.destroy({ children: true });
      this.riding.delete(id);
    }
  }

  /** Where an item is on the belt right now (cells from the top), or undefined if it is not riding. */
  public positionOf(id: string): number | undefined {
    const entry = this.riding.get(id);
    return entry ? beltItemPosition(entry.startPos, this.belt.beltSpeed, this.now - entry.startedAt) : undefined;
  }

  /** Moves every item on by `deltaSeconds`. */
  public update(deltaSeconds: number): void {
    if (this.destroyed) return;
    this.now += Math.max(0, deltaSeconds);
    for (const entry of this.riding.values()) this.place(entry);
  }

  public destroy(): void {
    this.destroyed = true;
    this.riding.clear();
    this.root.destroy({ children: true });
  }

  private place(entry: RidingItem): void {
    const pos = Math.max(0, beltItemPosition(entry.startPos, this.belt.beltSpeed, this.now - entry.startedAt));
    entry.view.position.set((this.belt.shaftX + this.belt.shaftWidth / 2) * TILE_SIZE, (this.belt.startRow + pos) * TILE_SIZE);
    // At the top it has gone into the extractor
    entry.view.visible = pos > 0;
  }

  private showIcon(item: MiningBeltItem, view: Container): void {
    const dot = new Graphics().circle(0, 0, TILE_SIZE * 0.3).fill(0xfbbf24);
    view.addChild(dot);
    const url = item.iconUrl;
    if (!url) return;
    const apply = (texture: Texture | null) => {
      if (!texture || view.destroyed || this.destroyed) return;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      const size = BELT_ITEM_CELLS * TILE_SIZE;
      sprite.scale.set(size / Math.max(texture.width, texture.height, 1));
      view.removeChildren().forEach((child) => child.destroy());
      view.addChild(sprite);
    };
    if (this.textures.has(url)) {
      apply(this.textures.get(url) ?? null);
      return;
    }
    if (this.pending.has(url)) {
      // another item of this kind is already loading it: try again shortly after it lands
      void this.loadTexture(url).then(apply);
      return;
    }
    this.pending.add(url);
    void this.loadTexture(url).then((texture) => {
      this.textures.set(url, texture);
      this.pending.delete(url);
      apply(texture);
    });
  }
}
