import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MiningTileType, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('fluid reactions in a mining room', () => {
  const cid = 'react-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const seconds = (s: number) => tick(Math.round(s * 30));
  const ticks = (): MiningStateTickPayload[] => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
  const type = (x: number, y: number) => engine.grid[y][x].type;

  /** A closed hall x 8..12, y 20, with a floor at 21 and a roof at 19; the player is far away. */
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: socket as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    const grid = engine.fluidSubsystem.grid;
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) grid.setCell(x, y, 0, 0);
    for (let y = 19; y <= 21; y++) {
      for (let x = 7; x <= 13; x++) {
        const open = y === 20 && x >= 8 && x <= 12;
        engine.grid[y][x] = { type: open ? MiningTileType.EMPTY : MiningTileType.DIRT, revealed: true };
      }
    }
    engine.players.get(cid)!.playerBody.position = { x: 80.5, y: 5.5 };
    engine.fluidSubsystem.grid.drainChanges();
  });
  afterEach(() => vi.restoreAllMocks());

  it('water meeting lava turns the lava cell into solid lavarock', () => {
    engine.fluidSubsystem.placeFluid(8, 20, 'LAVA', 0.25);
    engine.fluidSubsystem.placeFluid(9, 20, 'WATER', 1);
    seconds(1);
    expect(type(8, 20)).toBe(MiningTileType.LAVAROCK);
    expect(engine.fluidSubsystem.grid.getFluidId(8, 20)).toBe(0);
  });

  it('the new block is solid to the physics world and told to clients that can see it', () => {
    engine.fluidSubsystem.placeFluid(8, 20, 'LAVA', 0.25);
    engine.fluidSubsystem.placeFluid(9, 20, 'WATER', 1);
    seconds(1);
    const updates = ticks().flatMap((t) => t.revealedTiles ?? []);
    expect(updates.some((u: any) => u.x === 8 && u.y === 20 && u.type === MiningTileType.LAVAROCK)).toBe(true);
  });

  it('does not tell clients about a reaction they cannot see', () => {
    engine.grid[20][8].revealed = false;
    engine.fluidSubsystem.placeFluid(8, 20, 'LAVA', 0.25);
    engine.fluidSubsystem.placeFluid(9, 20, 'WATER', 1);
    seconds(1);
    expect(type(8, 20)).toBe(MiningTileType.LAVAROCK);
    const updates = ticks().flatMap((t) => t.revealedTiles ?? []);
    expect(updates.some((u: any) => u.x === 8 && u.y === 20)).toBe(false);
  });

  it('uses up two water for each lava hardened', () => {
    engine.fluidSubsystem.placeFluid(8, 20, 'LAVA', 0.25);
    engine.fluidSubsystem.placeFluid(9, 20, 'WATER', 1);
    const water = engine.fluidSubsystem.registry.idOf('WATER')!;
    const before = engine.fluidSubsystem.grid.totalVolume(water);
    seconds(1);
    expect(before - engine.fluidSubsystem.grid.totalVolume(water)).toBeCloseTo(0.5, 1);
  });

  it('lava with no water near it stays lava', () => {
    engine.fluidSubsystem.placeFluid(8, 20, 'LAVA', 1);
    seconds(2);
    expect(type(8, 20)).toBe(MiningTileType.EMPTY);
    expect(engine.fluidSubsystem.grid.getFluidId(8, 20)).not.toBe(0);
  });

  it('a solid tile is never overwritten by a reaction', () => {
    expect(engine.blockSubsystem.placeBlockFromReaction(7, 20, 'LAVAROCK')).toBe(false);
    expect(type(7, 20)).toBe(MiningTileType.DIRT);
  });
});
