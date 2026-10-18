import { describe, it, expect } from 'vitest';
import { FluidField, MINING_TILE_PIXELS, MiningRigidWorld, applyFluidForces, quantizeFluidLevel, type FluidEnvironment } from '../src/index';

const FLOOR_Y = 24;
/** Half the height of a dropped item (32px) in tiles: where its centre rests above the floor. */
const ITEM_HALF = 16 / MINING_TILE_PIXELS;

/** A 40x26 mine with a solid floor on row 24 and a pool of fluid (rows 12..23, x 8..17); the same pool the original 20x13 mine had, in smaller blocks. */
function setup(fluidDensity: number, viscosity: number) {
  const rigid = new MiningRigidWorld({ width: 40, height: 26 });
  for (let x = 0; x < 40; x++) rigid.addTileCollider(x, FLOOR_Y);
  const field = new FluidField(40, 26);
  for (let y = 12; y <= 23; y++) for (let x = 8; x <= 17; x++) field.set(x, y, 1, quantizeFluidLevel(1));
  const environment: FluidEnvironment = {
    sampler: field,
    propertiesOf: (id) => (id === 1 ? { viscosity, density: fluidDensity } : undefined),
  };
  const run = (seconds: number, forces = true) => {
    for (let i = 0; i < seconds * 30; i++) {
      if (forces) applyFluidForces(rigid.world, environment);
      rigid.step(1 / 30);
    }
  };
  return { rigid, field, environment, run };
}

describe('applyFluidForces', () => {
  it('floats a body lighter than the fluid up to the surface', () => {
    const { rigid, run } = setup(1.0, 0.5);
    const body = rigid.createItemBody('light', { x: 13, y: 20 }, undefined, { density: 0.3 });
    run(4);
    // Surface of the pool is at y=12; a floating box bobs around there (the pool is 12 deep), nowhere near the floor
    expect(body.getPosition().y).toBeLessThan(16);
    expect(body.getPosition().y).toBeGreaterThan(6);
  });

  it('sinks a body heavier than the fluid to the floor', () => {
    const { rigid, run } = setup(1.0, 0.5);
    const body = rigid.createItemBody('heavy', { x: 13, y: 13 }, undefined, { density: 4 });
    run(5);
    expect(body.getPosition().y).toBeGreaterThan(FLOOR_Y - ITEM_HALF - 0.3);
  });

  it('sinks more slowly in fluid than in air', () => {
    const wet = setup(1.0, 0.5);
    const dry = setup(1.0, 0.5);
    const inFluid = wet.rigid.createItemBody('a', { x: 13, y: 12.4 }, undefined, { density: 4 });
    const inAir = dry.rigid.createItemBody('b', { x: 27, y: 12.4 }, undefined, { density: 4 });
    wet.run(0.5);
    dry.run(0.5);
    expect(inFluid.getPosition().y - 12.4).toBeLessThan(inAir.getPosition().y - 12.4);
  });

  it('a more viscous fluid brakes a falling body more', () => {
    const thin = setup(0.5, 0.1);
    const thick = setup(0.5, 1.0);
    const a = thin.rigid.createItemBody('a', { x: 13, y: 12.4 }, undefined, { density: 4 });
    const b = thick.rigid.createItemBody('b', { x: 13, y: 12.4 }, undefined, { density: 4 });
    thin.run(0.6);
    thick.run(0.6);
    expect(b.getPosition().y).toBeLessThan(a.getPosition().y);
  });

  it('does nothing to a body outside the fluid', () => {
    const { rigid, environment, run } = setup(1.0, 0.5);
    const body = rigid.createItemBody('dry', { x: 29, y: 6 }, undefined, { density: 0.3 });
    expect(applyFluidForces(rigid.world, environment)).toBe(0);
    run(0.5);
    expect(body.getPosition().y).toBeGreaterThan(7); // still falling like normal
  });

  it('acts on rocks and dynamite as well as items, but not on tile colliders', () => {
    const { rigid, environment } = setup(1.0, 0.5);
    rigid.createItemBody('i', { x: 11, y: 16 });
    rigid.createRockBody('r', { x: 13, y: 16 });
    rigid.createDynamiteBody('d', { x: 15, y: 16 }, { x: 0, y: 0 });
    expect(applyFluidForces(rigid.world, environment)).toBe(3);
  });

  it('ignores a fluid it has no properties for and a body with no density', () => {
    const { rigid, field } = setup(1.0, 0.5);
    rigid.createItemBody('i', { x: 13, y: 16 });
    const unknown: FluidEnvironment = { sampler: field, propertiesOf: () => undefined };
    expect(applyFluidForces(rigid.world, unknown)).toBe(0);
  });

  it('keeps a body in fluid awake so it reacts when the fluid changes', () => {
    const { rigid, run } = setup(1.0, 0.5);
    const body = rigid.createItemBody('heavy', { x: 13, y: 23 }, undefined, { density: 4 });
    run(4);
    expect(body.isAwake()).toBe(true);
  });

  it('with no forces applied, the same body just falls (the forces are what make the difference)', () => {
    const { rigid, run } = setup(1.0, 0.5);
    const body = rigid.createItemBody('light', { x: 13, y: 20 }, undefined, { density: 0.3 });
    run(2, false);
    expect(body.getPosition().y).toBeGreaterThan(FLOOR_Y - ITEM_HALF - 0.3);
  });
});
