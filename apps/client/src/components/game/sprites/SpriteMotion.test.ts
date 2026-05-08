import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpriteMotion } from './SpriteMotion';
import { Container, Ticker } from 'pixi.js';

describe('SpriteMotion', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // clear tick list
    Ticker.shared.stop();
    // removing all listeners is private, but stopping is usually enough for tests, or we don't care
  });

  describe('moveTo', () => {
    it('should set position immediately when duration is 0', async () => {
      const promise = SpriteMotion.moveTo({
        container,
        targetX: 100,
        targetY: 50,
        duration: 0,
      });

      await promise;
      expect(container.x).toBe(100);
      expect(container.y).toBe(50);
    });

    it('should accept negative offsets', async () => {
      const promise = SpriteMotion.moveTo({
        container,
        targetX: -200,
        targetY: 0,
        duration: 0,
      });

      await promise;
      expect(container.x).toBe(-200);
    });
  });

  describe('moveBack', () => {
    it('should set position immediately when duration is 0', async () => {
      container.x = 100;
      container.y = 50;
      const promise = SpriteMotion.moveBack(container, 0, 0, 0);
      await promise;
      expect(container.x).toBe(0);
      expect(container.y).toBe(0);
    });
  });

  describe('wait', () => {
    it('should resolve after the specified duration', async () => {
      let resolved = false;
      const promise = SpriteMotion.wait(500).then(() => { resolved = true; });

      expect(resolved).toBe(false);

      vi.advanceTimersByTime(500);
      await promise;

      expect(resolved).toBe(true);
    });
  });

  describe('calculateLungeOffset', () => {
    it('should calculate offset between two containers', () => {
      const attacker = new Container();
      const target = new Container();
      
      attacker.x = 100;
      attacker.y = 100;
      
      target.x = 400;
      target.y = 100;

      // Mock getBounds
      vi.spyOn(attacker, 'getBounds').mockReturnValue({ width: 50 } as any);
      vi.spyOn(target, 'getBounds').mockReturnValue({ width: 50 } as any);

      const offset = SpriteMotion.calculateLungeOffset(attacker, target, 30, 'right');

      // deltaX = 400 - 100 = 300
      // With gap + half attacker width: 300 - 30 - 25 = 245
      expect(offset.x).toBe(245);
      expect(offset.y).toBe(0);
    });

    it('should calculate offset for left direction approach', () => {
      const attacker = new Container();
      const target = new Container();

      attacker.x = 400;
      attacker.y = 100;
      
      target.x = 100;
      target.y = 100;

      vi.spyOn(attacker, 'getBounds').mockReturnValue({ width: 50 } as any);
      vi.spyOn(target, 'getBounds').mockReturnValue({ width: 50 } as any);

      const offset = SpriteMotion.calculateLungeOffset(attacker, target, 30, 'left');

      // deltaX = 100 - 400 = -300
      // With gap + half attacker width (added for left): -300 + 30 + 25 = -245
      expect(offset.x).toBe(-245);
      expect(offset.y).toBe(0);
    });
  });

  describe('lunge', () => {
    it('should exist as a static method', () => {
      expect(typeof SpriteMotion.lunge).toBe('function');
    });
  });
});
