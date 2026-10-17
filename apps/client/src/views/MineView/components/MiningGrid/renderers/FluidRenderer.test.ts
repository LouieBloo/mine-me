import { describe, it, expect, vi, afterEach } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { DEFAULT_FLUID_APPEARANCE, quantizeFluidLevel, type FluidClientDefinition } from '@mine-me/shared';
import { FLUID_CHUNK_SIZE, FluidRenderer, darkenColor, lightenColor, parseHexColor } from './FluidRenderer';

const OIL: FluidClientDefinition = { id: 1, typeKey: 'OIL', name: 'Oil', color: '#0b0b0d', opacity: 0.9, viscosity: 0.6, density: 0.8 };
const q = quantizeFluidLevel;

describe('colour helpers', () => {
  it('parses #rrggbb and falls back to black', () => {
    expect(parseHexColor('#ff8800')).toBe(0xff8800);
    expect(parseHexColor('orange')).toBe(0);
    expect(parseHexColor('#fff')).toBe(0);
  });

  it('lightens towards white', () => {
    expect(lightenColor(0x000000, 0)).toBe(0x000000);
    expect(lightenColor(0x000000, 1)).toBe(0xffffff);
    expect(lightenColor(0x102030, 0.5)).toBe(0x889098);
  });
});

describe('darkenColor', () => {
  it('darkens towards black by the amount', () => {
    expect(darkenColor(0xff8040, 0)).toBe(0xff8040);
    expect(darkenColor(0xff8040, 1)).toBe(0x000000);
    expect(darkenColor(0x806040, 0.5)).toBe(0x403020);
    expect(darkenColor(0x806040, 7)).toBe(0x000000);
  });
});

describe('FluidRenderer', () => {
  const make = (width = 40, height = 40) => {
    const container = new Container();
    return { container, renderer: new FluidRenderer(container, width, height, [OIL], 64) };
  };

  it('draws nothing until fluid arrives, and nothing when nothing changed', () => {
    const { container, renderer } = make();
    expect(renderer.render()).toBe(0);
    expect(container.children).toHaveLength(0);
    renderer.apply([[3, 3, 1, q(1)]]);
    expect(renderer.render()).toBe(1);
    expect(container.children).toHaveLength(1);
    expect(renderer.render()).toBe(0);
  });

  it('redraws only the chunks that changed', () => {
    const { renderer } = make();
    renderer.apply([[1, 1, 1, q(1)], [FLUID_CHUNK_SIZE + 1, 1, 1, q(1)], [1, FLUID_CHUNK_SIZE + 1, 1, q(1)]]);
    expect(renderer.render()).toBe(3);
    renderer.apply([[1, 1, 1, q(0.5)]]);
    expect(renderer.render()).toBe(1);
  });

  it('also redraws the chunk below when a cell on a chunk edge changes (its look depends on the cell above)', () => {
    const { renderer } = make();
    renderer.apply([[2, FLUID_CHUNK_SIZE, 1, q(1)]]);
    renderer.render();
    renderer.apply([[2, FLUID_CHUNK_SIZE - 1, 1, q(1)]]);
    expect(renderer.render()).toBe(2);
  });

  it('ignores repeated identical cells', () => {
    const { renderer } = make();
    renderer.apply([[1, 1, 1, q(1)]]);
    renderer.render();
    renderer.apply([[1, 1, 1, q(1)]]);
    expect(renderer.render()).toBe(0);
  });

  it('hides a chunk whose fluid all went away, and shows it again when it returns', () => {
    const { container, renderer } = make();
    renderer.apply([[1, 1, 1, q(1)]]);
    renderer.render();
    const chunk = container.children[0];
    expect(chunk.visible).toBe(true);
    renderer.apply([[1, 1, 0, 0]]);
    renderer.render();
    expect(chunk.visible).toBe(false);
    renderer.apply([[2, 2, 1, q(0.3)]]);
    renderer.render();
    expect(chunk.visible).toBe(true);
  });

  it('does not draw fluid it has no definition for', () => {
    const { container, renderer } = make();
    renderer.apply([[1, 1, 7, q(1)]]);
    renderer.render();
    expect(container.children[0].visible).toBe(false);
  });

  it('redraws what is showing when the definitions change', () => {
    const { renderer } = make();
    renderer.apply([[1, 1, 1, q(1)]]);
    renderer.render();
    renderer.setDefinitions([{ ...OIL, color: '#ff0000' }]);
    expect(renderer.render()).toBe(1);
  });

  it('lets bodies feel the fluid it holds, with each fluid\'s viscosity and density', () => {
    const { renderer } = make();
    renderer.apply([[3, 3, 1, q(1)]]);
    expect(renderer.environment.sampler.getFluidId(3, 3)).toBe(1);
    expect(renderer.environment.propertiesOf(1)).toEqual({ viscosity: 0.6, density: 0.8 });
    expect(renderer.environment.propertiesOf(9)).toBeUndefined();
    renderer.setDefinitions([{ ...OIL, viscosity: 0.2 }]);
    expect(renderer.environment.propertiesOf(1)?.viscosity).toBe(0.2);
  });

  it('removes its graphics when destroyed', () => {
    const { container, renderer } = make();
    renderer.apply([[1, 1, 1, q(1)]]);
    renderer.render();
    renderer.destroy();
    expect(container.children).toHaveLength(0);
  });

  it('redraws the chunks beside a changed cell (surfaces join their neighbours) and above it (a stream runs on into the pool)', () => {
    const { renderer } = make();
    renderer.apply([[FLUID_CHUNK_SIZE, 3, 1, q(0.5)], [FLUID_CHUNK_SIZE - 1, FLUID_CHUNK_SIZE, 1, q(0.5)]]);
    renderer.render();
    renderer.apply([[FLUID_CHUNK_SIZE - 1, 3, 1, q(0.4)]]);
    expect(renderer.render()).toBe(2); // its own chunk and the one holding its right-hand neighbour
    renderer.apply([[FLUID_CHUNK_SIZE - 1, FLUID_CHUNK_SIZE, 1, q(0.3)]]);
    expect(renderer.render()).toBeGreaterThanOrEqual(2); // the chunk above holds the cell that runs into it
  });

  it('redraws the fluid stacked below a changed cell, because its shading depends on how deep it is', () => {
    const { renderer } = make();
    const column: [number, number, number, number][] = [];
    for (let y = FLUID_CHUNK_SIZE - 2; y < FLUID_CHUNK_SIZE + 3; y++) column.push([2, y, 1, q(1)]);
    renderer.apply(column);
    renderer.render();
    renderer.apply([[2, FLUID_CHUNK_SIZE - 3, 1, q(1)]]);
    expect(renderer.render()).toBe(2);
  });

  it('redraws the fluid stacked below a changed top cell, and not the cells above a changed bottom cell', () => {
    const { renderer } = make();
    const column: [number, number, number, number][] = [];
    for (let y = 2; y < FLUID_CHUNK_SIZE * 2 + 2; y++) column.push([2, y, 1, q(1)]);
    renderer.apply(column);
    renderer.render();
    renderer.apply([[2, FLUID_CHUNK_SIZE * 2 + 1, 1, q(0.5)]]);
    expect(renderer.render()).toBe(1); // only the bottom cell's own chunk: nothing above it depends on it
    renderer.apply([[2, 2, 1, q(0.5)]]);
    expect(renderer.render()).toBe(3); // the top of the column moved, so all three chunks it runs through are deeper or shallower
  });

  it('redraws the fluid stacked above a changed cell, because it rests on that cell\'s surface', () => {
    const { renderer } = make();
    renderer.setDefinitions([OIL, { ...OIL, id: 2, typeKey: 'WATER' }]);
    const stack: Array<[number, number, number, number]> = [];
    for (let y = 2; y < FLUID_CHUNK_SIZE + 2; y++) stack.push([2, y, 1, q(1)]);
    stack.push([2, FLUID_CHUNK_SIZE + 2, 2, q(0.25)]);
    renderer.apply(stack);
    renderer.render();
    renderer.apply([[2, FLUID_CHUNK_SIZE + 2, 2, q(0.5)]]);
    expect(renderer.render()).toBe(2); // the water's chunk and the chunk holding the top of the stack resting on it
  });

  describe('falling fluid', () => {
    afterEach(() => vi.restoreAllMocks());
    const look = (extra: object = {}) => ({ ...OIL, appearance: { ...DEFAULT_FLUID_APPEARANCE, waveAmplitude: 0, waveSpeed: 0, ...extra } });
    const fall = (def: FluidClientDefinition) => {
      const renderer = new FluidRenderer(new Container(), 40, 40, [def], 64);
      renderer.apply([[5, 5, 1, q(1), 1], [5, 6, 1, q(1), 1]], true);
      renderer.render();
      return renderer;
    };

    it('shows at once, never eased between cells', () => {
      const renderer = fall(look());
      expect(renderer.display.getLevel(5, 5)).toBe(1);
      expect(renderer.display.isFalling(5, 5)).toBe(true);
      renderer.apply([[5, 5, 0, 0], [5, 6, 0, 0], [5, 7, 1, q(1), 1], [5, 8, 1, q(1), 1]], true);
      expect(renderer.display.getLevel(5, 5)).toBe(0);
      expect(renderer.display.getLevel(5, 7)).toBe(1);
    });

    it('redraws only the streaks as time passes (the shape of a fall stands still)', () => {
      const renderer = fall(look());
      const clear = vi.spyOn(Graphics.prototype, 'clear');
      const rect = vi.spyOn(Graphics.prototype, 'rect');
      renderer.update(1);
      renderer.update(1.1);
      expect(clear).toHaveBeenCalledTimes(2);
      expect(rect).toHaveBeenCalled();
    });

    it('is not redrawn when the fluid does not flow or has no streaks', () => {
      for (const extra of [{ flowSpeed: 0 }, { flowStreaks: 0 }]) {
        const renderer = fall(look(extra));
        const clear = vi.spyOn(Graphics.prototype, 'clear');
        renderer.update(1);
        renderer.update(1.1);
        expect(clear).not.toHaveBeenCalled();
        vi.restoreAllMocks();
      }
    });

    it('stops redrawing once the fluid lands and rests', () => {
      const renderer = fall(look());
      renderer.apply([[5, 5, 0, 0], [5, 6, 1, q(1)]], true);
      renderer.render();
      const clear = vi.spyOn(Graphics.prototype, 'clear');
      renderer.update(2);
      renderer.update(2.1);
      expect(clear).not.toHaveBeenCalled();
    });

    it('draws the streaks the shared maths gives, clipped to the cells that are falling', () => {
      const renderer = fall(look());
      const rects: number[][] = [];
      vi.spyOn(Graphics.prototype, 'rect').mockImplementation(function (this: any, ...args: number[]) {
        rects.push(args);
        return this;
      });
      renderer.update(1.5);
      expect(rects.length).toBeGreaterThan(0);
      for (const [x, y, w, h] of rects) {
        expect(x).toBeGreaterThanOrEqual(5 * 64);
        expect(x + w).toBeLessThanOrEqual(6 * 64);
        expect(y).toBeGreaterThanOrEqual(5 * 64 - 1e-6);
        expect(y + h).toBeLessThanOrEqual(7 * 64 + 1e-6);
      }
    });
  });

  describe('waves', () => {
    afterEach(() => vi.restoreAllMocks());
    const still = { ...OIL, appearance: { ...DEFAULT_FLUID_APPEARANCE, waveAmplitude: 0, waveSpeed: 0.6, highlight: 0.5, depthDarkening: 0.3, depthOpacity: 0.2 } };
    const puddle = (def: FluidClientDefinition) => {
      const container = new Container();
      const renderer = new FluidRenderer(container, 40, 40, [def], 64);
      renderer.apply([[1, 3, 1, q(0.5)], [2, 3, 1, q(0.5)]]);
      renderer.render();
      return renderer;
    };

    it('redraws the surface of a waving chunk as time passes, and only the surface', () => {
      const renderer = puddle(OIL);
      const clear = vi.spyOn(Graphics.prototype, 'clear');
      renderer.update(1);
      renderer.update(1.1);
      expect(clear).toHaveBeenCalledTimes(2);
    });

    it('does not redraw a fluid with no waves', () => {
      const renderer = puddle(still);
      const clear = vi.spyOn(Graphics.prototype, 'clear');
      renderer.update(1);
      renderer.update(2);
      expect(clear).not.toHaveBeenCalled();
    });

    it('does not redraw a chunk that holds no surface', () => {
      const container = new Container();
      const renderer = new FluidRenderer(container, 40, 40, [OIL], 64);
      renderer.apply([[1, 1, 1, q(1)], [1, 2, 1, q(1)]]);
      renderer.render();
      renderer.apply([[1, 1, 0, 0]]);
      renderer.render();
      const clear = vi.spyOn(Graphics.prototype, 'clear');
      renderer.update(3);
      // The one chunk still has a surface (the cell left at row 2), so it is the only one redrawn
      expect(clear).toHaveBeenCalledTimes(1);
    });
  });

  it('shows nothing of a fluid that has no definition even if it has waves elsewhere', () => {
    const { container, renderer } = make();
    renderer.apply([[1, 1, 9, q(1)]]);
    renderer.render();
    expect(container.children[0].visible).toBe(false);
  });

  describe('easing what it draws', () => {
    afterEach(() => vi.restoreAllMocks());
    const still = { ...OIL, appearance: { ...DEFAULT_FLUID_APPEARANCE, waveAmplitude: 0, waveSpeed: 0, highlight: 0.5, depthDarkening: 0.3, depthOpacity: 0.2 } };
    const make = () => new FluidRenderer(new Container(), 40, 40, [still], 64);

    it('shows a snapshot (or fluid coming into view) at once', () => {
      const renderer = make();
      renderer.apply([[3, 3, 1, q(0.5)]]);
      expect(renderer.display.getLevel(3, 3)).toBeCloseTo(0.5, 2);
    });

    it('eases a tick\'s changes in over the next frames, while bodies feel the exact level straight away', () => {
      const renderer = make();
      renderer.apply([[3, 3, 1, q(0.25)]]);
      renderer.render();
      renderer.apply([[3, 3, 1, q(0.75)]], true);
      expect(renderer.field.getLevel(3, 3)).toBeCloseTo(0.75, 2);
      expect(renderer.environment.sampler.getLevel(3, 3)).toBeCloseTo(0.75, 2);
      expect(renderer.display.getLevel(3, 3)).toBeCloseTo(0.25, 2);
      renderer.update(10);
      renderer.update(10.05);
      const halfway = renderer.display.getLevel(3, 3);
      expect(halfway).toBeGreaterThan(0.3);
      expect(halfway).toBeLessThan(0.7);
      for (let t = 10.05; t < 12; t += 1 / 60) renderer.update(t);
      expect(renderer.display.getLevel(3, 3)).toBeCloseTo(0.75, 2);
    });

    it('redraws while the fluid eases and stops once it has settled', () => {
      const renderer = make();
      renderer.apply([[3, 3, 1, q(0.25)]]);
      renderer.render();
      renderer.apply([[3, 3, 1, q(0.75)]], true);
      renderer.update(0);
      const clear = vi.spyOn(Graphics.prototype, 'clear');
      renderer.update(1 / 60);
      expect(clear).toHaveBeenCalled();
      for (let t = 2 / 60; t < 3; t += 1 / 60) renderer.update(t);
      clear.mockClear();
      renderer.update(3.1);
      renderer.update(3.2);
      expect(clear).not.toHaveBeenCalled();
    });

    it('a stalled frame does not jump the whole way', () => {
      const renderer = make();
      renderer.apply([[3, 3, 1, q(0.25)]]);
      renderer.apply([[3, 3, 1, q(0.75)]], true);
      renderer.update(0);
      renderer.update(30);
      expect(renderer.display.getLevel(3, 3)).toBeLessThan(0.75 - 0.05);
    });
  });

  describe('terrain changes', () => {
    it('redraws the fluid beside a tile that was mined (whether it rests or falls depends on it)', () => {
      const { renderer } = make();
      renderer.apply([[FLUID_CHUNK_SIZE, 3, 1, q(0.5)]]);
      renderer.render();
      expect(renderer.render()).toBe(0);
      renderer.onTileChanged(FLUID_CHUNK_SIZE - 1, 3);
      expect(renderer.render()).toBe(2); // the mined tile's chunk and the fluid's chunk beside it
    });

    it('answers where the drawn surface is, and forgets it once the drawn fluid changes', () => {
      const { renderer } = make();
      renderer.apply([[2, 3, 1, q(0.5)]]);
      expect(renderer.drawnSurfaceY(2, 3)).toBe(4 * 64 - 32);
      renderer.apply([[2, 3, 1, q(0.25)]]);
      expect(renderer.drawnSurfaceY(2, 3)).toBe(4 * 64 - 16);
      // Fluid with fluid above it is drawn a full cell tall, so its surface is the top of its cell
      renderer.apply([[2, 2, 1, q(0.5)]]);
      expect(renderer.drawnSurfaceY(2, 3)).toBe(3 * 64);
      expect(renderer.drawnSurfaceY(9, 9)).toBeNull();
    });
  });
});
