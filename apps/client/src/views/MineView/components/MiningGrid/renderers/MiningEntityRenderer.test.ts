import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { MiningEntityRenderer, type ActiveFallingRock } from './MiningEntityRenderer';
import type { MiningDroppedItem, MiningActiveDynamite } from '@mine-me/shared';

describe('MiningEntityRenderer', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('updates falling rocks graphics in container with fallback when texture is not provided', () => {
    const rocks: ActiveFallingRock[] = [
      { id: 'rock_1', x: 2.5, y: 3.5 },
      { id: 'rock_2', x: 4.5, y: 5.5 },
    ];
    const graphicsMap = new Map<string, Sprite | Graphics>();

    MiningEntityRenderer.updateFallingRocks(container, rocks, graphicsMap, 64);

    expect(graphicsMap.size).toBe(2);
    expect(graphicsMap.has('rock_1')).toBe(true);
    expect(graphicsMap.has('rock_2')).toBe(true);
    expect(graphicsMap.get('rock_1')).toBeInstanceOf(Graphics);
    expect(container.children.length).toBe(2);

    // Update with rock_1 removed (settled)
    MiningEntityRenderer.updateFallingRocks(container, [{ id: 'rock_2', x: 4.5, y: 6.5 }], graphicsMap, 64);
    expect(graphicsMap.size).toBe(1);
    expect(graphicsMap.has('rock_1')).toBe(false);
    expect(graphicsMap.has('rock_2')).toBe(true);
    expect(container.children.length).toBe(1);
  });

  it('renders falling rocks as Sprites when rockTexture is provided', () => {
    const rocks: ActiveFallingRock[] = [
      { id: 'rock_1', x: 2.5, y: 3.5 },
    ];
    const viewsMap = new Map<string, Sprite | Graphics>();
    const mockTexture = Texture.WHITE;

    MiningEntityRenderer.updateFallingRocks(container, rocks, viewsMap, 64, mockTexture);

    expect(viewsMap.size).toBe(1);
    const sprite = viewsMap.get('rock_1');
    expect(sprite).toBeInstanceOf(Sprite);
    expect((sprite as Sprite).texture).toBe(mockTexture);
    expect((sprite as Sprite).width).toBe(64);
    expect((sprite as Sprite).height).toBe(64);
    expect((sprite as Sprite).anchor.x).toBe(0.5);
    expect((sprite as Sprite).anchor.y).toBe(0.5);
    expect((sprite as Sprite).x).toBe(160);
    expect((sprite as Sprite).y).toBe(224);

    // Verify rotation with angle
    MiningEntityRenderer.updateFallingRocks(
      container,
      [{ id: 'rock_1', x: 2.5, y: 3.5, angle: 1.25 }],
      viewsMap,
      64,
      mockTexture
    );
    expect((sprite as Sprite).rotation).toBe(1.25);
  });

  it('updates dropped items and removes vanished items', () => {
    const droppedItems: MiningDroppedItem[] = [
      {
        id: 'drop-1',
        itemId: 'ore_iron',
        itemName: 'Iron Ore',
        iconUrl: null,
        quantity: 1,
        position: { x: 1.5, y: 2.5 },
      },
    ];
    const spritesMap = new Map<string, Sprite | Graphics>();

    MiningEntityRenderer.updateDroppedItems(container, droppedItems, spritesMap, 64);
    expect(spritesMap.has('drop-1')).toBe(true);

    // Update position on next tick as item falls
    droppedItems[0].position = { x: 1.5, y: 3.2 };
    MiningEntityRenderer.updateDroppedItems(container, droppedItems, spritesMap, 64);

    const view = spritesMap.get('drop-1')!;
    expect(view.x).toBe(1.5 * 64);
    expect(view.y).toBe(3.2 * 64);

    // After cleanup with empty dropped items
    MiningEntityRenderer.updateDroppedItems(container, [], spritesMap, 64);
    expect(spritesMap.size).toBe(0);
    expect(container.children.length).toBe(0);
  });

  it('respects inGameScale when rendering dropped items and scales sprite dimensions', () => {
    const droppedItems: MiningDroppedItem[] = [
      {
        id: 'drop-scale-default',
        itemId: 'ore_iron',
        itemName: 'Iron Ore',
        iconUrl: null,
        quantity: 1,
        position: { x: 1, y: 1 },
      },
      {
        id: 'drop-scale-large',
        itemId: 'big_boulder',
        itemName: 'Big Boulder',
        iconUrl: null,
        quantity: 1,
        position: { x: 3, y: 3 },
        inGameScale: 2.0,
      },
      {
        id: 'drop-scale-small',
        itemId: 'tiny_gem',
        itemName: 'Tiny Gem',
        iconUrl: null,
        quantity: 1,
        position: { x: 5, y: 5 },
        inGameScale: 0.5,
      },
    ];
    const spritesMap = new Map<string, Sprite | Graphics>();

    MiningEntityRenderer.updateDroppedItems(container, droppedItems, spritesMap, 64);

    expect(spritesMap.size).toBe(3);
    expect(spritesMap.get('drop-scale-default')).toBeInstanceOf(Graphics);
    expect(spritesMap.get('drop-scale-large')).toBeInstanceOf(Graphics);
    expect(spritesMap.get('drop-scale-small')).toBeInstanceOf(Graphics);

    // Also test sprite dynamic scaling update when existing view is a Sprite
    const mockSprite = new Sprite(Texture.WHITE);
    spritesMap.set('drop-scale-large', mockSprite);
    MiningEntityRenderer.updateDroppedItems(container, droppedItems, spritesMap, 64);

    // Base size is 64 * 0.5 = 32. With inGameScale 2.0, size = 64
    expect(mockSprite.width).toBe(64);
    expect(mockSprite.height).toBe(64);
  });

  describe('dropped items with a sprite that is still loading', () => {
    const item = (over: Partial<MiningDroppedItem> = {}): MiningDroppedItem => ({
      id: 'drop-img',
      itemId: 'ore_iron',
      itemName: 'Iron Ore',
      iconUrl: null,
      inGameSpriteUrl: '/assets/test-ore.png',
      quantity: 1,
      position: { x: 2, y: 2 },
      ...over,
    });
    let finishLoad: (t: Texture) => void;
    let failLoad: () => void;

    beforeEach(() => {
      vi.spyOn(Assets.cache, 'has').mockReturnValue(false);
      vi.spyOn(Assets, 'load').mockImplementation(
        () => new Promise((resolve, reject) => { finishLoad = resolve as (t: Texture) => void; failLoad = reject; }) as never
      );
    });

    it('shows exactly one sprite per item however many ticks arrive before the texture does', () => {
      const map = new Map<string, Sprite | Graphics>();
      for (let tick = 0; tick < 10; tick++) {
        MiningEntityRenderer.updateDroppedItems(container, [item({ position: { x: 2, y: 2 + tick * 0.1 } })], map, 64);
      }
      expect(container.children.length).toBe(1);
      expect(map.size).toBe(1);
      expect(Assets.load).toHaveBeenCalledTimes(1);
    });

    it('leaves nothing behind when the item is picked up before its texture arrives', async () => {
      const map = new Map<string, Sprite | Graphics>();
      MiningEntityRenderer.updateDroppedItems(container, [item()], map, 64);
      MiningEntityRenderer.updateDroppedItems(container, [], map, 64); // picked up
      finishLoad(Texture.WHITE);
      await Promise.resolve();
      expect(container.children.length).toBe(0);
      expect(map.size).toBe(0);
    });

    it('applies the texture to the tracked sprite once loaded, keeping its size', async () => {
      const map = new Map<string, Sprite | Graphics>();
      MiningEntityRenderer.updateDroppedItems(container, [item()], map, 64);
      const sprite = map.get('drop-img') as Sprite;
      finishLoad(Texture.WHITE);
      await Promise.resolve();
      expect(sprite.texture).toBe(Texture.WHITE);
      expect(sprite.width).toBe(32);
      expect(sprite.height).toBe(32);
    });

    it('falls back to an amber square if the texture fails to load', async () => {
      const map = new Map<string, Sprite | Graphics>();
      MiningEntityRenderer.updateDroppedItems(container, [item()], map, 64);
      const sprite = map.get('drop-img') as Sprite;
      failLoad();
      await new Promise((r) => setTimeout(r, 0));
      expect(sprite.tint).toBe(0xf59e0b);
      expect(container.children.length).toBe(1);
    });
  });

  describe('updateActiveDynamites', () => {
    it('renders fallback graphics for active dynamites and updates world coordinates', () => {
      const dynamites: MiningActiveDynamite[] = [
        {
          id: 'dyn-1',
          position: { x: 5.5, y: 4.5 },
          velocity: { x: 2, y: -1 },
          fuseRemainingSeconds: 3.5,
        },
      ];
      const viewsMap = new Map<string, Sprite | Graphics>();

      MiningEntityRenderer.updateActiveDynamites(container, dynamites, viewsMap, 64);

      expect(viewsMap.size).toBe(1);
      const view = viewsMap.get('dyn-1');
      expect(view).toBeInstanceOf(Graphics);
      expect(view?.x).toBe(5.5 * 64);
      expect(view?.y).toBe(4.5 * 64);
      expect(container.children.length).toBe(1);

      // Clean up when dynamite explodes and is removed
      MiningEntityRenderer.updateActiveDynamites(container, [], viewsMap, 64);
      expect(viewsMap.size).toBe(0);
      expect(container.children.length).toBe(0);
    });

    it('renders Sprite when dynamiteTexture is provided', () => {
      const dynamites: MiningActiveDynamite[] = [
        {
          id: 'dyn-2',
          position: { x: 8, y: 6 },
          velocity: { x: 0, y: 0 },
          fuseRemainingSeconds: 2.0,
        },
      ];
      const viewsMap = new Map<string, Sprite | Graphics>();
      const mockTexture = Texture.WHITE;

      MiningEntityRenderer.updateActiveDynamites(container, dynamites, viewsMap, 64, mockTexture);

      expect(viewsMap.size).toBe(1);
      const sprite = viewsMap.get('dyn-2');
      expect(sprite).toBeInstanceOf(Sprite);
      expect((sprite as Sprite).texture).toBe(mockTexture);
      expect(sprite?.x).toBe(8 * 64);
      expect(sprite?.y).toBe(6 * 64);
    });

    it('respects inGameScale when rendering active dynamites and scales dimensions', () => {
      const dynamites: MiningActiveDynamite[] = [
        {
          id: 'dyn-scaled',
          position: { x: 3, y: 3 },
          velocity: { x: 0, y: 0 },
          fuseRemainingSeconds: 2.0,
          inGameScale: 0.5,
        },
      ];
      const viewsMap = new Map<string, Sprite | Graphics>();
      const mockTexture = Texture.WHITE;

      MiningEntityRenderer.updateActiveDynamites(container, dynamites, viewsMap, 64, mockTexture);

      const sprite = viewsMap.get('dyn-scaled') as Sprite;
      expect(sprite).toBeDefined();
      // Base size: 64 * 0.5 = 32. With inGameScale 0.5, targetSize = 16
      expect(sprite.width).toBe(16);
      expect(sprite.height).toBe(16);
    });
  });

  describe('updateActiveProjectiles', () => {
    it('creates and positions Graphics fallback for flying bullets', () => {
      const projectiles = [
        {
          id: 'proj-1',
          characterId: 'char-1',
          position: { x: 10.5, y: 7.2 },
          velocity: { x: 28, y: 0 },
          angle: 0.25,
          damage: 35,
        },
      ];
      const viewsMap = new Map<string, Container>();

      MiningEntityRenderer.updateActiveProjectiles(container, projectiles, viewsMap, 64);

      expect(viewsMap.size).toBe(1);
      const view = viewsMap.get('proj-1');
      expect(view).toBeInstanceOf(Container);
      expect(view?.x).toBe(10.5 * 64);
      expect(view?.y).toBe(7.2 * 64);
      expect(view?.rotation).toBe(0.25);
      expect(container.children.length).toBe(1);

      // Clean up when bullet hits tile and is removed
      MiningEntityRenderer.updateActiveProjectiles(container, [], viewsMap, 64);
      expect(viewsMap.size).toBe(0);
      expect(container.children.length).toBe(0);
    });

    it('renders a Sprite using the texture resolved from the projectile\'s own sprite url', () => {
      const projectiles = [
        {
          id: 'proj-2',
          characterId: 'char-1',
          position: { x: 14, y: 9 },
          velocity: { x: 28, y: 2 },
          angle: 0.1,
          damage: 35,
          spriteUrl: '/ammo/arrow.png',
        },
      ];
      const viewsMap = new Map<string, Container>();
      const mockTexture = Texture.WHITE;
      const resolve = vi.fn().mockReturnValue(mockTexture);

      MiningEntityRenderer.updateActiveProjectiles(container, projectiles, viewsMap, 64, resolve);

      expect(resolve).toHaveBeenCalledWith('/ammo/arrow.png');
      expect(viewsMap.size).toBe(1);
      const view = viewsMap.get('proj-2');
      expect(view).toBeInstanceOf(Container);
      expect(view?.children.some((c) => c instanceof Sprite)).toBe(true);
      expect(view?.x).toBe(14 * 64);
      expect(view?.y).toBe(9 * 64);
      expect(view?.rotation).toBe(0.1);
    });

    it('draws the placeholder capsule (no Sprite) while the ammo sprite is still loading', () => {
      const projectiles = [{ id: 'p-loading', position: { x: 1, y: 1 }, velocity: { x: 1, y: 0 }, angle: 0, spriteUrl: '/slow.png' }];
      const viewsMap = new Map<string, Container>();
      MiningEntityRenderer.updateActiveProjectiles(container, projectiles, viewsMap, 64, () => null);
      expect(viewsMap.get('p-loading')?.children.some((c) => c instanceof Sprite)).toBe(false);
    });

    it('each projectile asks for its own sprite (different ammo, different texture)', () => {
      const resolve = vi.fn().mockReturnValue(null);
      const projectiles = [
        { id: 'a', position: { x: 1, y: 1 }, velocity: { x: 1, y: 0 }, angle: 0, spriteUrl: '/bullet.png' },
        { id: 'b', position: { x: 2, y: 1 }, velocity: { x: 1, y: 0 }, angle: 0, spriteUrl: '/arrow.png' },
      ];
      MiningEntityRenderer.updateActiveProjectiles(container, projectiles, new Map(), 64, resolve);
      expect(resolve.mock.calls.map((c) => c[0])).toEqual(['/bullet.png', '/arrow.png']);
    });

    it('updates view alpha when proj.alpha is provided during impact fadeout', () => {
      const projectiles = [
        {
          id: 'proj-fade',
          position: { x: 5, y: 5 },
          velocity: { x: 0, y: 0 },
          angle: 0,
          alpha: 0.5,
        },
      ];
      const viewsMap = new Map<string, Container>();

      MiningEntityRenderer.updateActiveProjectiles(container, projectiles, viewsMap, 64);
      const view = viewsMap.get('proj-fade');
      expect(view?.alpha).toBeCloseTo(0.5);
    });

    it('respects inGameScale when rendering flying projectiles (e.g. shrunk bullet round)', () => {
      const projectiles = [
        {
          id: 'proj-shrunk-bullet',
          position: { x: 6, y: 4 },
          velocity: { x: 28, y: 0 },
          angle: 0,
          inGameScale: 0.4,
        },
        {
          id: 'proj-default-bullet',
          position: { x: 7, y: 4 },
          velocity: { x: 28, y: 0 },
          angle: 0,
        },
      ];
      const viewsMap = new Map<string, Container>();

      MiningEntityRenderer.updateActiveProjectiles(container, projectiles, viewsMap, 64, null, 1.0);

      const shrunkView = viewsMap.get('proj-shrunk-bullet');
      expect(shrunkView).toBeDefined();
      expect(shrunkView?.scale.x).toBeCloseTo(0.4);
      expect(shrunkView?.scale.y).toBeCloseTo(0.4);

      const defaultView = viewsMap.get('proj-default-bullet');
      expect(defaultView).toBeDefined();
      expect(defaultView?.scale.x).toBeCloseTo(1.0);
      expect(defaultView?.scale.y).toBeCloseTo(1.0);
    });

    it('uses fallback defaultScale when proj.inGameScale is omitted', () => {
      const projectiles = [
        {
          id: 'proj-fallback',
          position: { x: 8, y: 4 },
          velocity: { x: 28, y: 0 },
          angle: 0,
        },
      ];
      const viewsMap = new Map<string, Container>();

      MiningEntityRenderer.updateActiveProjectiles(container, projectiles, viewsMap, 64, null, 0.4);

      const view = viewsMap.get('proj-fallback');
      expect(view).toBeDefined();
      expect(view?.scale.x).toBeCloseTo(0.4);
      expect(view?.scale.y).toBeCloseTo(0.4);
    });
  });
});
