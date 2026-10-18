import { describe, it, expect } from 'vitest';
import { MiningPlayerBody, MiningMobBody, PlayerPredictor, MINING_CONFIG, MiningTileType, type MiningInputState } from '../src';

const IDLE: MiningInputState = { left: false, right: false, up: false, down: false, jump: false, sequence: 0 } as MiningInputState;
const RIGHT: MiningInputState = { ...IDLE, right: true, sequence: 1 } as MiningInputState;

const FLOOR = 10; // the first solid row; a body standing on it has its feet at y = 10

/** Open cave (rows 0..9) over a solid floor (rows 10..13), 30 wide. */
const makeGrid = () => {
  const g: Record<number, Record<number, { type: MiningTileType }>> = {};
  for (let y = 0; y <= 13; y++) {
    g[y] = {};
    for (let x = 0; x < 30; x++) g[y][x] = { type: y >= FLOOR ? MiningTileType.DIRT : MiningTileType.EMPTY };
  }
  return g;
};
const solid = (g: ReturnType<typeof makeGrid>, x: number, y: number) => { g[y][x] = { type: MiningTileType.DIRT }; };

const standing = (x: number) => {
  const body = new MiningPlayerBody({ x, y: FLOOR - MINING_CONFIG.PLAYER_COLLIDER_HEIGHT_TILES / 2 });
  body.isGrounded = true;
  return body;
};
const walk = (body: MiningPlayerBody, grid: ReturnType<typeof makeGrid>, steps: number) => {
  for (let i = 0; i < steps; i++) {
    body.processInputs(RIGHT, grid);
    body.update(1 / 30, grid);
  }
};

describe('stepping up small ledges', () => {
  it('walks up a ledge one cell high without jumping', () => {
    const grid = makeGrid();
    for (let x = 12; x < 30; x++) solid(grid, x, FLOOR - 1); // a one-cell step up onto a long ledge
    const body = standing(10);
    walk(body, grid, 30);
    expect(body.position.x).toBeGreaterThan(13);
    expect(body.position.y).toBeCloseTo(FLOOR - 1 - MINING_CONFIG.PLAYER_COLLIDER_HEIGHT_TILES / 2, 3);
    expect(body.isGrounded).toBe(true);
  });

  it('climbs a staircase of one-cell steps', () => {
    const grid = makeGrid();
    // Steps two cells long, each one cell higher than the last, the top one running on to the end of the cave
    for (let x = 12; x < 30; x++) for (let h = 1; h <= Math.min(4, Math.floor((x - 12) / 2) + 1); h++) solid(grid, x, FLOOR - h);
    const body = standing(10);
    walk(body, grid, 40);
    expect(body.position.x).toBeGreaterThan(20);
    expect(body.position.y).toBeCloseTo(FLOOR - 4 - MINING_CONFIG.PLAYER_COLLIDER_HEIGHT_TILES / 2, 3);
  });

  it('still stops at a wall two cells high', () => {
    const grid = makeGrid();
    solid(grid, 12, FLOOR - 1);
    solid(grid, 12, FLOOR - 2);
    const body = standing(10);
    walk(body, grid, 30);
    expect(body.position.x).toBeLessThanOrEqual(12 - body.halfWidth + 1e-6);
    expect(body.position.y).toBeCloseTo(FLOOR - MINING_CONFIG.PLAYER_COLLIDER_HEIGHT_TILES / 2, 3);
  });

  it('does not step up where the low ceiling leaves no room for the whole body', () => {
    const grid = makeGrid();
    solid(grid, 12, FLOOR - 1);
    for (let x = 11; x <= 14; x++) solid(grid, x, FLOOR - 3); // a ceiling only 2 cells above the floor: too low once lifted
    const body = standing(9);
    walk(body, grid, 30);
    expect(body.position.x).toBeLessThanOrEqual(12 - body.halfWidth + 1e-6);
  });

  it('does not pull a body up a ledge from the air', () => {
    const grid = makeGrid();
    solid(grid, 12, FLOOR - 1);
    const body = standing(10);
    body.position.y -= 3;
    body.isGrounded = false;
    body.velocity.y = 0;
    body.processInputs(RIGHT, grid);
    body.update(1 / 30, grid);
    expect(body.stepUpLift).toBe(0);
  });

  it('applies to mobs as well as players', () => {
    const grid = makeGrid();
    solid(grid, 12, FLOOR - 1);
    const mob = new MiningMobBody({ position: { x: 10, y: FLOOR - MINING_CONFIG.PLAYER_COLLIDER_HEIGHT_TILES / 2 }, moveSpeed: 6 });
    mob.isGrounded = true;
    for (let i = 0; i < 30; i++) {
      mob.processMovement(1, false, false, false, grid);
      mob.update(1 / 30, grid);
    }
    expect(mob.position.x).toBeGreaterThan(13);
  });

  it('is switched off by a step height of 0 (mutation check for the tests above)', () => {
    const config = MINING_CONFIG as { MAX_STEP_UP_TILES: number };
    const saved = config.MAX_STEP_UP_TILES;
    config.MAX_STEP_UP_TILES = 0;
    try {
      const grid = makeGrid();
      solid(grid, 12, FLOOR - 1);
      const body = standing(10);
      walk(body, grid, 30);
      expect(body.position.x).toBeLessThanOrEqual(12 - body.halfWidth + 1e-6);
    } finally {
      config.MAX_STEP_UP_TILES = saved;
    }
  });
});

describe('prediction and stepping up', () => {
  it('eases the drawn position up the ledge instead of popping, and server and client agree on where the body ends up', () => {
    const grid = makeGrid();
    solid(grid, 12, FLOOR - 1);
    const clientBody = standing(10);
    const predictor = new PlayerPredictor(clientBody, IDLE);
    predictor.setInput(RIGHT);
    const serverBody = standing(10);

    let maxJump = 0;
    let last = predictor.renderPosition().y;
    for (let i = 0; i < 40; i++) {
      predictor.advance(1 / 30, grid);
      const y = predictor.renderPosition().y;
      maxJump = Math.max(maxJump, Math.abs(y - last));
      last = y;
      serverBody.processInputs(RIGHT, grid);
      serverBody.update(1 / 30, grid);
    }
    expect(clientBody.position.x).toBeCloseTo(serverBody.position.x, 6);
    expect(clientBody.position.y).toBeCloseTo(serverBody.position.y, 6);
    // The body moved up by a whole cell in one step, but the drawn player never jumped by anything like that
    expect(maxJump).toBeLessThan(0.5);
  });
});
