import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { quantizeFluidLevel, type FluidClientDefinition } from '@mine-me/shared';
import { FLUID_CHUNK_SIZE, FluidRenderer, lightenColor, parseHexColor } from './FluidRenderer';

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
});
