import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { giveBlockDrops } from './testHelpers';

describe('clients are only told about what is near their player', () => {
  afterEach(() => vi.restoreAllMocks());

  const cid = 'interest-char';
  const RX = MINING_CONFIG.INTEREST_RADIUS_X;
  const B = 5; // where the player starts; the grid is only 45 wide
  const FAR = B + RX + 9; // well outside even the hysteresis band
  const ROW = 19; // the player's row; dirt floor below it
  let engine: MiningGameEngine;
  let ticks: any[];
  let mobIds: Record<string, string>;

  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const last = () => ticks[ticks.length - 1];
  const walkTo = (x: number) => { me().playerBody.position = { x, y: ROW + 0.5 }; me().playerBody.velocity = { x: 0, y: 0 }; };
  const addMob = (id: string, x: number) => {
    const mob = engine.spawnMob({ id, name: id, health: 100, aiType: 'PASSIVE' } as any, { x, y: ROW });
    mobIds[id] = mob.id;
    mob.mobBody.position = { x, y: ROW + 0.5 };
    mob.mobBody.velocity = { x: 0, y: 0 };
    mob.mobBody.hasGravity = false;
    return mob;
  };

  beforeEach(() => {
    ticks = [];
    mobIds = {};
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 7, mapConfig: { mobSpawnCount: 0 },
      socket: { connected: true, emit: (e: string, p: any) => e === 'mining_state_tick' && ticks.push(p) } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
      for (let y = 10; y <= ROW; y++) { engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true }; engine.rigidWorld.removeTileCollider(x, y); }
      engine.grid[ROW + 1][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    walkTo(B);
    tick(2);
  });

  describe('mobs', () => {
    it('sends near mobs, with their description once, and leaves far ones out entirely', () => {
      addMob('near', B + 5);
      addMob('far', FAR);
      tick(2);
      const idsSeen = ticks.flatMap((t) => (t.mobs ?? []).map((m: any) => m.id));
      expect(idsSeen).toContain(mobIds.near);
      expect(idsSeen).not.toContain(mobIds.far);
      const described = ticks.flatMap((t) => (t.spawned?.mobs ?? []).map((m: any) => m.id));
      expect(described).toEqual([mobIds.near]);
    });

    it('describes a mob when it comes into view, and again if it leaves and returns', () => {
      addMob('walker', FAR);
      tick(2);
      expect(last().mobs).toEqual([]);

      walkTo(FAR - 10); // now within range
      tick(1);
      expect(last().mobs.map((m: any) => m.id)).toEqual([mobIds.walker]);
      expect(last().spawned.mobs.map((m: any) => m.id)).toEqual([mobIds.walker]);
      tick(1);
      expect(last().spawned?.mobs).toBeUndefined();

      walkTo(B); // far again
      tick(1);
      expect(last().mobs).toEqual([]);
      walkTo(FAR - 10);
      tick(1);
      expect(last().spawned.mobs.map((m: any) => m.id)).toEqual([mobIds.walker]); // the client forgot it
    });

    it('keeps a known mob a little past the edge so it does not flicker, but not far past it', () => {
      const mob = addMob('edge', B + RX - 1);
      tick(2);
      expect(last().mobs).toHaveLength(1);
      mob.mobBody.position = { x: B + RX + 2, y: ROW + 0.5 }; // inside the hysteresis band
      tick(1);
      expect(last().mobs).toHaveLength(1);
      mob.mobBody.position = { x: B + RX + MINING_CONFIG.INTEREST_HYSTERESIS + 1, y: ROW + 0.5 }; // clearly out
      tick(1);
      expect(last().mobs).toEqual([]);
    });

    it('a mob that was never in view is not admitted at the hysteresis distance', () => {
      addMob('outer', B + RX + 2);
      tick(2);
      expect(last().mobs).toEqual([]);
    });
  });

  describe('everything else', () => {
    it('only sends falling rocks, explosions and gunshots near the player', () => {
      const farX = FAR;
      engine.explosiveSubsystem.pendingExplosions.push(
        { id: 'far-boom', position: { x: farX, y: ROW }, radius: 3 },
        { id: 'near-boom', position: { x: B + 2, y: ROW }, radius: 3 }
      );
      engine.projectileSubsystem.pendingGunshots.push(
        { id: 'far-shot', characterId: 'x', position: { x: farX, y: ROW } },
        { id: 'near-shot', characterId: 'x', position: { x: B + 2, y: ROW } }
      );
      tick(1);
      expect(last().explosions.map((e: any) => e.id)).toEqual(['near-boom']);
      expect(last().gunshots.map((g: any) => g.id)).toEqual(['near-shot']);
    });

    it('sends dropped items in view, and sends the list when the view moves over items that did not move', () => {
      giveBlockDrops(engine, MiningTileType.CHEST, [{ itemId: 'gem' }]);
      engine.spawnBlockDrops(FAR, ROW - 2, MiningTileType.CHEST);
      tick(300); // the item lands and fully settles
      expect(engine.droppedItems.length).toBe(1);
      expect(last().droppedItems === undefined || last().droppedItems.length === 0).toBe(true);

      walkTo(FAR - 10); // the settled, unmoving item comes into view
      tick(1);
      expect(last().droppedItems).toHaveLength(1);
      expect(last().spawned.droppedItems).toHaveLength(1);
      tick(1);
      expect(last().droppedItems).toBeUndefined(); // nothing changed since
    });

    it('sends weapon ammo only when it changes', () => {
      const session = me();
      vi.spyOn(engine.projectileSubsystem, 'getAmmoStatus').mockReturnValue({ current: 6, max: 6, isReloading: false });
      tick(1);
      expect(last().weaponAmmo).toEqual({ current: 6, max: 6, isReloading: false });
      tick(3);
      expect(ticks.slice(-3).every((t) => t.weaponAmmo === undefined)).toBe(true);
      (engine.projectileSubsystem.getAmmoStatus as any).mockReturnValue({ current: 5, max: 6, isReloading: false });
      tick(1);
      expect(last().weaponAmmo).toEqual({ current: 5, max: 6, isReloading: false });
      expect(session).toBeDefined();
    });

    it('rounds other entities\' positions to hundredths', () => {
      const mob = addMob("m", B + 4);
      mob.mobBody.position = { x: B + 4.123456, y: ROW + 0.5 };
      mob.mobBody.velocity = { x: 0.123456, y: 0 };
      tick(1);
      const sent = last().mobs.find((m: any) => m.id === mobIds.m);
      mob.mobBody.position = { x: B + 4.123456, y: ROW + 0.5 };
      expect(Math.round(sent.position.x * 100) / 100).toBe(sent.position.x);
      expect(Math.round(sent.position.y * 100) / 100).toBe(sent.position.y);
      expect(Math.round(sent.velocity.x * 100) / 100).toBe(sent.velocity.x);
    });
  });
});
