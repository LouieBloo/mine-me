import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Camera2D } from './Camera2D';

describe('Camera2D', () => {
  let mockContainer: any;

  beforeEach(() => {
    mockContainer = {
      x: 0,
      y: 0,
      scale: {
        x: 1,
        y: 1,
        set: vi.fn(function (this: any, val: number) {
          this.x = val;
          this.y = val;
        }),
      },
      destroyed: false,
    };
  });

  it('initializes with default options and clamps initial zoom', () => {
    const camera = new Camera2D({
      targetContainer: mockContainer,
      screenWidth: 1000,
      screenHeight: 800,
      defaultZoom: 1.25,
      minZoom: 0.5,
      maxZoom: 2.0,
    });

    expect(camera.getZoom()).toBe(1.25);
    expect(camera.minZoom).toBe(0.5);
    expect(camera.maxZoom).toBe(2.0);
  });

  it('clamps zoom value within [minZoom, maxZoom] range', () => {
    const camera = new Camera2D({
      targetContainer: mockContainer,
      screenWidth: 800,
      screenHeight: 600,
      minZoom: 0.5,
      maxZoom: 2.0,
    });

    camera.setZoom(0.2, true);
    expect(camera.getZoom()).toBe(0.5);

    camera.setZoom(3.5, true);
    expect(camera.getZoom()).toBe(2.0);

    camera.setZoom(1.5, true);
    expect(camera.getZoom()).toBe(1.5);
  });

  it('updates container position and scale to center on lookAt coordinates', () => {
    const camera = new Camera2D({
      targetContainer: mockContainer,
      screenWidth: 1000,
      screenHeight: 800,
      defaultZoom: 1.5,
    });

    camera.update({ x: 200, y: 300 });

    // container.scale = 1.5
    expect(mockContainer.scale.set).toHaveBeenCalledWith(1.5);
    // container.x = 1000/2 - 200 * 1.5 = 500 - 300 = 200
    expect(mockContainer.x).toBe(200);
    // container.y = 800/2 - 300 * 1.5 = 400 - 450 = -50
    expect(mockContainer.y).toBe(-50);
  });

  it('converts screen coordinates to world coordinates correctly', () => {
    const camera = new Camera2D({
      targetContainer: mockContainer,
      screenWidth: 1000,
      screenHeight: 800,
      defaultZoom: 2.0,
    });

    camera.update({ x: 100, y: 100 });
    // mockContainer.x = 500 - 200 = 300
    // mockContainer.y = 400 - 200 = 200

    const world = camera.screenToWorld({ x: 500, y: 400 });
    // (500 - 300) / 2 = 100
    // (400 - 200) / 2 = 100
    expect(world.x).toBe(100);
    expect(world.y).toBe(100);
  });

  it('converts world coordinates to screen coordinates correctly', () => {
    const camera = new Camera2D({
      targetContainer: mockContainer,
      screenWidth: 1000,
      screenHeight: 800,
      defaultZoom: 2.0,
    });

    camera.update({ x: 100, y: 100 });
    // mockContainer.x = 300
    // mockContainer.y = 200

    const screen = camera.worldToScreen({ x: 100, y: 100 });
    // 100 * 2 + 300 = 500
    // 100 * 2 + 200 = 400
    expect(screen.x).toBe(500);
    expect(screen.y).toBe(400);
  });

  it('updates screen dimensions dynamically', () => {
    const camera = new Camera2D({
      targetContainer: mockContainer,
      screenWidth: 800,
      screenHeight: 600,
      defaultZoom: 1.0,
    });

    camera.setScreenSize(1200, 900);
    camera.update({ x: 0, y: 0 });

    expect(mockContainer.x).toBe(600);
    expect(mockContainer.y).toBe(450);
  });
});
