import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiningTileType, pieceCells } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('the conveyor belt digs a shaft (ticket 122)', () => {
  const cid = 'belt-char';
  let emitted: { event: string; payload: any }[];
  let engine: MiningGameEngine;
  const tickFor = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 30); i++) (engine as any).tick(1 / 30); };
  const belt = () => engine.beltSubsystem!;
  const extractor = () => engine.extractorSubsystem!;
  const seconds = () => extractor().definition.buildSecondsPerSegment;
  const land = () => tickFor(extractor().definition.landingSeconds + 0.1);
  const cols = () => Array.from({ length: belt().shaftWidth }, (_, i) => belt().shaftX + i);
  const ground = (row: number) => { for (let x = 0; x < engine.grid[0].length; x++) engine.grid[row][x] = { type: MiningTileType.DIRT, revealed: false }; };
  const open = (x: number, y: number) => {
    engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
    engine.rigidWorld.removeTileCollider(x, y);
    engine.fluidSubsystem.onTileChanged(x, y);
    engine.gasSubsystem.onTileChanged(x, y);
  };

  beforeEach(() => {
    emitted = [];
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 11, mapConfig: { mobSpawnCount: 0, gridHeight: 40, skyRows: 12 },
      socket: { connected: true, emit: (event: string, payload: any) => emitted.push({ event, payload }) } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    // A plain solid world under the ground, with no stray fluid, gas or fire, so only what a test adds is in the way
    // (fluid is forgotten first, while its cells are still open: a solid cell cannot be emptied)
    for (let y = engine.surfaceRow; y < engine.grid.length; y++) for (let x = 0; x < engine.grid[0].length; x++) engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
    for (let y = engine.surfaceRow; y < engine.grid.length; y++) {
      ground(y);
      for (let x = 0; x < engine.grid[0].length; x++) {
        engine.gasSubsystem.onTileChanged(x, y); // gas inside what is now solid is pushed out
        engine.rigidWorld.addTileCollider(x, y);
      }
    }
  });

  it('does not start before the extractor has landed', () => {
    tickFor(seconds() * 2);
    expect(belt().rows).toBe(0);
    expect(belt().blockedBy).toBeNull();
  });

  it('grows one row per build time, at the extractor\'s rate', () => {
    land();
    tickFor(seconds() * 3 + 0.05);
    expect(belt().rows).toBe(3);
    const slow = extractor().definition;
    expect(slow.buildSecondsPerSegment).toBeGreaterThan(0);
  });

  it('follows a different build time when the definition says so (data, not a constant)', () => {
    land();
    const base = seconds();
    (extractor().definition as any).buildSecondsPerSegment = base * 4;
    tickFor(base * 4 * 2 + 0.05);
    expect(belt().rows).toBe(2);
  });

  it('digs straight down from the ground, the shaft width wide, centred under the machine', () => {
    land();
    tickFor(seconds() * 3 + 0.05);
    const p = extractor().placement;
    expect(belt().startRow).toBe(engine.surfaceRow);
    expect(belt().shaftWidth).toBe(extractor().definition.shaftWidth);
    expect(belt().shaftX).toBeGreaterThanOrEqual(p.x);
    expect(belt().shaftX + belt().shaftWidth).toBeLessThanOrEqual(p.x + p.width);
    for (let row = engine.surfaceRow; row < engine.surfaceRow + 3; row++) for (const x of cols()) expect(engine.grid[row][x].type).toBe(MiningTileType.EMPTY);
    // beside the shaft and below its tip it is still solid
    expect(engine.grid[engine.surfaceRow][belt().shaftX - 1].type).toBe(MiningTileType.DIRT);
    expect(engine.grid[engine.surfaceRow + 3][belt().shaftX].type).toBe(MiningTileType.DIRT);
  });

  it('tells clients about the removed blocks, and drops no loot', () => {
    land();
    emitted.length = 0;
    tickFor(seconds() + 0.05);
    const updates = emitted.filter((e) => e.event === 'mining_state_tick').flatMap((e) => e.payload.revealedTiles ?? []);
    expect(updates.filter((u: any) => u.y === engine.surfaceRow && u.type === MiningTileType.EMPTY).length).toBeGreaterThanOrEqual(belt().shaftWidth);
    expect(engine.droppedItems).toEqual([]);
  });

  it('clears a rock whole, even when most of it is outside the shaft', () => {
    land();
    const row = engine.surfaceRow;
    const x = belt().shaftX + belt().shaftWidth - 1; // only its left column is in the shaft
    for (const cell of pieceCells({ x, y: row }, { width: 3, height: 3 }, true)) {
      engine.grid[cell.y][cell.x] = { type: MiningTileType.ROCK, revealed: false, piece: cell.offset };
      engine.rigidWorld.addTileCollider(cell.x, cell.y);
    }
    tickFor(seconds() + 0.05);
    for (const cell of pieceCells({ x, y: row }, { width: 3, height: 3 }, true)) expect(engine.grid[cell.y][cell.x].type).toBe(MiningTileType.EMPTY);
  });

  it.each([
    ['fluid', () => { const f = engine.dataManager.getFluids()[0]; engine.fluidSubsystem.placeFluid(belt().shaftX + 1, belt().tipRow + 1, f.typeKey, 1); }, (r: number) => r],
  ])('pauses at %s in the next row and carries on when it is gone', (reason) => {
    land();
    tickFor(seconds() * 2 + 0.05);
    const before = belt().rows;
    const row = belt().tipRow;
    open(belt().shaftX + 1, row);
    const fluid = engine.dataManager.getFluids()[0];
    engine.fluidSubsystem.placeFluid(belt().shaftX + 1, row, fluid.typeKey, 1);
    tickFor(seconds() * 3);
    expect(belt().rows).toBe(before);
    expect(belt().blockedBy).toBe(reason);
    engine.fluidSubsystem.grid.setCell(belt().shaftX + 1, row, 0, 0);
    tickFor(seconds() * 2 + 0.05);
    expect(belt().rows).toBeGreaterThan(before);
    expect(belt().blockedBy).toBeNull();
  });

  it('pauses at gas', () => {
    land();
    tickFor(seconds() + 0.05);
    const row = belt().tipRow;
    open(belt().shaftX, row);
    const gas = engine.dataManager.getGases()[0];
    engine.gasSubsystem.placeGas(belt().shaftX, row, gas.typeKey, 1);
    const before = belt().rows;
    // (gas drifts off an open cell, so it is kept topped up for the check)
    for (let i = 0; i < Math.round(seconds() * 3 * 30); i++) {
      engine.gasSubsystem.placeGas(belt().shaftX, row, gas.typeKey, 1);
      tickFor(1 / 30);
    }
    expect(belt().rows).toBe(before);
    expect(belt().blockedBy).toBe('gas');
  });

  it('pauses at fire', () => {
    land();
    tickFor(seconds() + 0.05);
    const row = belt().tipRow;
    open(belt().shaftX, row);
    vi.spyOn(engine.fireSubsystem, 'isBurning').mockImplementation((x, y) => x === belt().shaftX && y === row);
    const before = belt().rows;
    tickFor(seconds() * 2);
    expect(belt().rows).toBe(before);
    expect(belt().blockedBy).toBe('fire');
  });

  it('pauses while a falling rock is in the next row', () => {
    land();
    tickFor(seconds() + 0.05);
    const row = belt().tipRow;
    engine.rockSubsystem.activeRocks.push({ cellsWide: 1, cellsHigh: 1, position: { x: belt().shaftX + 0.5, y: row + 0.5 } } as any);
    const before = belt().rows;
    tickFor(seconds() * 2);
    expect(belt().rows).toBe(before);
    expect(belt().blockedBy).toBe('rock');
  });

  it('stops for good at a block that cannot be removed', () => {
    land();
    tickFor(seconds() + 0.05);
    engine.grid[belt().tipRow][belt().shaftX + 1] = { type: MiningTileType.ENTRANCE, revealed: false };
    const before = belt().rows;
    tickFor(seconds() * 3);
    expect(belt().rows).toBe(before);
    expect(belt().blockedBy).toBe('solid');
  });

  it('stops at the bottom of the map', () => {
    land();
    tickFor(seconds() * (engine.grid.length + 5));
    expect(belt().blockedBy).toBe('bottom');
    expect(belt().rows).toBe(engine.grid.length - engine.surfaceRow);
    expect(belt().blockedBy).toBe('bottom');
    const rows = belt().rows;
    tickFor(seconds() * 3);
    expect(belt().rows).toBe(rows);
  });

  it('is an open channel: nothing solid is left in the laid rows', () => {
    land();
    tickFor(seconds() * 4 + 0.05);
    for (let i = 0; i < belt().rows; i++) for (const x of cols()) expect(engine.rigidWorld.hasTileCollider?.(x, engine.surfaceRow + i) ?? false).toBe(false);
  });

  it('sends the length once per change, and the whole belt in the join state', () => {
    land();
    emitted.length = 0;
    tickFor(seconds() * 2 + 0.05);
    const ticks = emitted.filter((e) => e.event === 'mining_state_tick' && e.payload.belt);
    expect(ticks.map((t) => t.payload.belt.rows)).toEqual([1, 2]);
    expect(belt().clientState()).toMatchObject({ rows: 2, startRow: engine.surfaceRow, shaftWidth: belt().shaftWidth, blockedBy: null });
  });

  it('has no belt in the sandbox', () => {
    const sandbox = new MiningGameEngine({ characterId: 'sb', cityId: 'c', seed: 1, gameMode: 'sandbox', socket: { connected: true, emit: vi.fn() } as any });
    expect(sandbox.beltSubsystem).toBeNull();
  });
});
