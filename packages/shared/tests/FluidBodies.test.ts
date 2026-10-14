import { describe, it, expect } from 'vitest';
import { FluidField, MINING_CONFIG, MiningMobBody, MiningPlayerBody, MiningTileType, quantizeFluidLevel, type FluidEnvironment, type MiningInputState } from '../src/index';

const IDLE: MiningInputState = { left: false, right: false, up: false, down: false, jump: false, sequence: 0 } as MiningInputState;
const input = (over: Partial<MiningInputState>): MiningInputState => ({ ...IDLE, ...over });

/** Open cave rows 0..9, solid floor at row 10. */
const grid = () => {
  const g: Record<number, Record<number, { type: MiningTileType }>> = {};
  for (let y = 0; y <= 10; y++) {
    g[y] = {};
    for (let x = 0; x < 20; x++) g[y][x] = { type: y === 10 ? MiningTileType.DIRT : MiningTileType.EMPTY };
  }
  return g;
};

/** Oil (viscosity 0.6) filling rows 8 and 9 around x 4..6 (so a standing body is about 1.25 tiles deep in it). */
const oilEnvironment = (): FluidEnvironment => {
  const field = new FluidField(20, 11);
  for (let y = 8; y <= 9; y++) for (let x = 4; x <= 6; x++) field.set(x, y, 1, quantizeFluidLevel(1));
  return { sampler: field, propertiesOf: (id) => (id === 1 ? { viscosity: 0.6, density: 0.8 } : undefined) };
};

const standingAt = (x: number, env: FluidEnvironment | null) => {
  const body = new MiningPlayerBody({ x, y: 10 - 0.8 });
  body.isGrounded = true;
  body.fluidEnvironment = env;
  return body;
};

describe('a player wading through fluid', () => {
  it('walks at full speed when there is no fluid environment, or the fluid is elsewhere', () => {
    const dry = standingAt(10.5, oilEnvironment());
    dry.processInputs(input({ right: true }), grid());
    expect(dry.velocity.x).toBeCloseTo(MINING_CONFIG.MOVE_SPEED, 5);
    expect(dry.movementFactor).toBe(1);

    const none = standingAt(5.5, null);
    none.processInputs(input({ right: true }), grid());
    expect(none.velocity.x).toBeCloseTo(MINING_CONFIG.MOVE_SPEED, 5);
  });

  it('is slowed by the fluid\'s viscosity', () => {
    const body = standingAt(5.5, oilEnvironment());
    body.processInputs(input({ right: true }), grid());
    expect(body.movementFactor).toBeLessThan(0.6);
    expect(body.movementFactor).toBeGreaterThan(0.2);
    expect(body.velocity.x).toBeCloseTo(MINING_CONFIG.MOVE_SPEED * body.movementFactor, 5);
  });

  it('walking in shallow fluid is slowed less than in deep fluid', () => {
    const env = oilEnvironment();
    (env.sampler as FluidField).set(5, 8, 0, 0); // only one cell deep here
    const shallow = standingAt(5.5, env);
    shallow.processInputs(input({ right: true }), grid());
    const deep = standingAt(4.5, oilEnvironment());
    deep.processInputs(input({ right: true }), grid());
    expect(shallow.velocity.x).toBeGreaterThan(deep.velocity.x);
  });

  it('jumps lower, but loses less than it loses walking speed', () => {
    const dry = standingAt(10.5, oilEnvironment());
    dry.processInputs(input({ jump: true }), grid());
    const wet = standingAt(5.5, oilEnvironment());
    wet.processInputs(input({ jump: true }), grid());
    expect(wet.velocity.y).toBeGreaterThan(dry.velocity.y); // less negative = weaker
    expect(Math.abs(wet.velocity.y)).toBeCloseTo(Math.abs(dry.velocity.y) * Math.sqrt(wet.movementFactor), 5);
    expect(Math.abs(wet.velocity.y) / Math.abs(dry.velocity.y)).toBeGreaterThan(wet.movementFactor);
  });

  it('cannot move at all in a fluid with viscosity 1 at full depth, but is not stuck forever', () => {
    const env: FluidEnvironment = { sampler: (oilEnvironment().sampler), propertiesOf: () => ({ viscosity: 1, density: 1 }) };
    const field = env.sampler as FluidField;
    for (let y = 6; y <= 9; y++) field.set(5, y, 1, quantizeFluidLevel(1));
    const body = standingAt(5.5, env);
    body.processInputs(input({ right: true }), grid());
    expect(body.velocity.x).toBe(0);
    body.position = { x: 15.5, y: 10 - 0.8 };
    body.processInputs(input({ right: true }), grid());
    expect(body.velocity.x).toBeGreaterThan(0);
  });

  it('climbs a ladder more slowly in fluid', () => {
    const g = grid();
    for (let y = 5; y <= 9; y++) g[y][5] = { type: MiningTileType.LADDER };
    const body = standingAt(5.5, oilEnvironment());
    body.processInputs(input({ up: true }), g);
    expect(body.velocity.y).toBeCloseTo(-MINING_CONFIG.CLIMB_SPEED * body.movementFactor, 5);
    expect(Math.abs(body.velocity.y)).toBeLessThan(MINING_CONFIG.CLIMB_SPEED);
  });

  it('falls into fluid at a reduced top speed, but never below the minimum, and never at a standstill', () => {
    const g = grid();
    const body = new MiningPlayerBody({ x: 5.5, y: 4 });
    body.fluidEnvironment = oilEnvironment();
    // Drop it into the pool and let the cap act
    body.position = { x: 5.5, y: 8.6 };
    body.velocity = { x: 0, y: MINING_CONFIG.TERMINAL_FALL_SPEED };
    body.processInputs(IDLE, g);
    body.update(1 / 30, g);
    expect(body.velocity.y).toBeLessThanOrEqual(MINING_CONFIG.TERMINAL_FALL_SPEED * Math.max(MINING_CONFIG.FLUID_MIN_FALL_FACTOR, body.movementFactor) + 1e-9);
    expect(body.velocity.y).toBeLessThan(MINING_CONFIG.TERMINAL_FALL_SPEED);
    expect(body.velocity.y).toBeGreaterThan(0);
  });

  it('re-reads the fluid every step, even if nothing processed input (a mob that is not updated that tick)', () => {
    const g = grid();
    const body = new MiningPlayerBody({ x: 5.5, y: 8.6 });
    body.fluidEnvironment = oilEnvironment();
    body.movementFactor = 1; // stale: says dry
    body.velocity = { x: 0, y: MINING_CONFIG.TERMINAL_FALL_SPEED };
    body.update(1 / 30, g);
    expect(body.movementFactor).toBeLessThan(0.6);
    expect(body.velocity.y).toBeLessThan(MINING_CONFIG.TERMINAL_FALL_SPEED);
  });

  it('lands softer in fluid than in air from the same height (less fall damage)', () => {
    const drop = (env: FluidEnvironment | null, x: number) => {
      const g = grid();
      const body = new MiningPlayerBody({ x, y: 1 });
      body.fluidEnvironment = env;
      let worst = 0;
      for (let i = 0; i < 300 && !body.isGrounded; i++) {
        body.processInputs(IDLE, g);
        body.update(1 / 30, g);
        worst = Math.max(worst, body.lastImpactSpeed);
      }
      return worst;
    };
    const dry = drop(null, 5.5);
    const wet = drop(oilEnvironment(), 5.5);
    expect(dry).toBeGreaterThan(0);
    expect(wet).toBeLessThan(dry);
  });
});

describe('a mob wading through fluid', () => {
  const mob = (x: number, env: FluidEnvironment | null) => {
    const body = new MiningMobBody({ position: { x, y: 10 - 0.8 }, width: 0.6, height: 1.6 } as any);
    body.isGrounded = true;
    body.fluidEnvironment = env;
    return body;
  };

  it('is slowed like a player, and unaffected when dry', () => {
    const wet = mob(5.5, oilEnvironment());
    wet.processMovement(1, false, false, false, grid());
    const dry = mob(10.5, oilEnvironment());
    dry.processMovement(1, false, false, false, grid());
    expect(dry.velocity.x).toBeCloseTo(dry.moveSpeed, 5);
    expect(wet.velocity.x).toBeCloseTo(wet.moveSpeed * wet.movementFactor, 5);
    expect(wet.velocity.x).toBeLessThan(dry.velocity.x);
  });

  it('jumps lower in fluid', () => {
    const wet = mob(5.5, oilEnvironment());
    wet.processMovement(0, true, false, false, grid());
    const dry = mob(10.5, oilEnvironment());
    dry.processMovement(0, true, false, false, grid());
    expect(Math.abs(wet.velocity.y)).toBeLessThan(Math.abs(dry.velocity.y));
    expect(wet.velocity.y).toBeLessThan(0);
  });
});
