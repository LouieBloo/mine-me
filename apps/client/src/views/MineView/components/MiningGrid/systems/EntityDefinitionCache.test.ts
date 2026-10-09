import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MiningActiveDynamite, MiningActiveMob, MiningActiveProjectile, MiningRemotePlayer } from '@mine-me/shared';
import { EntityDefinitionCache } from './EntityDefinitionCache';

const v = (x = 0, y = 0) => ({ x, y });

const mobDef = (over: Partial<MiningActiveMob> = {}): MiningActiveMob => ({
  id: 'm1', mobId: 'mole', name: 'Mole', position: v(1, 1), velocity: v(), health: 40, maxHealth: 40,
  attack: 5, defense: 2, isFacingLeft: false, isMining: true, miningTarget: { x: 3, y: 3 },
  animationState: 'mine', animations: { parts: ['big', 'manifest'] }, spriteUrl: '/mole.png',
  colliderWidth: 1, colliderHeight: 1.25, showHealthBar: true, ...over,
});
const mobTick = (over: any = {}) => ({
  id: 'm1', position: v(5, 5), velocity: v(1, 0), health: 30, isFacingLeft: true, isMining: false, animationState: 'walk', ...over,
});

describe('EntityDefinitionCache', () => {
  let cache: EntityDefinitionCache;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cache = new EntityDefinitionCache();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('mobs', () => {
    it('merges the stored definition with a tick\'s dynamic fields', () => {
      cache.applySpawned({ mobs: [mobDef()] });
      const [m] = cache.hydrateMobs([mobTick()])!;
      expect(m).toMatchObject({
        name: 'Mole', maxHealth: 40, animations: { parts: ['big', 'manifest'] }, spriteUrl: '/mole.png', // static
        position: v(5, 5), health: 30, isFacingLeft: true, animationState: 'walk', // dynamic
      });
    });

    it('never inherits stale dynamic fields from the definition (e.g. a mob that stopped mining)', () => {
      cache.applySpawned({ mobs: [mobDef({ isMining: true, miningTarget: { x: 3, y: 3 } })] });
      const [m] = cache.hydrateMobs([mobTick()])!; // tick omits miningTarget, as JSON would
      expect(m.isMining).toBe(false);
      expect(m.miningTarget).toBeUndefined();
    });

    it('later ticks keep using the same definition', () => {
      cache.applySpawned({ mobs: [mobDef()] });
      cache.hydrateMobs([mobTick()]);
      const [m] = cache.hydrateMobs([mobTick({ position: v(9, 9) })])!;
      expect(m.name).toBe('Mole');
      expect(m.position).toEqual(v(9, 9));
    });

    it('returns undefined for "no information" and does not forget anything', () => {
      cache.applySpawned({ mobs: [mobDef()] });
      expect(cache.hydrateMobs(undefined)).toBeUndefined();
      expect(cache.hydrateMobs([mobTick()])).toHaveLength(1);
    });

    it('an empty list clears the mobs and forgets their definitions', () => {
      cache.applySpawned({ mobs: [mobDef()] });
      expect(cache.hydrateMobs([])).toEqual([]);
      // The definition is gone: a stray tick entry can't be rendered until it is described again
      expect(cache.hydrateMobs([mobTick()])).toEqual([]);
    });

    it('forgets mobs that are no longer present while keeping the rest', () => {
      cache.applySpawned({ mobs: [mobDef({ id: 'a' }), mobDef({ id: 'b' })] });
      cache.hydrateMobs([mobTick({ id: 'b' })]);
      expect(cache.hydrateMobs([mobTick({ id: 'a' })])).toEqual([]); // a was forgotten
      expect(cache.hydrateMobs([mobTick({ id: 'b' })])).toEqual([]); // and so was b, by the previous call
    });

    it('skips an entry with no definition and warns only once per entity', () => {
      expect(cache.hydrateMobs([mobTick({ id: 'ghost' })])).toEqual([]);
      cache.hydrateMobs([mobTick({ id: 'ghost' })]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ghost'));
    });

    it('renders an entity as soon as its definition arrives', () => {
      expect(cache.hydrateMobs([mobTick()])).toEqual([]);
      cache.applySpawned({ mobs: [mobDef()] });
      expect(cache.hydrateMobs([mobTick()])).toHaveLength(1);
    });
  });

  describe('remote players', () => {
    const playerDef = (over: Partial<MiningRemotePlayer> = {}): MiningRemotePlayer => ({
      characterId: 'p2', characterName: 'Bob', position: v(), velocity: v(), isMining: false, isFacingLeft: false,
      animationState: 'idle', aimDirection: v(1, 0), flashlightOn: true, gearLayers: [{ url: '/hat.png', subType: 'HEAD' } as any], ...over,
    });
    const playerTick = (over: any = {}) => ({
      characterId: 'p2', position: v(2, 2), velocity: v(), isMining: false, isFacingLeft: true, animationState: 'walk', ...over,
    });

    it('merges name and gear with the live state', () => {
      cache.applySpawned({ players: [playerDef()] });
      const [p] = cache.hydratePlayers([playerTick()])!;
      expect(p).toMatchObject({ characterName: 'Bob', gearLayers: [{ url: '/hat.png' }], position: v(2, 2), isFacingLeft: true });
    });

    it('does not keep a stale flashlight or aim from the definition', () => {
      cache.applySpawned({ players: [playerDef({ flashlightOn: true, aimDirection: v(1, 0) })] });
      const [p] = cache.hydratePlayers([playerTick()])!;
      expect(p.flashlightOn).toBeUndefined();
      expect(p.aimDirection).toBeUndefined();
    });

    it('picks up changed gear when the player is described again', () => {
      cache.applySpawned({ players: [playerDef()] });
      cache.applySpawned({ players: [playerDef({ gearLayers: [{ url: '/helmet.png', subType: 'HEAD' } as any] })] });
      const [p] = cache.hydratePlayers([playerTick()])!;
      expect(p.gearLayers).toEqual([{ url: '/helmet.png', subType: 'HEAD' }]);
    });
  });

  describe('projectiles and dynamites', () => {
    const projDef: MiningActiveProjectile = {
      id: 'pr1', characterId: 'c1', itemId: 'bullet', weaponItemId: 'gun', damage: 35, spriteUrl: '/b.png', inGameScale: 0.4,
      position: v(), velocity: v(), angle: 0,
    };
    const dynDef: MiningActiveDynamite = {
      id: 'd1', position: v(), velocity: v(), angle: 0, angularVelocity: 0, fuseRemainingSeconds: 4,
      physicsConfig: { fuseSeconds: 4 } as any, itemId: 'dynamite', inGameScale: 1, explosionRadius: 3,
    };

    it('hydrates projectiles with their owner and sprite so own bullets can be filtered', () => {
      cache.applySpawned({ projectiles: [projDef] });
      const [p] = cache.hydrateProjectiles([{ id: 'pr1', position: v(4, 4), velocity: v(28, 0), angle: 0.1 }])!;
      expect(p).toMatchObject({ characterId: 'c1', spriteUrl: '/b.png', inGameScale: 0.4, position: v(4, 4), angle: 0.1 });
    });

    it('hydrates dynamites with physics and sounds but a live fuse', () => {
      cache.applySpawned({ dynamites: [dynDef] });
      const [d] = cache.hydrateDynamites([{ id: 'd1', position: v(1, 1), velocity: v(), angle: 1, angularVelocity: 2, fuseRemainingSeconds: 1.5 }])!;
      expect(d).toMatchObject({ physicsConfig: { fuseSeconds: 4 }, explosionRadius: 3, fuseRemainingSeconds: 1.5 });
    });

    it('forgets entities that have gone (no leaks as bullets come and go)', () => {
      cache.applySpawned({ projectiles: [projDef] });
      cache.hydrateProjectiles([]);
      expect(cache.hydrateProjectiles([{ id: 'pr1', position: v(), velocity: v(), angle: 0 }])).toEqual([]);
    });
  });

  describe('join snapshot', () => {
    it('seeds the cache from the snapshot so the first ticks can render everything in it', () => {
      cache.seedFromSnapshot({
        mobs: [mobDef()],
        otherPlayers: [{ characterId: 'p2', characterName: 'Bob', position: v(), velocity: v(), isMining: false, isFacingLeft: false, animationState: 'idle' }],
        activeDynamites: [{ id: 'd1', position: v(), velocity: v(), fuseRemainingSeconds: 3 }],
      });
      expect(cache.hydrateMobs([mobTick()])).toHaveLength(1);
      expect(cache.hydratePlayers([{ characterId: 'p2', position: v(), velocity: v(), isMining: false, isFacingLeft: false, animationState: 'idle' }])![0].characterName).toBe('Bob');
      expect(cache.hydrateDynamites([{ id: 'd1', position: v(), velocity: v(), fuseRemainingSeconds: 2 }])).toHaveLength(1);
    });

    it('tolerates a missing or partial snapshot', () => {
      expect(() => cache.seedFromSnapshot(undefined)).not.toThrow();
      expect(() => cache.seedFromSnapshot({})).not.toThrow();
    });
  });

  it('clear() forgets everything', () => {
    cache.applySpawned({ mobs: [mobDef()] });
    cache.clear();
    expect(cache.hydrateMobs([mobTick()])).toEqual([]);
  });
});
