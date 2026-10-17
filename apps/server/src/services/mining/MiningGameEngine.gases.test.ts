import { describe, it, expect, beforeEach } from 'vitest';
import { MiningTileType, MINING_CONFIG } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('gases in a mining room', () => {
  const cid = 'gas-char';
  let engine: MiningGameEngine;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const gasAt = (x: number, y: number) => engine.gasSubsystem.grid.getConcentration(x, y);
  const setTile = (x: number, y: number, type: number) => {
    engine.grid[y][x] = { type: type as MiningTileType, revealed: true };
  };
  /** Changes a tile the way mining does: the grid, then the tile update every subsystem hears. */
  const changeTile = (x: number, y: number, type: number) => {
    setTile(x, y, type);
    (engine as any).buildWorld().pushTileUpdate({ x, y, type });
  };

  /** A sealed pocket: x 10..14 open at y 20..22, solid all around. */
  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 },
      socket: { connected: true, emit: () => {} } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let y = 18; y <= 24; y++) {
      for (let x = 8; x <= 16; x++) {
        const open = x >= 10 && x <= 14 && y >= 20 && y <= 22;
        setTile(x, y, open ? MiningTileType.EMPTY : MiningTileType.DIRT);
      }
    }
    engine.players.get(cid)!.playerBody.position = { x: 5.5, y: 5.5 };
    // The map came with its own gas pockets; these tests want only the gas they place themselves
    const grid = engine.gasSubsystem.grid;
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) if (grid.getConcentration(x, y) > 0) grid.setCell(x, y, 0, 0);
    grid.drainChanges();
  });

  it('knows the gases from the definitions', () => {
    expect(engine.gasSubsystem.registry.idOf('HYDROGEN')).toBe(1);
    expect(engine.gasSubsystem.registry.idOf('NITROGEN')).toBe(2);
    expect(engine.gasSubsystem.placeGas(12, 22, 'HYDROGEN')).toBe(true);
    expect(engine.gasSubsystem.placeGas(12, 22, 'NOPE')).toBe(false);
    expect(engine.gasSubsystem.placeGas(9, 20, 'HYDROGEN')).toBe(false); // solid dirt
    expect(engine.gasSubsystem.contentsAt(12, 22)).toEqual([1, 1]);
    expect(engine.gasSubsystem.contentsAt(11, 22)).toBeUndefined();
  });

  it('moves only on every Nth tick', () => {
    engine.gasSubsystem.placeGas(12, 22, 'HYDROGEN');
    const start = (engine as any).tickCount as number;
    const before = gasAt(12, 21);
    tick(MINING_CONFIG.GAS_STEP_TICKS - 1 - (start % MINING_CONFIG.GAS_STEP_TICKS));
    expect(gasAt(12, 21)).toBe(before);
    tick(MINING_CONFIG.GAS_STEP_TICKS);
    expect(gasAt(12, 21)).toBeGreaterThan(0);
  });

  it('hydrogen rises to the roof of a sealed pocket and nitrogen sinks to its floor, then both cost nothing', () => {
    engine.gasSubsystem.placeGas(11, 22, 'HYDROGEN');
    engine.gasSubsystem.placeGas(13, 20, 'NITROGEN');
    tick(900);
    const grid = engine.gasSubsystem.grid;
    const hydrogen = engine.gasSubsystem.registry.idOf('HYDROGEN')!;
    const nitrogen = engine.gasSubsystem.registry.idOf('NITROGEN')!;
    const row = (y: number, id: number) => { let t = 0; for (let x = 10; x <= 14; x++) if (grid.getGasId(x, y) === id) t += grid.getConcentration(x, y); return t; };
    expect(row(20, hydrogen)).toBeGreaterThan(row(22, hydrogen));
    expect(row(22, nitrogen)).toBeGreaterThan(row(20, nitrogen));
    expect(grid.ventedVolume).toBe(0);
    expect(grid.activeCount).toBe(0);
  });

  it('takes sandbox-style single steps without waiting for the tick beat', () => {
    engine.gasSubsystem.placeGas(12, 22, 'HYDROGEN');
    engine.gasSubsystem.step();
    expect(gasAt(12, 21)).toBeGreaterThan(0);
  });

  it('breaking the roof of a pocket under an open shaft lets hydrogen escape and fade away', () => {
    // A shaft straight up to the surface, closed at the top by the surface dirt
    for (let y = 1; y <= 19; y++) setTile(12, y, MiningTileType.EMPTY);
    engine.gasSubsystem.placeGas(12, 22, 'HYDROGEN');
    engine.gasSubsystem.placeGas(11, 22, 'HYDROGEN');
    tick(300);
    const grid = engine.gasSubsystem.grid;
    expect(grid.ventedVolume).toBe(0);
    expect(grid.totalVolume()).toBeGreaterThan(0.5);
    // Break through the surface: the shaft is now open to the sky
    changeTile(12, 0, MiningTileType.EMPTY);
    expect(grid.isOpenToSky(12, 22)).toBe(true);
    tick(1200);
    expect(grid.ventedVolume).toBeGreaterThan(0.5);
    expect(grid.activeCount).toBe(0);
    // Only faint traces are left in the dead-end corners of the pocket, too thin to share any further
    expect(grid.totalVolume()).toBeLessThan(0.3);
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) expect(grid.getConcentration(x, y)).toBeLessThan(0.1);
    // The shaft itself is clear
    for (let y = 0; y <= 19; y++) expect(gasAt(12, y)).toBe(0);
  });

  it('tells the gas grid about every tile change: gas is pushed out of a cell where a block is placed', () => {
    engine.gasSubsystem.placeGas(12, 22, 'NITROGEN', 0.5);
    changeTile(12, 22, MiningTileType.ROCK);
    expect(gasAt(12, 22)).toBe(0);
    expect(engine.gasSubsystem.grid.totalVolume()).toBeCloseTo(0.5, 5);
  });

  it('lets gas through non-solid tiles like ladders without removing them', () => {
    changeTile(12, 22, MiningTileType.LADDER);
    engine.gasSubsystem.placeGas(12, 21, 'NITROGEN', 1);
    tick(300);
    expect(engine.grid[22][12].type).toBe(MiningTileType.LADDER);
    expect(gasAt(12, 22)).toBeGreaterThan(0.1);
  });

  it('never lets gas into a cell that holds fluid, and fluid flowing into gas pushes it out', () => {
    engine.fluidSubsystem.placeFluid(12, 22, 'OIL', 1);
    expect(engine.gasSubsystem.placeGas(12, 22, 'NITROGEN')).toBe(false);
    // A full floor of oil under it, so the oil poured in rests there instead of running off the sides
    for (const x of [10, 11, 13, 14]) engine.fluidSubsystem.placeFluid(x, 22, 'OIL', 1);
    engine.gasSubsystem.placeGas(12, 21, 'NITROGEN', 1);
    engine.fluidSubsystem.placeFluid(12, 21, 'OIL', 1);
    tick(MINING_CONFIG.GAS_STEP_TICKS * 2);
    expect(gasAt(12, 21)).toBe(0);
    expect(engine.gasSubsystem.grid.totalVolume()).toBeGreaterThan(0.5);
  });

  it('has a grid the size of the map', () => {
    expect(engine.gasSubsystem.grid.width).toBe(engine.grid[0].length);
    expect(engine.gasSubsystem.grid.height).toBe(engine.grid.length);
  });
});

describe('generated gas pockets in a mining room', () => {
  const big = () => new MiningGameEngine({
    characterId: 'gen-gas-char', cityId: 'c', seed: 5,
    mapConfig: { mobSpawnCount: 0, gridWidth: 80, gridHeight: 80 },
    socket: { connected: true, emit: () => {} } as any,
  });

  it('starts a room with the gas pockets the generator placed, sitting still inside solid walls', () => {
    const room = big();
    const grid = room.gasSubsystem.grid;
    const volume = grid.totalVolume();
    expect(volume).toBeGreaterThan(4);
    // Only gases that have generation settings are placed (what the admin has set up), so count those
    const generating = room.dataManager.getGases().filter((g) => g.generation && g.generation.percentage > 0).length;
    expect(generating).toBeGreaterThan(0);
    expect(new Set(room.gasSubsystem.drainChanges().map((c) => c.gasId)).size).toBe(generating);
    for (let n = 0; n < 300; n++) (room as any).tick(1 / 30);
    // Sealed and full: nothing escaped, nothing faded, and the pocket cells were never solid
    expect(grid.ventedVolume).toBe(0);
    expect(grid.totalVolume()).toBeGreaterThan(volume - 0.5);
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 80; x++) {
        if (grid.getConcentration(x, y) > 0) expect(room.grid[y][x].type).toBe(MiningTileType.EMPTY);
      }
    }
  });

  it('keeps gas and fluid pockets apart', () => {
    const room = big();
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 80; x++) {
        expect(room.gasSubsystem.grid.getConcentration(x, y) > 0 && room.fluidSubsystem.grid.getLevel(x, y) > 0).toBe(false);
      }
    }
  });

  it('never spawns a mob inside a gas pocket', () => {
    const room = big();
    const grid = room.gasSubsystem.grid;
    // Make the pocket cells the only open floor candidates by filling in every other cave
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if (grid.getConcentration(x, y) <= 0) room.grid[y][x] = { type: MiningTileType.DIRT, revealed: true };
    const pos = room.mobSubsystem.findValidCavernSpawnPosition(2);
    expect(grid.getConcentration(Math.floor(pos.x), Math.floor(pos.y) - 1)).toBe(0);
  });
});
