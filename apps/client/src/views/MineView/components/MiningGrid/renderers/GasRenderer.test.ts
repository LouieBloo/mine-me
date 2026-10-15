import { describe, it, expect, vi, afterEach } from 'vitest';
import { Container } from 'pixi.js';
import { quantizeGasConcentration, type GasClientDefinition } from '@mine-me/shared';
import { EXPLOSION_LIGHT_MS, GAS_CHUNK_SIZE, GAS_VISIBLE_MIN, GasRenderer, MAX_EXPLOSION_BURSTS, MAX_EXPLOSION_LIGHTS, gasBlobRadius, gasCellAlpha, gasDriftPhase } from './GasRenderer';

const HYDROGEN: GasClientDefinition = { id: 1, typeKey: 'HYDROGEN', name: 'Hydrogen', color: '#dff1ff', opacity: 0.4, density: 0.07 };
const NITROGEN: GasClientDefinition = { id: 2, typeKey: 'NITROGEN', name: 'Nitrogen', color: '#9db7cc', opacity: 0.3, density: 1.15, sounds: { vent: { soundId: 's', url: '/assets/sounds/x.mp3' } } };
const q = quantizeGasConcentration;

describe('drawing helpers', () => {
  it('scales a cell\'s opacity with its concentration and the gas\'s opacity, staying within 0 and 1', () => {
    expect(gasCellAlpha(0.4, 1)).toBeCloseTo(0.4);
    expect(gasCellAlpha(0.4, 0.5)).toBeCloseTo(0.2);
    expect(gasCellAlpha(0.4, 0)).toBe(0);
    expect(gasCellAlpha(3, 2)).toBe(1);
    expect(gasCellAlpha(-1, 1)).toBe(0);
  });

  it('grows the blob with softness, from half a tile (hard edged) to nearly a whole tile', () => {
    expect(gasBlobRadius(0)).toBe(0.5);
    expect(gasBlobRadius(1)).toBeCloseTo(0.95);
    expect(gasBlobRadius(0.5)).toBeGreaterThan(gasBlobRadius(0.2));
    expect(gasBlobRadius(9)).toBe(gasBlobRadius(1));
  });

  it('gives neighbouring cells different, repeatable drift phases within 0..1', () => {
    expect(gasDriftPhase(3, 4)).toBe(gasDriftPhase(3, 4));
    expect(gasDriftPhase(3, 4)).not.toBe(gasDriftPhase(4, 4));
    for (const [x, y] of [[0, 0], [5, 9], [44, 44]]) {
      expect(gasDriftPhase(x, y)).toBeGreaterThanOrEqual(0);
      expect(gasDriftPhase(x, y)).toBeLessThan(1);
    }
  });
});

describe('GasRenderer', () => {
  const make = (width = 40, height = 40) => {
    const container = new Container();
    return { container, renderer: new GasRenderer(container, width, height, [HYDROGEN, NITROGEN], 64) };
  };

  it('draws nothing until gas arrives, and nothing when nothing changed', () => {
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
    renderer.apply([[1, 1, 1, q(1)], [GAS_CHUNK_SIZE + 1, 1, 1, q(1)], [1, GAS_CHUNK_SIZE + 1, 1, q(1)]]);
    expect(renderer.render()).toBe(3);
    renderer.apply([[1, 1, 1, q(0.5)]]);
    expect(renderer.render()).toBe(1);
  });

  it('keeps an exact copy of the gas, for the player\'s body to sense', () => {
    const { renderer } = make();
    renderer.apply([[3, 3, 2, q(0.5)]], true);
    expect(renderer.field.getGasId(3, 3)).toBe(2);
    expect(renderer.field.getConcentration(3, 3)).toBeCloseTo(0.5, 2);
    expect(renderer.environment.sampler).toBe(renderer.field);
    expect(renderer.environment.propertiesOf(1)).toEqual({ density: 0.07 });
    expect(renderer.environment.propertiesOf(9)).toBeUndefined();
  });

  it('shows new gas at once when not smoothing, and eases towards it when smoothing', () => {
    const { renderer } = make();
    renderer.apply([[3, 3, 1, q(1)]]);
    expect(renderer.displayedConcentration(3, 3)).toBeCloseTo(1, 2);
    renderer.apply([[3, 3, 1, q(0.2)]], true);
    // The server says 0.2; the drawing is still near 1 and trails it down over the next frames
    expect(renderer.displayedConcentration(3, 3)).toBeCloseTo(1, 2);
    renderer.update(1);
    renderer.update(1.05);
    const mid = renderer.displayedConcentration(3, 3);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(0.2);
    for (let t = 1.1; t < 4; t += 0.05) renderer.update(t);
    expect(renderer.displayedConcentration(3, 3)).toBeCloseTo(0.2, 2);
  });

  it('a different gas arriving in a cell shows at once instead of easing from the old one', () => {
    const { renderer } = make();
    renderer.apply([[3, 3, 1, q(1)]]);
    renderer.apply([[3, 3, 2, q(0.4)]], true);
    expect(renderer.displayedConcentration(3, 3)).toBeCloseTo(0.4, 2);
  });

  it('gas that left a cell stops being drawn at once', () => {
    const { container, renderer } = make();
    renderer.apply([[3, 3, 1, q(1)]]);
    renderer.render();
    renderer.apply([[3, 3, 0, 0]], true);
    expect(renderer.displayedConcentration(3, 3)).toBe(0);
    renderer.render();
    expect(container.children[0].visible).toBe(false);
  });

  it('does not draw traces thinner than the visible minimum, and hides a chunk with nothing to show', () => {
    const { container, renderer } = make();
    renderer.apply([[3, 3, 1, q(GAS_VISIBLE_MIN / 2)]]);
    renderer.render();
    expect(container.children[0].visible).toBe(false);
    renderer.apply([[3, 3, 1, q(0.5)]]);
    renderer.render();
    expect(container.children[0].visible).toBe(true);
  });

  it('keeps drifting gas moving: a chunk with gas is redrawn as time passes, one without is not', () => {
    const { renderer } = make();
    renderer.apply([[3, 3, 1, q(1)]]);
    renderer.render();
    const drawn = (renderer as any).chunks.get(0);
    const g = drawn.graphics as { clear: () => void };
    let clears = 0;
    const clear = g.clear.bind(g);
    g.clear = () => { clears++; clear(); };
    renderer.update(10);
    renderer.update(10.01);
    expect(clears).toBe(1);
    renderer.update(10.2);
    expect(clears).toBe(2);
    renderer.apply([[3, 3, 0, 0]]);
    renderer.render();
    clears = 0;
    renderer.update(11);
    renderer.update(12);
    expect(clears).toBe(0);
  });

  it('ignores gas whose definition it was not told about, and cells outside the grid', () => {
    const { container, renderer } = make();
    renderer.apply([[3, 3, 9, q(1)], [-1, 2, 1, q(1)], [99, 2, 1, q(1)]]);
    renderer.render();
    expect(container.children.every((c) => !c.visible)).toBe(true);
    expect(renderer.displayedConcentration(-1, 2)).toBe(0);
  });

  it('redraws what is showing when the definitions change', () => {
    const { renderer } = make();
    renderer.apply([[3, 3, 1, q(1)]]);
    renderer.render();
    renderer.setDefinitions([{ ...HYDROGEN, color: '#ff0000' }]);
    expect(renderer.render()).toBe(1);
  });

  it('knows a gas\'s sounds, and that a silent one has none', () => {
    const { renderer } = make();
    expect(renderer.soundsOf(2)?.vent?.url).toBe('/assets/sounds/x.mp3');
    expect(renderer.soundsOf(1)).toBeUndefined();
  });

  it('cleans up its drawing', () => {
    const { container, renderer } = make();
    renderer.apply([[3, 3, 1, q(1)]]);
    renderer.render();
    renderer.destroy();
    expect(container.children).toHaveLength(0);
  });
});

describe('GasRenderer explosions', () => {
  afterEach(() => vi.useRealTimers());
  const FLASH = { burstCount: 20 } as any;
  const LIGHT = { enabled: true, type: 'POINT', effect: 'FLICKER', color: '#cfe8ff', radius: 3, intensity: 0.9 } as any;
  const BOOM: GasClientDefinition = { ...HYDROGEN, explosion: { effect: FLASH, light: LIGHT } };
  const make = (definitions: GasClientDefinition[] = [BOOM, NITROGEN]) => {
    const particles = { spawnBurst: vi.fn() };
    const lighting = { addLight: vi.fn(), removeLight: vi.fn() };
    const renderer = new GasRenderer(new Container(), 80, 80, definitions, 64);
    renderer.setEngines(particles as any, lighting as any);
    return { renderer, particles, lighting };
  };

  it('knows how an exploding gas looks, and that others draw nothing', () => {
    const { renderer } = make();
    expect(renderer.explosionOf(1)).toEqual({ effect: FLASH, light: LIGHT });
    expect(renderer.explosionOf(2)).toBeUndefined();
  });

  it('bursts the gas\'s particle effect in the middle of each detonated cell', () => {
    const { renderer, particles } = make();
    expect(renderer.playExplosions([[3, 4, 1], [5, 4, 1]])).toBe(2);
    expect(particles.spawnBurst).toHaveBeenNthCalledWith(1, FLASH, { x: 3.5 * 64, y: 4.5 * 64 });
    expect(particles.spawnBurst).toHaveBeenNthCalledWith(2, FLASH, { x: 5.5 * 64, y: 4.5 * 64 });
  });

  it('flashes a light in the cell, and takes it away again after a moment', () => {
    vi.useFakeTimers();
    const { renderer, lighting } = make();
    renderer.playExplosions([[3, 4, 1]]);
    expect(lighting.addLight).toHaveBeenCalledTimes(1);
    const light = lighting.addLight.mock.calls[0][0];
    expect(light.position).toEqual({ x: 3.5, y: 4.5 });
    expect(lighting.removeLight).not.toHaveBeenCalled();
    vi.advanceTimersByTime(EXPLOSION_LIGHT_MS + 1);
    expect(lighting.removeLight).toHaveBeenCalledWith(light.id);
  });

  it('does nothing for a gas with no explosion look, an unknown gas, or no cells', () => {
    const { renderer, particles, lighting } = make();
    expect(renderer.playExplosions([[3, 4, 2], [3, 4, 9]])).toBe(0);
    expect(renderer.playExplosions([])).toBe(0);
    expect(particles.spawnBurst).not.toHaveBeenCalled();
    expect(lighting.addLight).not.toHaveBeenCalled();
  });

  it('draws nothing without engines to draw with, and does not fail', () => {
    const renderer = new GasRenderer(new Container(), 80, 80, [BOOM], 64);
    expect(() => renderer.playExplosions([[3, 4, 1]])).not.toThrow();
    expect(renderer.playExplosions([[3, 4, 1]])).toBe(0);
  });

  it('draws only the effect when there is no light, and only the light when there is no effect', () => {
    const effectOnly = make([{ ...HYDROGEN, explosion: { effect: FLASH, light: null } }]);
    effectOnly.renderer.playExplosions([[1, 1, 1]]);
    expect(effectOnly.particles.spawnBurst).toHaveBeenCalledTimes(1);
    expect(effectOnly.lighting.addLight).not.toHaveBeenCalled();
    const lightOnly = make([{ ...HYDROGEN, explosion: { effect: null, light: LIGHT } }]);
    expect(lightOnly.renderer.playExplosions([[1, 1, 1]])).toBe(0);
    expect(lightOnly.lighting.addLight).toHaveBeenCalledTimes(1);
  });

  it('thins a long front so a huge pocket does not start thousands of effects', () => {
    vi.useFakeTimers();
    const { renderer, particles, lighting } = make();
    const cells = Array.from({ length: 800 }, (_, i) => [i % 80, Math.floor(i / 80), 1] as const);
    const bursts = renderer.playExplosions(cells);
    expect(bursts).toBeLessThanOrEqual(MAX_EXPLOSION_BURSTS);
    expect(bursts).toBeGreaterThan(MAX_EXPLOSION_BURSTS / 2);
    expect(particles.spawnBurst.mock.calls.length).toBe(bursts);
    expect(lighting.addLight.mock.calls.length).toBeLessThanOrEqual(MAX_EXPLOSION_LIGHTS);
    expect(lighting.addLight.mock.calls.length).toBeGreaterThan(1);
  });

  it('takes its lights away when it is destroyed, or when it is given other engines', () => {
    vi.useFakeTimers();
    const { renderer, lighting } = make();
    renderer.playExplosions([[1, 1, 1]]);
    renderer.destroy();
    expect(lighting.removeLight).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(EXPLOSION_LIGHT_MS * 2);
    expect(lighting.removeLight).toHaveBeenCalledTimes(1);
    const other = make();
    other.renderer.playExplosions([[2, 2, 1]]);
    other.renderer.setEngines(other.particles as any, { addLight: vi.fn(), removeLight: vi.fn() } as any);
    expect(other.lighting.removeLight).toHaveBeenCalledTimes(1);
  });

  it('picks up a changed look when the definitions are replaced', () => {
    const { renderer } = make();
    renderer.setDefinitions([HYDROGEN]);
    expect(renderer.explosionOf(1)).toBeUndefined();
  });
});
