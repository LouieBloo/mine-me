import type { MiningInputState, Vector2D } from '../types/mining';
import type { MiningCollisionGrid } from './MiningPhysicsBody';
import type { MiningPlayerBody } from './MiningPlayerBody';

/** Everything about a player body that a step reads or writes. */
export interface PredictedBodyState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isGrounded: boolean;
  isOnLadder: boolean;
  hasGravity: boolean;
  knockbackRemaining: number;
  collisionX: boolean;
  collisionY: boolean;
  facing: Vector2D;
}

export function snapshotPlayerBody(body: MiningPlayerBody): PredictedBodyState {
  return {
    x: body.position.x,
    y: body.position.y,
    vx: body.velocity.x,
    vy: body.velocity.y,
    isGrounded: body.isGrounded,
    isOnLadder: body.isOnLadder,
    hasGravity: body.hasGravity,
    knockbackRemaining: body.knockbackRemaining,
    collisionX: body.collisionX,
    collisionY: body.collisionY,
    facing: { ...body.facing },
  };
}

export function restorePlayerBody(body: MiningPlayerBody, s: PredictedBodyState): void {
  body.position.x = s.x;
  body.position.y = s.y;
  body.velocity.x = s.vx;
  body.velocity.y = s.vy;
  body.isGrounded = s.isGrounded;
  body.isOnLadder = s.isOnLadder;
  body.hasGravity = s.hasGravity;
  body.knockbackRemaining = s.knockbackRemaining;
  body.collisionX = s.collisionX;
  body.collisionY = s.collisionY;
  body.facing = { ...s.facing };
}

/** What the server tells a client about its own player each tick (see MiningStateTickPayload). */
export interface ServerPlayerSnapshot {
  tick: number;
  position: Vector2D;
  velocity: Vector2D;
  ackSequence: number;
  ackAge: number;
  /** Body flags the server tracks that `position`/`velocity` do not say; the prediction keeps its own if absent. */
  isGrounded?: boolean;
  isOnLadder?: boolean;
  knockbackRemaining?: number;
}

interface Impulse {
  vx: number;
  vy: number;
  seconds: number;
  /** Server tick the hit happened on, when known. Snapshots at or after it already include the push. */
  serverTick?: number;
}

interface StepRecord {
  step: number;
  input: MiningInputState;
  /** Pushes that landed just before this step ran. */
  impulses: Impulse[];
  after: PredictedBodyState;
}

export type ReconcileOutcome = 'ignored' | 'ok' | 'corrected' | 'snapped';

export interface PlayerPredictorOptions {
  /** Length of one simulation step; must match the server tick (default 1/30). */
  fixedDt?: number;
  /** How many steps of history to keep for replay. */
  historySteps?: number;
  /** Position error (tiles) under which the prediction is considered correct. */
  positionTolerance?: number;
  velocityTolerance?: number;
  /** Position error (tiles) above which the player is moved instantly instead of smoothed. */
  snapDistance?: number;
}

const MAX_FRAME_SECONDS = 0.25;
const OFFSET_DECAY_PER_SECOND = 10;
const MAX_TRACKED_SEQUENCES = 512;

/**
 * Client-side prediction for the local player, with server reconciliation by input replay.
 *
 *  - The body is stepped at the server's fixed rate, so client and server run the same maths.
 *  - Every step is recorded with the input that drove it and the resulting state.
 *  - The server acks the input `sequence` in effect and for how many ticks (`ackAge`), which names
 *    the exact client step the snapshot corresponds to. If the predicted state there differs, the
 *    body is reset to the server's state and every later step is replayed with its recorded input.
 *  - The visible position is the state `accumulator` seconds past the last whole step, found by
 *    speculatively running the partial step with the current input (then undoing it), so a key
 *    press shows on the very next frame instead of waiting for the next step. Corrections are
 *    blended in (`renderOffset` decays to zero) instead of popping.
 */
export class PlayerPredictor {
  public readonly fixedDt: number;
  /** Visual correction still to be absorbed; add it to the body position when drawing. */
  public renderOffset: Vector2D = { x: 0, y: 0 };
  /** Number of corrections applied so far (for diagnostics and tests). */
  public correctionCount = 0;

  private readonly body: MiningPlayerBody;
  private readonly historySteps: number;
  private readonly positionTolerance: number;
  private readonly velocityTolerance: number;
  private readonly snapDistance: number;

  private records: StepRecord[] = [];
  private stepCount = 0;
  private accumulator = 0;
  private input: MiningInputState;
  private readonly firstStepOfSequence = new Map<number, number>();
  private pendingImpulses: Impulse[] = [];
  /** Where the partial step after the last whole one takes the body, relative to the body. */
  private lookahead: Vector2D = { x: 0, y: 0 };

  constructor(body: MiningPlayerBody, initialInput: MiningInputState, options: PlayerPredictorOptions = {}) {
    this.body = body;
    this.fixedDt = options.fixedDt ?? 1 / 30;
    this.historySteps = options.historySteps ?? 180;
    this.positionTolerance = options.positionTolerance ?? 0.02;
    this.velocityTolerance = options.velocityTolerance ?? 0.25;
    this.snapDistance = options.snapDistance ?? 1.5;
    this.input = { ...initialInput };
    this.firstStepOfSequence.set(this.input.sequence, 1);
  }

  /** Steps simulated so far. */
  public get steps(): number {
    return this.stepCount;
  }

  /** The player's input changed; it drives every step from the next one on. */
  public setInput(input: MiningInputState): void {
    if (input.sequence === this.input.sequence) {
      this.input = { ...input }; // same input, refreshed fields
      return;
    }
    this.input = { ...input };
    this.firstStepOfSequence.set(input.sequence, this.stepCount + 1);
    if (this.firstStepOfSequence.size > MAX_TRACKED_SEQUENCES) {
      const oldest = this.firstStepOfSequence.keys().next().value;
      if (oldest !== undefined) this.firstStepOfSequence.delete(oldest);
    }
  }

  /** The server pushed the player (e.g. a hit). Applied now, and replayed correctly on a correction. */
  public applyKnockback(vx: number, vy: number, seconds: number, serverTick?: number): void {
    this.body.applyKnockback(vx, vy, seconds);
    this.pendingImpulses.push({ vx, vy, seconds, serverTick });
  }

  /** Runs as many fixed steps as `frameSeconds` of real time allows, then looks ahead through the leftover time. */
  public advance(frameSeconds: number, grid: MiningCollisionGrid): void {
    const frame = Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
    this.accumulator += frame;
    while (this.accumulator >= this.fixedDt - 1e-9) {
      this.stepOnce(grid);
      this.accumulator -= this.fixedDt;
    }
    this.lookahead = this.speculate(Math.max(0, this.accumulator), grid);
    const decay = Math.exp(-OFFSET_DECAY_PER_SECOND * frame);
    this.renderOffset.x *= decay;
    this.renderOffset.y *= decay;
    if (Math.abs(this.renderOffset.x) < 1e-4) this.renderOffset.x = 0;
    if (Math.abs(this.renderOffset.y) < 1e-4) this.renderOffset.y = 0;
  }

  /** Where to draw the player: the body plus the partial step ahead of it, plus any correction still being absorbed. */
  public renderPosition(): Vector2D {
    return {
      x: this.body.position.x + this.lookahead.x + this.renderOffset.x,
      y: this.body.position.y + this.lookahead.y + this.renderOffset.y,
    };
  }

  /** Runs `seconds` of the current input from the current state, reports how far it moved, and puts the body back. */
  private speculate(seconds: number, grid: MiningCollisionGrid): Vector2D {
    if (seconds <= 1e-9) return { x: 0, y: 0 };
    const saved = snapshotPlayerBody(this.body);
    this.body.processInputs(this.input, grid);
    this.body.update(seconds, grid);
    const moved = { x: this.body.position.x - saved.x, y: this.body.position.y - saved.y };
    restorePlayerBody(this.body, saved);
    return moved;
  }

  /** Compares a server snapshot with the prediction for the same moment and replays if they disagree. */
  public reconcile(snapshot: ServerPlayerSnapshot, grid: MiningCollisionGrid): ReconcileOutcome {
    const first = this.firstStepOfSequence.get(snapshot.ackSequence);
    if (first === undefined) return 'ignored'; // an input we never recorded (dropped or merged)
    const k = first + snapshot.ackAge - 1;
    const record = this.recordAt(k);
    // Not simulated yet / too old to compare / the server ran this input longer than we did
    if (!record || record.input.sequence !== snapshot.ackSequence) return 'ignored';

    const dx = snapshot.position.x - record.after.x;
    const dy = snapshot.position.y - record.after.y;
    const error = Math.hypot(dx, dy);
    const velocityError = Math.hypot(snapshot.velocity.x - record.after.vx, snapshot.velocity.y - record.after.vy);
    if (error <= this.positionTolerance && velocityError <= this.velocityTolerance) {
      this.dropRecordsBefore(k);
      return 'ok';
    }

    const bodyBefore = { x: this.body.position.x, y: this.body.position.y };

    // Start from the server's state at step k, then re-run everything the client did since
    restorePlayerBody(this.body, record.after);
    this.body.position.x = snapshot.position.x;
    this.body.position.y = snapshot.position.y;
    this.body.velocity.x = snapshot.velocity.x;
    this.body.velocity.y = snapshot.velocity.y;
    if (snapshot.isGrounded !== undefined) this.body.isGrounded = snapshot.isGrounded;
    if (snapshot.isOnLadder !== undefined) this.body.isOnLadder = snapshot.isOnLadder;
    if (snapshot.knockbackRemaining !== undefined) this.body.knockbackRemaining = snapshot.knockbackRemaining;
    record.after = snapshotPlayerBody(this.body);

    for (let step = k + 1; step <= this.stepCount; step++) {
      const r = this.recordAt(step)!;
      this.applyImpulses(r.impulses, snapshot.tick);
      this.body.processInputs(r.input, grid);
      this.body.update(this.fixedDt, grid);
      r.after = snapshotPlayerBody(this.body);
    }
    // Pushes received since the last step have not been through a step yet
    this.applyImpulses(this.pendingImpulses, snapshot.tick);
    this.pendingImpulses = this.pendingImpulses.filter((i) => i.serverTick === undefined || i.serverTick > snapshot.tick);

    this.dropRecordsBefore(k);
    this.correctionCount++;

    const delta = { x: this.body.position.x - bodyBefore.x, y: this.body.position.y - bodyBefore.y };
    if (error > this.snapDistance) {
      this.renderOffset = { x: 0, y: 0 };
      this.lookahead = { x: 0, y: 0 };
      return 'snapped';
    }
    // The offset cancels the body's move for drawing, so nothing visibly moves; it then fades
    // and the player glides to the right place.
    this.renderOffset = { x: this.renderOffset.x - delta.x, y: this.renderOffset.y - delta.y };
    return 'corrected';
  }

  private applyImpulses(impulses: Impulse[], snapshotTick: number): void {
    for (const i of impulses) {
      // A snapshot at or after the hit already contains the push
      if (i.serverTick !== undefined && i.serverTick <= snapshotTick) continue;
      this.body.applyKnockback(i.vx, i.vy, i.seconds);
    }
  }

  private stepOnce(grid: MiningCollisionGrid): void {
    const impulses = this.pendingImpulses;
    this.pendingImpulses = [];
    this.body.processInputs(this.input, grid);
    this.body.update(this.fixedDt, grid);
    this.stepCount++;
    this.records.push({ step: this.stepCount, input: this.input, impulses, after: snapshotPlayerBody(this.body) });
    if (this.records.length > this.historySteps) this.records.shift();
  }

  private recordAt(step: number): StepRecord | undefined {
    if (this.records.length === 0) return undefined;
    const index = step - this.records[0].step;
    return index >= 0 && index < this.records.length ? this.records[index] : undefined;
  }

  private dropRecordsBefore(step: number): void {
    // Keep the record at `step` itself: later acks may still refer to it
    while (this.records.length > 1 && this.records[0].step < step) this.records.shift();
  }
}
