import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MiningTileType, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { BURN_TICK_SECONDS } from './subsystems/MiningBurningSubsystem';

const OIL = { ignitionChance: 1, spreadChance: 0, burnDuration: 400, heat: 3, burnsInto: null }; // burns for ages, never spreads
const RULE = { burnDamagePerSecond: 6, burnSeconds: 5, heatRadius: 2.5, heatDamagePerSecond: 1.5 };

describe('burning and heat in a mining room', () => {
  const cid = 'burn-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const seconds = (s: number) => tick(Math.round(s * 30));
  const ticks = (): MiningStateTickPayload[] => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
  const place = (x: number) => { me().playerBody.position = { x, y: 21 - me().playerBody.halfHeight }; me().playerBody.isGrounded = true; };

  /** A long hall x 8..30, y 17..20 over a floor at row 21 (oil sits in cells x 20 and 21 at row 20, burning). */
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0, ...RULE }, maxHealth: 1000, socket: socket as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let y = 0; y < engine.fluidSubsystem.grid.height; y++) {
      for (let x = 0; x < engine.fluidSubsystem.grid.width; x++) engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
    }
    for (let x = 8; x <= 30; x++) {
      for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    engine.dataManager.getFluid('OIL')!.flammability = OIL;
    engine.fluidSubsystem.placeFluid(20, 20, 'OIL', 1);
    engine.fluidSubsystem.placeFluid(21, 20, 'OIL', 1);
    engine.fireSubsystem.grid.ignite(20, 20);
    engine.fireSubsystem.grid.ignite(21, 20);
    place(10.5);
    me().health = me().maxHealth;
  });

  afterEach(() => vi.restoreAllMocks());

  describe('burning', () => {
    it('a body that touches fire is set alight and takes burn damage, in whole-number hits twice a second', () => {
      place(20.5);
      tick(1);
      expect(me().burning).toBe(true);
      const start = me().health;
      seconds(2);
      // 6 per second plus heat from an oil fire (3 x 1.5 = 4.5 per second at the flames): about 21 in 2 seconds
      expect(start - me().health).toBeGreaterThanOrEqual(19);
      expect(start - me().health).toBeLessThanOrEqual(22);
      const hits = socket.emit.mock.calls.filter((c) => c[0] === 'player_damaged').map((c) => c[1].damage);
      expect(hits.every((d: number) => Number.isInteger(d) && d >= 1)).toBe(true);
      expect(hits.length).toBe(Math.round(2 / BURN_TICK_SECONDS));
    });

    it('far from any fire nothing happens', () => {
      place(10.5);
      seconds(3);
      expect(me().burning).toBeFalsy();
      expect(me().health).toBe(me().maxHealth);
    });

    it('keeps burning for the burn time after leaving the fire, then goes out by itself', () => {
      place(20.5);
      tick(1);
      place(10.5);
      seconds(4);
      expect(me().burning).toBe(true);
      seconds(1.5);
      expect(me().burning).toBe(false);
      const health = me().health;
      seconds(3);
      expect(me().health).toBe(health);
    });

    it('touching fire again starts the burn time over', () => {
      place(20.5);
      tick(1);
      place(10.5);
      seconds(4);
      place(20.5);
      tick(1);
      place(10.5);
      seconds(4);
      expect(me().burning).toBe(true);
    });

    it('does burn damage even during a player\'s hit protection, and does not start one', () => {
      place(20.5);
      me().invulnerableSeconds = 5;
      const start = me().health;
      seconds(1);
      expect(me().health).toBeLessThan(start);
      expect(me().invulnerableSeconds).toBeGreaterThan(3.9);
    });

    it('the burn time and damage come from the map config', () => {
      engine = new MiningGameEngine({
        characterId: cid, cityId: 'c', seed: 5, maxHealth: 1000, socket: socket as any,
        mapConfig: { mobSpawnCount: 0, burnDamagePerSecond: 0, burnSeconds: 1, heatDamagePerSecond: 0 },
      });
      { const fg = engine.fluidSubsystem.grid; for (let y = 0; y < fg.height; y++) for (let x = 0; x < fg.width; x++) fg.setCell(x, y, 0, 0); }
      for (let x = 8; x <= 30; x++) {
        for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
        engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
      }
      engine.dataManager.getFluid('OIL')!.flammability = OIL;
      engine.fluidSubsystem.placeFluid(20, 20, 'OIL', 1);
      engine.fireSubsystem.grid.ignite(20, 20);
      place(20.5);
      seconds(0.5);
      expect(me().burning).toBe(true);
      expect(me().health).toBe(me().maxHealth); // no damage configured
      place(10.5);
      seconds(1.2);
      expect(me().burning).toBe(false); // only burned for 1 second
    });

    it('a burning player in oil sets the oil alight', () => {
      engine.fluidSubsystem.placeFluid(12, 20, 'OIL', 1);
      vi.mocked(Math.random).mockReturnValue(0);
      engine.burningSubsystem.ignite('player', cid);
      place(12.5);
      expect(engine.fireSubsystem.grid.isBurning(12, 20)).toBe(false);
      seconds(0.5);
      expect(engine.fireSubsystem.grid.isBurning(12, 20)).toBe(true);
    });

    it('can be killed by burning', () => {
      me().health = 5;
      place(20.5);
      seconds(2);
      expect(me().health).toBeLessThanOrEqual(0);
      expect(me().isDead).toBe(true);
    });
  });

  describe('heat', () => {
    it('hurts near a fire without setting a body alight', () => {
      place(23.5); // 1.2 tiles from the flames' edge: 4.5 x (1 - 1.2/2.5) = about 2.3 a second
      seconds(2);
      expect(me().burning).toBeFalsy();
      expect(me().maxHealth - me().health).toBeGreaterThanOrEqual(3);
      expect(me().maxHealth - me().health).toBeLessThanOrEqual(5);
    });

    it('hurts less the farther away it is', () => {
      place(24.3); // 2 tiles from the edge: 4.5 x (1 - 2/2.5) = about 0.9 a second
      seconds(2);
      expect(me().maxHealth - me().health).toBeGreaterThanOrEqual(1);
      expect(me().maxHealth - me().health).toBeLessThanOrEqual(2);
    });

    it('does nothing beyond the heat radius', () => {
      place(22.5 + 3.5);
      seconds(2);
      expect(me().health).toBe(me().maxHealth);
    });

    it('stops when the fire goes out', () => {
      place(23.5);
      seconds(1);
      engine.fireSubsystem.grid.extinguish(20, 20);
      engine.fireSubsystem.grid.extinguish(21, 20);
      seconds(1);
      const health = me().health;
      seconds(2);
      expect(me().health).toBe(health);
    });
  });

  describe('mobs', () => {
    const makeMob = (x: number) =>
      engine.spawnMob({ id: 'm', name: 'Mole', health: 500, aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0, hitStunMs: 400, stunImmunityMs: 0 }, { x, y: 21 });

    it('burn and take damage just like a player, without being stunned', () => {
      const mob = makeMob(20.5);
      expect(mob.hitStunMs).toBe(400); // it could be stunned by an ordinary hit
      seconds(1);
      expect(mob.burning).toBe(true);
      expect(mob.health).toBeLessThan(500);
      expect(mob.animationState).not.toBe('damage');
    });

    it('a mob far from fire is left alone', () => {
      const mob = makeMob(12.5);
      seconds(2);
      expect(mob.burning).toBeFalsy();
      expect(mob.health).toBe(500);
    });

    it('a burning mob dies of it and stops burning', () => {
      const mob = engine.spawnMob({ id: 'm', name: 'Weak', health: 8, aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 }, { x: 20.5, y: 21 });
      seconds(2);
      expect(mob.health).toBeLessThanOrEqual(0);
      seconds(1);
      expect(mob.burning).toBe(false);
    });
  });

  describe('on the wire', () => {
    it('tells the burning player, mobs and other players they are on fire, and only while they are', () => {
      place(20.5);
      const mob = engine.spawnMob({ id: 'm', name: 'Mole', health: 500, aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 }, { x: 20.5, y: 21 });
      tick(2);
      expect(ticks().pop()!.burning).toBe(true);
      expect(ticks().pop()!.mobs!.find((m) => m.id === mob.id)!.burning).toBe(true);
      place(10.5);
      // Well clear of the oil, which spreads thinly along the hall (down to x 12) while it burns
      mob.mobBody.position = { x: 8.5, y: 21 - mob.mobBody.halfHeight };
      seconds(7);
      const last = ticks().pop()!;
      expect(last.burning).toBeUndefined();
      expect(last.mobs!.find((m) => m.id === mob.id)!.burning).toBeUndefined();
    });
  });
});
