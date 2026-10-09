import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MINING_CONFIG, MiningTileType, type DamageEvent } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { giveBlockDrops, hitMob } from './testHelpers';

const ev = (over: Partial<DamageEvent> = {}): DamageEvent => ({
  amount: 10,
  type: 'melee',
  source: { kind: 'environment' },
  ...over,
});

describe('MiningDamageSystem', () => {
  afterEach(() => vi.restoreAllMocks());

  const cid = 'dmg-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };

  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const pendingTiles = () => (engine as any).pendingRevealedTiles as any[];

  /** Open room x 16..28, y 17..20 with a dirt floor at row 21; the player stands in it at x = 22.5. */
  const room = () => {
    for (let x = 16; x <= 28; x++) {
      for (let y = 17; y <= 20; y++) {
        engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
        engine.rigidWorld.removeTileCollider(x, y); // keep the physics world in step with the grid
      }
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    me().playerBody.position = { x: 22.5, y: 21 - me().playerBody.halfHeight };
    me().playerBody.isGrounded = true;
  };
  const spawn = (x = 25.5, extra: any = {}) => engine.spawnMob({ id: 'm', name: 'Mole', health: 100, attack: 5, ...extra }, { x, y: 21 });

  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 11, socket: socket as any,
      miningSpeed: 25, toolDamage: 25, weaponDamage: 25, equippedWeaponId: 'cmn_revolver_6shooter',
      mapConfig: { mobSpawnCount: 0 },
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    room();
  });

  describe('applyDamage — mobs', () => {
    it('reduces health and reports what was dealt', () => {
      const mob = spawn();
      expect(engine.applyDamage({ kind: 'mob', id: mob.id }, ev({ amount: 30 }))).toEqual({ applied: true, dealt: 30, killed: false });
      expect(mob.health).toBe(70);
      expect(mob.hitStunDurationMs).toBeGreaterThan(0);
    });

    it('reports a kill, capping dealt damage at the remaining health', () => {
      const mob = spawn(25.5, { health: 20 });
      expect(engine.applyDamage({ kind: 'mob', id: mob.id }, ev({ amount: 500 }))).toEqual({ applied: true, dealt: 20, killed: true });
      expect(mob.animationState).toBe('death');
    });

    it('ignores unknown mobs, dead mobs and invalid amounts', () => {
      const mob = spawn();
      expect(engine.applyDamage({ kind: 'mob', id: 'nope' }, ev()).applied).toBe(false);
      for (const amount of [0, -4, NaN, Infinity]) {
        expect(engine.applyDamage({ kind: 'mob', id: mob.id }, ev({ amount })).applied).toBe(false);
      }
      expect(mob.health).toBe(100);
      hitMob(engine, mob.id, 1000);
      expect(engine.applyDamage({ kind: 'mob', id: mob.id }, ev()).applied).toBe(false);
    });

    it('applies knockback to mobs that can move, but never to stationary ones', () => {
      const walker = spawn(24.5);
      engine.applyDamage({ kind: 'mob', id: walker.id }, ev({ knockback: { x: 4.5, y: -3.2 } }));
      expect(walker.mobBody.velocity).toMatchObject({ x: 4.5, y: -3.2 });
      expect(walker.mobBody.isGrounded).toBe(false);

      const dummy = spawn(26.5, { aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 });
      engine.applyDamage({ kind: 'mob', id: dummy.id }, ev({ knockback: { x: 4.5, y: -3.2 } }));
      expect(dummy.mobBody.velocity.x).toBe(0);
    });

    it('applies no knockback when the hit has none (bullets, explosions)', () => {
      const mob = spawn();
      mob.mobBody.velocity.x = 0;
      engine.applyDamage({ kind: 'mob', id: mob.id }, ev());
      expect(mob.mobBody.velocity.x).toBe(0);
    });

    it('does not reduce damage by the mob\'s defense yet (deferred by design)', () => {
      const tank = spawn(25.5, { defense: 9999 });
      expect(engine.applyDamage({ kind: 'mob', id: tank.id }, ev({ amount: 30 })).dealt).toBe(30);
    });
  });

  describe('applyDamage — players', () => {
    it('applies the same validation, immunity and result shape as mobs', () => {
      expect(engine.applyDamage({ kind: 'player', id: cid }, ev({ amount: 25 }))).toEqual({ applied: true, dealt: 25, killed: false });
      expect(engine.applyDamage({ kind: 'player', id: cid }, ev({ amount: 25 })).applied).toBe(false); // immune
      expect(engine.applyDamage({ kind: 'player', id: 'ghost' }, ev()).applied).toBe(false);
      expect(engine.applyDamage({ kind: 'player', id: cid }, ev({ amount: NaN })).applied).toBe(false);
      expect(me().health).toBe(75);
    });

    it('reports the kill and credits the source in the event the client receives', () => {
      const res = engine.applyDamage(
        { kind: 'player', id: cid },
        ev({ amount: 9999, source: { kind: 'mob', id: 'mob-7', name: 'Mole' } })
      );
      expect(res).toEqual({ applied: true, dealt: 100, killed: true });
      const hurt = socket.emit.mock.calls.find((c: any[]) => c[0] === 'player_damaged')![1];
      expect(hurt).toMatchObject({ sourceId: 'mob-7', sourceName: 'Mole' });
    });

    it('knocks the player back only when the event carries a push', () => {
      engine.applyDamage({ kind: 'player', id: cid }, ev({ amount: 1 }));
      expect(me().playerBody.knockbackRemaining).toBe(0);
      tick(20);
      engine.applyDamage({ kind: 'player', id: cid }, ev({ amount: 1, knockback: { x: -5, y: -4 } }));
      expect(me().playerBody.velocity.x).toBe(-5);
      expect(me().playerBody.knockbackRemaining).toBeCloseTo(MINING_CONFIG.PLAYER_HIT_KNOCKBACK_SECONDS);
    });
  });

  describe('damageTile', () => {
    const dirt = (x = 23, y = 20) => { engine.grid[y][x] = { type: MiningTileType.DIRT, revealed: true }; };

    it('accumulates damage and only announces a new crack stage when it changes', () => {
      dirt();
      (engine as any).pendingRevealedTiles = []; // drop fog-of-war reveals from setup
      const max = engine['dataManager'].getBlockMaxHealth(MiningTileType.DIRT);
      const first = engine.damageTile(23, 20, ev({ amount: 1, type: 'mining' }));
      expect(first).toMatchObject({ applied: true, destroyed: false, tileDamage: 1 });
      expect(pendingTiles()).toHaveLength(0); // still the same stage

      engine.damageTile(23, 20, ev({ amount: max * 0.6, type: 'mining' }));
      expect(pendingTiles()).toEqual([expect.objectContaining({ x: 23, y: 20, type: MiningTileType.DIRT, damageStage: expect.any(Number) })]);
      expect(engine.grid[20][23].damage).toBeCloseTo(1 + max * 0.6);
    });

    it('mines the block through at its max health, dropping loot for non-mob sources', () => {
      giveBlockDrops(engine, MiningTileType.CHEST);
      engine.grid[20][23] = { type: MiningTileType.CHEST, revealed: true };
      const max = engine['dataManager'].getBlockMaxHealth(MiningTileType.CHEST);
      const res = engine.damageTile(23, 20, ev({ amount: max, source: { kind: 'player', id: cid }, type: 'mining' }));
      expect(res).toMatchObject({ applied: true, destroyed: true });
      expect(engine.grid[20][23].type).toBe(MiningTileType.EMPTY);
      expect(engine.droppedItems.length).toBeGreaterThan(0);
    });

    it('drops nothing when a mob breaks the block', () => {
      giveBlockDrops(engine, MiningTileType.CHEST); // the block WOULD drop for anyone but a mob
      engine.grid[20][23] = { type: MiningTileType.CHEST, revealed: true };
      engine.damageTile(23, 20, ev({ amount: 99999, source: { kind: 'mob', id: 'm1' }, type: 'mining' }));
      expect(engine.grid[20][23].type).toBe(MiningTileType.EMPTY);
      expect(engine.droppedItems).toHaveLength(0);
    });

    it('stops everyone mining a block that breaks when no miners are given', () => {
      dirt();
      me().isMining = true;
      me().miningTarget = { x: 23, y: 20 };
      engine.damageTile(23, 20, ev({ amount: 99999 }));
      expect(me().isMining).toBe(false);
    });

    it('does not stop the shooter of a bullet that breaks an unrelated block', () => {
      dirt();
      me().isMining = true;
      me().miningTarget = { x: 20, y: 21 }; // mining somewhere else
      engine.damageTile(23, 20, ev({ amount: 99999, type: 'ranged', source: { kind: 'projectile', ownerId: cid } }));
      expect(me().isMining).toBe(true);
    });

    it.each([
      ['fractional coordinates', 23.5, 20],
      ['out of bounds', -1, 20],
      ['out of bounds (far)', 9999, 9999],
      ['NaN', NaN, 20],
    ])('ignores %s', (_n, x, y) => {
      expect(engine.damageTile(x as number, y as number, ev()).applied).toBe(false);
    });

    it.each([
      ['empty air', MiningTileType.EMPTY],
      ['indestructible rock', MiningTileType.ROCK],
      ['the entrance', MiningTileType.ENTRANCE],
      ['a ladder', MiningTileType.LADDER],
    ])('does not damage %s', (_n, type) => {
      engine.grid[20][23] = { type, revealed: true };
      expect(engine.damageTile(23, 20, ev({ amount: 99999 })).applied).toBe(false);
      expect(engine.grid[20][23].type).toBe(type);
    });

    it('rejects invalid amounts', () => {
      dirt();
      for (const amount of [0, -5, NaN, Infinity]) expect(engine.damageTile(23, 20, ev({ amount })).applied).toBe(false);
      expect(engine.grid[20][23].damage).toBeUndefined();
    });
  });

  describe('every damage source goes through the pipeline with the right event', () => {
    let hits: Array<{ target?: any; event: DamageEvent; kind: 'entity' | 'tile' }>;

    beforeEach(() => {
      hits = [];
      const sys = engine.damageSystem;
      const origApply = sys.applyDamage.bind(sys);
      const origTile = sys.damageTile.bind(sys);
      vi.spyOn(sys, 'applyDamage').mockImplementation((t, e) => { hits.push({ target: t, event: e, kind: 'entity' }); return origApply(t, e); });
      vi.spyOn(sys, 'damageTile').mockImplementation((x, y, e, m) => { hits.push({ target: { x, y }, event: e, kind: 'tile' }); return origTile(x, y, e, m); });
    });

    it('melee swings: type melee, credited to the player, with knockback', () => {
      const mob = spawn(23.4);
      me().inputs = { ...me().inputs, miningKey: true, miningTarget: null };
      me().aimDirection = { x: 1, y: 0 };
      tick(2);
      const hit = hits.find((h) => h.kind === 'entity' && h.target.kind === 'mob');
      expect(hit).toBeDefined();
      expect(hit!.target.id).toBe(mob.id);
      expect(hit!.event).toMatchObject({ type: 'melee', amount: 25, source: { kind: 'player', id: cid }, knockback: { y: -3.2 } });
    });

    it('bullets hitting a mob: type ranged, credited to the owner and weapon, no knockback', () => {
      const mob = spawn(25.5);
      me().playerBody.position.x = 20.5;
      engine.shootProjectile(cid, { x: 25.5, y: mob.mobBody.position.y });
      tick(15);
      const hit = hits.find((h) => h.kind === 'entity' && h.target.kind === 'mob');
      expect(hit).toBeDefined();
      expect(hit!.event.type).toBe('ranged');
      expect(hit!.event.source).toMatchObject({ kind: 'projectile', ownerId: cid, itemId: 'cmn_revolver_6shooter' });
      expect(hit!.event.source.id).toMatch(/^proj_/);
      expect(hit!.event.knockback).toBeUndefined();
      expect(mob.health).toBeLessThan(100);
    });

    it('bullets hitting a block: a tile hit credited to the shooter', () => {
      engine.grid[20][26] = { type: MiningTileType.DIRT, revealed: true };
      me().playerBody.position.x = 20.5;
      engine.shootProjectile(cid, { x: 26.5, y: 20.5 });
      tick(15);
      const hit = hits.find((h) => h.kind === 'tile');
      expect(hit).toBeDefined();
      expect(hit!.target).toEqual({ x: 26, y: 20 });
      expect(hit!.event).toMatchObject({ type: 'ranged', source: { kind: 'projectile', ownerId: cid } });
    });

    it('explosions: type explosive, credited to the thrower, flat configured damage', () => {
      const mob = spawn(24.5);
      engine.throwDynamite(cid, { target: { x: 24.5, y: 20 }, forceRatio: 0.05, explosionRadius: 3, itemId: 'dynamite' });
      const dyn = engine.activeDynamites[0];
      dyn.position.x = 24.5;
      dyn.position.y = 20;
      dyn.fuseRemainingSeconds = 0.01;
      tick(3);
      const hit = hits.find((h) => h.kind === 'entity' && h.event.type === 'explosive');
      expect(hit).toBeDefined();
      expect(hit!.event.amount).toBe(MINING_CONFIG.EXPLOSION_MOB_DAMAGE);
      expect(hit!.event.source).toMatchObject({ kind: 'explosion', ownerId: cid, itemId: 'dynamite' });
      expect(mob.health).toBe(100 - MINING_CONFIG.EXPLOSION_MOB_DAMAGE);
    });

    it('pickaxe swings on blocks: type mining, credited to the player', () => {
      engine.grid[20][23] = { type: MiningTileType.DIRT, revealed: true };
      me().inputs = { ...me().inputs, miningKey: true, miningTarget: { x: 23, y: 20 } };
      tick(25);
      const hit = hits.find((h) => h.kind === 'tile');
      expect(hit).toBeDefined();
      expect(hit!.event).toMatchObject({ type: 'mining', source: { kind: 'player', id: cid } });
      expect(engine.grid[20][23].damage).toBeGreaterThan(0);
    });

    it('mobs digging: type mining, credited to the mob', () => {
      engine.grid[20][26] = { type: MiningTileType.DIRT, revealed: true };
      const mob = spawn(25.5, { miningSpeed: 100 });
      engine.handleMobMining(mob, { x: 26, y: 20 }, 0.1);
      const hit = hits.find((h) => h.kind === 'tile');
      expect(hit!.event).toMatchObject({ type: 'mining', source: { kind: 'mob', id: mob.id } });
    });

    it('mob attacks: type melee, credited to the mob, knocking the player away', () => {
      const mob = spawn(23.4, { attack: 7 });
      tick(2);
      const hit = hits.find((h) => h.kind === 'entity' && h.target.kind === 'player');
      expect(hit).toBeDefined();
      expect(hit!.event).toMatchObject({ type: 'melee', amount: 7, source: { kind: 'mob', id: mob.id, name: 'Mole' } });
      expect(hit!.event.knockback!.x).toBeLessThan(0); // mob is to the right, so push left
      expect(me().health).toBe(93);
    });
  });
});
