import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

const RULE = { burnDamagePerSecond: 6, burnSeconds: 5, heatRadius: 2.5, heatDamagePerSecond: 1.5 };

describe('fluid contact effects in a mining room', () => {
  const cid = 'contact-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const seconds = (s: number) => tick(Math.round(s * 30));
  const place = (x: number) => { me().playerBody.position = { x, y: 21 - me().playerBody.halfHeight }; me().playerBody.isGrounded = true; };
  const fluidAt = (x: number, key: string) => engine.fluidSubsystem.placeFluid(x, 20, key, 1);
  const hits = () => socket.emit.mock.calls.filter((c) => c[0] === 'player_damaged').map((c) => c[1]);

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0, ...RULE }, maxHealth: 1000, socket: socket as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    const grid = engine.fluidSubsystem.grid;
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) grid.setCell(x, y, 0, 0);
    for (let x = 8; x <= 30; x++) {
      for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    // Test fluids defined here so the tests do not depend on the dev data
    const data = engine.dataManager;
    data.getFluid('OIL')!.contact = null;
    place(10.5);
    me().health = me().maxHealth;
  });

  afterEach(() => vi.restoreAllMocks());

  const withContact = (contact: any) => { engine.dataManager.getFluid('OIL')!.contact = contact; };

  const fillColumn = (x: number, rows: number[]) => { for (const y of rows) engine.fluidSubsystem.placeFluid(x, y, 'OIL', 1); };
  const lostIn = (rows: number[]) => {
    withContact({ damagePerSecond: 20 });
    fillColumn(20, rows);
    place(20.5);
    me().health = me().maxHealth;
    seconds(2);
    return me().maxHealth - me().health;
  };

  it('damages a fully submerged body by the fluid\'s damage per second, in whole hits', () => {
    const lost = lostIn([20, 19, 18, 17]);
    expect(lost).toBeGreaterThanOrEqual(34); // 20/s for 2 s (whole hits floor a little)
    expect(lost).toBeLessThanOrEqual(41);
    expect(hits().every((h) => Number.isInteger(h.damage) && h.damage >= 1)).toBe(true);
    expect(me().burning).toBeFalsy();
  });

  it('hurts less when only wading than when fully under', () => {
    const wading = lostIn([20]);
    expect(wading).toBeGreaterThan(0);
    engine.fluidSubsystem.grid.setCell(20, 20, 0, 0);
    expect(wading).toBeLessThan(lostIn([20, 19, 18, 17]) * 0.7);
  });

  it('does nothing to a body outside the fluid', () => {
    withContact({ damagePerSecond: 20, ignites: 100 });
    fluidAt(20, 'OIL');
    place(10.5);
    seconds(2);
    expect(me().health).toBe(me().maxHealth);
    expect(me().burning).toBeFalsy();
  });

  it('a fluid that ignites sets the body burning, and it keeps burning after leaving', () => {
    withContact({ ignites: 100 });
    fluidAt(20, 'OIL');
    place(20.5);
    tick(2);
    expect(me().burning).toBe(true);
    place(10.5);
    seconds(2);
    expect(me().burning).toBe(true);
    expect(me().health).toBeLessThan(me().maxHealth);
  });

  it('a fluid that extinguishes puts a burning body out and keeps it from catching fire', () => {
    engine.dataManager.getFluid('OIL')!.flammability = null;
    withContact({ extinguishes: true });
    fluidAt(20, 'OIL');
    engine.burningSubsystem.ignite('player', cid);
    place(10.5);
    tick(1);
    expect(me().burning).toBe(true);
    place(20.5);
    tick(1);
    expect(me().burning).toBe(false);
    engine.burningSubsystem.update(1 / 30);
    seconds(1);
    expect(me().burning).toBe(false);
  });

  it('a fluid with no contact data is harmless', () => {
    withContact(null);
    fluidAt(20, 'OIL');
    place(20.5);
    seconds(2);
    expect(me().health).toBe(me().maxHealth);
  });

  describe('lava as a spark', () => {
    const OIL_BURNS = { ignitionChance: 1, spreadChance: 0, burnDuration: 400, heat: 3, burnsInto: null };
    beforeEach(() => {
      engine.dataManager.getFluid('OIL')!.flammability = OIL_BURNS;
      engine.dataManager.getFluid('LAVA')!.contact = { damagePerSecond: 25, ignites: 100 };
    });

    it('sets alight flammable fluid next to it', () => {
      engine.fluidSubsystem.placeFluid(20, 20, 'LAVA', 1);
      engine.fluidSubsystem.placeFluid(21, 20, 'OIL', 1);
      seconds(1);
      expect(engine.fireSubsystem.grid.burningCount).toBeGreaterThan(0);
    });

    it('leaves oil far from the lava alone', () => {
      engine.fluidSubsystem.placeFluid(10, 20, 'LAVA', 1);
      engine.fluidSubsystem.placeFluid(28, 20, 'OIL', 1);
      seconds(1);
      expect(engine.fireSubsystem.grid.isBurning(28, 20)).toBe(false);
    });

    it('a lava that does not ignite lights nothing', () => {
      engine.dataManager.getFluid('LAVA')!.contact = { damagePerSecond: 25 };
      engine.fluidSubsystem.placeFluid(20, 20, 'LAVA', 1);
      engine.fluidSubsystem.placeFluid(21, 20, 'OIL', 1);
      seconds(1);
      expect(engine.fireSubsystem.grid.burningCount).toBe(0);
    });
  });
});
