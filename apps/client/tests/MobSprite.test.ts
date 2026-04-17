import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MobSprite } from '../src/components/game/MobSprite/MobSprite';

// Mock pixi.js with proper class-based mocks
vi.mock('pixi.js', () => {
  class MockContainer {
    children: any[] = [];
    x = 0;
    y = 0;
    width = 64;
    height = 64;
    scale = { set: vi.fn() };
    parent: any = null;

    addChild(child: any) { this.children.push(child); }
    removeChild(child: any) { this.children = this.children.filter(c => c !== child); }
    destroy() { this.children = []; }
  }

  class MockAnimatedSprite {
    anchor = { set: vi.fn() };
    animationSpeed = 0;
    loop = true;
    playing = true;
    onComplete: (() => void) | null = null;

    play = vi.fn();
    stop = vi.fn();
    destroy = vi.fn();
  }

  class MockSpritesheet {
    animations: Record<string, any[]> = {
      Idle: [{ width: 64, height: 64 }],
      Attacking: [{ width: 64, height: 64 }],
      Death: [{ width: 64, height: 64 }],
    };
    parse = vi.fn().mockResolvedValue(undefined);
  }

  return {
    Assets: {
      load: vi.fn().mockResolvedValue({ width: 128, height: 128 }),
    },
    Texture: { EMPTY: {} },
    AnimatedSprite: MockAnimatedSprite,
    Spritesheet: MockSpritesheet,
    Container: MockContainer,
  };
});

// Mock fetch for atlas loading
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({
    meta: { image: 'sprite.png' },
    frames: {},
    animations: {
      Idle: ['Idle0.png'],
      Attacking: ['Attacking0.png'],
      Death: ['Death0.png'],
    },
  }),
}) as any;

describe('MobSprite', () => {
  let mockContainer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContainer = {
      children: [],
      addChild: vi.fn(),
      removeChild: vi.fn(),
      destroy: vi.fn(),
      x: 0,
      y: 0,
      scale: { set: vi.fn() },
      parent: null,
    };
  });

  it('should create and attach a wrapper container', () => {
    const mob = new MobSprite(mockContainer, 'http://test/sprite.png', 'http://test/atlas.json');
    expect(mockContainer.addChild).toHaveBeenCalled();
    mob.destroy();
  });

  it('should load assets and parse spritesheet', async () => {
    const mob = new MobSprite(mockContainer, 'http://test/sprite.png', 'http://test/atlas.json');
    await mob.load();
    expect(mob.getAvailableAnimations()).toEqual(['Idle', 'Attacking', 'Death']);
    mob.destroy();
  });

  it('should return available animations after load', async () => {
    const mob = new MobSprite(mockContainer, 'http://test/sprite.png', 'http://test/atlas.json');
    expect(mob.getAvailableAnimations()).toEqual([]);
    await mob.load();
    expect(mob.getAvailableAnimations().length).toBeGreaterThan(0);
    mob.destroy();
  });

  it('should play an animation by key', async () => {
    const mob = new MobSprite(mockContainer, 'http://test/sprite.png', 'http://test/atlas.json');
    await mob.load();
    mob.playAnimation('Idle');
    expect(mob.getCurrentAnimation()).toBe('Idle');
    mob.destroy();
  });

  it('should handle case-insensitive animation keys', async () => {
    const mob = new MobSprite(mockContainer, 'http://test/sprite.png', 'http://test/atlas.json');
    await mob.load();
    mob.playAnimation('idle');
    expect(mob.getCurrentAnimation()).toBe('Idle');
    mob.destroy();
  });

  it('should warn when animation is not found', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mob = new MobSprite(mockContainer, 'http://test/sprite.png', 'http://test/atlas.json');
    await mob.load();
    mob.playAnimation('NonExistent');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('NonExistent'));
    warnSpy.mockRestore();
    mob.destroy();
  });

  it('should set position', () => {
    const mob = new MobSprite(mockContainer, 'http://test/sprite.png', 'http://test/atlas.json');
    mob.setPosition(100, 200);
    const wrapper = mob.getContainer();
    expect(wrapper.x).toBe(100);
    expect(wrapper.y).toBe(200);
    mob.destroy();
  });

  it('should clean up on destroy', async () => {
    const mob = new MobSprite(mockContainer, 'http://test/sprite.png', 'http://test/atlas.json');
    await mob.load();
    mob.playAnimation('Idle');
    mob.destroy();
    expect(mob.getAvailableAnimations()).toEqual([]);
    expect(mob.getCurrentAnimation()).toBeNull();
  });
});
