import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateSunlightMap } from './SunlightCalculator';
import { PointLight } from './PointLight';
import { SpotLight } from './SpotLight';
import { LightingEngine } from './LightingEngine';
import { LightTextureFactory } from './LightTextureFactory';
import { MiningTileType } from '@mine-me/shared';
import type { MiningClientTile } from '@mine-me/shared';

describe('SunlightCalculator', () => {
  it('should calculate direct vertical sunlight fading with depth', () => {
    // 5x5 grid with an open shaft in column 2
    const grid: MiningClientTile[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, (_, x) => ({
        type: x === 2 ? MiningTileType.EMPTY : MiningTileType.DIRT,
        revealed: true,
      }))
    );

    const sunlight = calculateSunlightMap(grid, 5, 0.4);

    expect(sunlight.length).toBe(5);
    expect(sunlight[0].length).toBe(5);

    // Surface tile of the shaft (y=0, x=2) has full sunlight (1.0)
    expect(sunlight[0][2]).toBeCloseTo(1.0, 2);

    // Downward shaft decreases with depth
    expect(sunlight[1][2]).toBeLessThan(sunlight[0][2]);
    expect(sunlight[2][2]).toBeLessThan(sunlight[1][2]);
    expect(sunlight[3][2]).toBeLessThan(sunlight[2][2]);
  });

  it('should stop vertical sunlight propagation when blocked by a solid tile', () => {
    // 5x5 grid with an open shaft at y=0,1, but blocked by DIRT at y=2
    const grid: MiningClientTile[][] = Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 5 }, (_, x) => ({
        type: x === 2 && y <= 1 ? MiningTileType.EMPTY : MiningTileType.DIRT,
        revealed: true,
      }))
    );

    const sunlight = calculateSunlightMap(grid, 5, 0.4);

    expect(sunlight[0][2]).toBeGreaterThan(0.8);
    expect(sunlight[1][2]).toBeGreaterThan(0.5);
    // Blocked from y=2 onwards
    expect(sunlight[2][2]).toBe(0);
    expect(sunlight[3][2]).toBe(0);
    expect(sunlight[4][2]).toBe(0);
  });

  it('should diffuse sunlight laterally into adjacent excavated air tunnels', () => {
    // T-shaped tunnel: vertical shaft at x=2 (y=0,1), horizontal branch at y=1 (x=1,2,3)
    const grid: MiningClientTile[][] = Array.from({ length: 4 }, (_, y) =>
      Array.from({ length: 5 }, (_, x) => {
        const isVerticalShaft = x === 2 && y <= 1;
        const isHorizontalBranch = y === 1 && (x === 1 || x === 2 || x === 3);
        return {
          type: isVerticalShaft || isHorizontalBranch ? MiningTileType.EMPTY : MiningTileType.DIRT,
          revealed: true,
        };
      })
    );

    const sunlight = calculateSunlightMap(grid, 5, 0.4);

    // Main shaft at (x=2, y=1)
    const centerLight = sunlight[1][2];
    expect(centerLight).toBeGreaterThan(0.5);

    // Left and right open branches should receive lateral diffused light
    expect(sunlight[1][1]).toBeGreaterThan(0.1);
    expect(sunlight[1][3]).toBeGreaterThan(0.1);
    expect(sunlight[1][1]).toBeLessThan(centerLight);
    expect(sunlight[1][3]).toBeLessThan(centerLight);

    // Blocked dirt tile at (x=0, y=1) should have 0 sunlight
    expect(sunlight[1][0]).toBe(0);
  });

  it('should handle empty or degenerate grids safely', () => {
    expect(calculateSunlightMap([])).toEqual([]);
    expect(calculateSunlightMap([[]])).toEqual([]);
  });
});

describe('PointLight', () => {
  it('should initialize with correct properties', () => {
    const light = new PointLight('torch_1', { x: 10, y: 5 }, 0xf59e0b, 1.2, 4.0);
    expect(light.id).toBe('torch_1');
    expect(light.position).toEqual({ x: 10, y: 5 });
    expect(light.color).toBe(0xf59e0b);
    expect(light.baseIntensity).toBe(1.2);
    expect(light.radius).toBe(4.0);
    expect(light.enabled).toBe(true);
  });

  it('should oscillate intensity in flicker mode', () => {
    const light = new PointLight('torch_flicker', { x: 0, y: 0 }, 0xf59e0b, 1.0, 3.5, {
      flicker: { speed: 4.0, amount: 0.2 },
    });

    light.update(0.1);
    const updated1 = light.currentIntensity;
    light.update(0.2);
    const updated2 = light.currentIntensity;

    // Intensity should vary within range [0.7, 1.3]
    expect(updated1).toBeGreaterThanOrEqual(0.7);
    expect(updated1).toBeLessThanOrEqual(1.3);
    expect(updated2).toBeGreaterThanOrEqual(0.7);
    expect(updated2).toBeLessThanOrEqual(1.3);
  });

  it('should pulse between min and max intensity in pulse mode', () => {
    const light = new PointLight('gem_pulse', { x: 0, y: 0 }, 0x38bdf8, 1.0, 2.0, {
      pulse: { speed: 2.0, minIntensity: 0.3, maxIntensity: 0.9 },
    });

    for (let t = 0; t < 10; t++) {
      light.update(0.2);
      expect(light.currentIntensity).toBeGreaterThanOrEqual(0.29);
      expect(light.currentIntensity).toBeLessThanOrEqual(0.91);
    }
  });

  it('should render to a Pixi Container without crashing', () => {
    vi.spyOn(LightTextureFactory, 'getRadialTexture').mockReturnValue({} as any);
    const light = new PointLight('test_light', { x: 5, y: 5 });
    const mockContainer = {
      addChild: vi.fn(),
    } as any;
    const mockGraphics = {} as any;

    light.render(mockContainer, mockGraphics, 64);
    expect(mockContainer.addChild).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('SpotLight', () => {
  it('should normalize and update direction vector', () => {
    const spot = new SpotLight('flashlight', { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(spot.direction.x).toBeCloseTo(1.0, 4);
    expect(spot.direction.y).toBeCloseTo(0.0, 4);

    spot.setDirection(0, -5);
    expect(spot.direction.x).toBeCloseTo(0.0, 4);
    expect(spot.direction.y).toBeCloseTo(-1.0, 4);
  });

  it('should render cone arc and body aura', () => {
    const spot = new SpotLight('flashlight', { x: 2, y: 3 }, { x: 1, y: 0 });
    const mockGraphics = {
      circle: vi.fn(),
      moveTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
    } as any;

    spot.render({} as any, mockGraphics, 64);
    expect(mockGraphics.circle).toHaveBeenCalled(); // 360 aura
    expect(mockGraphics.arc).toHaveBeenCalled(); // directional cone
    expect(mockGraphics.fill).toHaveBeenCalled();
  });
});

describe('LightingEngine', () => {
  let mockApp: any;
  let mockContainer: any;

  beforeEach(() => {
    mockContainer = {
      addChild: vi.fn(),
      removeChild: vi.fn(),
      destroy: vi.fn(),
    };

    mockApp = {
      renderer: {
        render: vi.fn(),
      },
    };
  });

  it('should manage light source lifecycle (add, get, remove, destroy)', () => {
    const engine = new LightingEngine(mockApp, mockContainer, 30, 30, 64);
    const torch = new PointLight('entrance_torch', { x: 15, y: 0 });

    engine.addLight(torch);
    expect(engine.getLight('entrance_torch')).toBe(torch);

    engine.removeLight('entrance_torch');
    expect(engine.getLight('entrance_torch')).toBeUndefined();
    expect(torch.enabled).toBe(false);

    engine.destroy();
  });

  it('should update sunlight map when grid updates', () => {
    const engine = new LightingEngine(mockApp, mockContainer, 10, 10, 64);
    const grid: MiningClientTile[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => ({
        type: MiningTileType.EMPTY,
        revealed: true,
      }))
    );

    engine.updateGrid(grid);
    // Should run frame update smoothly
    engine.update(0.016, { x: 2, y: 2 }, { x: 1, y: 0 });
    engine.destroy();
  });
});
