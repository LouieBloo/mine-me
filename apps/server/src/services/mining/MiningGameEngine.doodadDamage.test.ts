import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningTileType, type DamageEvent, type DoodadDefinition, type DoodadPlacement, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningDoodadSubsystem } from './subsystems/MiningDoodadSubsystem';
import { MiningProjectileEntity } from './physics/MiningProjectileEntity';
import { MiningRockEntity } from './physics/MiningRockEntity';

const def = (key: string, anchor: DoodadDefinition['anchor'], over: Partial<DoodadDefinition> = {}): DoodadDefinition => ({
  id: key, key, name: key, anchor, width: 1, height: 1, zOffset: 0, biomes: [], ...over,
});
// Ordered by key: 0 bug (floor, 10 hp), 1 hanging (ceiling, 15 hp, 1 wide 3 high), 2 icicle (ceiling, no health), 3 moss (floor, no health)
const DEFS = [
  def('a_bug', 'FLOOR', { health: 10 }),
  def('b_hanging', 'CEILING', { health: 15, height: 3 }),
  def('c_icicle', 'CEILING', { height: 3 }),
  def('d_moss', 'FLOOR'),
];
const BUG = 0, HANGING = 1, ICICLE = 2, MOSS = 3;
const at = (typeIndex: number, x: number, y: number): DoodadPlacement => ({ typeIndex, x, y, variant: 0, flip: false });
const hit = (over: Partial<DamageEvent> = {}): DamageEvent => ({ amount: 99999, type: 'mining', source: { kind: 'environment' }, ...over }) as DamageEvent;

describe('hurting and dropping doodads (ticket 143)', () => {
  const cid = 'doodad-damage';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const ticks = (): MiningStateTickPayload[] => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
  const lastTick = () => ticks()[ticks().length - 1];
  const place = (placements: DoodadPlacement[], defs = DEFS) => {
    engine.doodadSubsystem = new MiningDoodadSubsystem((engine as any).worldView, defs, placements);
    for (const p of engine.doodadSubsystem.placements()) engine.doodadSubsystem.onTileRevealed(p.x, p.y);
    tick(1); // sends the additions, so later deltas are about doodads the clients know
  };
  const standing = () => engine.doodadSubsystem.placements().map((p) => `${p.typeIndex}@${p.x},${p.y}`);
  const hp = (x: number, y: number) => engine.doodadSubsystem.healthAt(x, y);
  const hurtDoodad = (x: number, y: number, amount: number) => engine.applyDamage({ kind: 'doodad', id: `${x},${y}` }, hit({ amount, type: 'ranged' }));

  /**
   * A shaft x 30..36 of open air from y 20 to y 39 in solid dirt (roof y 19, floor y 40, walls x 29 and 37), all revealed,
   * the player far away at the top left of the map.
   */
  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0, skyRows: 0 }, socket: socket as any, maxHealth: 100 });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let y = 18; y <= 41; y++) {
      for (let x = 28; x <= 38; x++) {
        const open = x >= 30 && x <= 36 && y >= 20 && y <= 39;
        engine.grid[y][x] = { type: open ? MiningTileType.EMPTY : MiningTileType.DIRT, revealed: true };
        engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
        if (open) engine.rigidWorld.removeTileCollider(x, y);
        else engine.rigidWorld.addTileCollider(x, y);
      }
    }
    me().playerBody.position = { x: 130.5, y: 5.5 };
  });

  describe('a hit on a doodad', () => {
    beforeEach(() => place([at(BUG, 32, 39), at(MOSS, 34, 39)]));

    it('spares a doodad that has no health', () => {
      expect(hurtDoodad(34, 39, 50)).toMatchObject({ applied: false });
      expect(standing()).toContain('3@34,39');
      expect(engine.doodadSubsystem.hurtableCovering(34, 39)).toBeUndefined();
    });

    it('takes health, tells the clients who knew of it, and leaves it standing', () => {
      const result = hurtDoodad(32, 39, 4);
      expect(result).toEqual({ applied: true, dealt: 4, killed: false });
      expect(hp(32, 39)).toBe(6);
      tick(1);
      expect(lastTick().doodadsHit).toEqual([[32, 39]]);
      expect(lastTick().doodadsKilled).toBeUndefined();
      expect(standing()).toContain('0@32,39');
    });

    it('kills it when its health is used up: gone for good, with a kill and a removal in the same tick', () => {
      const result = hurtDoodad(32, 39, 25);
      expect(result).toEqual({ applied: true, dealt: 10, killed: true });
      expect(standing()).not.toContain('0@32,39');
      tick(1);
      expect(lastTick().doodadsKilled).toEqual([[32, 39]]);
      expect(lastTick().doodadsRemoved).toEqual([[32, 39]]);
      expect(lastTick().fallingDoodads).toBeUndefined(); // a floor doodad does not fall
      expect(hurtDoodad(32, 39, 1)).toMatchObject({ applied: false });
    });

    it('says nothing about a doodad the clients were never told of', () => {
      engine.doodadSubsystem = new MiningDoodadSubsystem((engine as any).worldView, DEFS, [at(BUG, 32, 39)]);
      engine.grid[39][32].revealed = false;
      hurtDoodad(32, 39, 4);
      hurtDoodad(32, 39, 40);
      tick(1);
      expect(lastTick().doodadsHit).toBeUndefined();
      expect(lastTick().doodadsKilled).toBeUndefined();
    });

    it('refuses an amount that is not a damage', () => {
      expect(engine.applyDamage({ kind: 'doodad', id: '32,39' }, hit({ amount: 0 }))).toMatchObject({ applied: false });
      expect(hp(32, 39)).toBe(10);
    });

    it('ignores a hit on an id that is not a doodad', () => {
      expect(engine.applyDamage({ kind: 'doodad', id: 'nope' }, hit({ amount: 5 }))).toMatchObject({ applied: false });
      expect(engine.applyDamage({ kind: 'doodad', id: '1,1' }, hit({ amount: 5 }))).toMatchObject({ applied: false });
    });
  });

  describe('every source of damage', () => {
    beforeEach(() => place([at(BUG, 32, 39), at(MOSS, 34, 39)]));

    it('a bullet kills a bug it reaches and stops there, and flies on through scenery that has no health', () => {
      const shot = new MiningProjectileEntity('p1', cid, { x: 30.3, y: 39.5 }, { x: 90, y: 0 }, { damage: 10 });
      engine.activeProjectiles = [shot];
      tick(1);
      expect(standing()).not.toContain('0@32,39');
      expect(shot.hasHit).toBe(true);
      expect(standing()).toContain('3@34,39');
    });

    it('a slow bullet that sits in a bug over several steps hurts it once', () => {
      const shot = new MiningProjectileEntity('p2', cid, { x: 32.5, y: 39.5 }, { x: 0.1, y: 0 }, { damage: 3, pierceCount: 5 });
      engine.activeProjectiles = [shot];
      tick(4);
      expect(hp(32, 39)).toBe(7);
    });

    it('the nearest of a mob and a doodad is the one a bullet hits', () => {
      const mob = engine.spawnMob({ id: 'm', name: 'M', health: 100, aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 }, { x: 31, y: 40 });
      const shot = new MiningProjectileEntity('p3', cid, { x: 30.3, y: 39.5 }, { x: 90, y: 0 }, { damage: 10 });
      engine.activeProjectiles = [shot];
      tick(1);
      expect(mob.health).toBeLessThan(100);
      expect(hp(32, 39)).toBe(10);
    });

    it('a melee swing hurts a bug in reach, but not through a wall', () => {
      place([at(BUG, 33, 39)]);
      const p = me();
      p.playerBody.position = { x: 30.5, y: 38.7 };
      p.aimDirection = { x: 1, y: 0 };
      p.weaponDamage = 3;
      p.swungThisTick = true;
      engine.playerManager.handleMeleeAttacks();
      expect(hp(33, 39)).toBe(7);

      place([at(BUG, 33, 39)]);
      for (const y of [38, 39]) engine.grid[y][32] = { type: MiningTileType.DIRT, revealed: true };
      p.swungThisTick = true;
      engine.playerManager.handleMeleeAttacks();
      expect(hp(33, 39)).toBe(10);
    });

    it('a swing far from the bug misses', () => {
      const p = me();
      p.playerBody.position = { x: 36, y: 20.7 };
      p.aimDirection = { x: -1, y: 0 };
      p.swungThisTick = true;
      engine.playerManager.handleMeleeAttacks();
      expect(hp(32, 39)).toBe(10);
    });

    it('dynamite hurts a bug in the blast, as explosive damage, and not one far outside it', () => {
      place([at(BUG, 32, 39), at(BUG, 36, 39)]);
      const spy = vi.spyOn(engine.damageSystem, 'applyDamage');
      engine.explodeDynamite({ id: 'dyn', position: { x: 32, y: 38 }, explosionRadius: 4, ownerId: cid } as any);
      const hurt = spy.mock.calls.filter(([t]) => t.kind === 'doodad');
      expect(hurt.map(([t]) => t.id)).toContain('32,39');
      expect(hurt.find(([t]) => t.id === '32,39')![1]).toMatchObject({ type: 'explosive' });
      spy.mockClear();
      engine.explodeDynamite({ id: 'dyn2', position: { x: 10, y: 38 }, explosionRadius: 3, ownerId: cid } as any);
      expect(spy.mock.calls.filter(([t]) => t.kind === 'doodad')).toHaveLength(0);
    });

    it('an explosion of gas hurts a bug beside it', () => {
      const spy = vi.spyOn(engine.damageSystem, 'applyDamage');
      const cells = [{ x: 32, y: 38, concentration: 1, explosion: { blastRadius: 5, damage: 80, frontSpeed: 1 } }];
      (engine.gasExplosionSubsystem as any).hurt(cells, 'boom');
      expect(spy.mock.calls.some(([t]) => t.kind === 'doodad' && t.id === '32,39')).toBe(true);
      expect(standing()).not.toContain('0@32,39');
    });

    it('a rock that falls through a bug crushes it, once', () => {
      place([at(BUG, 32, 39)]);
      const spy = vi.spyOn(engine.damageSystem, 'applyDamage');
      const rock = new MiningRockEntity('rock_t', 32, 22, engine.rigidWorld, { gravityScale: engine.rigidWorld.config.rockGravityScale, restitution: engine.rigidWorld.config.rockRestitution });
      (engine as any).rockSubsystem.activeRocks.push(rock);
      for (let i = 0; i < 90 && !rock.hasSettled; i++) tick(1);
      const crushes = spy.mock.calls.filter(([t]) => t.kind === 'doodad');
      expect(crushes).toHaveLength(1);
      expect(crushes[0][1]).toMatchObject({ type: 'environmental', source: { name: 'Falling rock' } });
      expect(standing()).not.toContain('0@32,39');
    });
  });

  describe('a ceiling doodad falls', () => {
    // The hanging one is 1 wide and 3 high, hanging from y 20 (the roof block is y 19)
    beforeEach(() => place([at(HANGING, 33, 20), at(ICICLE, 35, 20), at(BUG, 33, 39), at(MOSS, 31, 39)]));

    it('does not fall while its block holds', () => {
      tick(10);
      expect(engine.doodadSubsystem.falling.list).toHaveLength(0);
      expect(standing()).toContain('1@33,20');
    });

    it('falls when the block above it is mined: removed from the wall, in the air, and on the wire', () => {
      me().playerBody.position = { x: 30.5, y: 25 };
      engine.damageTile(33, 19, hit());
      expect(standing()).not.toContain('1@33,20');
      expect(engine.doodadSubsystem.falling.list).toHaveLength(1);
      tick(1);
      expect(lastTick().doodadsRemoved).toEqual([[33, 20]]);
      expect(lastTick().doodadsKilled).toBeUndefined();
      const [wire] = lastTick().fallingDoodads!;
      expect(wire.slice(1, 4)).toEqual([HANGING, 0, 0]);
      expect(wire[5]).toBeGreaterThan(20);
    });

    it('falls from a blast that clears its block', () => {
      engine.explodeDynamite({ id: 'dyn', position: { x: 33, y: 17 }, explosionRadius: 2, ownerId: cid } as any);
      expect(engine.doodadSubsystem.falling.list.length).toBeGreaterThan(0);
    });

    it('falls when shot down, though its block is untouched', () => {
      expect(hurtDoodad(33, 20, 99).killed).toBe(true);
      expect(engine.doodadSubsystem.falling.list).toHaveLength(1);
      tick(1);
      expect(lastTick().doodadsKilled).toEqual([[33, 20]]);
      expect(engine.grid[19][33].type).toBe(MiningTileType.DIRT);
    });

    it('a ceiling doodad with no health cannot be shot, but still falls with its block', () => {
      expect(hurtDoodad(35, 20, 99)).toMatchObject({ applied: false });
      engine.damageTile(35, 19, hit());
      expect(engine.doodadSubsystem.falling.list.map((f) => f.typeIndex)).toEqual([ICICLE]);
    });

    it('a floor doodad just vanishes when its block goes', () => {
      engine.damageTile(31, 40, hit());
      expect(engine.doodadSubsystem.falling.list).toHaveLength(0);
      expect(standing()).not.toContain('3@31,39');
    });

    it('lands on the floor, shatters, and is gone', () => {
      me().playerBody.position = { x: 30.5, y: 39 };
      engine.damageTile(35, 19, hit());
      tick(120);
      expect(engine.doodadSubsystem.falling.list).toHaveLength(0);
      const shattered = ticks().flatMap((t) => t.doodadsShattered ?? []);
      expect(shattered).toHaveLength(1);
      const [typeIndex, , , x, y] = shattered[0];
      expect([typeIndex, x]).toEqual([ICICLE, 35]);
      expect(y + 3).toBe(40); // its bottom sits on the floor
      expect(engine.grid[39][35].type).toBe(MiningTileType.EMPTY); // it never becomes a block
      tick(1);
      expect(lastTick().fallingDoodads).toBeUndefined();
    });

    it('hurts a player standing under it, once, and shoves them', () => {
      me().playerBody.position = { x: 33.5, y: 40 - me().playerBody.halfHeight };
      me().playerBody.isGrounded = true;
      engine.damageTile(33, 19, hit());
      for (let i = 0; i < 120 && engine.doodadSubsystem.falling.list.length > 0; i++) {
        me().playerBody.position = { x: 33.5, y: 40 - me().playerBody.halfHeight };
        tick(1);
      }
      const events = socket.emit.mock.calls.filter((c) => c[0] === 'player_damaged').map((c) => c[1]);
      expect(events).toHaveLength(1);
      expect(events[0].sourceName).toBe('Falling b_hanging');
      expect(me().health).toBeLessThan(100);
    });

    it('spares a player who is not in its way', () => {
      me().playerBody.position = { x: 36.5, y: 40 - me().playerBody.halfHeight };
      engine.damageTile(33, 19, hit());
      tick(120);
      expect(me().health).toBe(100);
    });

    it('hurts a mob under it', () => {
      const mob = engine.spawnMob({ id: 'm', name: 'M', health: 1000, aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 }, { x: 33.5, y: 38.5 });
      engine.damageTile(33, 19, hit());
      tick(120);
      expect(mob.health).toBeLessThan(1000);
    });

    it('kills a bug under it, and not the moss beside it', () => {
      engine.damageTile(33, 19, hit());
      tick(120);
      expect(standing()).not.toContain('0@33,39');
      expect(standing()).toContain('3@31,39');
    });

    it('hurts harder the heavier it is', () => {
      const lost = (fallDamage: number) => {
        const heavy = { ...DEFS[1], fallDamage };
        place([at(HANGING, 33, 20)], [DEFS[0], heavy, DEFS[2], DEFS[3]]);
        const mob = engine.spawnMob({ id: `m${fallDamage}`, name: 'M', health: 100000, aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 }, { x: 33.5, y: 38.5 });
        engine.damageTile(33, 19, hit());
        tick(120);
        const taken = 100000 - mob.health;
        engine.activeMobs.delete(mob.id);
        engine.grid[19][33] = { type: MiningTileType.DIRT, revealed: true };
        return taken;
      };
      const light = lost(1);
      const heavy = lost(4);
      expect(light).toBeGreaterThan(0);
      expect(heavy).toBeGreaterThan(light);
    });

    it('lets sandbox tools drop and hurt doodads', () => {
      expect(engine.doodadSubsystem.dropAt(33, 20)).toBe(true);
      expect(engine.doodadSubsystem.falling.list).toHaveLength(1);
      expect(engine.doodadSubsystem.dropAt(33, 20)).toBe(false);
      expect(engine.doodadSubsystem.dropAt(31, 39)).toBe(true); // moss just goes
      expect(engine.doodadSubsystem.falling.list).toHaveLength(1);
    });
  });
});
