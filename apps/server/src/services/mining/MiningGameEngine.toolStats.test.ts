import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningDataManager } from './subsystems/MiningDataManager';

describe('tool stats: one swing, separate tool/weapon damage, pick power, knockback', () => {
  const cid = 'tool-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };

  const me = () => engine.players.get(cid)!;
  const tick = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 30); i++) (engine as any).tick(1 / 30);
  };
  const notices = () => socket.emit.mock.calls.filter((c: any[]) => c[0] === 'mining_notice').map((c: any[]) => c[1]);

  const make = (opts: Record<string, unknown> = {}) => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, socket: socket as any,
      miningSpeed: 25, toolDamage: 25, weaponDamage: 40, pickPower: 0, knockback: 0,
      mapConfig: { mobSpawnCount: 0 }, ...opts,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    // Open room x 16..28, y 17..20 over a dirt floor at row 21; player stands at x = 22.5
    for (let x = 16; x <= 28; x++) {
      for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    me().playerBody.position = { x: 22.5, y: 21 - me().playerBody.halfHeight };
    me().playerBody.isGrounded = true;
    me().aimDirection = { x: 1, y: 0 };
    me().isFacingLeft = false;
  };
  const hold = (target: { x: number; y: number } | null) => {
    me().inputs = { ...me().inputs, miningKey: true, miningTarget: target };
  };
  const release = () => {
    me().inputs = { ...me().inputs, miningKey: false, miningTarget: null };
  };
  const dirt = (x = 23, y = 20) => { engine.grid[y][x] = { type: MiningTileType.DIRT, revealed: true }; };
  const mob = (x = 23.4, extra: any = {}) => engine.spawnMob({ id: 'm', name: 'Mole', health: 500, ...extra }, { x, y: 21 });
  /** A target that doesn't get knocked out of the weapon's reach, for measuring swing rates. */
  const dummy = (x = 23.4) => mob(x, { aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 });

  beforeEach(() => make());

  describe('one swing timer drives blocks and mobs', () => {
    it('a single swing damages the block under the cursor AND the mob in the hit box', () => {
      dirt(23, 19);
      const m = mob(23.4);
      hold({ x: 23, y: 19 });
      tick(1 / 30); // exactly one tick: the first swing fires immediately

      expect(engine.grid[19][23].damage).toBe(25); // tool damage to the block
      expect(m.health).toBe(500 - 40); // weapon damage to the mob
    });

    it('uses the same rate for both: 2 swings per second at baseline speed', () => {
      dirt(23, 19);
      const m = dummy(23.4);
      hold({ x: 23, y: 19 });
      tick(1.0);
      const blockHits = (engine.grid[19][23].damage ?? 0) / 25;
      const mobHits = (500 - m.health) / 40;
      expect(blockHits).toBe(mobHits);
      expect(blockHits).toBeGreaterThanOrEqual(2);
      expect(blockHits).toBeLessThanOrEqual(3);
    });

    it('swings faster with a higher Mining Speed, for both blocks and mobs', () => {
      make({ miningSpeed: 50 });
      dirt(23, 19);
      const m = dummy(23.4);
      hold({ x: 23, y: 19 });
      tick(1.0);
      expect((500 - m.health) / 40).toBeGreaterThanOrEqual(4);
      // 4+ swings of 25 break a 100 HP dirt block within the second
      expect(engine.grid[19][23].type).toBe(MiningTileType.EMPTY);
    });

    it('tapping cannot swing faster than holding (the cooldown survives releasing the button)', () => {
      const swingsIn = (pattern: 'hold' | 'tap') => {
        make();
        const d = dummy(23.4);
        for (let i = 0; i < 30; i++) {
          if (pattern === 'hold') {
            hold(null);
            tick(2 / 30);
          } else {
            // press for one tick, release for one tick
            hold(null);
            tick(1 / 30);
            release();
            tick(1 / 30);
          }
        }
        return (500 - d.health) / 40;
      };

      const held = swingsIn('hold');
      const tapped = swingsIn('tap');
      expect(held).toBeGreaterThanOrEqual(3); // ~2 s at 2 swings/s
      expect(tapped).toBeLessThanOrEqual(held);
    });

    it('a melee swing with no block under the cursor still hits mobs', () => {
      const m = mob(23.4);
      hold(null);
      tick(1 / 30);
      expect(m.health).toBe(460);
    });

    it('a block swing with no mob in reach only damages the block', () => {
      dirt(23, 19);
      hold({ x: 23, y: 19 });
      tick(1 / 30);
      expect(engine.grid[19][23].damage).toBe(25);
    });

    it('does nothing while the mining key is up', () => {
      dirt(23, 19);
      const m = mob(23.4);
      release();
      tick(1);
      expect(engine.grid[19][23].damage).toBeUndefined();
      expect(m.health).toBe(500);
    });
  });

  describe('tool damage vs weapon damage', () => {
    it('blocks take tool damage; mobs take weapon damage (independent stats)', () => {
      make({ toolDamage: 10, weaponDamage: 70 });
      dirt(23, 19);
      const m = mob(23.4);
      hold({ x: 23, y: 19 });
      tick(1 / 30);
      expect(engine.grid[19][23].damage).toBe(10);
      expect(m.health).toBe(430);
    });

    it('zero tool damage cannot mine, but can still fight; zero weapon damage cannot fight, but can mine', () => {
      make({ toolDamage: 0, weaponDamage: 40 });
      dirt(23, 19);
      let m = mob(23.4);
      hold({ x: 23, y: 19 });
      tick(1 / 30);
      expect(engine.grid[19][23].damage).toBeUndefined();
      expect(m.health).toBe(460);

      make({ toolDamage: 25, weaponDamage: 0 });
      dirt(23, 19);
      m = mob(23.4);
      hold({ x: 23, y: 19 });
      tick(1 / 30);
      expect(engine.grid[19][23].damage).toBe(25);
      expect(m.health).toBe(500);
    });

    it('cooperating miners on one block combine their tool damage', () => {
      dirt(23, 19);
      const other = engine.addPlayer({ characterId: 'buddy', socket: { connected: true, emit: vi.fn() } as any, miningSpeed: 25, toolDamage: 30, weaponDamage: 0 });
      other.playerBody.position = { x: 22.5, y: 21 - other.playerBody.halfHeight };
      other.playerBody.isGrounded = true;
      hold({ x: 23, y: 19 });
      other.inputs = { ...other.inputs, miningKey: true, miningTarget: { x: 23, y: 19 } };
      tick(1 / 30);
      expect(engine.grid[19][23].damage).toBe(55);
    });
  });

  describe('pick power', () => {
    const setRequired = (type: MiningTileType, required: number) => {
      const dm = MiningDataManager.getInstance();
      const cfg = dm.getBlockConfig(type);
      const original = cfg.requiredPickPower;
      cfg.requiredPickPower = required;
      return () => { cfg.requiredPickPower = original; };
    };

    it('a tool below the block\'s requirement cannot damage it, and is told why', () => {
      const restore = setRequired(MiningTileType.DIRT, 2);
      try {
        make({ pickPower: 1 });
        dirt(23, 19);
        hold({ x: 23, y: 19 });
        tick(1);
        expect(engine.grid[19][23].damage).toBeUndefined();
        expect(me().isMining).toBe(false);
        expect(notices()).toEqual([{ kind: 'tool_too_weak', message: expect.stringContaining('strong enough') }]);
      } finally {
        restore();
      }
    });

    it('a tool at or above the requirement damages normally', () => {
      const restore = setRequired(MiningTileType.DIRT, 2);
      try {
        for (const power of [2, 5]) {
          make({ pickPower: power });
          dirt(23, 19);
          hold({ x: 23, y: 19 });
          tick(1 / 30);
          expect(engine.grid[19][23].damage).toBe(25);
          expect(notices()).toHaveLength(0);
        }
      } finally {
        restore();
      }
    });

    it('does nothing different for blocks that need no pick power (the default)', () => {
      make({ pickPower: 0 });
      dirt(23, 19);
      hold({ x: 23, y: 19 });
      tick(1 / 30);
      expect(engine.grid[19][23].damage).toBe(25);
    });

    it('throttles the "too weak" message while the button is held', () => {
      const restore = setRequired(MiningTileType.DIRT, 3);
      try {
        make({ pickPower: 0 });
        dirt(23, 19);
        hold({ x: 23, y: 19 });
        tick(2.5);
        expect(notices()).toHaveLength(1);
        tick(1.5); // past the cooldown
        expect(notices().length).toBe(2);
      } finally {
        restore();
      }
    });

    it('still lets a weak tool fight mobs', () => {
      const restore = setRequired(MiningTileType.DIRT, 9);
      try {
        make({ pickPower: 0 });
        dirt(23, 19);
        const m = mob(23.4);
        hold({ x: 23, y: 19 });
        tick(1 / 30);
        expect(m.health).toBe(460);
      } finally {
        restore();
      }
    });

    it('swapping to a weaker tool mid-mine stops the dig', () => {
      const restore = setRequired(MiningTileType.DIRT, 1);
      try {
        make({ pickPower: 1 });
        dirt(23, 19);
        hold({ x: 23, y: 19 });
        tick(1 / 30);
        expect(me().isMining).toBe(true);
        engine.setLoadout(cid, { miningSpeed: 25, toolDamage: 25, weaponDamage: 25, pickPower: 0, knockback: 0, gearLayers: [], equippedWeaponId: null });
        tick(1);
        expect(me().isMining).toBe(false);
        expect(engine.grid[19][23].damage).toBe(25); // only the first hit landed
      } finally {
        restore();
      }
    });
  });

  describe('knockback stat', () => {
    const pushOf = (m: any) => ({ x: m.mobBody.velocity.x, y: m.mobBody.velocity.y });

    it('uses today\'s default push when the weapon has no Knockback effect', () => {
      const m = mob(23.4);
      hold(null);
      tick(1 / 30);
      expect(pushOf(m).x).toBeGreaterThan(4);
      expect(pushOf(m).x).toBeLessThanOrEqual(4.5 + 1e-6);
      expect(pushOf(m).y).toBeLessThan(0);
    });

    it('scales with the stat (tenths of tiles/s)', () => {
      make({ knockback: 90 });
      const m = mob(23.4);
      hold(null);
      tick(1 / 30);
      expect(pushOf(m).x).toBeGreaterThan(8);
      expect(pushOf(m).x).toBeLessThanOrEqual(9 + 1e-6);
    });

    it('pushes away from the player, to the left or right', () => {
      me().aimDirection = { x: -1, y: 0 };
      me().isFacingLeft = true;
      const m = mob(21.6);
      hold(null);
      tick(1 / 30);
      expect(pushOf(m).x).toBeLessThan(0);
    });
  });

  describe('loadout changes', () => {
    it('setLoadout updates all stats on the live session', () => {
      engine.setLoadout(cid, { miningSpeed: 30, toolDamage: 11, weaponDamage: 22, pickPower: 3, knockback: 55, gearLayers: [], equippedWeaponId: null });
      expect(me()).toMatchObject({ toolDamage: 11, weaponDamage: 22, pickPower: 3, knockback: 55 });
    });

    it('reconnecting keeps stats unless new ones are supplied', () => {
      engine.addPlayer({ characterId: cid, socket: socket as any });
      expect(me()).toMatchObject({ toolDamage: 25, weaponDamage: 40 });
      engine.addPlayer({ characterId: cid, socket: socket as any, pickPower: 4 });
      expect(me().pickPower).toBe(4);
      expect(me().toolDamage).toBe(25);
    });
  });
});
