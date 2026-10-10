import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { MiningMobRenderer } from './MiningMobRenderer';
import type { MiningActiveMob } from '@mine-me/shared';
import { Assets, Texture } from 'pixi.js';

// Mock Assets.load for non-browser environment
vi.spyOn(Assets, 'load').mockResolvedValue(Texture.EMPTY as any);

// Mock ModularEntitySprite and FloatingTextManager
vi.mock('../../../../../components/game/sprites', () => {
  class MockModularEntitySprite {
    load = vi.fn().mockResolvedValue(undefined);
    scaleToHeight = vi.fn();
    setPosition = vi.fn();
    setFlipped = vi.fn();
    setState = vi.fn();
    setVisible = vi.fn();
    update = vi.fn();
    destroy = vi.fn();
    static REFERENCE_HEIGHT = 880;
  }
  class MockFloatingTextManager {
    spawnDamage = vi.fn();
    spawnCritDamage = vi.fn();
    spawnHeal = vi.fn();
    spawn = vi.fn();
    destroy = vi.fn();
  }
  return {
    ModularEntitySprite: MockModularEntitySprite,
    FloatingTextManager: MockFloatingTextManager,
  };
});

describe('MiningMobRenderer', () => {
  let parentContainer: Container;
  let renderer: MiningMobRenderer;

  beforeEach(() => {
    parentContainer = new Container();
    renderer = new MiningMobRenderer(parentContainer);
  });

  it('initializes with 0 mobs', () => {
    expect(renderer.getMobCount()).toBe(0);
  });

  it('adds active mobs and mounts their containers to parent', () => {
    const mobs: MiningActiveMob[] = [
      {
        id: 'mob-1',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 5, y: 10 },
        velocity: { x: 0, y: 0 },
        health: 40,
        maxHealth: 40,
        
        defense: 2,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
      },
      {
        id: 'mob-2',
        mobId: 'cmn1zb9op0000ihw4mgknuvlr',
        name: 'Mario',
        position: { x: 8, y: 10 },
        velocity: { x: 1, y: 0 },
        health: 30,
        maxHealth: 30,
        
        defense: 1,
        isFacingLeft: true,
        isMining: true,
        animationState: 'mine',
      },
    ];

    renderer.updateMobs(mobs);
    expect(renderer.getMobCount()).toBe(2);

    const mole = renderer.getMob('mob-1');
    expect(mole).toBeDefined();
    expect(mole?.name).toBe('Mole Person');
    expect(mole?.targetPos).toEqual({ x: 5, y: 10 });
    expect(mole?.health).toBe(40);

    const mario = renderer.getMob('mob-2');
    expect(mario).toBeDefined();
    expect(mario?.name).toBe('Mario');
    expect(mario?.isFacingLeft).toBe(true);
    expect(mario?.animationState).toBe('mine');
  });

  it('shows a killed mob in the death state with no health bar until the server removes it', () => {
    const alive: MiningActiveMob = {
      id: 'mob-d',
      mobId: 'cmn_mole_person_001',
      name: 'Mole Person',
      position: { x: 5, y: 10 },
      velocity: { x: 0, y: 0 },
      health: 10,
      maxHealth: 40,
      
      defense: 2,
      isFacingLeft: false,
      isMining: false,
      animationState: 'idle',
    };
    renderer.updateMobs([alive]);
    expect(renderer.getMob('mob-d')?.healthBar.visible).toBe(true);

    renderer.updateMobs([{ ...alive, health: 0, animationState: 'death' }]);
    const dying = renderer.getMob('mob-d');
    expect(dying).toBeDefined();
    expect(dying?.animationState).toBe('death');
    expect(dying?.health).toBe(0);
    expect(dying?.healthBar.visible).toBe(false);

    renderer.updateMobs([]);
    expect(renderer.getMob('mob-d')).toBeUndefined();
  });

  it('removes the last remaining mob when given an empty list, and a fresh list replaces stale mobs', () => {
    const mk = (id: string): MiningActiveMob => ({
      id,
      mobId: 'cmn_mole_person_001',
      name: 'Mole Person',
      position: { x: 5, y: 10 },
      velocity: { x: 0, y: 0 },
      health: 40,
      maxHealth: 40,
      
      defense: 2,
      isFacingLeft: false,
      isMining: false,
      animationState: 'idle',
    });

    renderer.updateMobs([mk('a'), mk('b')]);
    renderer.updateMobs([mk('b')]);
    expect(renderer.getMobCount()).toBe(1);
    renderer.updateMobs([]);
    expect(renderer.getMobCount()).toBe(0);

    // A snapshot (e.g. after reconnect) replaces whatever was there
    renderer.updateMobs([mk('stale')]);
    renderer.updateMobs([mk('fresh')]);
    expect(renderer.getMob('stale')).toBeUndefined();
    expect(renderer.getMob('fresh')).toBeDefined();
  });

  it('updates existing mob position, health, and removes departed mobs', () => {
    const initialMobs: MiningActiveMob[] = [
      {
        id: 'mob-1',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 5, y: 10 },
        velocity: { x: 0, y: 0 },
        health: 40,
        maxHealth: 40,
        
        defense: 2,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
      },
      {
        id: 'mob-2',
        mobId: 'cmn1zb9op0000ihw4mgknuvlr',
        name: 'Mario',
        position: { x: 8, y: 10 },
        velocity: { x: 0, y: 0 },
        health: 30,
        maxHealth: 30,
        
        defense: 1,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
      },
    ];

    renderer.updateMobs(initialMobs);
    expect(renderer.getMobCount()).toBe(2);

    // Update: Mole moved and lost health, Mario defeated/removed
    const updatedMobs: MiningActiveMob[] = [
      {
        id: 'mob-1',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 6, y: 10 },
        velocity: { x: 1, y: 0 },
        health: 25,
        maxHealth: 40,
        
        defense: 2,
        isFacingLeft: true,
        isMining: true,
        animationState: 'mine',
      },
    ];

    renderer.updateMobs(updatedMobs);
    expect(renderer.getMobCount()).toBe(1);

    const mole = renderer.getMob('mob-1');
    expect(mole).toBeDefined();
    expect(mole?.targetPos).toEqual({ x: 6, y: 10 });
    expect(mole?.health).toBe(25);
    expect(mole?.isFacingLeft).toBe(true);

    const mario = renderer.getMob('mob-2');
    expect(mario).toBeUndefined();
  });

  it('clears all mobs when updated with empty or undefined array', () => {
    renderer.updateMobs([
      {
        id: 'mob-1',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 5, y: 10 },
        velocity: { x: 0, y: 0 },
        health: 40,
        maxHealth: 40,
        
        defense: 2,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
      },
    ]);
    expect(renderer.getMobCount()).toBe(1);

    renderer.updateMobs([]);
    expect(renderer.getMobCount()).toBe(0);
  });

  it('interpolates positions on tick', () => {
    renderer.updateMobs([
      {
        id: 'mob-1',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        health: 40,
        maxHealth: 40,
        
        defense: 2,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
      },
    ]);

    const mob = renderer.getMob('mob-1')!;
    mob.targetPos = { x: 10, y: 10 };

    renderer.tick(0.016);
    expect(mob.currentPos.x).toBeGreaterThan(0);
    expect(mob.currentPos.y).toBeGreaterThan(0);
    expect(mob.currentPos.x).toBeLessThan(10);
    expect(mob.currentPos.y).toBeLessThan(10);
  });

  it('destroys all mobs cleanly', () => {
    renderer.updateMobs([
      {
        id: 'mob-1',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 5, y: 10 },
        velocity: { x: 0, y: 0 },
        health: 40,
        maxHealth: 40,
        
        defense: 2,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
      },
    ]);
    expect(renderer.getMobCount()).toBe(1);

    renderer.destroy();
    expect(renderer.getMobCount()).toBe(0);
  });

  describe('Mob Sound Effects Triggers', () => {
    let mockSoundManager: any;

    const SOUNDS = {
      dig: { url: '/assets/sounds/dig.mp3', volume: 1 },
      idle: { url: '/assets/sounds/idle.mp3', volume: 1 },
      damage: { url: '/assets/sounds/damage.mp3', volume: 0.5 },
      attack: { url: '/assets/sounds/attack.mp3', volume: 1 },
      death: { url: '/assets/sounds/death.mp3', volume: 1 },
    };

    const makeMob = (overrides: Partial<MiningActiveMob> = {}): MiningActiveMob => ({
      id: 'mob-mole',
      mobId: 'any_mob',
      name: 'Some Mob',
      position: { x: 4, y: 7 },
      velocity: { x: 0, y: 0 },
      health: 40,
      maxHealth: 40,
      defense: 2,
      isFacingLeft: false,
      isMining: false,
      animationState: 'idle',
      sounds: SOUNDS,
      ...overrides,
    });
    const urlsPlayed = () => mockSoundManager.playPositionalSfx.mock.calls.map((c: any[]) => c[0]);

    beforeEach(() => {
      mockSoundManager = {
        playPositionalSfx: vi.fn(),
        playSfx: vi.fn(),
        preloadSfx: vi.fn(),
      };
    });

    it('plays the mob-supplied damage sound at the mob, scaled by the sound volume', () => {
      renderer.tick(0.016, mockSoundManager);
      renderer.updateMobs([makeMob()]);
      expect(mockSoundManager.playPositionalSfx).not.toHaveBeenCalled();

      renderer.updateMobs([makeMob({ health: 20 })]);

      expect(mockSoundManager.playPositionalSfx).toHaveBeenCalledTimes(1);
      const [soundUrl, pos, options] = mockSoundManager.playPositionalSfx.mock.calls[0];
      expect(soundUrl).toBe('/assets/sounds/damage.mp3');
      expect(pos).toEqual({ x: 4.5, y: 7.5 });
      expect(options.spatial).toBeDefined();
      expect(options.volumeScale).toBe(0.5);
    });

    it('plays the death sound, not the hurt sound, on the killing blow', () => {
      renderer.tick(0.016, mockSoundManager);
      renderer.updateMobs([makeMob()]);
      renderer.updateMobs([makeMob({ health: 0, animationState: 'death' })]);
      expect(urlsPlayed()).toEqual(['/assets/sounds/death.mp3']);
    });

    it('plays the attack sound once when the mob starts a swing', () => {
      renderer.tick(0.016, mockSoundManager);
      renderer.updateMobs([makeMob()]);
      renderer.updateMobs([makeMob({ animationState: 'attack' })]);
      renderer.updateMobs([makeMob({ animationState: 'attack' })]);
      expect(urlsPlayed()).toEqual(['/assets/sounds/attack.mp3']);

      renderer.updateMobs([makeMob({ animationState: 'idle' })]);
      renderer.updateMobs([makeMob({ animationState: 'attack' })]);
      expect(urlsPlayed()).toEqual(['/assets/sounds/attack.mp3', '/assets/sounds/attack.mp3']);
    });

    it('plays the dig sound while mining', () => {
      renderer.updateMobs([makeMob({ isMining: true, animationState: 'mine' })]);
      renderer.tick(0.016, mockSoundManager);
      const call = mockSoundManager.playPositionalSfx.mock.calls.find(([url]: [string]) => url === '/assets/sounds/dig.mp3');
      expect(call).toBeDefined();
      expect(call[1]).toEqual({ x: 4.5, y: 7.5 });
    });

    it('plays the idle sound once the idle interval has passed', () => {
      renderer.updateMobs([makeMob()]);
      renderer.getMob('mob-mole')!.lastIdleSoundTime = -10000;
      renderer.tick(0.016, mockSoundManager);
      expect(urlsPlayed()).toContain('/assets/sounds/idle.mp3');
    });

    it('stays silent for a mob with no sounds, or a slot that is not set', () => {
      renderer.tick(0.016, mockSoundManager);
      renderer.updateMobs([makeMob({ sounds: undefined })]);
      renderer.updateMobs([makeMob({ sounds: undefined, health: 10, animationState: 'attack' })]);
      renderer.updateMobs([makeMob({ sounds: { attack: SOUNDS.attack }, health: 5, animationState: 'idle' })]);
      expect(mockSoundManager.playPositionalSfx).not.toHaveBeenCalled();
      expect(mockSoundManager.playSfx).not.toHaveBeenCalled();
    });

    it('uses sounds that arrive after the mob was first seen', () => {
      renderer.tick(0.016, mockSoundManager);
      renderer.updateMobs([makeMob({ sounds: undefined })]);
      renderer.updateMobs([makeMob({ health: 30 })]);
      expect(urlsPlayed()).toEqual(['/assets/sounds/damage.mp3']);
    });

    it('does not use the old hard-coded profile for the mole person', () => {
      renderer.tick(0.016, mockSoundManager);
      renderer.updateMobs([makeMob({ mobId: 'cmn_mole_person_001', sounds: undefined })]);
      renderer.updateMobs([makeMob({ mobId: 'cmn_mole_person_001', sounds: undefined, health: 1 })]);
      expect(mockSoundManager.playPositionalSfx).not.toHaveBeenCalled();
    });

    it('starts preloading a mob\'s sounds the first time it is seen', () => {
      renderer.tick(0.016, mockSoundManager);
      renderer.updateMobs([makeMob()]);
      renderer.updateMobs([makeMob()]);
      expect(mockSoundManager.preloadSfx).toHaveBeenCalledTimes(1);
      expect(mockSoundManager.preloadSfx.mock.calls[0][0].sort()).toEqual(Object.values(SOUNDS).map((s) => s.url).sort());
    });

    it('falls back to playSfx when positional playback is unavailable', () => {
      delete mockSoundManager.playPositionalSfx;
      renderer.tick(0.016, mockSoundManager);
      renderer.updateMobs([makeMob()]);
      renderer.updateMobs([makeMob({ health: 20 })]);
      expect(mockSoundManager.playSfx).toHaveBeenCalledWith(
        '/assets/sounds/damage.mp3',
        expect.objectContaining({ position: { x: 4.5, y: 7.5 }, volumeScale: 0.5 })
      );
    });
  });

  describe('Mob Tweaks: Healthbar, Nametag, and Debug Hitboxes', () => {
    it('only renders healthbar when mob has taken damage and hides it at full health or death', () => {
      const mobData: MiningActiveMob = {
        id: 'mob-hb-test',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 5, y: 5 },
        velocity: { x: 0, y: 0 },
        health: 40,
        maxHealth: 40,
        
        defense: 2,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
      };

      renderer.updateMobs([mobData]);
      const mob = renderer.getMob('mob-hb-test')!;
      // Full health: healthbar must NOT be visible
      expect(mob.healthBar.visible).toBe(false);

      // Mob takes damage: healthbar must become visible
      renderer.updateMobs([{ ...mobData, health: 32 }]);
      expect(mob.healthBar.visible).toBe(true);

      // Mob restored to full health: healthbar must hide
      renderer.updateMobs([{ ...mobData, health: 40 }]);
      expect(mob.healthBar.visible).toBe(false);

      // Mob dead: healthbar must hide
      renderer.updateMobs([{ ...mobData, health: 0 }]);
      expect(mob.healthBar.visible).toBe(false);
    });

    it('does not create or render a nametag on the mob container', () => {
      const mobData: MiningActiveMob = {
        id: 'mob-no-nametag',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 2, y: 2 },
        velocity: { x: 0, y: 0 },
        health: 40,
        maxHealth: 40,
        
        defense: 2,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
      };

      renderer.updateMobs([mobData]);
      const mob = renderer.getMob('mob-no-nametag')!;
      expect((mob as any).nameplate).toBeUndefined();
    });

    it('renders debug hitboxes, foot contact lines, and mining targets for active mobs', () => {
      const mobData: MiningActiveMob = {
        id: 'mob-debug-test',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 4, y: 8 },
        velocity: { x: 0, y: 0 },
        health: 40,
        maxHealth: 40,
        
        defense: 2,
        isFacingLeft: true,
        isMining: true,
        miningTarget: { x: 3, y: 8 },
        animationState: 'mine',
      };

      renderer.updateMobs([mobData]);

      const mockDebugGraphics = {
        rect: vi.fn().mockReturnThis(),
        stroke: vi.fn().mockReturnThis(),
        fill: vi.fn().mockReturnThis(),
        circle: vi.fn().mockReturnThis(),
        moveTo: vi.fn().mockReturnThis(),
        lineTo: vi.fn().mockReturnThis(),
      } as any;

      renderer.renderDebugHitboxes(mockDebugGraphics, 64);

      // Mob collider AABB
      expect(mockDebugGraphics.rect).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
      // Feet line and facing direction
      expect(mockDebugGraphics.moveTo).toHaveBeenCalled();
      expect(mockDebugGraphics.lineTo).toHaveBeenCalled();
      // Center point
      expect(mockDebugGraphics.circle).toHaveBeenCalled();
    });

    it('spawns floating damage text when a mob takes damage and floatingTextManager is set', () => {
      const mockFloatingTextManager = {
        spawnDamage: vi.fn(),
        spawnCritDamage: vi.fn(),
        spawnHeal: vi.fn(),
        spawn: vi.fn(),
        destroy: vi.fn(),
      } as any;

      renderer.setFloatingTextManager(mockFloatingTextManager);

      const mobData: MiningActiveMob = {
        id: 'mob-floating-dmg',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 5, y: 10 },
        velocity: { x: 0, y: 0 },
        health: 100,
        maxHealth: 100,
        
        defense: 2,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
      };

      renderer.updateMobs([mobData]);

      // Damaged by 35 points
      renderer.updateMobs([{ ...mobData, health: 65 }]);

      expect(mockFloatingTextManager.spawnDamage).toHaveBeenCalledWith(
        5 * 64, // spawnX (position.x * TILE_SIZE)
        expect.any(Number), // spawnY
        35 // damageTaken
      );
    });

    it('supports single-sprite mobs (like target dummy) without modular puppet', () => {
      const dummyMob: MiningActiveMob = {
        id: 'dummy-1',
        mobId: 'mob_target_dummy',
        name: 'Target Dummy',
        position: { x: 25, y: 0 },
        velocity: { x: 0, y: 0 },
        health: 1000000,
        maxHealth: 1000000,
        
        defense: 0,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
        spriteUrl: '/assets/sprites/mobs/target_dummy.png',
        colliderWidth: 0.8,
        colliderHeight: 1.25,
        showHealthBar: false,
      };

      renderer.updateMobs([dummyMob]);
      const mob = renderer.getMob('dummy-1');

      expect(mob).toBeDefined();
      expect(mob?.staticSprite).toBeDefined();
      expect(mob?.sprite).toBeUndefined();
      expect(mob?.colliderWidth).toBe(0.8);
      expect(mob?.colliderHeight).toBe(1.25);
    });

    it('renders custom rectangular collider dimensions in debug mode', () => {
      const dummyMob: MiningActiveMob = {
        id: 'dummy-hitbox',
        mobId: 'mob_target_dummy',
        name: 'Target Dummy',
        position: { x: 25, y: 0 },
        velocity: { x: 0, y: 0 },
        health: 1000000,
        maxHealth: 1000000,
        
        defense: 0,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
        spriteUrl: '/assets/sprites/mobs/target_dummy.png',
        colliderWidth: 0.8,
        colliderHeight: 1.25,
      };

      renderer.updateMobs([dummyMob]);

      const mockDebugGraphics = {
        rect: vi.fn().mockReturnThis(),
        stroke: vi.fn().mockReturnThis(),
        fill: vi.fn().mockReturnThis(),
        circle: vi.fn().mockReturnThis(),
        moveTo: vi.fn().mockReturnThis(),
        lineTo: vi.fn().mockReturnThis(),
      } as any;

      renderer.renderDebugHitboxes(mockDebugGraphics, 64);

      // Expected width = 0.8 * 64 = 51.2, height = 1.25 * 64 = 80
      expect(mockDebugGraphics.rect).toHaveBeenCalledWith(
        25 * 64 - 51.2 / 2,
        0 * 64 - 80 / 2,
        51.2,
        80
      );
    });

    it('hides healthbar when showHealthBar is false even after taking damage', () => {
      const dummyMob: MiningActiveMob = {
        id: 'dummy-healthbar',
        mobId: 'mob_target_dummy',
        name: 'Target Dummy',
        position: { x: 25, y: 0 },
        velocity: { x: 0, y: 0 },
        health: 1000000,
        maxHealth: 1000000,
        
        defense: 0,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
        spriteUrl: '/assets/sprites/mobs/target_dummy.png',
        showHealthBar: false,
      };

      renderer.updateMobs([dummyMob]);
      const mob = renderer.getMob('dummy-healthbar')!;
      expect(mob.healthBar.visible).toBe(false);

      // Takes damage: healthbar should still be hidden because showHealthBar is false
      renderer.updateMobs([{ ...dummyMob, health: 999950 }]);
      expect(mob.healthBar.visible).toBe(false);
    });
  });
});


