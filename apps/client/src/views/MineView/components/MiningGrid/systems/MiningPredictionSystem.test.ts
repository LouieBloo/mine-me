import { describe, it, expect, vi } from 'vitest';
import { MiningPlayerBody, MiningTileType, MINING_CONFIG, type MiningClientTile, type MiningInputState } from '@mine-me/shared';
import { MiningPredictionSystem } from './MiningPredictionSystem';
import { MiningPredictionState } from './MiningPredictionState';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

const idle: MiningInputState = { up: false, down: false, left: false, right: false, jump: false, miningKey: false, sequence: 0 };

function hall(): MiningClientTile[][] {
  return Array.from({ length: MINING_CONFIG.GRID_HEIGHT }, (_, y) =>
    Array.from({ length: MINING_CONFIG.GRID_WIDTH }, () => ({
      type: y >= 21 ? MiningTileType.ROCK : MiningTileType.EMPTY,
      revealed: true,
    }))
  );
}

const setup = () => {
  const body = new MiningPlayerBody({ x: 10.5, y: 20.5 });
  body.isGrounded = true;
  const prediction = new MiningPredictionState(body, idle);
  const container: any = { x: 0, y: 0 };
  const currentPos = { x: 10.5, y: 20.5 };
  const ctx = (inputs: MiningInputState) => ({
    playerBody: body, prediction, grid: hall(), inputs, targetPos: { x: 10.5, y: 20.5 }, currentPos,
    playerContainer: container, soundManager: { setListenerPosition: vi.fn() } as any,
  });
  return { body, prediction, container, currentPos, ctx };
};

describe('MiningPredictionSystem', () => {
  it('moves the sprite with the predicted body, in pixels', () => {
    const { ctx, container, currentPos } = setup();
    const walking = { ...idle, right: true, sequence: 1 };
    for (let i = 0; i < 10; i++) MiningPredictionSystem.update(ctx(walking), 1 / 30);
    expect(currentPos.x).toBeGreaterThan(10.5);
    expect(container.x).toBeCloseTo(currentPos.x * TILE_SIZE, 6);
    expect(container.y).toBeCloseTo(currentPos.y * TILE_SIZE, 6);
  });

  it('steps at the server rate whatever the frame rate is', () => {
    const { ctx, prediction } = setup();
    for (let i = 0; i < 120; i++) MiningPredictionSystem.update(ctx(idle), 1 / 120); // 1 second at 120 fps
    expect(prediction.predictor.steps).toBe(30);
  });

  it('feeds the newest server snapshot to the predictor exactly once, and corrects a mismatch', () => {
    const { ctx, prediction, body } = setup();
    for (let i = 0; i < 6; i++) MiningPredictionSystem.update(ctx(idle), 1 / 30);
    const spy = vi.spyOn(prediction.predictor, 'reconcile');
    prediction.offer({
      tick: 3, position: { x: body.position.x + 0.4, y: body.position.y }, velocity: { x: 0, y: 0 },
      ackSequence: 0, ackAge: 3,
      bodyState: { isGrounded: true, isOnLadder: false, knockbackRemaining: 0 },
    } as any);
    MiningPredictionSystem.update(ctx(idle), 1 / 30);
    MiningPredictionSystem.update(ctx(idle), 1 / 30);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(prediction.predictor.correctionCount).toBe(1);
  });

  it('falls back to easing toward the server position before the predictor is ready', () => {
    const container: any = { x: 0, y: 0 };
    const currentPos = { x: 0, y: 0 };
    MiningPredictionSystem.update(
      { playerBody: null, prediction: null, grid: null, inputs: idle, targetPos: { x: 10, y: 5 }, currentPos, playerContainer: container },
      1 / 30
    );
    expect(currentPos.x).toBeGreaterThan(0);
    expect(currentPos.x).toBeLessThanOrEqual(10);
    expect(container.x).toBeCloseTo(currentPos.x * TILE_SIZE, 6);
  });
});

describe('MiningPredictionState', () => {
  it('keeps only the newest snapshot and hands it out once', () => {
    const body = new MiningPlayerBody({ x: 1, y: 1 });
    const state = new MiningPredictionState(body, idle);
    const payload = (tick: number) => ({
      tick, position: { x: tick, y: 0 }, velocity: { x: 0, y: 0 }, ackSequence: 0, ackAge: tick,
      bodyState: { isGrounded: true, isOnLadder: false, knockbackRemaining: 0.2 },
    }) as any;
    state.offer(payload(1));
    state.offer(payload(2));
    const snap = state.takeSnapshot();
    expect(snap).toMatchObject({ tick: 2, ackAge: 2, isGrounded: true, knockbackRemaining: 0.2 });
    expect(state.takeSnapshot()).toBeNull();
  });
});
