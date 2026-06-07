import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container, Assets } from 'pixi.js';
import { RockSprite } from './RockSprite';

vi.mock('pixi.js', () => {
  return {
    Container: class MockContainer {
      children: any[] = [];
      x = 0;
      y = 0;
      scale = {
        set: vi.fn(),
      };
      parent: any = null;
      addChild(child: any) {
        this.children.push(child);
        child.parent = this;
      }
      removeChild(child: any) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
          this.children.splice(idx, 1);
          child.parent = null;
        }
      }
      destroy = vi.fn();
    },
    Graphics: class MockGraphics {
      rect = vi.fn();
      fill = vi.fn();
      stroke = vi.fn();
      parent: any = null;
      destroy = vi.fn();
    },
    Sprite: class MockSprite {
      anchor = {
        set: vi.fn(),
      };
      parent: any = null;
      destroy = vi.fn();
      texture: any;
      constructor(texture: any) {
        this.texture = texture;
      }
    },
    Texture: {},
    Assets: {
      load: vi.fn().mockImplementation(async () => ({})),
    },
  };
});

describe('RockSprite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementation
    Assets.load = vi.fn().mockImplementation(async () => ({}));
  });

  it('should create a container when instantiated', () => {
    const parent = new Container();
    const rock = new RockSprite(parent);
    expect(rock.getContainer()).toBeDefined();
    expect(parent.children.length).toBe(1);
    rock.destroy();
  });

  it('should load ore vein sprite if Assets.load succeeds', async () => {
    const parent = new Container();
    const rock = new RockSprite(parent);
    await rock.load();
    const container = rock.getContainer();
    // One sprite should be added
    expect(container.children.length).toBe(1);
    expect(Assets.load).toHaveBeenCalled();
    rock.destroy();
  });

  it('should fall back to Graphics if Assets.load fails', async () => {
    Assets.load = vi.fn().mockRejectedValue(new Error('Load error'));
    const parent = new Container();
    const rock = new RockSprite(parent);
    await rock.load();
    const container = rock.getContainer();
    expect(container.children.length).toBe(1);
    expect(Assets.load).toHaveBeenCalled();
    rock.destroy();
  });
});
