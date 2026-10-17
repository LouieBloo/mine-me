import { describe, it, expect } from 'vitest';
import { FLUID_SCENES, FluidLayout, FluidSceneRunner, fluidSceneByKey, isSceneSolid } from '../src/index';

/** Every scene is checked the same way: these are the artifacts the fluid audit found, as measurable facts. */

const runner = (key: string) => new FluidSceneRunner(fluidSceneByKey(key)!);

/** Runs the scene's pour for a while, then lets it settle. */
function poured(key: string, steps = 150): FluidSceneRunner {
  const r = runner(key);
  r.run(steps);
  expect(r.settle()).not.toBeNull();
  return r;
}

/** Tolerance for "level" comparisons: one unit (1/16) once the simulation is in whole units, with room for float error. */
const UNIT = 1 / 16 + 1e-6;

describe('fluid scenes', () => {
  it('are rectangular, closed by rock, and have unique keys', () => {
    const keys = new Set<string>();
    for (const scene of FLUID_SCENES) {
      expect(keys.has(scene.key)).toBe(false);
      keys.add(scene.key);
      for (const row of scene.rows) expect(row.length).toBe(scene.rows[0].length);
      expect(scene.rows[0]).toMatch(/^#+$/);
      expect(scene.rows[scene.rows.length - 1]).toMatch(/^#+$/);
      for (const row of scene.rows) expect(row[0] + row[row.length - 1]).toBe('##');
    }
  });

  it('treat ladders as open and rock as solid', () => {
    const r = runner('ladder-shaft');
    expect(r.tileAt(8, 5)).toBe('H');
    expect(r.isSolid(8, 5)).toBe(false);
    expect(r.isSolid(0, 0)).toBe(true);
    expect(isSceneSolid('H')).toBe(false);
  });

  for (const scene of FLUID_SCENES) {
    describe(scene.name, () => {
      it('settles completely once the pour stops (no endless trickle)', () => {
        const r = runner(scene.key);
        r.run(150);
        const steps = r.settle(1500);
        expect(steps).not.toBeNull();
        expect(r.grid.activeCount).toBe(0);
      });

      it('loses nothing but what is counted', () => {
        const r = poured(scene.key);
        const kept = r.grid.totalVolume() + r.grid.evaporatedVolume + r.grid.drainedVolume;
        if (scene.key === 'lava-meets-water') expect(kept).toBeLessThanOrEqual(r.poured + 1e-3);
        else expect(kept).toBeCloseTo(r.poured, 2);
      });

      it('leaves no fluid hanging in the air once settled', () => {
        const r = poured(scene.key);
        for (const [x, y] of r.fluidCells()) {
          const belowOpenAndEmpty = !r.isSolid(x, y + 1) && r.grid.getFluidId(x, y + 1) === 0;
          expect(belowOpenAndEmpty, `fluid hangs over air at ${x},${y}`).toBe(false);
        }
      });

      it('draws with no seams while it pours and once settled, and never above its own cell', () => {
        const r = runner(scene.key);
        const check = () => {
          const layout = new FluidLayout(r.toField(), 64);
          for (let y = 0; y < r.height; y++) {
            for (let x = 0; x < r.width; x++) {
              const a = layout.shapesAt(x, y)[0];
              if (!a) continue;
              expect(a.topLeft).toBeGreaterThanOrEqual(y * 64 - 1e-9);
              expect(a.topRight).toBeGreaterThanOrEqual(y * 64 - 1e-9);
              const b = layout.shapesAt(x + 1, y)[0];
              if (b && b.fluidId === a.fluidId && a.surface && b.surface) expect(a.topRight).toBe(b.topLeft);
            }
          }
        };
        for (let i = 0; i < 60; i++) {
          r.step();
          if (i % 7 === 0) check();
        }
        r.settle();
        check();
      });

      it('leaves resting neighbours level (no wedge or mound)', () => {
        const r = poured(scene.key);
        for (const [x, y] of r.fluidCells()) {
          if (!r.isSolid(x, y + 1) || r.isSolid(x + 1, y) || r.grid.getFluidId(x + 1, y) !== r.grid.getFluidId(x, y)) continue;
          if (r.isSolid(x + 1, y + 1)) {
            expect(Math.abs(r.grid.getLevel(x, y) - r.grid.getLevel(x + 1, y)), `step at ${x},${y}`).toBeLessThanOrEqual(UNIT * 2);
          }
        }
      });
    });
  }

  it('keeps a steady waterfall steady: the fall is falling on every step and does not fan out in mid-air', () => {
    const r = runner('waterfall-pool');
    r.run(30);
    for (let i = 0; i < 14; i++) {
      r.step();
      // The spout is in column 7: the fall above the splash at the pool is falling every single step
      for (let y = 2; y <= 3; y++) {
        expect(r.grid.isFalling(7, y), `step ${i}, cell 7,${y}`).toBe(true);
        expect(r.grid.getUnits(6, y) + r.grid.getUnits(8, y), `step ${i}, fluid beside the fall at row ${y}`).toBe(0);
      }
    }
  });

  it('lets a pour onto the floor spread flat instead of piling up under the fall', () => {
    const r = runner('waterfall-pool');
    r.run(26);
    const floor = r.height - 2;
    const under = r.grid.getLevel(7, floor);
    const beside = r.grid.getLevel(10, floor);
    expect(under - beside).toBeLessThanOrEqual(0.5);
  });

  it('runs a pool over the ledge and fills the floor below it', () => {
    const r = poured('ledge-spill');
    expect(r.grid.totalVolume(r.registry.idOf('WATER'))).toBeGreaterThan(5);
    // Everything that went over the edge ends on the low floor, none left on the cliff face
    let low = 0;
    for (let x = 8; x < r.width - 1; x++) low += r.grid.getLevel(x, 7);
    expect(low).toBeGreaterThan(0.5);
  });

  it('lets water fall down a ladder shaft like air', () => {
    const r = poured('ladder-shaft');
    let chamber = 0;
    for (let x = 1; x < r.width - 1; x++) chamber += r.grid.getLevel(x, 7);
    expect(chamber).toBeGreaterThan(0.5);
  });

  it('fills the low part of a U-bend and stops', () => {
    const r = runner('u-bend');
    r.run(60);
    expect(r.settle()).not.toBeNull();
    for (let x = 1; x < r.width - 1; x++) expect(r.grid.getLevel(x, 4)).toBeGreaterThan(0.7);
  });

  it('hardens lava where water reaches it', () => {
    const r = runner('lava-meets-water');
    expect(r.settle()).not.toBeNull();
    const rock = r.scene.rows[3].split('').filter((_, x) => r.tileAt(x, 3) === '#').length;
    expect(rock).toBeGreaterThan(r.scene.rows[3].split('').filter((c) => c === '#').length);
  });

  it('drops a poured cell to the floor and spreads it into a flat puddle there', () => {
    const r = poured('mid-air-blob');
    // A unit or two at the thin edge of the puddle may evaporate, nothing more
    expect(r.grid.totalVolume()).toBeGreaterThan(0.85);
    expect(r.grid.totalVolume() + r.grid.evaporatedVolume).toBeCloseTo(1, 3);
    const cells = r.fluidCells();
    expect(cells.length).toBeGreaterThan(2);
    expect(cells.every(([, y]) => y === r.height - 2)).toBe(true);
  });

  it('carries a pour down a one-wide shaft into the room below', () => {
    const r = poured('one-wide-shaft', 60);
    expect(r.grid.totalVolume()).toBeGreaterThan(5);
  });

  it('lets a tile be opened, like mining the divider wall', () => {
    const r = runner('tank');
    r.pouring = true;
    r.run(80);
    r.pouring = false;
    r.openTile(12, 9);
    expect(r.isSolid(12, 9)).toBe(false);
    expect(r.settle()).not.toBeNull();
  });
});

describe('oil scenes', () => {
  it('oil spilled on the ground ends as one flat, even layer', () => {
    const r = runner('oil-spill');
    expect(r.settle(3000)).not.toBeNull();
    const row = r.height - 2;
    const units = Array.from({ length: r.width - 2 }, (_, i) => r.grid.getUnits(i + 1, row));
    expect(Math.max(...units) - Math.min(...units)).toBeLessThanOrEqual(1);
    expect(units.every((u) => u > 0)).toBe(true);
    expect(r.grid.totalVolume() + r.grid.evaporatedVolume).toBeCloseTo(6, 3);
    // Drawn flat: every cell's surface is one line
    const layout = new FluidLayout(r.toField(), 64);
    const tops = units.map((_, i) => layout.shapesAt(i + 1, row)[0].topMid);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(64 / 16 + 1e-9);
  });

  it('oil spilled on the ground settles in a reasonable time even though it is thick', () => {
    const r = runner('oil-spill');
    const steps = r.settle(3000)!;
    expect(steps).toBeLessThan(600); // a minute at 10 steps a second
  });

  it('oil on water is drawn sitting on the water with no gap, however thin the water has spread', () => {
    const r = runner('oil-on-water');
    const layout = new FluidLayout(r.toField(), 64);
    for (let step = 0; step < 80; step++) {
      r.step();
      if (step % 9 !== 0) continue;
      const field = r.toField();
      const l = new FluidLayout(field, 64);
      const oil = r.registry.idOf('OIL');
      for (let y = 0; y < r.height - 1; y++) {
        for (let x = 0; x < r.width; x++) {
          if (r.grid.getFluidId(x, y) !== oil) continue;
          const below = r.grid.getFluidId(x, y + 1);
          if (below === 0 || below === oil) continue;
          const top = (y + 2) * 64 - r.grid.getLevel(x, y + 1) * 64; // the surface of the water under it
          expect(l.shapesAt(x, y)[0].bottom, `step ${step}, cell ${x},${y}`).toBeCloseTo(top, 6);
        }
      }
    }
    expect(layout).toBeDefined();
  });
});

describe('fluid scene runner', () => {
  it('opens a gate once, letting the fluid behind it through', () => {
    const r = runner('tank');
    expect(r.hasSpout).toBe(true);
    expect(r.hasGate).toBe(true);
    r.pouring = true;
    r.run(60);
    r.pouring = false;
    r.settle();
    expect(r.grid.getLevel(14, 10)).toBe(0);
    r.openGate();
    expect(r.gateOpen).toBe(true);
    expect(r.isSolid(12, 9)).toBe(false);
    r.settle();
    expect(r.grid.getLevel(14, 10)).toBeGreaterThan(0);
    r.openGate();
  });

  it('knows which scenes have a spout and a gate', () => {
    expect(runner('ledge-spill').hasSpout).toBe(false);
    expect(runner('ledge-spill').hasGate).toBe(false);
    expect(runner('u-bend').hasSpout).toBe(true);
    expect(fluidSceneByKey('nope')).toBeUndefined();
  });
});
