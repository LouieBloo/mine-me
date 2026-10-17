import { describe, it, expect, vi, afterEach } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { quantizeFluidLevel, type FluidClientDefinition } from '@mine-me/shared';
import { FLUID_CHUNK_SIZE, FLUID_STEP_SECONDS, FluidRenderer, darkenColor, lightenColor, parseHexColor } from './FluidRenderer';

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

  it('redraws a fall across a one-cell gap: the jet is laid out down the whole column, so the part past the gap changes too', () => {
    const { renderer } = make();
    const x = 2;
    // Falling water, an empty beat two rows above a chunk edge, and more of the fall running on into the chunk below
    renderer.apply([[x, FLUID_CHUNK_SIZE - 4, 1, q(0.06)], [x, FLUID_CHUNK_SIZE - 3, 1, q(0.06)], [x, FLUID_CHUNK_SIZE - 1, 1, q(0.06)], [x, FLUID_CHUNK_SIZE, 1, q(0.06)]]);
    renderer.render();
    renderer.apply([[x, FLUID_CHUNK_SIZE - 4, 1, q(0.3)]]);
    expect(renderer.render()).toBe(2); // its own chunk and the one past the gap
  });

  it('draws the highlight over the lip where a pool spills into a drop', () => {
    const container = new Container();
    const renderer = new FluidRenderer(container, 10, 10, [{ ...OIL, appearance: { waveAmplitude: 0, waveSpeed: 0, highlight: 0.6, depthDarkening: 0.3, depthOpacity: 0.2 } }], 64);
    // Ground at row 4 except a one-wide shaft at x 5; a pool on the left spilling into it
    renderer.setSolidSampler((x, y) => x < 0 || x >= 10 || y >= 9 || (y >= 4 && x !== 5));
    renderer.apply([[2, 3, 1, q(0.6)], [3, 3, 1, q(0.6)], [4, 3, 1, q(0.6)], [5, 3, 1, q(0.1)], [5, 4, 1, q(0.06)], [5, 5, 1, q(0.06)], [5, 6, 1, q(0.06)]]);
    const stroke = vi.spyOn(Graphics.prototype, 'stroke');
    const poly = vi.spyOn(Graphics.prototype, 'poly');
    renderer.render();
    // An open polyline (the spill's edge) starting at the lip's left side, stroked
    const edgeCall = poly.mock.calls.find(([points, closed]) => closed === false && (points as number[])[0] === 5 * 64);
    expect(edgeCall).toBeDefined();
    expect(stroke).toHaveBeenCalled();
  });

  it('draws fluid in free fall sliding down from the cell above over one step, redrawing it every frame until it arrives', () => {
    const { renderer } = make();
    renderer.setSolidSampler((x, y) => y >= 39 || x < 0 || x >= 40);
    renderer.apply([[5, 5, 1, q(1)]]); // a cell of fluid in the air
    renderer.update(0);
    renderer.render();
    // The next step: it fell one cell
    renderer.apply([[5, 5, 0, 0], [5, 6, 1, q(1), q(1)]], true);
    renderer.update(0.001);
    expect(renderer.fallProgress).toBeLessThan(0.1);
    let frames = 0;
    for (let t = 0.001; t < FLUID_STEP_SECONDS; t += 1 / 60) {
      renderer.update(t);
      frames++;
    }
    expect(frames).toBeGreaterThan(3);
    renderer.update(FLUID_STEP_SECONDS + 0.02);
    expect(renderer.fallProgress).toBe(1);
    // Once it has arrived nothing more is redrawn
    renderer.update(FLUID_STEP_SECONDS + 0.1);
    expect(renderer.render()).toBe(0);
  });

  it('the redraws while sliding come from the slide: a frame mid-slide redraws the falling cell', () => {
    const { renderer } = make();
    renderer.setSolidSampler((x, y) => y >= 39 || x < 0 || x >= 40);
    renderer.apply([[5, 5, 1, q(1)]]);
    renderer.update(0);
    renderer.render();
    renderer.apply([[5, 5, 0, 0], [5, 6, 1, q(1), q(1)]], true);
    // Let the (hurried) easing settle while the slide is still under way
    for (let t = 0.001; t < 0.09; t += 1 / 240) renderer.update(t);
    renderer.render();
    expect(renderer.fallProgress).toBeLessThan(1);
    const spy = vi.spyOn(renderer as any, 'drawChunk');
    renderer.update(0.095); // only the slide moves it now
    expect(spy).toHaveBeenCalled();
  });

  describe('waves', () => {
    afterEach(() => vi.restoreAllMocks());
    const still = { ...OIL, appearance: { waveAmplitude: 0, waveSpeed: 0.6, highlight: 0.5, depthDarkening: 0.3, depthOpacity: 0.2 } };
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

  describe('streams', () => {
    const open = (x: number, y: number) => x < 0 || y < 0 || x >= 5 || y >= 5;

    it('draws falling fluid when it knows what is solid, and redraws when told', () => {
      const { renderer } = make(5, 5);
      renderer.apply([[2, 1, 1, q(0.5)]]);
      renderer.render();
      renderer.setSolidSampler(open);
      expect(renderer.render()).toBe(1);
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
    const still = { ...OIL, appearance: { waveAmplitude: 0, waveSpeed: 0, highlight: 0.5, depthDarkening: 0.3, depthOpacity: 0.2 } };
    const make = () => new FluidRenderer(new Container(), 40, 40, [still], 64);

    it('shows a snapshot (or fluid coming into view) at once', () => {
      const renderer = make();
      renderer.apply([[3, 3, 1, q(0.5)]]);
      expect(renderer.display.getLevel(3, 3)).toBeCloseTo(0.5, 2);
    });

    it('eases a tick\'s changes in over the next frames, while bodies feel the exact level straight away', () => {
      const renderer = make();
      renderer.apply([[3, 3, 1, q(0.2)]]);
      renderer.render();
      renderer.apply([[3, 3, 1, q(0.8)]], true);
      expect(renderer.field.getLevel(3, 3)).toBeCloseTo(0.8, 2);
      expect(renderer.environment.sampler.getLevel(3, 3)).toBeCloseTo(0.8, 2);
      expect(renderer.display.getLevel(3, 3)).toBeCloseTo(0.2, 2);
      renderer.update(10);
      renderer.update(10.05);
      const halfway = renderer.display.getLevel(3, 3);
      expect(halfway).toBeGreaterThan(0.25);
      expect(halfway).toBeLessThan(0.75);
      for (let t = 10.05; t < 12; t += 1 / 60) renderer.update(t);
      expect(renderer.display.getLevel(3, 3)).toBeCloseTo(0.8, 2);
    });

    it('redraws while the fluid eases and stops once it has settled', () => {
      const renderer = make();
      renderer.apply([[3, 3, 1, q(0.2)]]);
      renderer.render();
      renderer.apply([[3, 3, 1, q(0.8)]], true);
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
      renderer.apply([[3, 3, 1, q(0.2)]]);
      renderer.apply([[3, 3, 1, q(0.8)]], true);
      renderer.update(0);
      renderer.update(30);
      expect(renderer.display.getLevel(3, 3)).toBeLessThan(0.8 - 0.05);
    });

    it('redraws the whole run of fluid a changed cell sits in (it is drawn as one body packed onto its floor)', () => {
      const renderer = make();
      const column: [number, number, number, number][] = [];
      for (let y = 2; y < FLUID_CHUNK_SIZE * 2 + 2; y++) column.push([2, y, 1, q(1)]);
      renderer.apply(column);
      renderer.render();
      renderer.apply([[2, FLUID_CHUNK_SIZE * 2 + 1, 1, q(0.5)]]);
      expect(renderer.render()).toBe(3); // all three chunks the column runs through
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
      expect(renderer.drawnSurfaceY(9, 9)).toBeNull();
    });
  });
});
