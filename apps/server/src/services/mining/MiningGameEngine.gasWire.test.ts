import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_GAS_APPEARANCE, MiningTileType, quantizeGasConcentration, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningSessionManager } from './MiningSessionManager';

describe('gases on the wire', () => {
  const cid = 'gas-wire-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const ticks = (): MiningStateTickPayload[] => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
  const lastTick = () => ticks()[ticks().length - 1];
  const setTile = (x: number, y: number, type: number, revealed = true) => {
    engine.grid[y][x] = { type: type as MiningTileType, revealed };
  };

  /** A pocket x 30..34, y 30..32, solid around it, with the player far away (nothing revealed there). */
  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0, skyRows: 0 }, socket: socket as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    // Forget the generated gas so only this test's gas exists
    const grid = engine.gasSubsystem.grid;
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) grid.setCell(x, y, 0, 0);
    engine.gasSubsystem.drainChanges();
    { const fg = engine.fluidSubsystem.grid; for (let y = 0; y < fg.height; y++) for (let x = 0; x < fg.width; x++) fg.setCell(x, y, 0, 0); }
    for (let y = 28; y <= 34; y++) {
      for (let x = 28; x <= 36; x++) {
        const open = x >= 30 && x <= 34 && y >= 30 && y <= 32;
        setTile(x, y, open ? MiningTileType.EMPTY : MiningTileType.DIRT, false);
      }
    }
    engine.players.get(cid)!.playerBody.position = { x: 130.5, y: 5.5 };
  });

  it('never sends gas in cells the fog of war has not revealed', () => {
    engine.gasSubsystem.placeGas(32, 30, 'HYDROGEN');
    tick(20);
    expect(ticks().every((t) => !t.gasCells || t.gasCells.length === 0)).toBe(true);
  });

  it('sends changed cells once they are revealed, as [x, y, gasId, concentration]', () => {
    for (let x = 30; x <= 34; x++) engine.grid[30][x].revealed = true;
    engine.gasSubsystem.placeGas(32, 30, 'HYDROGEN');
    vi.spyOn(engine.gasSubsystem, 'update').mockImplementation(() => {}); // (the wire format of the placed cell, before it starts to spread)
    tick(1);
    expect(lastTick().gasCells).toEqual([[32, 30, 1, quantizeGasConcentration(1)]]);
  });

  it('sends nothing on ticks where the gas did not change', () => {
    for (let y = 30; y <= 32; y++) for (let x = 30; x <= 34; x++) engine.grid[y][x].revealed = true;
    engine.gasSubsystem.placeGas(32, 32, 'NITROGEN', 0.5);
    tick(300);
    const before = ticks().length;
    tick(10);
    expect(ticks().slice(before).every((t) => t.gasCells === undefined)).toBe(true);
  });

  it('describes a newly revealed tile together with the gas in it', () => {
    engine.gasSubsystem.placeGas(32, 30, 'HYDROGEN', 0.5);
    engine.players.get(cid)!.playerBody.position = { x: 32.5, y: 30.5 };
    (engine as any).revealAndTrackTiles({ x: 32.5, y: 30.5 }, 2);
    tick(1);
    const entry = lastTick().revealedTiles!.find((r) => r.x === 32 && r.y === 30)!;
    expect(entry.gas).toEqual([1, quantizeGasConcentration(0.5)]);
    expect(lastTick().revealedTiles!.find((r) => r.x === 31 && r.y === 30)!.gas).toBeUndefined();
  });

  it('gives a joining client the gas definitions and a snapshot of only the revealed cells', () => {
    engine.gasSubsystem.placeGas(31, 31, 'HYDROGEN', 0.75);
    engine.gasSubsystem.placeGas(33, 31, 'NITROGEN', 0.25);
    engine.grid[31][31].revealed = true;
    const state = MiningSessionManager.getInstance().buildClientState(engine, cid);
    expect(state.gases!.map((g) => g.typeKey)).toEqual(['HYDROGEN', 'NITROGEN']);
    // Compared with the loaded definition, so an admin edit to the gas data does not break this
    const hydrogen = engine.dataManager.getGas('HYDROGEN')!;
    expect(state.gases![0]).toMatchObject({ id: 1, name: hydrogen.name, color: hydrogen.color, opacity: hydrogen.opacity, density: hydrogen.density });
    expect(state.gasCells).toEqual([[31, 31, 1, quantizeGasConcentration(0.75)]]);
  });

  it('sends how the gas looks, with whatever the admin left out filled in', () => {
    engine.dataManager.getGas('HYDROGEN')!.appearance = { softness: 0.1, driftAmount: 9 };
    const state = MiningSessionManager.getInstance().buildClientState(engine, cid);
    expect(state.gases![0].appearance).toEqual({ ...DEFAULT_GAS_APPEARANCE, softness: 0.1, driftAmount: 0.5 });
  });

  it('carries the gas\'s playable sounds, and none when it has none', () => {
    expect(engine.gasSubsystem.clientDefinitions()[0].sounds).toBeUndefined();
    const sounds = { explode: { soundId: 's1', url: '/assets/sounds/boom.mp3', volume: 0.5, loop: false } };
    engine.dataManager.getGas('HYDROGEN')!.sounds = sounds;
    expect(engine.gasSubsystem.clientDefinitions()[0].sounds).toEqual(sounds);
    engine.dataManager.getGas('HYDROGEN')!.sounds = {};
    expect(engine.gasSubsystem.clientDefinitions()[0].sounds).toBeUndefined();
  });

  it('reports gas that faded away as an empty cell', () => {
    // Open the pocket to the sky so gas in it fades
    for (let y = 29; y >= 0; y--) setTile(32, y, MiningTileType.EMPTY, true);
    for (let y = 30; y <= 32; y++) for (let x = 30; x <= 34; x++) engine.grid[y][x].revealed = true;
    (engine as any).buildWorld().pushTileUpdate({ x: 32, y: 0, type: MiningTileType.EMPTY });
    engine.gasSubsystem.placeGas(32, 31, 'HYDROGEN', 0.5);
    tick(600);
    const last = new Map<string, number[]>();
    for (const c of ticks().flatMap((t) => t.gasCells ?? [])) last.set(`${c[0]},${c[1]}`, c);
    expect(last.size).toBeGreaterThan(0);
    for (const c of last.values()) expect(c).toEqual([c[0], c[1], 0, 0]);
  });

  it('gives a player\'s and a mob\'s body the room\'s gas to sense, and a body in gas reads it', () => {
    for (let x = 30; x <= 34; x++) engine.grid[30][x].revealed = true;
    const player = engine.players.get(cid)!;
    player.playerBody.position = { x: 32.5, y: 30.5 };
    engine.gasSubsystem.grid.setCell(32, 30, 2, 0.8);
    tick(1);
    expect(player.playerBody.gasEnvironment).toBe(engine.gasSubsystem.environment);
    expect(player.playerBody.gasContact?.gasId).toBe(2);
    expect(engine.gasSubsystem.environment.propertiesOf(2)).toEqual({ density: engine.dataManager.getGas('NITROGEN')!.density });
    expect(engine.gasSubsystem.environment.propertiesOf(99)).toBeUndefined();
  });
});
