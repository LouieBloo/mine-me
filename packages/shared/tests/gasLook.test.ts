import { describe, it, expect } from 'vitest';
import { GAS_BLOB_LAYERS, GAS_VISIBLE_MIN, gasBlobCentre, gasBlobRadius, gasCellAlpha, gasDriftPhase } from '../src/index';

describe('gas look helpers', () => {
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
    expect(gasBlobRadius(-3)).toBe(0.5);
  });

  it('gives neighbouring cells different, repeatable drift phases within 0..1', () => {
    expect(gasDriftPhase(3, 4)).toBe(gasDriftPhase(3, 4));
    expect(gasDriftPhase(3, 4)).not.toBe(gasDriftPhase(4, 4));
    for (const [x, y] of [[0, 0], [5, 9], [44, 44]]) {
      expect(gasDriftPhase(x, y)).toBeGreaterThanOrEqual(0);
      expect(gasDriftPhase(x, y)).toBeLessThan(1);
    }
  });

  it('centres a blob on its cell when there is no drift, and never strays further than the drift amount', () => {
    expect(gasBlobCentre(3, 4, 7.7, 0.3, 0)).toEqual({ x: 3.5, y: 4.5 });
    for (let t = 0; t < 10; t += 0.37) {
      const c = gasBlobCentre(3, 4, t, 0.5, 0.2);
      expect(Math.abs(c.x - 3.5)).toBeLessThanOrEqual(0.2 + 1e-9);
      expect(Math.abs(c.y - 4.5)).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });

  it('moves the blob as time passes, and not at all with a zero drift speed', () => {
    expect(gasBlobCentre(3, 4, 0, 0.5, 0.2)).not.toEqual(gasBlobCentre(3, 4, 0.7, 0.5, 0.2));
    expect(gasBlobCentre(3, 4, 0, 0, 0.2)).toEqual(gasBlobCentre(3, 4, 9, 0, 0.2));
  });

  it('stacks circles from the widest and faintest down to the smallest, none bigger than the blob', () => {
    expect(GAS_BLOB_LAYERS.length).toBeGreaterThan(1);
    for (let i = 1; i < GAS_BLOB_LAYERS.length; i++) expect(GAS_BLOB_LAYERS[i].radius).toBeLessThan(GAS_BLOB_LAYERS[i - 1].radius);
    for (const layer of GAS_BLOB_LAYERS) {
      expect(layer.radius).toBeLessThanOrEqual(1);
      expect(layer.alpha).toBeGreaterThan(0);
    }
    expect(GAS_VISIBLE_MIN).toBeGreaterThan(0);
  });
});
