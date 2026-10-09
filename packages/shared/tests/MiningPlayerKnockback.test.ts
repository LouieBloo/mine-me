import { describe, it, expect } from 'vitest';
import { MiningPlayerBody, MINING_CONFIG, MiningTileType } from '../src';

const input = (over: any = {}) => ({ up: false, down: false, left: false, right: false, miningKey: false, sequence: 0, ...over });

// Open cavern with a solid floor at y=10 and a ladder column at x=5 (y 0..9)
const grid: any = {};
for (let y = 0; y < 12; y++) {
  grid[y] = {};
  for (let x = 0; x < 12; x++) {
    grid[y][x] = { type: y >= 10 ? MiningTileType.DIRT : x === 5 && y < 10 ? MiningTileType.LADDER : MiningTileType.EMPTY };
  }
}

const body = (x = 8.5, y = 9.5) => {
  const b = new MiningPlayerBody({ x, y });
  b.isGrounded = true;
  return b;
};

describe('MiningPlayerBody knockback', () => {
  it('launches the body and ungrounds it', () => {
    const b = body();
    b.applyKnockback(5, -4, 0.2);
    expect(b.velocity).toEqual({ x: 5, y: -4 });
    expect(b.isGrounded).toBe(false);
    expect(b.knockbackRemaining).toBeCloseTo(0.2);
  });

  it('ignores movement input while knocked back, then resumes', () => {
    const b = body();
    b.applyKnockback(5, -4, 0.2);
    b.processInputs(input({ left: true }), grid);
    expect(b.velocity.x).toBe(5); // not overridden by "left"
    b.update(0.25, grid);
    expect(b.knockbackRemaining).toBe(0);
    b.processInputs(input({ left: true }), grid);
    expect(b.velocity.x).toBe(-MINING_CONFIG.MOVE_SPEED);
  });

  it('moves the body away from the source', () => {
    const b = body();
    const startX = b.position.x;
    b.applyKnockback(5, -4, 0.2);
    b.processInputs(input(), grid);
    b.update(0.1, grid);
    expect(b.position.x).toBeGreaterThan(startX);
    expect(b.position.y).toBeLessThan(9.5);
  });

  it('lets go of a ladder and ignores climb input during knockback', () => {
    const b = body(5.5, 5.5);
    b.processInputs(input({ up: true }), grid);
    expect(b.isOnLadder).toBe(true);
    b.applyKnockback(-5, -4, 0.2);
    expect(b.isOnLadder).toBe(false);
    b.processInputs(input({ up: true }), grid);
    expect(b.hasGravity).toBe(true);
    expect(b.velocity.x).toBe(-5);
  });

  it('negative durations do not extend the lock', () => {
    const b = body();
    b.applyKnockback(1, 0, -3);
    expect(b.knockbackRemaining).toBe(0);
  });
});
