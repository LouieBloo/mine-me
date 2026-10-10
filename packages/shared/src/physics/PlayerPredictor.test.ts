import { describe, it, expect } from 'vitest';
import { PlayerPredictor, type ServerPlayerSnapshot } from './PlayerPredictor';
import { MiningPlayerBody } from './MiningPlayerBody';
import { MiningTileType, MINING_CONFIG, type MiningInputState } from '../types/mining';
import type { MiningCollisionGrid } from './MiningPhysicsBody';

const DT = 1 / 30;

function hall(): MiningCollisionGrid {
  const grid: MiningCollisionGrid = {};
  for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
    grid[y] = {};
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
      grid[y][x] = { type: y >= 21 || x === 0 || x === MINING_CONFIG.GRID_WIDTH - 1 ? MiningTileType.ROCK : MiningTileType.EMPTY };
    }
  }
  return grid;
}

const idle: MiningInputState = { up: false, down: false, left: false, right: false, jump: false, miningKey: false, sequence: 0 };
const startPos = () => ({ x: 10.5, y: 21 - 0.9 });
const newBody = () => {
  const b = new MiningPlayerBody(startPos());
  b.isGrounded = true;
  return b;
};

/**
 * A server and a client joined by a delay line. Both tick at 30 Hz; messages take `delay` ticks
 * (plus optional jitter that never reorders them).
 */
class Rig {
  clientGrid: MiningCollisionGrid;
  serverGrid: MiningCollisionGrid;
  serverBody = newBody();
  clientBody = newBody();
  predictor: PredictorWithInput;
  serverInput: MiningInputState = { ...idle };
  serverAge = 0;
  tick = 0;
  seq = 0;
  inputQueue: Array<{ at: number; input: MiningInputState }> = [];
  snapQueue: Array<{ at: number; snap: ServerPlayerSnapshot }> = [];
  eventQueue: Array<{ at: number; fn: () => void }> = [];
  outcomes: string[] = [];
  jitter: () => number;

  constructor(readonly delay: number, jitter: () => number = () => 0) {
    this.clientGrid = hall();
    this.serverGrid = hall();
    this.predictor = new PredictorWithInput(this.clientBody);
    this.jitter = jitter;
  }

  /** The player presses/releases keys. */
  press(change: Partial<MiningInputState>): void {
    this.seq++;
    const input = { ...this.predictor.current, ...change, sequence: this.seq };
    this.predictor.setInput(input);
    this.inputQueue.push({ at: this.arrival(this.tick + this.delay), input });
  }

  private lastArrival = new Map<object, number>();
  private arrival(t: number): number {
    return t + Math.max(0, Math.round(this.jitter()));
  }

  step(): void {
    this.tick++;
    // 1. Server: take delivered inputs, simulate, send a snapshot
    while (this.inputQueue.length && this.inputQueue[0].at <= this.tick) {
      const { input } = this.inputQueue.shift()!;
      if (input.sequence !== this.serverInput.sequence) this.serverAge = 0;
      this.serverInput = input;
    }
    this.serverAge++;
    this.serverBody.processInputs(this.serverInput, this.serverGrid);
    this.serverBody.update(DT, this.serverGrid);
    this.snapQueue.push({
      at: this.tick + this.delay,
      snap: {
        tick: this.tick,
        position: { ...this.serverBody.position },
        velocity: { ...this.serverBody.velocity },
        ackSequence: this.serverInput.sequence,
        ackAge: this.serverAge,
        isGrounded: this.serverBody.isGrounded,
        isOnLadder: this.serverBody.isOnLadder,
        knockbackRemaining: this.serverBody.knockbackRemaining,
      },
    });
    // 2. Client: deliver events and snapshots, then run one frame
    while (this.eventQueue.length && this.eventQueue[0].at <= this.tick) this.eventQueue.shift()!.fn();
    this.predictor.advance(DT, this.clientGrid);
    while (this.snapQueue.length && this.snapQueue[0].at <= this.tick) {
      this.outcomes.push(this.predictor.reconcile(this.snapQueue.shift()!.snap, this.clientGrid));
    }
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  /** Server-side hit: pushes the server body now; the client hears about it `delay` ticks later. */
  knock(vx: number, vy: number, seconds = 0.2): void {
    this.serverBody.applyKnockback(vx, vy, seconds);
    const hitTick = this.tick;
    this.eventQueue.push({ at: this.tick + this.delay, fn: () => this.predictor.applyKnockback(vx, vy, seconds, hitTick) });
  }

  count(outcome: string): number {
    return this.outcomes.filter((o) => o === outcome).length;
  }
}

/** PlayerPredictor plus a record of the current input, for the rig. */
class PredictorWithInput extends PlayerPredictor {
  current: MiningInputState = { ...idle };
  constructor(body: MiningPlayerBody) {
    super(body, idle);
  }
  override setInput(input: MiningInputState): void {
    this.current = { ...input };
    super.setInput(input);
  }
}

describe('PlayerPredictor', () => {
  describe('fixed-step simulation', () => {
    it('runs steps at the server rate regardless of frame length', () => {
      const body = newBody();
      const p = new PlayerPredictor(body, idle);
      const grid = hall();
      let t = 0;
      for (const frame of [0.016, 0.033, 0.05, 0.007, 0.1, 0.02]) {
        p.advance(frame, grid);
        t += frame;
      }
      expect(p.steps).toBe(Math.floor(t / DT + 1e-9));
    });

    it('draws the player ahead of the last whole step by the time left over', () => {
      const body = newBody();
      const p = new PlayerPredictor(body, { ...idle, right: true, sequence: 1 });
      const grid = hall();
      p.advance(DT * 1.5, grid); // one step plus half
      const drawn = p.renderPosition();
      expect(drawn.x).toBeGreaterThan(body.position.x);
      expect(drawn.x).toBeLessThan(body.position.x + MINING_CONFIG.MOVE_SPEED * DT);
      // The speculation is undone: the simulated body is still exactly where the last step left it
      const again = new PlayerPredictor(newBody(), { ...idle, right: true, sequence: 1 });
      again.advance(DT, grid);
      expect(body.position.x).toBeCloseTo((again as unknown as { body: { position: { x: number } } }).body.position.x, 9);
    });

    it('shows a key press on the very next frame, not on the next step', () => {
      const body = newBody();
      const p = new PlayerPredictor(body, idle);
      const grid = hall();
      p.advance(DT * 1.01, grid); // one step done, a sliver of time left over
      p.setInput({ ...idle, right: true, sequence: 1 });
      const before = p.renderPosition().x;
      p.advance(0.005, grid); // a short frame: no whole step runs
      expect(p.steps).toBe(1);
      expect(p.renderPosition().x).toBeGreaterThan(before);
    });

    it('caps a huge frame (tab was in the background) instead of simulating it all', () => {
      const p = new PlayerPredictor(newBody(), idle);
      p.advance(60, hall());
      expect(p.steps).toBeLessThanOrEqual(Math.ceil(0.25 / DT));
    });
  });

  describe('reconciliation', () => {
    it('never needs a correction when client and server agree, whatever the latency', () => {
      for (const delay of [0, 2, 6, 12]) {
        const rig = new Rig(delay);
        rig.run(5);
        rig.press({ right: true, sequence: 0 });
        rig.run(20);
        rig.press({ jump: true });
        rig.run(4);
        rig.press({ jump: false });
        rig.run(30);
        rig.press({ right: false, left: true });
        rig.run(25);
        rig.press({ left: false });
        rig.run(30);
        expect(rig.count('corrected') + rig.count('snapped')).toBe(0);
        expect(rig.count('ok')).toBeGreaterThan(10);
      }
    });

    it('with jittery delivery (inputs reach the server at different moments) it corrects, never snaps, and converges', () => {
      let seed = 12345;
      const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const rig = new Rig(5, () => rand() * 4);
      rig.run(5);
      for (let i = 0; i < 12; i++) {
        rig.press({ right: i % 2 === 0, left: i % 2 === 1, jump: i % 3 === 0 });
        rig.run(8 + (i % 5));
      }
      rig.press({ right: false, left: false, jump: false });
      rig.run(60);
      expect(rig.count('snapped')).toBe(0);
      expect(rig.clientBody.position.x).toBeCloseTo(rig.serverBody.position.x, 1);
      expect(rig.clientBody.position.y).toBeCloseTo(rig.serverBody.position.y, 1);
    });

    it('replays unacked inputs on top of a correction, so the client stays ahead of the server', () => {
      const delay = 6;
      const rig = new Rig(delay);
      rig.run(3);
      rig.press({ right: true });
      rig.run(10);
      // Something only the server knows about holds the player still (a stun, a collision...)
      rig.serverBody.applyKnockback(0, 0, 0.5);
      let maxLead = 0;
      for (let i = 0; i < 20; i++) {
        rig.step();
        maxLead = Math.max(maxLead, rig.clientBody.position.x - rig.serverBody.position.x);
      }
      expect(rig.count('corrected') + rig.count('snapped')).toBeGreaterThan(0);
      // The client only leads by the round trip it has not heard back about, never by the whole stall
      expect(maxLead).toBeLessThan(2 * delay * (MINING_CONFIG.MOVE_SPEED / 30) + 0.5);
      rig.press({ right: false });
      rig.run(60);
      expect(rig.clientBody.position.x).toBeCloseTo(rig.serverBody.position.x, 1);
    });

    it('blends a small correction in instead of popping the drawn position', () => {
      const rig = new Rig(4);
      rig.run(3);
      rig.press({ right: true });
      rig.run(8);
      rig.serverBody.applyKnockback(0, 0, 0.3); // server-only stall
      let biggestJump = 0;
      let largestOffset = 0;
      let last = rig.predictor.renderPosition();
      for (let i = 0; i < 70; i++) {
        rig.step();
        const now = rig.predictor.renderPosition();
        biggestJump = Math.max(biggestJump, Math.hypot(now.x - last.x, now.y - last.y));
        largestOffset = Math.max(largestOffset, Math.abs(rig.predictor.renderOffset.x));
        last = now;
      }
      expect(rig.count('corrected')).toBeGreaterThan(0);
      expect(largestOffset).toBeGreaterThan(0.3);
      // A pop would move the drawn player by the whole correction in one frame; blending spreads it out
      expect(biggestJump).toBeLessThan(largestOffset * 0.5);
    });

    it('snaps instantly when the error is large (a teleport)', () => {
      const rig = new Rig(2);
      rig.run(5);
      rig.serverBody.position.x += 6;
      rig.run(10);
      expect(rig.count('snapped')).toBeGreaterThan(0);
      expect(rig.clientBody.position.x).toBeCloseTo(rig.serverBody.position.x, 1);
      expect(rig.predictor.renderOffset).toEqual({ x: 0, y: 0 });
    });

    it('ignores snapshots it cannot line up (unknown input, or ahead of what it has simulated)', () => {
      const body = newBody();
      const p = new PlayerPredictor(body, idle);
      const grid = hall();
      p.advance(DT * 3, grid);
      const base = { tick: 1, position: { x: 99, y: 99 }, velocity: { x: 0, y: 0 } };
      expect(p.reconcile({ ...base, ackSequence: 42, ackAge: 1 }, grid)).toBe('ignored');
      expect(p.reconcile({ ...base, ackSequence: 0, ackAge: 50 }, grid)).toBe('ignored');
      expect(body.position.x).toBeCloseTo(startPos().x, 6);
    });
  });

  describe('direct reconcile checks', () => {
    const run = (body: MiningPlayerBody, steps: number, grid: MiningCollisionGrid, input: MiningInputState) => {
      for (let i = 0; i < steps; i++) {
        body.processInputs(input, grid);
        body.update(DT, grid);
      }
    };
    const walking: MiningInputState = { ...idle, right: true, sequence: 0 };

    it('keeps the drawn position put when it corrects, then fades the offset to nothing', () => {
      const grid = hall();
      const body = newBody();
      const p = new PlayerPredictor(body, walking);
      for (let i = 0; i < 10; i++) p.advance(DT, grid);
      const drawnBefore = p.renderPosition();
      // The server says the player is 0.3 tiles further back at step 10
      const outcome = p.reconcile(
        { tick: 10, position: { x: body.position.x - 0.3, y: body.position.y }, velocity: { x: walking.right ? MINING_CONFIG.MOVE_SPEED : 0, y: 0 }, ackSequence: 0, ackAge: 10 },
        grid
      );
      expect(outcome).toBe('corrected');
      const drawnAfter = p.renderPosition();
      expect(drawnAfter.x).toBeCloseTo(drawnBefore.x, 9);
      expect(p.renderOffset.x).toBeCloseTo(0.3, 6);
      p.setInput({ ...idle, sequence: 1 });
      for (let i = 0; i < 30; i++) p.advance(DT, grid);
      expect(p.renderOffset).toEqual({ x: 0, y: 0 });
    });

    it('does not apply a hit twice when the snapshot already contains it', () => {
      const grid = hall();
      const body = newBody();
      const p = new PlayerPredictor(body, walking);
      // Authoritative server: walks 3 ticks, is hit (after tick 3), then keeps walking
      const server = newBody();
      const serverStates: Array<{ x: number; y: number; vx: number; vy: number; g: boolean; l: boolean; k: number }> = [];
      const serverStep = (n: number) => {
        for (let i = 0; i < n; i++) {
          run(server, 1, grid, walking);
          serverStates.push({ x: server.position.x, y: server.position.y, vx: server.velocity.x, vy: server.velocity.y, g: server.isGrounded, l: server.isOnLadder, k: server.knockbackRemaining });
        }
      };
      serverStep(3);
      server.applyKnockback(-7, -4, 0.3);
      serverStep(4); // ticks 4..7

      // The client ran 6 steps without knowing about the hit, then hears about it (tick 3) and runs one more
      for (let i = 0; i < 6; i++) p.advance(DT, grid);
      p.applyKnockback(-7, -4, 0.3, 3);
      p.advance(DT, grid);

      // The snapshot for tick 4 (which includes the hit) arrives
      const s4 = serverStates[3];
      p.reconcile({ tick: 4, position: { x: s4.x, y: s4.y }, velocity: { x: s4.vx, y: s4.vy }, isGrounded: s4.g, isOnLadder: s4.l, knockbackRemaining: s4.k, ackSequence: 0, ackAge: 4 }, grid);

      // After replaying to step 7 the client matches the server at tick 7: the push was counted once
      const s7 = serverStates[6];
      expect(body.position.x).toBeCloseTo(s7.x, 6);
      expect(body.position.y).toBeCloseTo(s7.y, 6);
    });
  });

  describe('knockback', () => {
    it('applies a hit at once and does not double-apply it when the snapshot catches up', () => {
      const rig = new Rig(5);
      rig.run(10);
      rig.knock(7, -5);
      rig.run(60);
      // Predicted and authoritative positions agree at the end, at rest
      expect(rig.clientBody.position.x).toBeCloseTo(rig.serverBody.position.x, 1);
      expect(rig.clientBody.position.y).toBeCloseTo(rig.serverBody.position.y, 1);
      expect(rig.serverBody.position.x).toBeGreaterThan(startPos().x + 0.5);
      expect(rig.count('snapped')).toBe(0);
    });

    it('the client is thrown before the server\'s next snapshot would have told it', () => {
      const rig = new Rig(8);
      rig.run(10);
      const before = rig.clientBody.position.x;
      rig.knock(8, -4);
      rig.run(9); // the event has arrived by now
      expect(rig.clientBody.position.x).toBeGreaterThan(before);
    });

    it('keeps the push when a correction lands while the hit is still pending', () => {
      const rig = new Rig(6);
      rig.run(3);
      rig.press({ right: true });
      rig.run(12);
      rig.serverBody.applyKnockback(0, 0, 0.3); // server-only stall forces corrections
      rig.run(2);
      rig.knock(-6, -3);
      rig.run(10);
      rig.press({ right: false });
      rig.run(90);
      expect(rig.clientBody.position.x).toBeCloseTo(rig.serverBody.position.x, 1);
    });
  });
});
