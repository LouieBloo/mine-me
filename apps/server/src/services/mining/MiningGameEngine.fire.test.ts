import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MiningTileType, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningSessionManager } from './MiningSessionManager';
import { FIRE_STEP_SECONDS } from './subsystems/MiningFireSubsystem';

const OIL = { ignitionChance: 1, spreadChance: 1, burnDuration: 4, heat: 3, burnsInto: null };

describe('fire in a mining room', () => {
  const cid = 'fire-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const seconds = (s: number) => tick(Math.round(s * 30));
  const ticks = (): MiningStateTickPayload[] => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
  const burning = () => {
    const out: string[] = [];
    engine.fireSubsystem.grid.forEachBurning((x, y) => out.push(`${x},${y}`));
    return out;
  };
  const light = (x: number, y: number) => {
    engine.ignitionSubsystem.emit(x + 0.5, y + 0.5, 0.2, 1);
    tick(3); // the next fire step takes the spark
  };

  /** A sealed pocket x 10..20, y 20..22 (floor row 23), oil along the bottom row x 10..20. */
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: socket as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let y = 0; y < engine.fluidSubsystem.grid.height; y++) {
      for (let x = 0; x < engine.fluidSubsystem.grid.width; x++) engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
    }
    for (let y = 18; y <= 24; y++) {
      for (let x = 8; x <= 22; x++) {
        const open = x >= 10 && x <= 20 && y >= 20 && y <= 22;
        engine.grid[y][x] = { type: open ? MiningTileType.EMPTY : MiningTileType.DIRT, revealed: true };
      }
    }
    engine.dataManager.getFluid('OIL')!.flammability = OIL;
    for (let x = 10; x <= 20; x++) engine.fluidSubsystem.placeFluid(x, 22, 'OIL', 1);
    engine.players.get(cid)!.playerBody.position = { x: 5.5, y: 5.5 };
    engine.fluidSubsystem.drainChanges();
    engine.fireSubsystem.grid.drainChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('steps on the fluid beat', () => {
    expect(FIRE_STEP_SECONDS).toBeCloseTo(0.1, 5);
  });

  it('a spark on oil sets it burning, and nothing burns before a spark', () => {
    seconds(1);
    expect(burning()).toEqual([]);
    light(15, 22);
    expect(burning()).toContain('15,22');
  });

  it('a spark on a dry cell starts nothing', () => {
    light(15, 21);
    expect(burning()).toEqual([]);
  });

  it('spreads along the oil, and does not cross a block', () => {
    // A wall of blocks across the pocket: fire cannot cross it, and neither can the oil
    engine.fluidSubsystem.grid.setCell(14, 22, 0, 0);
    for (let y = 20; y <= 22; y++) {
      engine.grid[y][14] = { type: MiningTileType.ROCK, revealed: true };
      (engine as any).buildWorld().pushTileUpdate({ x: 14, y, type: MiningTileType.ROCK });
    }
    light(10, 22);
    seconds(2);
    expect(burning()).toEqual(expect.arrayContaining(['10,22', '11,22', '12,22', '13,22']));
    expect(burning()).not.toContain('15,22');
  });

  it('burns the oil away while it burns, then goes out when it is all gone', () => {
    const before = engine.fluidSubsystem.grid.totalVolume();
    light(15, 22);
    seconds(1);
    expect(engine.fluidSubsystem.grid.totalVolume()).toBeLessThan(before);
    seconds(40);
    expect(burning()).toEqual([]);
    expect(engine.fluidSubsystem.grid.totalVolume()).toBeLessThan(before * 0.05);
    expect(engine.fluidSubsystem.grid.drainedVolume).toBeGreaterThan(before * 0.9);
  });

  it('a thin film burns off faster than a deep pool', () => {
    const grid = engine.fluidSubsystem.grid;
    const oil = engine.fluidSubsystem.registry.idOf('OIL')!;
    for (let x = 10; x <= 20; x++) grid.setCell(x, 22, 0, 0);
    grid.setCell(10, 22, oil, 0.3);
    for (let y = 20; y <= 22; y++) grid.addFluid(20, y, oil, 1);
    light(10, 22);
    light(20, 22);
    seconds(1.5);
    expect(burning()).not.toContain('10,22');
    expect(burning()).toContain('20,22');
  });

  it('goes out when the oil under it is displaced by a placed block', () => {
    light(15, 22);
    expect(burning()).toContain('15,22');
    engine.grid[22][15] = { type: MiningTileType.ROCK, revealed: true };
    (engine as any).buildWorld().pushTileUpdate({ x: 15, y: 22, type: MiningTileType.ROCK });
    seconds(0.5);
    expect(burning()).not.toContain('15,22');
  });

  it('oil that cannot burn never catches', () => {
    engine.dataManager.getFluid('OIL')!.flammability = null;
    light(15, 22);
    expect(burning()).toEqual([]);
  });

  describe('on the wire', () => {
    it('never tells a client about fire in cells it has not revealed', () => {
      for (let y = 18; y <= 24; y++) for (let x = 8; x <= 22; x++) engine.grid[y][x].revealed = false;
      light(15, 22);
      seconds(2);
      expect(ticks().every((t) => !t.fireCells)).toBe(true);
    });

    it('sends fires starting and stopping in revealed cells, as [x, y, 1 or 0]', () => {
      light(15, 22);
      const started = ticks().flatMap((t) => t.fireCells ?? []);
      expect(started).toContainEqual([15, 22, 1]);
      seconds(40);
      const all = ticks().flatMap((t) => t.fireCells ?? []);
      expect(all).toContainEqual([15, 22, 0]);
    });

    it('sends nothing on ticks where no fire changed', () => {
      light(15, 22);
      const before = ticks().length;
      tick(2);
      expect(ticks().slice(before).every((t) => t.fireCells === undefined)).toBe(true);
    });

    it('describes a newly revealed tile that is on fire', () => {
      for (let y = 18; y <= 24; y++) for (let x = 8; x <= 22; x++) engine.grid[y][x].revealed = false;
      light(15, 22);
      engine.players.get(cid)!.playerBody.position = { x: 15.5, y: 22.5 };
      (engine as any).revealAndTrackTiles({ x: 15.5, y: 22.5 }, 2);
      tick(1);
      const reveals = ticks().flatMap((t) => t.revealedTiles ?? []);
      expect(reveals.find((r) => r.x === 15 && r.y === 22)?.fire).toBe(1);
      expect(reveals.find((r) => r.x === 16 && r.y === 22 && !engine.fireSubsystem.isBurning(16, 22))?.fire).toBeUndefined();
    });

    it('gives a joining client a snapshot of only the revealed fires', () => {
      light(15, 22);
      light(10, 22);
      engine.grid[22][10].revealed = false;
      const state = MiningSessionManager.getInstance().buildClientState(engine, cid);
      const cells = (state.fireCells ?? []).map((c) => `${c[0]},${c[1]}`);
      expect(cells).toContain('15,22');
      expect(cells).not.toContain('10,22');
      expect((state.fireCells ?? []).every((c) => c[2] === 1)).toBe(true);
    });
  });
});
