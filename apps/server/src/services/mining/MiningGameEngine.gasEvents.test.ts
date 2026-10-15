import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MINING_CONFIG, MiningTileType, type GasEvent, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('gas events: the sounds gases make', () => {
  const cid = 'gas-sound-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const me = () => engine.players.get(cid)!;
  const gas = () => engine.gasSubsystem;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const ticks = (): MiningStateTickPayload[] => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
  const sent = (): GasEvent[] => ticks().flatMap((t) => t.gasEvents ?? []);
  /** Walks the player to a spot and runs the body check, returning the events it queued. */
  const standAt = (x: number, y: number) => {
    me().playerBody.position = { x, y };
    gas().trackBodies();
  };
  const taken = () => gas().takeEvents();
  /** Lets game time go by (the cooldown between a body's sounds is measured in it) without running the room. */
  const passTime = (seconds: number) => {
    (engine as any).elapsedTimeSeconds += seconds;
  };
  const setTile = (x: number, y: number, type: number, revealed = true) => {
    engine.grid[y][x] = { type: type as MiningTileType, revealed };
  };
  const changeTile = (x: number, y: number, type: number) => {
    setTile(x, y, type);
    (engine as any).buildWorld().pushTileUpdate({ x, y, type });
  };

  /** A sealed hall x 20..31, y 20..22 in solid dirt, with a shaft up to the roof at x 25 (closed at the surface). */
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: socket as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let y = 0; y <= 24; y++) {
      for (let x = 18; x <= 33; x++) {
        const open = (x >= 20 && x <= 31 && y >= 20 && y <= 22) || (x === 25 && y >= 1 && y <= 19);
        setTile(x, y, open ? MiningTileType.EMPTY : MiningTileType.DIRT);
      }
    }
    const g = gas().grid;
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) g.setCell(x, y, 0, 0);
    gas().drainChanges();
    g.refreshSky(); // the hall was carved out after the engine built its grid
    me().playerBody.position = { x: 5.5, y: 5.5 };
    taken();
  });

  afterEach(() => vi.restoreAllMocks());

  describe('walking into and out of a cloud', () => {
    it('queues an enter event when the gas around a body gets thick enough, and an exit when it thins out', () => {
      gas().placeGas(22, 21, 'NITROGEN', 1);
      standAt(22.5, 21.5);
      expect(taken()).toEqual([{ kind: 'enter', gasId: gas().registry.idOf('NITROGEN'), x: 22.5, y: 21.5 }]);
      // Still in it: nothing more
      standAt(22.5, 21.5);
      expect(taken()).toEqual([]);
      // Walks out into clear air
      passTime(10);
      standAt(28.5, 21.5);
      expect(taken()).toEqual([{ kind: 'exit', gasId: gas().registry.idOf('NITROGEN'), x: 28.5, y: 21.5 }]);
    });

    it('does not enter on a wisp, and gives some slack at the edge: thick enough to enter, but only thin enough to leave', () => {
      gas().placeGas(22, 21, 'NITROGEN', 0.2);
      standAt(22.5, 21.5);
      expect(taken()).toEqual([]);
      gas().grid.setCell(22, 21, gas().registry.idOf('NITROGEN')!, 0.5);
      standAt(22.5, 21.5);
      expect(taken().map((e) => e.kind)).toEqual(['enter']);
      // Thinned, but not below the exit level: still counts as in the cloud (time has passed, so only the thresholds hold it)
      passTime(10);
      gas().grid.setCell(22, 21, gas().registry.idOf('NITROGEN')!, 0.2);
      standAt(22.5, 21.5);
      expect(taken()).toEqual([]);
      // ...and below the exit level it is out
      gas().grid.setCell(22, 21, gas().registry.idOf('NITROGEN')!, 0.05);
      standAt(22.5, 21.5);
      expect(taken().map((e) => e.kind)).toEqual(['exit']);
    });

    it('moving from one gas straight into another is an exit and an enter', () => {
      gas().placeGas(22, 21, 'NITROGEN', 1);
      gas().placeGas(27, 21, 'HYDROGEN', 1);
      standAt(22.5, 21.5);
      taken();
      passTime(10);
      standAt(27.5, 21.5);
      expect(taken().map((e) => `${e.kind}:${e.gasId}`)).toEqual([`exit:${gas().registry.idOf('NITROGEN')}`, `enter:${gas().registry.idOf('HYDROGEN')}`]);
    });

    it('does not repeat a body\'s sounds faster than the cooldown, but still tracks where it is', () => {
      gas().placeGas(22, 21, 'NITROGEN', 1);
      standAt(22.5, 21.5);
      expect(taken()).toHaveLength(1);
      // Out and in again straight away: the sound is held back, not queued for later
      standAt(28.5, 21.5);
      standAt(22.5, 21.5);
      expect(taken()).toEqual([]);
    });

    it('hears mobs too', () => {
      gas().placeGas(22, 21, 'NITROGEN', 1);
      const mob = engine.mobSubsystem.spawnMob(engine.dataManager.getMobs()[0], { x: 22.5, y: 21.5 });
      gas().trackBodies();
      const events = taken();
      expect(events.some((e) => e.kind === 'enter' && e.x === mob.mobBody.position.x)).toBe(true);
    });

    it('does nothing for a dead player', () => {
      gas().placeGas(22, 21, 'NITROGEN', 1);
      me().playerBody.position = { x: 22.5, y: 21.5 };
      me().isDead = true;
      gas().trackBodies();
      expect(taken()).toEqual([]);
    });

    it('sends an enter event to the client of the player who walked into the cloud', () => {
      gas().placeGas(22, 21, 'NITROGEN', 1);
      me().playerBody.position = { x: 22.5, y: 21.5 };
      tick(2);
      expect(sent().some((e) => e.kind === 'enter')).toBe(true);
    });

    it('is forgotten when the body goes, so the next one starts clean', () => {
      gas().placeGas(22, 21, 'NITROGEN', 1);
      standAt(22.5, 21.5);
      taken();
      const mob = engine.mobSubsystem.spawnMob(engine.dataManager.getMobs()[0], { x: 22.5, y: 21.5 });
      gas().trackBodies();
      engine.activeMobs.delete(mob.id);
      gas().trackBodies();
      expect(() => gas().trackBodies()).not.toThrow();
    });
  });

  describe('gas starting to escape', () => {
    it('queues one vent event when a roof is broken over gas, where the gas starts to leave', () => {
      for (let y = 17; y <= 22; y++) gas().placeGas(25, y, 'HYDROGEN', 1);
      changeTile(25, 0, MiningTileType.EMPTY);
      const events = taken().filter((e) => e.kind === 'vent');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ gasId: gas().registry.idOf('HYDROGEN'), x: 25.5 });
      // The topmost gas in the column that is newly open to the sky
      expect(events[0].y).toBe(17.5);
    });

    it('stays quiet when there is no gas under the opened roof, or only a wisp', () => {
      changeTile(25, 0, MiningTileType.EMPTY);
      expect(taken()).toEqual([]);
      changeTile(25, 0, MiningTileType.DIRT);
      gas().placeGas(25, 21, 'HYDROGEN', MINING_CONFIG.GAS_VENT_EVENT_MIN_CONCENTRATION / 2);
      changeTile(25, 0, MiningTileType.EMPTY);
      expect(taken()).toEqual([]);
    });

    it('stays quiet when the gas was already open to the sky, and for tile changes that open nothing', () => {
      changeTile(25, 0, MiningTileType.EMPTY);
      taken();
      gas().placeGas(25, 10, 'HYDROGEN', 1);
      changeTile(25, 5, MiningTileType.EMPTY); // already open
      expect(taken()).toEqual([]);
      changeTile(30, 21, MiningTileType.DIRT);
      expect(taken()).toEqual([]);
    });

    it('does not report a vent in a tile the player has not seen', () => {
      for (let y = 17; y <= 22; y++) gas().placeGas(25, y, 'HYDROGEN', 1);
      for (let y = 1; y <= 22; y++) engine.grid[y][25].revealed = false;
      changeTile(25, 0, MiningTileType.EMPTY);
      engine.grid[0][25].revealed = true;
      for (let y = 1; y <= 22; y++) engine.grid[y][25].revealed = false;
      expect(taken()).toEqual([]);
    });
  });

  describe('gas set alight', () => {
    it('queues one ignite event for the spark that starts an explosion, not one for every cell the front crosses', () => {
      for (let x = 20; x <= 31; x++) for (let y = 20; y <= 22; y++) gas().placeGas(x, y, 'HYDROGEN', 1);
      engine.ignitionSubsystem.emit(22.5, 21.5, 0.4, 1);
      for (let n = 0; n < 8; n++) engine.gasExplosionSubsystem.step();
      const events = taken().filter((e) => e.kind === 'ignite');
      expect(events).toEqual([{ kind: 'ignite', gasId: gas().registry.idOf('HYDROGEN'), x: 22.5, y: 21.5 }]);
    });

    it('is silent for gas that cannot be lit', () => {
      gas().placeGas(22, 21, 'NITROGEN', 1);
      engine.ignitionSubsystem.emit(22.5, 21.5, 0.4, 1);
      expect(taken().filter((e) => e.kind === 'ignite')).toEqual([]);
    });

    it('does not report an ignition in a tile the player has not seen', () => {
      gas().placeGas(22, 21, 'HYDROGEN', 1);
      engine.grid[21][22].revealed = false;
      engine.ignitionSubsystem.emit(22.5, 21.5, 0.4, 1);
      expect(taken()).toEqual([]);
    });

    it('reaches a client near the explosion on the tick it was lit', () => {
      for (let x = 20; x <= 22; x++) for (let y = 20; y <= 22; y++) gas().placeGas(x, y, 'HYDROGEN', 1);
      me().playerBody.position = { x: 21.5, y: 21.5 };
      engine.ignitionSubsystem.emit(21.5, 21.5, 0.4, 1);
      tick(3);
      expect(sent().filter((e) => e.kind === 'ignite')).toHaveLength(1);
      // ...and only that tick
      const before = ticks().length;
      tick(30);
      expect(ticks().slice(before).flatMap((t) => t.gasEvents ?? []).filter((e) => e.kind === 'ignite')).toEqual([]);
    });
  });
});
