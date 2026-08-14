import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pixi.js', () => {
  class MockContainer {
    children: any[] = [];
    x = 0;
    y = 0;
    width = 64;
    height = 64;
    scale = {
      x: 1,
      y: 1,
      set: vi.fn(function (this: any, val: number) {
        this.x = val;
        this.y = val;
      }),
    };
    parent: any = null;

    addChild(child: any) {
      this.children.push(child);
      child.parent = this;
    }
    removeChild(child: any) {
      this.children = this.children.filter((c) => c !== child);
      child.parent = null;
    }
    destroy = vi.fn();
  }

  class MockSprite {
    anchor = { set: vi.fn() };
    x = 0;
    y = 0;
    parent: any = null;
    destroy = vi.fn();
    texture: any;
    constructor(texture: any) {
      this.texture = texture;
    }
  }

  return {
    Container: MockContainer,
    Sprite: MockSprite,
    Texture: { EMPTY: {} },
    Assets: {
      load: vi.fn().mockResolvedValue({}),
    },
  };
});

import { Container } from 'pixi.js';
import { CompositeEntitySprite } from '../src/components/game/sprites/CompositeEntitySprite';

describe('CompositeEntitySprite and BaseSprite Facing Direction', () => {
  let parentContainer: any;

  beforeEach(() => {
    parentContainer = new Container();
  });

  it('should initialize with default scale (facing right)', () => {
    const sprite = new CompositeEntitySprite(parentContainer, '/base-body.png');
    const container = sprite.getContainer();

    expect(container.scale.x).toBe(1);
  });

  it('should flip horizontally when setFlipped(true) is called', () => {
    const sprite = new CompositeEntitySprite(parentContainer, '/base-body.png');
    const container = sprite.getContainer();

    sprite.setFlipped(true);
    expect(container.scale.x).toBe(-1);
  });

  it('should unflip horizontally when setFlipped(false) is called', () => {
    const sprite = new CompositeEntitySprite(parentContainer, '/base-body.png');
    const container = sprite.getContainer();

    sprite.setFlipped(true);
    expect(container.scale.x).toBe(-1);

    sprite.setFlipped(false);
    expect(container.scale.x).toBe(1);
  });

  it('should maintain scale magnitude when flipping', () => {
    const sprite = new CompositeEntitySprite(parentContainer, '/base-body.png');
    const container = sprite.getContainer();

    sprite.setScale(0.5);
    expect(container.scale.x).toBe(0.5);

    sprite.setFlipped(true);
    expect(container.scale.x).toBe(-0.5);

    sprite.setFlipped(false);
    expect(container.scale.x).toBe(0.5);
  });
});
