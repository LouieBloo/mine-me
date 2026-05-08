import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted — all variables used inside must be declared within the factory.
// We use vi.hoisted() to safely create shared references.
const { mockTickerAdd, mockTickerRemove } = vi.hoisted(() => ({
  mockTickerAdd: vi.fn(),
  mockTickerRemove: vi.fn(),
}));

vi.mock('pixi.js', () => {
  return {
    Container: class MockContainer {
      children: any[] = [];
      addChild(child: any) { this.children.push(child); }
      removeChild(child: any) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) this.children.splice(idx, 1);
      }
    },
    Text: class MockText {
      text: string;
      style: any;
      anchor = { set: vi.fn() };
      x = 0;
      y = 0;
      alpha = 1;
      scale = { set: vi.fn() };
      parent: any = null;
      destroyed = false;

      constructor(options: any) {
        this.text = options?.text ?? '';
        this.style = options?.style ?? {};
      }
      destroy() {
        this.destroyed = true;
      }
    },
    TextStyle: class MockTextStyle {
      options: any;
      constructor(options: any) { this.options = options; }
    },
    Ticker: {
      shared: {
        deltaMS: 16,
        add: mockTickerAdd,
        remove: mockTickerRemove,
      },
    },
  };
});

import { FloatingText } from './FloatingText';
import { Container } from 'pixi.js';

describe('FloatingText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a text object and add it to the parent container', () => {
    const container = new Container();

    FloatingText.spawn(container, {
      text: '-15',
      x: 100,
      y: 80,
      color: '#ff4444',
    });

    // Should have added the text object to the container
    expect(container.children.length).toBe(1);
    expect((container.children[0] as any).text).toBe('-15');
  });

  it('should register a ticker callback on spawn', () => {
    const container = new Container();

    FloatingText.spawn(container, {
      text: '-10',
      x: 50,
      y: 50,
    });

    expect(mockTickerAdd).toHaveBeenCalledTimes(1);
  });

  it('should use default options when not specified', () => {
    const container = new Container();

    const floater = FloatingText.spawn(container, {
      text: '+20',
      x: 0,
      y: 0,
    });

    // Should not be destroyed immediately
    expect(floater.isDestroyed()).toBe(false);
    expect(container.children.length).toBe(1);
  });

  it('should remove ticker callback on destroy', () => {
    const container = new Container();

    const floater = FloatingText.spawn(container, {
      text: '-5',
      x: 100,
      y: 100,
    });

    floater.destroy();

    expect(mockTickerRemove).toHaveBeenCalledTimes(1);
    expect(floater.isDestroyed()).toBe(true);
  });

  it('should not double-destroy', () => {
    const container = new Container();

    const floater = FloatingText.spawn(container, {
      text: '-5',
      x: 100,
      y: 100,
    });

    floater.destroy();
    floater.destroy(); // Call again

    // remove should only be called once
    expect(mockTickerRemove).toHaveBeenCalledTimes(1);
  });

  it('should remove the text from the container on destroy', () => {
    const container = new Container();

    const floater = FloatingText.spawn(container, {
      text: '-20',
      x: 0,
      y: 0,
    });

    // Manually set parent reference (since our mock addChild doesn't set .parent)
    const textObj = floater.getTextObject();
    textObj.parent = container;

    floater.destroy();

    expect(container.children.length).toBe(0);
  });

  it('should accept custom options', () => {
    const container = new Container();

    const floater = FloatingText.spawn(container, {
      text: '+50',
      x: 200,
      y: 150,
      color: '#44ff88',
      fontSize: 36,
      duration: 2000,
      floatDistance: 100,
      punchScale: false,
    });

    expect(floater.isDestroyed()).toBe(false);
    expect((container.children[0] as any).text).toBe('+50');
  });
});
