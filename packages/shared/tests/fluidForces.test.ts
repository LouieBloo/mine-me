import { describe, it, expect } from 'vitest';
import { FluidField, MiningRigidWorld, applyFluidForces, quantizeFluidLevel, type FluidEnvironment } from '../src/index';

const FLOOR_Y = 12;

/** A 20x13 mine with a solid floor on row 12 and a pool of fluid (rows 6..11, x 4..8). */
function setup(fluidDensity: number, viscosity: number) {
  const rigid = new MiningRigidWorld({ width: 20, height: 13 });
  for (let x = 0; x < 20; x++) rigid.addTileCollider(x, FLOOR_Y);
  const field = new FluidField(20, 13);
  for (let y = 6; y <= 11; y++) for (let x = 4; x <= 8; x++) field.set(x, y, 1, quantizeFluidLevel(1));
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
    const body = rigid.createItemBody('light', { x: 6.5, y: 10 }, undefined, { density: 0.3 });
    run(4);
    // Surface of the pool is at y=6; a floating box sits with its centre near there, nowhere near the floor
    expect(body.getPosition().y).toBeLessThan(7.2);
    expect(body.getPosition().y).toBeGreaterThan(5);
  });

  it('sinks a body heavier than the fluid to the floor', () => {
    const { rigid, run } = setup(1.0, 0.5);
    const body = rigid.createItemBody('heavy', { x: 6.5, y: 6.5 }, undefined, { density: 4 });
    run(5);
    expect(body.getPosition().y).toBeGreaterThan(FLOOR_Y - 0.4);
  });

  it('sinks more slowly in fluid than in air', () => {
    const wet = setup(1.0, 0.5);
    const dry = setup(1.0, 0.5);
    const inFluid = wet.rigid.createItemBody('a', { x: 6.5, y: 6.2 }, undefined, { density: 4 });
    const inAir = dry.rigid.createItemBody('b', { x: 13.5, y: 6.2 }, undefined, { density: 4 });
    wet.run(0.5);
    dry.run(0.5);
    expect(inFluid.getPosition().y - 6.2).toBeLessThan(inAir.getPosition().y - 6.2);
  });

  it('a more viscous fluid brakes a falling body more', () => {
    const thin = setup(0.5, 0.1);
    const thick = setup(0.5, 1.0);
    const a = thin.rigid.createItemBody('a', { x: 6.5, y: 6.2 }, undefined, { density: 4 });
    const b = thick.rigid.createItemBody('b', { x: 6.5, y: 6.2 }, undefined, { density: 4 });
    thin.run(0.6);
    thick.run(0.6);
    expect(b.getPosition().y).toBeLessThan(a.getPosition().y);
  });

  it('does nothing to a body outside the fluid', () => {
    const { rigid, environment, run } = setup(1.0, 0.5);
    const body = rigid.createItemBody('dry', { x: 14.5, y: 3 }, undefined, { density: 0.3 });
    expect(applyFluidForces(rigid.world, environment)).toBe(0);
    run(0.5);
    expect(body.getPosition().y).toBeGreaterThan(3.5); // still falling like normal
  });

  it('acts on rocks and dynamite as well as items, but not on tile colliders', () => {
    const { rigid, environment } = setup(1.0, 0.5);
    rigid.createItemBody('i', { x: 5.5, y: 8 });
    rigid.createRockBody('r', { x: 6.5, y: 8 });
    rigid.createDynamiteBody('d', { x: 7.5, y: 8 }, { x: 0, y: 0 });
    expect(applyFluidForces(rigid.world, environment)).toBe(3);
  });

  it('ignores a fluid it has no properties for and a body with no density', () => {
    const { rigid, field } = setup(1.0, 0.5);
    rigid.createItemBody('i', { x: 6.5, y: 8 });
    const unknown: FluidEnvironment = { sampler: field, propertiesOf: () => undefined };
    expect(applyFluidForces(rigid.world, unknown)).toBe(0);
  });

  it('keeps a body in fluid awake so it reacts when the fluid changes', () => {
    const { rigid, run } = setup(1.0, 0.5);
    const body = rigid.createItemBody('heavy', { x: 6.5, y: 11.5 }, undefined, { density: 4 });
    run(4);
    expect(body.isAwake()).toBe(true);
  });

  it('with no forces applied, the same body just falls (the forces are what make the difference)', () => {
    const { rigid, run } = setup(1.0, 0.5);
    const body = rigid.createItemBody('light', { x: 6.5, y: 10 }, undefined, { density: 0.3 });
    run(2, false);
    expect(body.getPosition().y).toBeGreaterThan(FLOOR_Y - 0.4);
  });
});
