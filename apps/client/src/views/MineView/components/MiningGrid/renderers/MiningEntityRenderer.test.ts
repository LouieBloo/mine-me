import { describe, it, expect, beforeEach } from 'vitest';
import { Container, Graphics, Sprite } from 'pixi.js';
import { MiningEntityRenderer, type ActiveFallingRock } from './MiningEntityRenderer';
import type { MiningDroppedItem } from '@mine-me/shared';

describe('MiningEntityRenderer', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('updates falling rocks graphics in container', () => {
    const rocks: ActiveFallingRock[] = [
      { id: 'rock_1', x: 2.5, y: 3.5 },
      { id: 'rock_2', x: 4.5, y: 5.5 },
    ];
    const graphicsMap = new Map<string, Graphics>();

    MiningEntityRenderer.updateFallingRocks(container, rocks, graphicsMap, 64);

    expect(graphicsMap.size).toBe(2);
    expect(graphicsMap.has('rock_1')).toBe(true);
    expect(graphicsMap.has('rock_2')).toBe(true);
    expect(container.children.length).toBe(2);

    // Update with rock_1 removed (settled)
    MiningEntityRenderer.updateFallingRocks(container, [{ id: 'rock_2', x: 4.5, y: 6.5 }], graphicsMap, 64);
    expect(graphicsMap.size).toBe(1);
    expect(graphicsMap.has('rock_1')).toBe(false);
    expect(graphicsMap.has('rock_2')).toBe(true);
    expect(container.children.length).toBe(1);
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
});
