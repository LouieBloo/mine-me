import { describe, it, expect, beforeEach } from 'vitest';
import { MiningGameEngine } from '../src/services/mining/MiningGameEngine';
import { MINING_CONFIG } from '@mine-me/shared';
import { hitMob, hitPlayer } from '../src/services/mining/testHelpers';

describe('MiningGameEngine - Target Dummy', () => {
  let engine: MiningGameEngine;

  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: 'test_player',
      characterName: 'Hero',
      cityId: 'city-1',
      socket: { connected: true, emit: () => {} } as any,
      // The surface dummy comes from the map config (no mob id is built into the game)
      mapConfig: { surfaceDummyMobId: 'mob_target_dummy' },
    });
  });

  it('is only spawned when the map config names a dummy', () => {
    const without = new MiningGameEngine({
      characterId: 'p', cityId: 'c', socket: { connected: true, emit: () => {} } as any,
      mapConfig: { surfaceDummyMobId: null },
    });
    expect(without.getActiveMobs().find((m) => m.mobId === 'mob_target_dummy')).toBeUndefined();

    const unset = new MiningGameEngine({ characterId: 'p', cityId: 'c', socket: { connected: true, emit: () => {} } as any });
    expect(unset.getActiveMobs().find((m) => m.mobId === 'mob_target_dummy')).toBeUndefined();
  });

  it('can be any mob the config names, and an unknown mob id spawns nothing', () => {
    const named = new MiningGameEngine({
      characterId: 'p', cityId: 'c', socket: { connected: true, emit: () => {} } as any,
      mapConfig: { surfaceDummyMobId: 'Mole Person', mobSpawnCount: 0 },
    });
    expect(named.getActiveMobs().map((m) => m.name)).toEqual(['Mole Person']);

    const unknown = new MiningGameEngine({
      characterId: 'p', cityId: 'c', socket: { connected: true, emit: () => {} } as any,
      mapConfig: { surfaceDummyMobId: 'no-such-mob', mobSpawnCount: 0 },
    });
    expect(unknown.getActiveMobs()).toEqual([]);
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
    hitMob(engine, dummy.id, 45);

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
