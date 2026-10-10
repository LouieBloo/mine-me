import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningSessionManager } from './MiningSessionManager';
import { collectSpawned,
  droppedItemDynamic, createKnownEntities, toActiveMob } from './MiningEntitySync';
import { MiningDataManager } from './subsystems/MiningDataManager';

vi.mock('../../index', () => ({ prisma: { character: { update: vi.fn() } } }));
vi.mock('../characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));

const STATIC_MOB_KEYS = ['name', 'mobId', 'maxHealth', 'attack', 'defense', 'animations', 'spriteUrl', 'colliderWidth', 'colliderHeight', 'showHealthBar'];

describe('entity description sent once, dynamic fields every tick', () => {
  let a: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  let b: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  let engine: MiningGameEngine;

  const ticksOf = (s: typeof a) => s.emit.mock.calls.filter((c: any[]) => c[0] === 'mining_state_tick').map((c: any[]) => c[1]);
  const last = (s: typeof a) => { const t = ticksOf(s); return t[t.length - 1]; };
  /** What a client would actually receive: JSON drops undefined fields. */
  const wire = (x: unknown) => JSON.parse(JSON.stringify(x));
  const tick = () => (engine as any).tick(1 / 30);

  beforeEach(() => {
    a = { connected: true, emit: vi.fn() };
    b = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({
      roomId: 'sync-room', gameMode: 'multiplayer', characterId: 'a', characterName: 'Alice', cityId: 'c', seed: 4,
      socket: a as any, mapConfig: { mobSpawnCount: 0 }, gearLayers: [{ url: '/hat.png', subType: 'HEAD' } as any],
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
  });

  describe('mobs', () => {
    it('describes a mob once, then sends only dynamic fields', () => {
      const mob = engine.spawnMob({ id: 'mole', name: 'Mole', health: 40, animations: { url: '/big.png', atlasUrl: '/big.json' }, spriteUrl: '/m.png' }, { x: 10, y: 15 });
      tick();
      expect(last(a).spawned.mobs).toEqual([expect.objectContaining({ id: mob.id, name: 'Mole', animations: { url: '/big.png', atlasUrl: '/big.json' }, maxHealth: 40 })]);

      tick();
      expect(last(a).spawned).toBeUndefined();
      const [dynamic] = wire(last(a).mobs);
      expect(dynamic.id).toBe(mob.id);
      for (const key of STATIC_MOB_KEYS) expect(dynamic).not.toHaveProperty(key);
      // Only per-tick fields (miningTarget appears only while the mob is digging)
      const DYNAMIC = ['animationState', 'health', 'id', 'isFacingLeft', 'isMining', 'miningTarget', 'position', 'velocity'];
      expect(Object.keys(dynamic).every((k) => DYNAMIC.includes(k))).toBe(true);
      expect(Object.keys(dynamic)).toEqual(expect.arrayContaining(['id', 'position', 'velocity', 'health', 'animationState']));
    });

    it('sends a mob\'s sound slots once with its description, never per tick', () => {
      const sounds = { attack: { soundId: 's1', url: '/assets/sounds/a.mp3', volume: 1, loop: false } };
      const mob = engine.spawnMob({ id: 'growler', name: 'Growler', sounds }, { x: 10, y: 15 });
      tick();
      expect(last(a).spawned.mobs).toEqual([expect.objectContaining({ id: mob.id, sounds })]);
      tick();
      expect(wire(last(a).mobs)[0]).not.toHaveProperty('sounds');
    });

    it('describes a mob that appears later, exactly once', () => {
      tick();
      expect(last(a).spawned).toBeUndefined();
      const mob = engine.spawnMob({ id: 'late', name: 'Late' }, { x: 12, y: 15 });
      tick();
      expect(last(a).spawned.mobs.map((m: any) => m.id)).toEqual([mob.id]);
      tick();
      expect(last(a).spawned).toBeUndefined();
    });

    it('keeps reporting health changes as dynamic data', () => {
      const mob = engine.spawnMob({ id: 'hp', name: 'HP', health: 40 }, { x: 10, y: 15 });
      tick();
      mob.health = 25;
      tick();
      expect(last(a).mobs[0].health).toBe(25);
      expect(last(a).spawned).toBeUndefined();
    });

    it('forgets a removed mob, so a new mob that reuses nothing is described fresh', () => {
      const first = engine.spawnMob({ id: 'x', name: 'First' }, { x: 10, y: 15 });
      tick();
      engine.activeMobs.delete(first.id);
      tick();
      expect(last(a).mobs).toEqual([]);
      const second = engine.spawnMob({ id: 'y', name: 'Second' }, { x: 10, y: 15 });
      tick();
      expect(last(a).spawned.mobs.map((m: any) => m.id)).toEqual([second.id]);
    });
  });

  describe('per-client bookkeeping', () => {
    it('each client is described to separately: a late joiner gets existing mobs, the first client does not get repeats', () => {
      engine.spawnMob({ id: 'm', name: 'M' }, { x: 10, y: 15 });
      tick();
      tick();
      expect(last(a).spawned).toBeUndefined();

      engine.addPlayer({ characterId: 'b', characterName: 'Bob', socket: b as any });
      tick();
      expect(last(b).spawned.mobs).toHaveLength(1); // the newcomer learns about the existing mob
      expect(last(a).spawned.mobs).toBeUndefined(); // Alice already knew it
      expect(last(a).spawned.players.map((p: any) => p.characterName)).toEqual(['Bob']); // but learns about Bob
    });

    it('a reconnecting client is described to again (its page started from nothing)', () => {
      engine.spawnMob({ id: 'm', name: 'M' }, { x: 10, y: 15 });
      tick();
      tick();
      expect(last(a).spawned).toBeUndefined();

      engine.addPlayer({ characterId: 'a', socket: a as any }); // re-entering the same run
      tick();
      expect(last(a).spawned.mobs).toHaveLength(1);
    });
  });

  describe('remote players', () => {
    beforeEach(() => {
      engine.addPlayer({ characterId: 'b', characterName: 'Bob', socket: b as any, gearLayers: [{ url: '/boots.png', subType: 'BOOTS' } as any] });
    });

    it('sends name and gear once, then only live state', () => {
      tick();
      expect(last(a).spawned.players).toEqual([expect.objectContaining({ characterId: 'b', characterName: 'Bob', gearLayers: [expect.objectContaining({ url: '/boots.png' })] })]);
      tick();
      expect(last(a).spawned).toBeUndefined();
      const dyn = wire(last(a).otherPlayers)[0];
      expect(dyn).not.toHaveProperty('characterName');
      expect(dyn).not.toHaveProperty('gearLayers');
      expect(dyn.characterId).toBe('b');
    });

    it('re-sends a player\'s description when their gear changes, and only then', () => {
      tick();
      tick();
      const loadout = { miningSpeed: 25, toolDamage: 25, weaponDamage: 25, pickPower: 0, knockback: 0, equippedWeaponId: null };

      engine.setLoadout('b', { ...loadout, gearLayers: [{ url: '/boots.png', subType: 'BOOTS' } as any] }); // unchanged gear
      tick();
      expect(last(a).spawned).toBeUndefined();

      engine.setLoadout('b', { ...loadout, gearLayers: [{ url: '/boots.png', subType: 'BOOTS' } as any, { url: '/gun.png', subType: 'WEAPON' } as any] });
      tick();
      expect(last(a).spawned.players[0].gearLayers.map((g: any) => g.url)).toEqual(['/boots.png', '/gun.png']);
      tick();
      expect(last(a).spawned).toBeUndefined();
    });

    it('a player who leaves is forgotten and described again if they come back', () => {
      tick();
      engine.removePlayer('b');
      tick();
      expect(last(a).otherPlayers).toEqual([]);
      engine.addPlayer({ characterId: 'b', characterName: 'Bob', socket: b as any });
      tick();
      expect(last(a).spawned.players.map((p: any) => p.characterId)).toEqual(['b']);
    });
  });

  describe('projectiles and dynamites', () => {
    it('describes a bullet once and then only moves it', () => {
      const e2 = new MiningGameEngine({
        characterId: 'a', cityId: 'c', seed: 4, socket: a as any, equippedWeaponId: 'cmn_revolver_6shooter', mapConfig: { mobSpawnCount: 0 },
      });
      engine = e2;
      e2.shootProjectile('a', { x: 30, y: -20 }); // fired up into the open sky, so it stays in flight
      tick();
      const first = last(a);
      expect(first.spawned.projectiles[0]).toMatchObject({ characterId: 'a', itemId: expect.any(String), spriteUrl: expect.any(String) });
      tick();
      expect(last(a).spawned?.projectiles).toBeUndefined();
      expect(Object.keys(wire(last(a).activeProjectiles)[0]).sort()).toEqual(['angle', 'id', 'position', 'velocity']);
    });

    it('describes a dynamite once (physics config, sounds, scale) and then only its motion and fuse', () => {
      engine.throwDynamite('a', { target: { x: 24, y: 20 }, forceRatio: 0.5, explosionRadius: 3, itemId: 'dynamite' });
      tick();
      expect(last(a).spawned.dynamites[0]).toMatchObject({ itemId: 'dynamite', explosionRadius: 3, inGameScale: expect.any(Number) });
      tick();
      expect(last(a).spawned?.dynamites).toBeUndefined();
      expect(Object.keys(wire(last(a).activeDynamites)[0]).sort()).toEqual(
        ['angle', 'angularVelocity', 'fuseRemainingSeconds', 'id', 'position', 'velocity'].sort()
      );
    });
  });

  describe('join snapshot', () => {
    it('still carries complete entities so a joining client can render immediately', () => {
      engine.spawnMob({ id: 'm', name: 'Snapshotted', spriteUrl: '/s.png' }, { x: 10, y: 15 });
      engine.addPlayer({ characterId: 'b', characterName: 'Bob', socket: b as any });
      const manager = MiningSessionManager.getInstance();
      const state = manager.buildClientState(engine, 'a');
      expect(state.mobs?.[0]).toMatchObject({ name: 'Snapshotted', spriteUrl: '/s.png', maxHealth: expect.any(Number) });
      expect(state.otherPlayers?.[0]).toMatchObject({ characterId: 'b', characterName: 'Bob' });
    });
  });

  describe('payload size', () => {
    it('keeps a steady-state tick far smaller than re-sending every description', () => {
      // Real mob data, including its full animation manifest
      const mole = MiningDataManager.getInstance().getMobData('Mole Person')!;
      expect(mole?.animations).toBeDefined();
      for (let i = 0; i < 20; i++) engine.spawnMob(mole, { x: 5 + (i % 15), y: 15 });

      tick(); // described here
      const describedTick = JSON.stringify(last(a)).length;
      tick(); // steady state
      const steady = last(a);
      const steadyTick = JSON.stringify(steady).length;

      const legacyMobs = JSON.stringify(Array.from(engine.activeMobs.values(), toActiveMob)).length;
      const steadyMobs = JSON.stringify(steady.mobs).length;
      console.info(`[size] 20 mobs: steady ${steadyMobs} B/tick vs ${legacyMobs} B/tick before (${((steadyMobs / legacyMobs) * 100).toFixed(1)}%)`);

      expect(steady.mobs).toHaveLength(20);
      expect(steadyMobs / 20).toBeLessThan(260); // bytes per mob per tick
      expect(steadyMobs).toBeLessThan(legacyMobs * 0.15); // a small fraction of the old per-tick mob cost
      expect(steadyTick).toBeLessThan(6_000); // whole tick with 20 mobs
      expect(describedTick).toBeGreaterThan(steadyTick * 5); // the one-off description is where the weight went
    });
  });
});

describe('collectSpawned', () => {
  const player = (id: string, gearVersion = 0) => ({ characterId: id, gearVersion, gearLayers: [], characterName: id, playerBody: { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } }, isFacingLeft: false, animationState: 'idle', isMining: false, miningTarget: null, aimDirection: { x: 1, y: 0 }, flashlightOn: false }) as any;

  it('returns undefined when everything is already known', () => {
    const known = createKnownEntities();
    expect(collectSpawned(known, { mobs: [], projectiles: [], dynamites: [], others: [] })).toBeUndefined();
  });

  it('records what it sends and sends nothing the second time', () => {
    const known = createKnownEntities();
    const world = { mobs: [], projectiles: [], dynamites: [], others: [player('p')] };
    expect(collectSpawned(known, world)?.players).toHaveLength(1);
    expect(collectSpawned(known, world)).toBeUndefined();
    expect(known.players.get('p')).toBe(0);
  });

  it('re-sends a player only when the gear version moves', () => {
    const known = createKnownEntities();
    collectSpawned(known, { mobs: [], projectiles: [], dynamites: [], others: [player('p', 0)] });
    expect(collectSpawned(known, { mobs: [], projectiles: [], dynamites: [], others: [player('p', 1)] })?.players).toHaveLength(1);
    expect(collectSpawned(known, { mobs: [], projectiles: [], dynamites: [], others: [player('p', 1)] })).toBeUndefined();
  });

  it('prunes known ids that disappeared', () => {
    const known = createKnownEntities();
    known.mobs.add('gone');
    known.players.set('gone', 3);
    collectSpawned(known, { mobs: [], projectiles: [], dynamites: [], others: [] });
    expect(known.mobs.size).toBe(0);
    expect(known.players.size).toBe(0);
  });

  it('describes a dropped item once, then never again while it stays on the floor', () => {
    const known = createKnownEntities();
    const item = { id: 'd1', itemId: 'gem', itemName: 'Gem', iconUrl: '/g.png', quantity: 1, position: { x: 1, y: 1 } } as any;
    const world = { mobs: [], projectiles: [], dynamites: [], others: [], droppedItems: [item] };
    expect(collectSpawned(known, world)?.droppedItems).toEqual([item]);
    expect(collectSpawned(known, world)).toBeUndefined();
    collectSpawned(known, { ...world, droppedItems: [] }); // picked up
    expect(known.droppedItems.size).toBe(0);
  });

  it('puts only an id and a position (to 1/100 tile) in a dropped item\'s dynamic part', () => {
    const dyn = droppedItemDynamic({ id: 'd1', itemId: 'gem', itemName: 'Gem', iconUrl: null, quantity: 1, position: { x: 1.23456, y: 7.891 }, inGameSpriteUrl: '/x.png' });
    expect(dyn).toEqual({ id: 'd1', position: { x: 1.23, y: 7.89 } });
  });
});
