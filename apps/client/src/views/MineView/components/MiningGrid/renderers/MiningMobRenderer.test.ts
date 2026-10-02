import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { MiningMobRenderer } from './MiningMobRenderer';
import type { MiningActiveMob } from '@mine-me/shared';

// Mock ModularEntitySprite
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
  return {
    ModularEntitySprite: MockModularEntitySprite,
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
        attack: 6,
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
        attack: 2,
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
        attack: 6,
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
        attack: 2,
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
        attack: 6,
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
        attack: 6,
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
        attack: 6,
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
        attack: 6,
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

    beforeEach(() => {
      mockSoundManager = {
        playPositionalSfx: vi.fn(),
        playSfx: vi.fn(),
      };
    });

    it('triggers positional damage sound when mob takes damage', () => {
      renderer.tick(0.016, mockSoundManager);

      const initialMob: MiningActiveMob = {
        id: 'mob-mole',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 4, y: 7 },
        velocity: { x: 0, y: 0 },
        health: 40,
        maxHealth: 40,
        attack: 6,
        defense: 2,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
      };

      renderer.updateMobs([initialMob]);
      expect(mockSoundManager.playPositionalSfx).not.toHaveBeenCalled();

      // Damaged mob update
      renderer.updateMobs([
        {
          ...initialMob,
          health: 20,
        },
      ]);

      expect(mockSoundManager.playPositionalSfx).toHaveBeenCalledTimes(1);
      const [soundUrl, pos, options] = mockSoundManager.playPositionalSfx.mock.calls[0];
      expect(soundUrl).toContain('cmn_mole_person_damage.mp3');
      expect(pos).toEqual({ x: 4.5, y: 7.5 });
      expect(options.spatial).toBeDefined();
    });

    it('triggers positional digging sound when mob is mining', () => {
      const miningMole: MiningActiveMob = {
        id: 'mob-mole',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 5, y: 8 },
        velocity: { x: 0, y: 0 },
        health: 40,
        maxHealth: 40,
        attack: 6,
        defense: 2,
        isFacingLeft: false,
        isMining: true,
        animationState: 'mine',
      };

      renderer.updateMobs([miningMole]);
      renderer.tick(0.016, mockSoundManager);

      expect(mockSoundManager.playPositionalSfx).toHaveBeenCalled();
      const calls = mockSoundManager.playPositionalSfx.mock.calls;
      const digCall = calls.find(([url]: [string]) => url.includes('cmn_mole_person_dig.mp3'));
      expect(digCall).toBeDefined();
      expect(digCall[1]).toEqual({ x: 5.5, y: 8.5 });
    });

    it('triggers positional ambient idle sound when mob idles past interval', () => {
      const idleMole: MiningActiveMob = {
        id: 'mob-mole',
        mobId: 'cmn_mole_person_001',
        name: 'Mole Person',
        position: { x: 3, y: 5 },
        velocity: { x: 0, y: 0 },
        health: 40,
        maxHealth: 40,
        attack: 6,
        defense: 2,
        isFacingLeft: false,
        isMining: false,
        animationState: 'idle',
      };

      renderer.updateMobs([idleMole]);
      const mob = renderer.getMob('mob-mole')!;
      // Artificially elapse time past idle threshold (6500ms)
      mob.lastIdleSoundTime = -10000;

      renderer.tick(0.016, mockSoundManager);

      const calls = mockSoundManager.playPositionalSfx.mock.calls;
      const idleCall = calls.find(([url]: [string]) => url.includes('cmn_mole_person_idle.mp3'));
      expect(idleCall).toBeDefined();
      expect(idleCall[1]).toEqual({ x: 3.5, y: 5.5 });
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
        attack: 6,
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
        attack: 6,
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
        attack: 6,
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
  });
});

