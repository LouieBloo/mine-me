import type { Container } from 'pixi.js';
import type { Vector2D, MiningInputState, MiningPlayerBody, MiningClientTile } from '@mine-me/shared';
import type { SoundManager } from '../../../../../services/sound';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';
import { miningProfiler } from '../utils/MiningProfiler';

export interface MiningPredictionContext {
  playerBody: MiningPlayerBody | null;
  grid: MiningClientTile[][] | null;
  inputs: MiningInputState;
  targetPos: Vector2D;
  currentPos: Vector2D;
  playerContainer: Container;
  soundManager?: SoundManager | null;
}

export class MiningPredictionSystem {
  public static update(ctx: MiningPredictionContext, dt: number): void {
    const { playerBody, grid, inputs, targetPos, currentPos, playerContainer, soundManager } = ctx;

    if (playerBody && grid) {
      miningProfiler.startSection('Physics');
      // 1. Client-Side Prediction: step physics immediately on client frame with active inputs
      playerBody.processInputs(inputs, grid);
      playerBody.update(dt, grid);

      miningProfiler.startSection('Reconciliation');
      // 2. Server Reconciliation: gently nudge predicted position towards authoritative server position
      const errX = targetPos.x - playerBody.position.x;
      const errY = targetPos.y - playerBody.position.y;
      const distErr = Math.hypot(errX, errY);

      if (distErr > 1.2) {
        // Large mismatch (e.g. server collision snap or teleport): snap to server position
        playerBody.position.x = targetPos.x;
        playerBody.position.y = targetPos.y;
      } else {
        let reconcileX = errX;
        let reconcileY = errY;

        // When the player is colliding with a wall horizontally, the client is already flush against the wall surface.
        // Do NOT allow delayed server packets (which are trailing behind) to pull the player away from the wall.
        if (playerBody.collisionX) {
          if (inputs.right && errX < 0) {
            reconcileX = 0;
          } else if (inputs.left && errX > 0) {
            reconcileX = 0;
          }
        } else if ((inputs.left || inputs.right) && distErr < 0.8) {
          // While actively walking in open space, allow local prediction to lead without trailing server drag
          if (inputs.right && errX < 0) {
            reconcileX = 0;
          } else if (inputs.left && errX > 0) {
            reconcileX = 0;
          }
        }

        if (playerBody.isGrounded) {
          // When grounded, clamp small vertical drift to prevent sub-pixel floor fighting
          if (Math.abs(errY) < 0.05) {
            reconcileY = 0;
          }
        } else if (!playerBody.isOnLadder && Math.abs(errY) < 0.8) {
          // AIRBORNE (jumping or falling): suppress vertical reconciliation.
          reconcileY = 0;
        }

        const reconcileFactor = Math.min(1.0, 1 - Math.exp(-12 * dt));
        if (Math.abs(reconcileX) > 0.001) {
          playerBody.position.x += reconcileX * reconcileFactor;
        }
        if (Math.abs(reconcileY) > 0.001) {
          playerBody.position.y += reconcileY * reconcileFactor;
        }
      }
      soundManager?.setListenerPosition(playerBody.position);

      currentPos.x = playerBody.position.x;
      currentPos.y = playerBody.position.y;

      // Position player sprite in pixel world space
      playerContainer.x = playerBody.position.x * TILE_SIZE;
      playerContainer.y = playerBody.position.y * TILE_SIZE;
    } else {
      // Fallback smooth factor if playerBody not yet initialized
      const smoothFactor = Math.min(1.0, 1 - Math.exp(-32 * dt));
      const dx = targetPos.x - currentPos.x;
      currentPos.x += dx * smoothFactor;
      currentPos.y += (targetPos.y - currentPos.y) * smoothFactor;

      playerContainer.x = currentPos.x * TILE_SIZE;
      playerContainer.y = currentPos.y * TILE_SIZE;
    }
  }
}
