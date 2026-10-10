import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MiningStateTickPayload, MiningPlayerDamagedEvent } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { hitPlayer } from './testHelpers';

describe('server side of client prediction', () => {
  let engine: MiningGameEngine;
  const socket = { connected: true, emit: vi.fn() };
  const cid = 'pred-char';
  const FRAME = 1 / 30;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(FRAME); };
  const ticks = () => socket.emit.mock.calls.filter((c: any[]) => c[0] === 'mining_state_tick').map((c: any[]) => c[1] as MiningStateTickPayload);
  const input = (sequence: number, extra: object = {}) => ({ up: false, down: false, left: false, right: false, jump: false, miningKey: false, sequence, ...extra });

  beforeEach(() => {
    socket.emit.mockClear();
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 6, socket: socket as any, mapConfig: { mobSpawnCount: 0 } });
  });

  it('acks the input sequence in effect, and how many ticks it has been in effect', () => {
    tick(2);
    engine.handleInput(cid, input(5, { right: true }));
    tick(3);
    const sent = ticks();
    const last3 = sent.slice(-3);
    expect(last3.map((t) => t.ackSequence)).toEqual([5, 5, 5]);
    expect(last3.map((t) => t.ackAge)).toEqual([1, 2, 3]);
    // Before that, the starting input had been in effect for 1 and 2 ticks
    expect(sent.slice(0, 2).map((t) => [t.ackSequence, t.ackAge])).toEqual([[0, 1], [0, 2]]);
  });

  it('restarts the age when the sequence changes, and keeps counting when it repeats', () => {
    engine.handleInput(cid, input(1, { right: true }));
    tick(4);
    engine.handleInput(cid, input(1, { right: true })); // same sequence again: not a new input
    tick(1);
    expect(ticks().slice(-1)[0]).toMatchObject({ ackSequence: 1, ackAge: 5 });
    engine.handleInput(cid, input(2));
    tick(1);
    expect(ticks().slice(-1)[0]).toMatchObject({ ackSequence: 2, ackAge: 1 });
  });

  it('reports the body flags the client cannot derive, so a replay starts from the right state', () => {
    tick(5);
    const t = ticks().slice(-1)[0];
    expect(t.bodyState).toEqual({
      isGrounded: expect.any(Boolean),
      isOnLadder: expect.any(Boolean),
      knockbackRemaining: expect.any(Number),
    });
    hitPlayer(engine, cid, 5, { position: { x: -5, y: 0 } });
    tick(1);
    expect(ticks().slice(-1)[0].bodyState.knockbackRemaining).toBeGreaterThan(0);
  });

  it('stamps a hit with the server tick it happened on', () => {
    tick(7);
    hitPlayer(engine, cid, 5, { position: { x: -5, y: 0 } });
    const hurt = socket.emit.mock.calls.find((c: any[]) => c[0] === 'player_damaged')?.[1] as MiningPlayerDamagedEvent;
    expect(hurt).toBeDefined();
    expect(hurt.tick).toBe(7);
  });
});
