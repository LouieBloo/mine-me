import {
  PlayerPredictor,
  type MiningInputState,
  type MiningPlayerBody,
  type MiningStateTickPayload,
  type ServerPlayerSnapshot,
} from '@mine-me/shared';

/**
 * Everything the local player's prediction needs, in one object that the input, network and frame
 * loops share: the predictor itself and the newest server snapshot waiting to be reconciled.
 */
export class MiningPredictionState {
  public readonly predictor: PlayerPredictor;
  /** The newest unprocessed server snapshot (older ones are superseded: acks are cumulative). */
  public latestSnapshot: ServerPlayerSnapshot | null = null;

  constructor(body: MiningPlayerBody, initialInput: MiningInputState) {
    this.predictor = new PlayerPredictor(body, initialInput);
  }

  /** Called for every server tick payload. */
  public offer(payload: MiningStateTickPayload): void {
    this.latestSnapshot = {
      tick: payload.tick,
      position: payload.position,
      velocity: payload.velocity,
      ackSequence: payload.ackSequence,
      ackAge: payload.ackAge,
      isGrounded: payload.bodyState?.isGrounded,
      isOnLadder: payload.bodyState?.isOnLadder,
      knockbackRemaining: payload.bodyState?.knockbackRemaining,
    };
  }

  /** Hands out the pending snapshot once. */
  public takeSnapshot(): ServerPlayerSnapshot | null {
    const snapshot = this.latestSnapshot;
    this.latestSnapshot = null;
    return snapshot;
  }
}
