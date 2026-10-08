import { describe, it, expect, beforeEach } from 'vitest';
import { MiningGameEngine } from '../src/services/mining/MiningGameEngine';
import { MINING_CONFIG } from '@mine-me/shared';

describe('MiningGameEngine - Target Dummy', () => {
  let engine: MiningGameEngine;

  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: 'test_player',
      characterName: 'Hero',
      cityId: 'city-1',
      socket: { connected: true, emit: () => {} } as any,
    });
  });

  it('spawns the target dummy at the surface near character entrance spawn', () => {
    const mobs = engine.getActiveMobs();
    const dummy = mobs.find((m) => m.mobId === 'mob_target_dummy');

    expect(dummy).toBeDefined();
    expect(dummy?.name).toBe('Target Dummy');
    expect(dummy?.health).toBe(1000000);
    expect(dummy?.maxHealth).toBe(1000000);
    expect(dummy?.position.x).toBeCloseTo(MINING_CONFIG.ENTRANCE_X + 2.5, 0.1);
    expect(dummy?.position.y).toBeLessThanOrEqual(1.0);
  });

  it('allows damaging the target dummy and registers health decrease without dying', () => {
    const mobs = engine.getActiveMobs();
    const dummy = mobs.find((m) => m.mobId === 'mob_target_dummy')!;
    expect(dummy).toBeDefined();

    const initialHealth = dummy.health;
    engine.damageMob(dummy.id, 45);

    const updatedMobs = engine.getActiveMobs();
    const updatedDummy = updatedMobs.find((m) => m.id === dummy.id);

    expect(updatedDummy).toBeDefined();
    expect(updatedDummy?.health).toBe(initialHealth - 45);
    expect(updatedDummy?.animationState).toBe('damage');
  });

  it('does not fling the target dummy with knockback during melee attacks', () => {
    const mobs = engine.getActiveMobs();
    const dummy = mobs.find((m) => m.mobId === 'mob_target_dummy')!;
    expect(dummy).toBeDefined();

    // Position player right next to dummy facing it
    const playerSession = engine.players.get('test_player')!;
    playerSession.playerBody.position = { x: dummy.position.x - 1.0, y: dummy.position.y };
    playerSession.isFacingLeft = false;
    playerSession.inputs.miningKey = true;

    // Simulate tick with melee attack
    (engine as any).tick(0.033);

    const dummySession = engine.activeMobs.get(dummy.id)!;
    expect(dummySession.mobBody.velocity.x).toBe(0);
    expect(dummySession.mobBody.velocity.y).toBe(0);
  });
});
