import { describe, it, expect } from 'vitest';
import { FreeCamera } from './FreeCamera';

describe('FreeCamera', () => {
  it('is off until enabled, and ignores keys while off', () => {
    const cam = new FreeCamera();
    expect(cam.active).toBe(false);
    expect(cam.handleKey('d', true)).toBe(false);
    cam.dragBy(100, 100, 1);
    expect(cam.update(1, 1)).toEqual({ x: 0, y: 0 });
  });

  it('starts where the camera was and pans with the keys', () => {
    const cam = new FreeCamera();
    cam.enable({ x: 100, y: 100 });
    expect(cam.handleKey('d', true)).toBe(true);
    const moved = cam.update(0.1, 1);
    expect(moved.x).toBeCloseTo(100 + FreeCamera.KEY_SPEED * 0.1, 5);
    expect(moved.y).toBe(100);
    cam.handleKey('d', false);
    expect(cam.update(0.1, 1).x).toBeCloseTo(moved.x, 5);
  });

  it('takes WASD and arrow keys, in any case, and ignores other keys', () => {
    const cam = new FreeCamera();
    cam.enable({ x: 0, y: 0 });
    for (const k of ['w', 'A', 's', 'D', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) {
      expect(cam.handleKey(k, true)).toBe(true);
    }
    expect(cam.handleKey('q', true)).toBe(false);
    expect(cam.handleKey(' ', true)).toBe(false);
  });

  it('pans at the same speed on screen at any zoom, and diagonals are not faster', () => {
    const cam = new FreeCamera();
    cam.enable({ x: 0, y: 0 });
    cam.handleKey('d', true);
    cam.handleKey('s', true);
    const p = cam.update(1, 2);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(FreeCamera.KEY_SPEED / 2, 5);
  });

  it('drags the world with the cursor (the camera moves the other way)', () => {
    const cam = new FreeCamera();
    cam.enable({ x: 500, y: 500 });
    cam.dragBy(100, -50, 2);
    expect(cam.update(0, 2)).toEqual({ x: 450, y: 525 });
  });

  it('stays on the map', () => {
    const cam = new FreeCamera();
    cam.enable({ x: 10, y: 10 });
    cam.dragBy(100000, 100000, 1);
    expect(cam.update(0, 1, { width: 640, height: 480 })).toEqual({ x: 0, y: -400 });
    cam.dragBy(-100000, -100000, 1);
    expect(cam.update(0, 1, { width: 640, height: 480 })).toEqual({ x: 640, y: 480 });
  });

  it('stops panning when disabled or when the keys are released', () => {
    const cam = new FreeCamera();
    cam.enable({ x: 0, y: 0 });
    cam.handleKey('d', true);
    cam.releaseKeys();
    expect(cam.update(1, 1).x).toBe(0);
    cam.handleKey('d', true);
    cam.disable();
    expect(cam.active).toBe(false);
    cam.enable({ x: 5, y: 5 });
    expect(cam.update(1, 1)).toEqual({ x: 5, y: 5 }); // a held key does not carry over
  });
});
