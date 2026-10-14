import { describe, it, expect } from 'vitest';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, POUR_RATE, PreviewScene, type PreviewFluid } from './previewScene';

const OIL: PreviewFluid = { density: 0.8, flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02 };
const runSteps = (scene: PreviewScene, n: number) => { for (let i = 0; i < n; i++) scene.step(); };

describe('PreviewScene', () => {
  it('starts as an empty tank with walls round the edge', () => {
    const scene = new PreviewScene(OIL);
    expect(scene.stats()).toEqual({ volume: 0, evaporated: 0, activeCells: 0 });
    expect(scene.isSolid(0, 0)).toBe(true);
    expect(scene.isSolid(PREVIEW_WIDTH - 1, PREVIEW_HEIGHT - 1)).toBe(true);
    expect(scene.isSolid(3, 3)).toBe(false);
    expect(scene.isSolid(-1, 3)).toBe(true);
  });

  it('adds fluid while pouring and nothing when not', () => {
    const scene = new PreviewScene(OIL);
    runSteps(scene, 5);
    expect(scene.stats().volume).toBe(0);
    scene.setPouring(true);
    runSteps(scene, 4);
    expect(scene.stats().volume + scene.stats().evaporated).toBeCloseTo(4 * POUR_RATE, 1);
    scene.setPouring(false);
    const before = scene.stats().volume;
    runSteps(scene, 2);
    expect(scene.stats().volume).toBeLessThanOrEqual(before + 1e-6);
  });

  it('the poured fluid falls and ends up on the floor', () => {
    const scene = new PreviewScene(OIL);
    scene.setPouring(true);
    runSteps(scene, 6);
    scene.setPouring(false);
    runSteps(scene, 600);
    const field = scene.toField();
    let onFloor = 0;
    for (let x = 1; x < PREVIEW_WIDTH - 1; x++) onFloor += field.getLevel(x, PREVIEW_HEIGHT - 2);
    expect(onFloor).toBeGreaterThan(1);
    expect(scene.stats().activeCells).toBe(0);
  });

  it('a thick fluid spreads slower than a thin one', () => {
    const thin = new PreviewScene({ ...OIL, flowRate: 0.9 });
    const thick = new PreviewScene({ ...OIL, flowRate: 0.1 });
    for (const scene of [thin, thick]) {
      scene.setPouring(true);
      runSteps(scene, 6);
      scene.setPouring(false);
      runSteps(scene, 12);
    }
    const reach = (scene: PreviewScene) => {
      const f = scene.toField();
      let cells = 0;
      for (let x = 0; x < PREVIEW_WIDTH; x++) if (f.getLevel(x, PREVIEW_HEIGHT - 2) > 0) cells++;
      return cells;
    };
    expect(reach(thin)).toBeGreaterThan(reach(thick));
  });

  it('opening the gate lets pooled fluid flow into the other chamber, and only then', () => {
    const scene = new PreviewScene({ ...OIL, flowRate: 0.6 });
    scene.setPouring(true);
    runSteps(scene, 30);
    scene.setPouring(false);
    runSteps(scene, 400);
    const right = (s: PreviewScene) => {
      const f = s.toField();
      let total = 0;
      for (let y = 8; y <= 10; y++) for (let x = 13; x < PREVIEW_WIDTH - 1; x++) total += f.getLevel(x, y);
      return total;
    };
    expect(right(scene)).toBe(0);
    expect(scene.isSolid(12, 9)).toBe(true);
    scene.openDivider();
    expect(scene.isSolid(12, 9)).toBe(false);
    runSteps(scene, 400);
    expect(right(scene)).toBeGreaterThan(0.2);
  });

  it('reset empties the tank, puts the divider back and stops pouring', () => {
    const scene = new PreviewScene(OIL);
    scene.setPouring(true);
    runSteps(scene, 5);
    scene.openDivider();
    scene.reset();
    expect(scene.pouring).toBe(false);
    expect(scene.dividerOpen).toBe(false);
    expect(scene.isSolid(12, 9)).toBe(true);
    expect(scene.stats().volume).toBe(0);
  });

  it('draws through the same field the game uses (quantised levels)', () => {
    const scene = new PreviewScene(OIL);
    scene.setPouring(true);
    runSteps(scene, 1);
    const field = scene.toField();
    let total = 0;
    for (let y = 0; y < PREVIEW_HEIGHT; y++) {
      for (let x = 0; x < PREVIEW_WIDTH; x++) {
        if (field.getLevel(x, y) > 0) expect(field.getFluidId(x, y)).toBe(1);
        total += field.getLevel(x, y);
      }
    }
    expect(total).toBeCloseTo(scene.stats().volume, 1);
    expect(total).toBeGreaterThan(0);
  });
});
