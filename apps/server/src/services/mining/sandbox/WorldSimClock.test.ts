import { describe, it, expect } from 'vitest';
import { WorldSimClock } from './WorldSimClock';

const run = (clock: WorldSimClock, beats: number) => {
  let total = 0;
  for (let i = 0; i < beats; i++) total += clock.stepsForTick(true);
  return total;
};

describe('WorldSimClock', () => {
  it('runs one step per beat at normal speed and none between beats', () => {
    const clock = new WorldSimClock();
    expect(clock.stepsForTick(true)).toBe(1);
    expect(clock.stepsForTick(false)).toBe(0);
  });

  it('runs faster and slower speeds as an average', () => {
    const fast = new WorldSimClock();
    fast.speed = 4;
    expect(run(fast, 10)).toBe(40);
    const slow = new WorldSimClock();
    slow.speed = 0.25;
    expect(run(slow, 8)).toBe(2);
    const half = new WorldSimClock();
    half.speed = 0.5;
    expect([1, 2, 3, 4].map(() => half.stepsForTick(true))).toEqual([0, 1, 0, 1]);
  });

  it('runs nothing while paused except requested steps', () => {
    const clock = new WorldSimClock();
    clock.paused = true;
    expect(run(clock, 5)).toBe(0);
    clock.requestStep();
    clock.requestStep();
    expect(clock.stepsForTick(false)).toBe(2);
    expect(clock.stepsForTick(false)).toBe(0);
  });

  it('forgets stray step requests made while running', () => {
    const clock = new WorldSimClock();
    clock.requestStep();
    expect(clock.stepsForTick(true)).toBe(1);
    clock.paused = true;
    expect(clock.stepsForTick(false)).toBe(0);
  });

  it('only accepts the offered speeds', () => {
    for (const ok of [0.25, 0.5, 1, 2, 4]) expect(WorldSimClock.isValidSpeed(ok)).toBe(true);
    for (const bad of [0, 3, -1, NaN, '2', undefined]) expect(WorldSimClock.isValidSpeed(bad)).toBe(false);
  });
});
