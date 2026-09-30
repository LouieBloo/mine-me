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
});
