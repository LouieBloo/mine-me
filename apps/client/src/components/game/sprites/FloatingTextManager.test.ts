import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTickerAdd, mockTickerRemove } = vi.hoisted(() => ({
  mockTickerAdd: vi.fn(),
  mockTickerRemove: vi.fn(),
}));

vi.mock('pixi.js', () => {
  return {
    Container: class MockContainer {
      children: any[] = [];
      parent: any = null;
      label = '';
      addChild(child: any) {
        this.children.push(child);
        child.parent = this;
      }
      removeChild(child: any) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) this.children.splice(idx, 1);
        child.parent = null;
      }
      destroy() {
        this.children = [];
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
      constructor(options: any) {
        this.options = options;
      }
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

import { FloatingTextManager } from './FloatingTextManager';
import { Container } from 'pixi.js';

describe('FloatingTextManager', () => {
  let parentContainer: Container;
  let manager: FloatingTextManager;

  beforeEach(() => {
    vi.clearAllMocks();
    parentContainer = new Container();
    manager = new FloatingTextManager(parentContainer);
  });

  it('attaches internal container to parent on construction', () => {
    expect(parentContainer.children.length).toBe(1);
    expect(manager.getContainer()).toBe(parentContainer.children[0]);
  });

  it('spawns damage indicator with negative prefix and red styling', () => {
    const textInstance = manager.spawnDamage(100, 200, 35);
    expect(textInstance).toBeDefined();
    expect(manager.getActiveCount()).toBe(1);

    const textObj = textInstance.getTextObject();
    expect(textObj.text).toBe('-35');
    expect((textObj.style as any).options.fill).toBe('#ef4444');
  });

  it('spawns critical hit indicator when isCritical option is true', () => {
    const textInstance = manager.spawnDamage(100, 200, 80, { isCritical: true });
    expect(textInstance).toBeDefined();

    const textObj = textInstance.getTextObject();
    expect(textObj.text).toBe('80!');
    expect((textObj.style as any).options.fill).toBe('#facc15');
  });

  it('spawns heal indicator with positive prefix and green styling', () => {
    const textInstance = manager.spawnHeal(100, 200, 25);
    const textObj = textInstance.getTextObject();
    expect(textObj.text).toBe('+25');
    expect((textObj.style as any).options.fill).toBe('#22c55e');
  });

  it('spawns block damage and custom status text', () => {
    const blockText = manager.spawnBlockDamage(50, 50, 10);
    expect(blockText.getTextObject().text).toBe('10');

    const statusText = manager.spawnStatus(50, 50, 'IMMUNE');
    expect(statusText.getTextObject().text).toBe('IMMUNE');
  });

  it('clears active texts and destroys them cleanly', () => {
    manager.spawnDamage(10, 20, 15);
    manager.spawnDamage(30, 40, 20);
    expect(manager.getActiveCount()).toBe(2);

    manager.clear();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('destroys container and removes from parent on destroy', () => {
    manager.spawnDamage(10, 20, 15);
    manager.destroy();

    expect(parentContainer.children.length).toBe(0);
    expect(() => manager.spawnDamage(10, 20, 10)).toThrow();
  });
});
