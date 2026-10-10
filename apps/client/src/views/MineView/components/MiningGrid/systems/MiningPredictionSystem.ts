import type { Container } from 'pixi.js';
import type { Vector2D, MiningInputState, MiningPlayerBody, MiningClientTile } from '@mine-me/shared';
import type { SoundManager } from '../../../../../services/sound';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';
import { miningProfiler } from '../utils/MiningProfiler';
import type { MiningPredictionState } from './MiningPredictionState';

export interface MiningPredictionContext {
  playerBody: MiningPlayerBody | null;
  prediction: MiningPredictionState | null;
  grid: MiningClientTile[][] | null;
  inputs: MiningInputState;
  targetPos: Vector2D;
  currentPos: Vector2D;
  playerContainer: Container;
  soundManager?: SoundManager | null;
}

export class MiningPredictionSystem {
  /**
   * Advances the local player and positions its sprite. With a predictor the body runs at the
   * server's fixed rate, replays on the server's corrections, and is drawn interpolated; without
   * one (or before the grid arrives) the sprite just eases toward the last server position.
   */
  public static update(ctx: MiningPredictionContext, frameSeconds: number): void {
    const { playerBody, prediction, grid, inputs, targetPos, currentPos, playerContainer, soundManager } = ctx;

    if (playerBody && prediction && grid) {
      miningProfiler.startSection('Physics');
      const predictor = prediction.predictor;
      predictor.setInput(inputs);

      miningProfiler.startSection('Reconciliation');
      const snapshot = prediction.takeSnapshot();
      if (snapshot) predictor.reconcile(snapshot, grid);

      predictor.advance(frameSeconds, grid);
      const drawn = predictor.renderPosition();

      soundManager?.setListenerPosition(playerBody.position);
      currentPos.x = drawn.x;
      currentPos.y = drawn.y;
      playerContainer.x = drawn.x * TILE_SIZE;
      playerContainer.y = drawn.y * TILE_SIZE;
    } else {
      // Fallback smooth factor if the predictor is not ready yet
      const smoothFactor = Math.min(1.0, 1 - Math.exp(-32 * frameSeconds));
      currentPos.x += (targetPos.x - currentPos.x) * smoothFactor;
      currentPos.y += (targetPos.y - currentPos.y) * smoothFactor;
      playerContainer.x = currentPos.x * TILE_SIZE;
      playerContainer.y = currentPos.y * TILE_SIZE;
    }
  }
}
