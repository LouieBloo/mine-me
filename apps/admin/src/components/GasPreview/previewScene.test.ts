import { describe, it, expect } from 'vitest';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, PreviewScene, RELEASE_RATE, SPOUT, VENT } from './previewScene';

const HYDROGEN = { density: 0.07, diffusionRate: 0.35, minConcentration: 0.02, ventLifetime: 6 };
const NITROGEN = { density: 1.15, diffusionRate: 0.25, minConcentration: 0.02, ventLifetime: 6 };
const STEP = 0.1;

const run = (scene: PreviewScene, steps: number) => {
  for (let n = 0; n < steps; n++) scene.step();
};
/** Concentration summed per row. */
const rows = (scene: PreviewScene) =>
  Array.from({ length: PREVIEW_HEIGHT }, (_, y) => Array.from({ length: PREVIEW_WIDTH }, (_, x) => scene.concentrationAt(x, y)).reduce((a, b) => a + b, 0));
/** The row (from the top) that holds the centre of the gas. */
const centreRow = (scene: PreviewScene) => {
  const r = rows(scene);
  const total = r.reduce((a, b) => a + b, 0);
  return r.reduce((sum, v, y) => sum + v * y, 0) / total;
};

describe('PreviewScene', () => {
  it('starts as an empty, sealed box with solid walls and the gate shut', () => {
    const scene = new PreviewScene(HYDROGEN, STEP);
    expect(scene.stats()).toEqual({ volume: 0, vented: 0, activeCells: 0 });
    expect(scene.isSolid(0, 0)).toBe(true);
    expect(scene.isSolid(VENT.x, VENT.y)).toBe(true);
    expect(scene.isSolid(5, 5)).toBe(false);
    expect(scene.isSolid(-1, 3)).toBe(true);
    expect(scene.isOpenToSky(VENT.x, 5)).toBe(false);
    expect(scene.ventOpen).toBe(false);
  });

  it('does nothing until gas is released', () => {
    const scene = new PreviewScene(HYDROGEN, STEP);
    run(scene, 20);
    expect(scene.stats().volume).toBe(0);
  });

  it('releasing adds gas at the spout each step', () => {
    const scene = new PreviewScene(NITROGEN, STEP);
    scene.setReleasing(true);
    scene.step();
    expect(scene.stats().volume).toBeCloseTo(RELEASE_RATE, 5);
    expect(scene.concentrationAt(SPOUT.x, SPOUT.y)).toBeGreaterThan(0);
    scene.setReleasing(false);
    const before = scene.stats().volume;
    run(scene, 5);
    expect(scene.stats().volume).toBeLessThanOrEqual(before + 1e-6);
  });

  it('light gas collects high in the box and heavy gas low, with the real simulation', () => {
    const light = new PreviewScene(HYDROGEN, STEP);
    const heavy = new PreviewScene({ ...NITROGEN, density: 2.5 }, STEP);
    for (const scene of [light, heavy]) {
      scene.setReleasing(true);
      run(scene, 20);
      scene.setReleasing(false);
      run(scene, 150);
    }
    expect(centreRow(light)).toBeLessThan(PREVIEW_HEIGHT / 2);
    expect(centreRow(heavy)).toBeGreaterThan(PREVIEW_HEIGHT / 2);
  });

  it('opening the roof gate makes the column below it open to the sky, and the gas escapes and fades', () => {
    const scene = new PreviewScene(HYDROGEN, STEP);
    scene.setReleasing(true);
    run(scene, 20);
    scene.setReleasing(false);
    run(scene, 100);
    expect(scene.stats().vented).toBe(0);
    scene.openVent();
    expect(scene.ventOpen).toBe(true);
    expect(scene.isSolid(VENT.x, VENT.y)).toBe(false);
    expect(scene.isOpenToSky(VENT.x, 5)).toBe(true);
    run(scene, 600);
    expect(scene.stats().vented).toBeGreaterThan(1);
  });

  it('opening the gate twice changes nothing more', () => {
    const scene = new PreviewScene(HYDROGEN, STEP);
    scene.openVent();
    scene.openVent();
    expect(scene.isSolid(VENT.x, VENT.y)).toBe(false);
  });

  it('a longer open-air lifetime keeps the gas around longer', () => {
    const quick = new PreviewScene({ ...HYDROGEN, ventLifetime: 2 }, STEP);
    const slow = new PreviewScene({ ...HYDROGEN, ventLifetime: 30 }, STEP);
    for (const scene of [quick, slow]) {
      scene.openVent();
      scene.setReleasing(true);
      run(scene, 10);
      scene.setReleasing(false);
      run(scene, 150);
    }
    expect(slow.stats().volume).toBeGreaterThan(quick.stats().volume);
  });

  it('reset empties the box, shuts the gate and stops releasing', () => {
    const scene = new PreviewScene(HYDROGEN, STEP);
    scene.openVent();
    scene.setReleasing(true);
    run(scene, 10);
    scene.reset();
    expect(scene.stats()).toEqual({ volume: 0, vented: 0, activeCells: 0 });
    expect(scene.ventOpen).toBe(false);
    expect(scene.releasing).toBe(false);
    expect(scene.isSolid(VENT.x, VENT.y)).toBe(true);
  });
});
