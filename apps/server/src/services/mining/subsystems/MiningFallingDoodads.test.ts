import { describe, it, expect, vi } from 'vitest';
import { MiningTileType, type DoodadDefinition, type DamageEvent, type DamageTarget } from '@mine-me/shared';
import { MiningFallingDoodads } from './MiningFallingDoodads';
import type { MiningWorld } from '../MiningWorld';

const def = (over: Partial<DoodadDefinition> = {}): DoodadDefinition => ({
  id: 'h', key: 'hanging', name: 'Hanging', anchor: 'CEILING', width: 2, height: 3, zOffset: 0, biomes: [], ...over,
});
const body = (x: number, y: number, halfWidth = 0.5, halfHeight = 1) => ({ position: { x, y }, halfWidth, halfHeight });

/** A tall room: open from row 0 to row 59, a solid floor at row 60. */
function setup(over: { players?: Array<{ id: string; x: number; y: number; dead?: boolean }>; mobs?: Array<{ id: string; x: number; y: number; health?: number }>; doodads?: Array<{ id: string }> } = {}) {
  const grid = Array.from({ length: 61 }, (_, y) => Array.from({ length: 20 }, () => ({ type: y === 60 ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true })));
  const calls: Array<[DamageTarget, DamageEvent]> = [];
  const world = {
    grid,
    mapConfig: undefined,
    players: new Map((over.players ?? []).map((p) => [p.id, { characterId: p.id, isDead: Boolean(p.dead), playerBody: body(p.x, p.y) }])),
    mobs: { activeMobs: new Map((over.mobs ?? []).map((m) => [m.id, { id: m.id, health: m.health ?? 10, mobBody: body(m.x, m.y) }])) },
    damage: { applyDamage: vi.fn((t: DamageTarget, e: DamageEvent) => { calls.push([t, e]); return { applied: true, dealt: 1, killed: false }; }) },
  } as unknown as MiningWorld;
  const targets = over.doodads ?? [];
  const host = { definitions: [def()], hurtableInBox: vi.fn(() => targets.map((t) => ({ id: t.id, x: 5, y: 5 }))) };
  const falling = new MiningFallingDoodads(world, host);
  return { falling, calls, host, world };
}
const place = (x = 4, y = 0) => ({ typeIndex: 0, x, y, variant: 0, flip: false });

describe('MiningFallingDoodads', () => {
  it('lets a doodad go with its placed size and a mass from its footprint (or its own fall damage)', () => {
    const { falling } = setup();
    falling.release(place(), def());
    falling.release(place(8, 0), def({ fallDamage: 7 }));
    expect(falling.list.map((f) => [f.state.width, f.state.height, f.mass, f.state.vy])).toEqual([[2, 3, 6, 0], [2, 3, 7, 0]]);
    expect(new Set(falling.list.map((f) => f.id)).size).toBe(2);
  });

  it('uses the size of the variant it was placed with', () => {
    const { falling } = setup();
    const big = def({ sizeVariants: [{ width: 2, height: 3, weight: 1 }, { width: 4, height: 6, weight: 1 }] });
    falling.release({ ...place(), variant: 1 }, big);
    expect(falling.list[0].state).toMatchObject({ width: 4, height: 6 });
  });

  it('falls, lands on the floor and reports where it broke up, once', () => {
    const { falling } = setup();
    falling.release(place(), def());
    for (let i = 0; i < 200 && falling.list.length > 0; i++) falling.update(1 / 30);
    expect(falling.list).toHaveLength(0);
    const shattered = falling.takeShattered();
    expect(shattered).toHaveLength(1);
    expect(shattered[0].slice(0, 3)).toEqual([0, 0, 0]);
    expect(shattered[0][3]).toBe(4);
    expect(shattered[0][4] + 3).toBe(60);
    expect(falling.takeShattered()).toEqual([]);
  });

  it('is on the wire with its place rounded', () => {
    const { falling } = setup();
    falling.release({ ...place(), flip: true }, def());
    falling.update(1 / 30);
    const wire = falling.toWire(falling.list[0]);
    expect(wire.slice(0, 4)).toEqual([falling.list[0].id, 0, 0, 1]);
    expect(wire[4]).toBe(4);
    expect(wire[5]).toBe(Math.round(falling.list[0].state.y * 100) / 100);
  });

  it('hurts a player in its way once per fall, however many steps it overlaps them', () => {
    const { falling, calls } = setup({ players: [{ id: 'p', x: 5, y: 30 }] });
    falling.release(place(4, 27), def());
    falling.list[0].state.vy = 70; // already fast, so every step is a hit
    for (let i = 0; i < 80; i++) falling.update(0.002); // slow steps: the overlap lasts many of them
    const hits = calls.filter(([t]) => t.kind === 'player');
    expect(hits).toHaveLength(1);
    expect(hits[0][1]).toMatchObject({ type: 'environmental', ignoreInvulnerability: true, source: { kind: 'environment', name: 'Falling hanging' } });
    expect(hits[0][1].amount).toBeGreaterThan(0);
    expect(hits[0][1].knockback?.x).toBeGreaterThan(0); // shoved away (to the right when dead centre)
  });

  it('hurts a mob once, and a doodad with health once', () => {
    const { falling, calls } = setup({ mobs: [{ id: 'm', x: 5, y: 30 }], doodads: [{ id: '5,5' }] });
    falling.release(place(4, 27), def());
    falling.list[0].state.vy = 70;
    for (let i = 0; i < 80; i++) falling.update(0.002);
    expect(calls.filter(([t]) => t.kind === 'mob')).toHaveLength(1);
    expect(calls.filter(([t]) => t.kind === 'doodad')).toHaveLength(1);
  });

  it('spares the dead, the players beside it, and anything when it is too slow to hurt', () => {
    const dead = setup({ players: [{ id: 'p', x: 5, y: 30, dead: true }], mobs: [{ id: 'm', x: 5, y: 30, health: 0 }] });
    dead.falling.release(place(4, 27), def());
    dead.falling.list[0].state.vy = 70;
    for (let i = 0; i < 80; i++) dead.falling.update(0.002);
    expect(dead.calls).toHaveLength(0);

    const beside = setup({ players: [{ id: 'p', x: 12, y: 30 }] });
    beside.falling.release(place(4, 27), def());
    beside.falling.list[0].state.vy = 70;
    for (let i = 0; i < 80; i++) beside.falling.update(0.002);
    expect(beside.calls).toHaveLength(0);

    const slow = setup({ players: [{ id: 'p', x: 5, y: 1 }] });
    slow.falling.release(place(), def());
    slow.falling.update(1 / 30); // it has barely started to fall
    expect(slow.calls).toHaveLength(0);
  });

  it('hurts harder the heavier it is', () => {
    const amount = (fallDamage: number) => {
      const { falling, calls } = setup({ players: [{ id: 'p', x: 5, y: 30 }] });
      falling.release(place(4, 27), def({ fallDamage }));
      falling.list[0].state.vy = 70;
      for (let i = 0; i < 20; i++) falling.update(0.002);
      return calls[0][1].amount;
    };
    expect(amount(4)).toBeCloseTo(amount(1) * 4);
  });

  it('does nothing when nothing falls', () => {
    const { falling, host } = setup();
    falling.update(1 / 30);
    expect(host.hurtableInBox).not.toHaveBeenCalled();
  });
});
