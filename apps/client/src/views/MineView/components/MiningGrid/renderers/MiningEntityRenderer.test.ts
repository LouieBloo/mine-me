import { describe, it, expect, beforeEach } from 'vitest';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
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
        itemId: 'ore_iron',
        itemName: 'Iron Ore',
        iconUrl: null,
        quantity: 1,
        position: { x: 1, y: 2 },
      },
    ];
    const spritesMap = new Map<string, Sprite | Graphics>();

    MiningEntityRenderer.updateDroppedItems(container, droppedItems, spritesMap, 64);

    // After cleanup with empty dropped items
    MiningEntityRenderer.updateDroppedItems(container, [], spritesMap, 64);
    expect(spritesMap.size).toBe(0);
    expect(container.children.length).toBe(0);
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
  });
});
