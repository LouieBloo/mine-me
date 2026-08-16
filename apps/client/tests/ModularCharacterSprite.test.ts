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
import { ModularCharacterSprite } from '../src/components/game/sprites/ModularCharacterSprite';

describe('ModularCharacterSprite', () => {
  let parentContainer: any;

  beforeEach(() => {
    parentContainer = new Container();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '1.0',
        canvas_size: [1024, 1024],
        pelvis_origin: [512, 590],
        parts: {
          head: {
            file: 'head.png',
            width: 242,
            height: 260,
            bbox: [419, 81, 660, 340],
            pivot_anchor: [0.4174, 0.8808],
            offset_from_pelvis: [8, -280],
            z_index: 30,
            slot: 'HEAD'
          },
          torso: {
            file: 'torso.png',
            width: 281,
            height: 321,
            bbox: [360, 280, 640, 600],
            pivot_anchor: [0.5409, 0.9657],
            offset_from_pelvis: [0, 0],
            z_index: 20,
            slot: 'CHEST'
          },
          arm_front: {
            file: 'arm_front.png',
            width: 159,
            height: 445,
            bbox: [302, 276, 460, 720],
            pivot_anchor: [0.522, 0.1213],
            offset_from_pelvis: [-127, -260],
            z_index: 40,
            slot: 'WEAPON'
          },
          arm_back: {
            file: 'arm_back.png',
            width: 133,
            height: 401,
            bbox: [600, 300, 732, 700],
            pivot_anchor: [0.0752, 0.0998],
            offset_from_pelvis: [98, -250],
            z_index: 5,
            slot: 'GAUNTLETS'
          },
          leg_front: {
            file: 'leg_front.png',
            width: 176,
            height: 408,
            bbox: [340, 570, 515, 977],
            pivot_anchor: [0.5966, 0.0735],
            offset_from_pelvis: [-67, 10],
            z_index: 25,
            slot: 'BOOTS'
          },
          leg_back: {
            file: 'leg_back.png',
            width: 196,
            height: 401,
            bbox: [505, 560, 700, 960],
            pivot_anchor: [0.3827, 0.0998],
            offset_from_pelvis: [68, 10],
            z_index: 10,
            slot: 'BOOTS'
          }
        }
      })
    }));
  });

  it('should initialize joint hierarchy and load skeleton parts', async () => {
    const sprite = new ModularCharacterSprite(parentContainer);
    // Initially wrapper is hidden
    expect(sprite.getContainer().visible).toBe(false);

    await sprite.load();

    const container = sprite.getContainer();
    expect(container).toBeDefined();
    expect(container.scale.x).toBe(1);
    expect(sprite.getState()).toBe('idle');

    sprite.setVisible(true);
    expect(container.visible).toBe(true);
  });

  it('should handle flipping direction without altering scale magnitude', () => {
    const sprite = new ModularCharacterSprite(parentContainer);
    const container = sprite.getContainer();

    sprite.setScale(0.5);
    expect(container.scale.x).toBe(0.5);

    sprite.setFlipped(true);
    expect(container.scale.x).toBe(-0.5);

    sprite.setFlipped(false);
    expect(container.scale.x).toBe(0.5);
  });

  it('should transition between animation states', () => {
    const sprite = new ModularCharacterSprite(parentContainer);
    expect(sprite.getState()).toBe('idle');

    sprite.setState('walk');
    expect(sprite.getState()).toBe('walk');

    sprite.setState('mine');
    expect(sprite.getState()).toBe('mine');

    sprite.setState('idle');
    expect(sprite.getState()).toBe('idle');
  });

  it('should automatically toggle walk state when moving velocity is applied', () => {
    const sprite = new ModularCharacterSprite(parentContainer);

    sprite.setMoveVelocity(1.5, 0);
    expect(sprite.getState()).toBe('walk');

    sprite.setMoveVelocity(0, 0);
    expect(sprite.getState()).toBe('idle');
  });

  it('should update joint transforms on update frame tick', async () => {
    const sprite = new ModularCharacterSprite(parentContainer);
    await sprite.load();

    expect(() => sprite.update(0.016)).not.toThrow();

    sprite.setState('walk');
    expect(() => sprite.update(0.016)).not.toThrow();

    sprite.setState('mine');
    expect(() => sprite.update(0.016)).not.toThrow();
  });

  it('should attach and clear gear layers', async () => {
    const sprite = new ModularCharacterSprite(parentContainer);
    await sprite.load();

    await sprite.setGearLayers([
      { url: '/assets/gear/iron-helm.png', subType: 'HEAD' },
      { url: '/assets/gear/iron-boots.png', subType: 'BOOTS' },
    ]);

    expect(sprite.getToolSocket()).toBeDefined();

    sprite.destroy();
  });
});
