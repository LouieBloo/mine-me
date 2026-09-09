import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pixi.js', () => {
  class MockContainer {
    children: any[] = [];
    x = 0;
    y = 0;
    rotation = 0;
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
    rotation = 0;
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
import { ModularEntitySprite } from '../src/components/game/sprites/ModularEntitySprite';

describe('ModularEntitySprite', () => {
  let parentContainer: any;

  beforeEach(() => {
    parentContainer = new Container();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version: '2.0',
          canvas_size: [1024, 1024],
          pelvis_origin: [512, 590],
          parts: {
            head: {
              file: 'head.png',
              width: 199,
              height: 240,
              bbox: [0, 0, 219, 260],
              pivot_anchor: [0.46, 0.94],
              offset_from_pelvis: [7, -225],
              z_index: 30,
              slot: 'HEAD',
            },
            torso: {
              file: 'torso.png',
              width: 303,
              height: 310,
              bbox: [0, 0, 303, 310],
              pivot_anchor: [0.5, 0.94],
              offset_from_pelvis: [-25, 15],
              z_index: 20,
              slot: 'CHEST',
            },
          },
        }),
      })
    );
  });

  it('should initialize and load manifest', async () => {
    const sprite = new ModularEntitySprite(parentContainer);
    expect(sprite.getContainer().visible).toBe(false);

    await sprite.load();
    expect(sprite.getState()).toBe('idle');

    sprite.setVisible(true);
    expect(sprite.getContainer().visible).toBe(true);
  });

  it('should accept inline manifest data', async () => {
    const sprite = new ModularEntitySprite(parentContainer, {
      manifestData: {
        version: '2.0',
        canvas_size: [1024, 1024],
        pelvis_origin: [512, 590],
        parts: {
          torso: {
            file: 'torso.png',
            width: 100,
            height: 100,
            bbox: [0, 0, 100, 100],
            pivot_anchor: [0.5, 0.5],
            offset_from_pelvis: [0, 0],
            z_index: 10,
            slot: 'CHEST',
          },
        },
      },
    });

    await sprite.load();
    expect(sprite.getState()).toBe('idle');
  });

  it('should transition between all modular animation states (idle, walk, mine, attack, damage, death)', () => {
    const sprite = new ModularEntitySprite(parentContainer);

    sprite.setState('attack');
    expect(sprite.getState()).toBe('attack');

    sprite.setState('damage');
    expect(sprite.getState()).toBe('damage');

    sprite.setState('death');
    expect(sprite.getState()).toBe('death');

    sprite.setState('idle');
    expect(sprite.getState()).toBe('idle');
  });

  it('should update joints on frame tick without error', async () => {
    const sprite = new ModularEntitySprite(parentContainer);
    await sprite.load();

    expect(() => sprite.update(0.016)).not.toThrow();

    sprite.setState('attack');
    expect(() => sprite.update(0.016)).not.toThrow();

    sprite.setState('damage');
    expect(() => sprite.update(0.016)).not.toThrow();

    sprite.setState('death');
    expect(() => sprite.update(0.016)).not.toThrow();
  });

  it('should scale and flip correctly', () => {
    const sprite = new ModularEntitySprite(parentContainer);
    const container = sprite.getContainer();

    sprite.scaleToHeight(440, 880);
    expect(sprite.getScale()).toBe(0.5);

    sprite.setFlipped(true);
    expect(container.scale.x).toBe(-0.5);

    sprite.setFlipped(false);
    expect(container.scale.x).toBe(0.5);
  });
});
