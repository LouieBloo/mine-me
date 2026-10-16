import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MiningDroppedItem, MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('pickup events for the pickup sound', () => {
  const cid = 'pickup-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const me = () => engine.players.get(cid)!;
  const tick = () => (engine as any).tick(1 / 30);
  const pickups = () =>
    socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').flatMap((c) => (c[1] as MiningStateTickPayload).itemPickups ?? []);
  const drop = (id: string, x: number, y: number) =>
    engine.dropSubsystem.droppedItems.push({ id, itemId: id, itemName: id, quantity: 1, position: { x, y }, velocity: { x: 0, y: 0 } } as unknown as MiningDroppedItem);

  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: socket as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    me().playerBody.position = { x: 10.5, y: 10.5 };
  });

  it('sends nothing while nothing is picked up', () => {
    tick();
    expect(pickups()).toEqual([]);
  });

  it('sends one event at the player per tick, however many stacks they collect', () => {
    drop('a', 10.5, 10.5);
    drop('b', 10.6, 10.5);
    tick();
    expect(pickups()).toHaveLength(1);
    expect(pickups()[0].x).toBeCloseTo(10.5, 0);
    tick();
    expect(pickups()).toHaveLength(1);
  });

  it('does not send the event for an item that is out of reach', () => {
    drop('far', 30, 30);
    tick();
    expect(pickups()).toEqual([]);
  });
});
