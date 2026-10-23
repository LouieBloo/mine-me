import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MiningTileType, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningSessionManager } from './MiningSessionManager';

const GRASSY = { ignitionChance: 1, spreadChance: 1, burnDuration: 2, heat: 1, burnsInto: null as string | null };

describe('flammable blocks', () => {
  const cid = 'block-fire-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  let flammable: Record<number, typeof GRASSY & Record<string, unknown>>;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const seconds = (s: number) => tick(Math.round(s * 30));
  const ticks = (): MiningStateTickPayload[] => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
  const type = (x: number, y: number) => engine.grid[y][x].type;
  const light = (x: number, y: number) => {
    engine.ignitionSubsystem.emit(x + 0.5, y + 0.5, 0.2, 1);
    tick(3);
  };

  /** A hall x 10..24, y 17..20 over a floor of DIRT at row 21 (plain dirt, not flammable). A row of "wood" (ROCK tiles here) at y 20, x 12..16. */
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0, skyRows: 0 }, socket: socket as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let y = 0; y < engine.fluidSubsystem.grid.height; y++) for (let x = 0; x < engine.fluidSubsystem.grid.width; x++) engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
    for (let x = 10; x <= 24; x++) {
      for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
      engine.rigidWorld.removeTileCollider(x, 20);
      engine.rigidWorld.addTileCollider(x, 21);
    }
    for (let x = 12; x <= 16; x++) {
      engine.grid[20][x] = { type: MiningTileType.ROCK, revealed: true };
      engine.rigidWorld.addTileCollider(x, 20);
    }
    flammable = { [MiningTileType.ROCK]: { ...GRASSY } };
    const original = engine.dataManager.getBlockConfig.bind(engine.dataManager);
    vi.spyOn(engine.dataManager, 'getBlockConfig').mockImplementation((t) => {
      const base = original(t);
      return flammable[t] ? ({ ...(base ?? { id: `b${t}`, name: 'b', health: 100, staminaCost: 0 }), flammability: flammable[t] } as any) : base;
    });
    engine.players.get(cid)!.playerBody.position = { x: 5.5, y: 5.5 };
    engine.fireSubsystem.grid.drainChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('knows which blocks can burn: only those whose block says so', () => {
    expect(engine.ignitionSubsystem.flammabilityAt(14, 20)).toMatchObject({ burnDuration: 2 });
    expect(engine.ignitionSubsystem.flammabilityAt(14, 21)).toBeNull(); // plain dirt
    expect(engine.ignitionSubsystem.flammabilityAt(14, 19)).toBeNull(); // air
  });

  it('a spark lights a flammable block and not a plain one', () => {
    light(14, 20);
    light(14, 21);
    expect(engine.fireSubsystem.grid.isBurning(14, 20)).toBe(true);
    expect(engine.fireSubsystem.grid.isBurning(14, 21)).toBe(false);
  });

  it('fire spreads from block to block and stops at one that cannot burn', () => {
    engine.grid[20][15] = { type: MiningTileType.DIRT, revealed: true }; // a gap of plain dirt in the row
    light(12, 20);
    seconds(1.5);
    expect(engine.fireSubsystem.grid.isBurning(13, 20) || type(13, 20) !== MiningTileType.ROCK).toBe(true);
    seconds(5);
    expect(type(15, 20)).toBe(MiningTileType.DIRT);
    expect(engine.fireSubsystem.grid.isBurning(16, 20)).toBe(false);
    expect(type(16, 20)).toBe(MiningTileType.ROCK); // never reached
  });

  it('a block burns for its burn duration and then is gone: no collider, no loot, clients told', () => {
    const spawn = vi.spyOn(engine.dropSubsystem, 'spawnBlockDrops');
    light(12, 20);
    seconds(1);
    expect(type(12, 20)).toBe(MiningTileType.ROCK); // still burning
    seconds(1.5);
    expect(type(12, 20)).toBe(MiningTileType.EMPTY);
    expect(engine.rigidWorld.hasTileCollider(12, 20)).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
    const updates = ticks().flatMap((t) => t.revealedTiles ?? []);
    expect(updates).toContainEqual(expect.objectContaining({ x: 12, y: 20, type: MiningTileType.EMPTY }));
    expect(engine.fireSubsystem.grid.isBurning(12, 20)).toBe(false);
  });

  it('a block that burns into another block becomes that block, solid', () => {
    flammable[MiningTileType.ROCK] = { ...GRASSY, burnsInto: 'DIRT' };
    light(12, 20);
    seconds(2.5);
    expect(type(12, 20)).toBe(MiningTileType.DIRT);
    expect(engine.rigidWorld.hasTileCollider(12, 20)).toBe(true);
    expect(engine.fireSubsystem.grid.isBurning(12, 20)).toBe(false);
  });

  it('an unknown burns-into key just burns away', () => {
    flammable[MiningTileType.ROCK] = { ...GRASSY, burnsInto: 'NOT_A_BLOCK' };
    light(12, 20);
    seconds(2.5);
    expect(type(12, 20)).toBe(MiningTileType.EMPTY);
  });

  it('a rock resting on a burnt block starts to fall', () => {
    flammable[MiningTileType.DIRT] = { ...GRASSY };
    // A real rock sits on the flammable dirt block at (20, 20)
    engine.grid[20][20] = { type: MiningTileType.DIRT, revealed: true };
    engine.rigidWorld.addTileCollider(20, 20);
    engine.grid[19][20] = { type: MiningTileType.ROCK, revealed: true };
    engine.rigidWorld.addTileCollider(20, 19);
    flammable[MiningTileType.ROCK] = undefined as any;
    light(20, 20);
    seconds(2.5);
    expect(type(20, 20)).toBe(MiningTileType.EMPTY);
    expect(engine.rockSubsystem.activeRocks.length).toBeGreaterThan(0);
  });

  it('fire spreads between burning oil and a flammable block', () => {
    engine.dataManager.getFluid('OIL')!.flammability = { ignitionChance: 1, spreadChance: 1, burnDuration: 6, heat: 3, burnsInto: null };
    engine.fluidSubsystem.placeFluid(11, 20, 'OIL', 1);
    light(11, 20);
    seconds(1.5);
    expect(engine.fireSubsystem.grid.isBurning(12, 20) || type(12, 20) === MiningTileType.EMPTY).toBe(true);
  });

  describe('on the wire', () => {
    it('sends the burning block cells like any other fire', () => {
      light(14, 20);
      expect(ticks().flatMap((t) => t.fireCells ?? [])).toContainEqual([14, 20, 1]);
    });

    it('describes how each burning block type looks, once, with the join state', () => {
      const FLAME = { emitterType: 'continuous', rate: 20 } as any;
      const LIGHT = { enabled: true, type: 'POINT', effect: 'FLICKER', color: '#ff8a2a', radius: 2, intensity: 0.6 } as any;
      flammable[MiningTileType.ROCK] = { ...GRASSY, flameEffectId: 'pe_wood', flameLight: LIGHT };
      vi.spyOn(engine.dataManager, 'getParticleEffect').mockImplementation((id) => (id === 'pe_wood' ? ({ id, config: FLAME } as any) : undefined));
      const state = MiningSessionManager.getInstance().buildClientState(engine, cid);
      expect(state.blockFlames).toEqual([{ tileType: MiningTileType.ROCK, flame: { effect: FLAME, light: LIGHT } }]);
    });

    it('lists no block flames when no block both burns and has a look', () => {
      expect(MiningSessionManager.getInstance().buildClientState(engine, cid).blockFlames).toEqual([]);
    });
  });
});
