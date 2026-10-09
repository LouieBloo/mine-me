import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { hitMob } from './testHelpers';

describe('mob hit stun (no stun-lock)', () => {
  const cid = 'stun-char';
  let engine: MiningGameEngine;

  const ms = (n: number) => { for (let i = 0; i < Math.round((n / 1000) * 30); i++) (engine as any).tick(1 / 30); };
  const spawn = (extra: any = {}) => {
    for (let x = 16; x <= 28; x++) {
      for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    // Far from the player so it just stands around instead of attacking
    return engine.spawnMob({ id: 'm', name: 'Mole', health: 100000, attack: 1, ...extra }, { x: 26.5, y: 21 });
  };

  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 9,
      socket: { connected: true, emit: vi.fn() } as any,
      mapConfig: { mobSpawnCount: 0 },
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    engine.players.get(cid)!.playerBody.position = { x: 17.5, y: 20.5 };
  });

  it('a hit stuns for the configured time, then control returns', () => {
    const mob = spawn({ hitStunMs: 300, stunImmunityMs: 0 });
    hitMob(engine, mob.id, 5);
    expect(mob.hitStunDurationMs).toBe(300);
    expect(mob.animationState).toBe('damage');

    ms(200);
    expect(mob.hitStunDurationMs).toBeGreaterThan(0);
    expect(mob.animationState).toBe('damage');

    ms(200);
    expect(mob.hitStunDurationMs).toBe(0);
    expect(mob.animationState).not.toBe('damage');
  });

  it('further hits during a stun do not extend it, but their damage still lands', () => {
    const mob = spawn({ hitStunMs: 300, stunImmunityMs: 0 });
    hitMob(engine, mob.id, 5);
    ms(200);
    const remaining = mob.hitStunDurationMs!;
    hitMob(engine, mob.id, 7);
    expect(mob.hitStunDurationMs).toBe(remaining);
    expect(mob.health).toBe(100000 - 12);
  });

  it('after a stun ends, the mob is immune to stun for the immunity window', () => {
    const mob = spawn({ hitStunMs: 200, stunImmunityMs: 500 });
    hitMob(engine, mob.id, 1);
    ms(300); // stun over, immunity running
    expect(mob.hitStunDurationMs).toBe(0);
    expect(mob.stunImmuneRemainingMs).toBeGreaterThan(0);

    hitMob(engine, mob.id, 1);
    expect(mob.hitStunDurationMs).toBe(0); // not stunned again
    expect(mob.health).toBe(100000 - 2);

    ms(600); // immunity over
    hitMob(engine, mob.id, 1);
    expect(mob.hitStunDurationMs).toBe(200);
  });

  it('sustained fire cannot keep a mob stunned: it gets control back between stuns', () => {
    const mob = spawn({ hitStunMs: 250, stunImmunityMs: 500 });
    let framesStunned = 0;
    const total = 30 * 6; // 6 seconds of a hit every tick
    for (let i = 0; i < total; i++) {
      hitMob(engine, mob.id, 1);
      (engine as any).tick(1 / 30);
      if ((mob.hitStunDurationMs ?? 0) > 0) framesStunned++;
    }
    // At most 250 ms of every 750 ms cycle is stunned (1/3), plus rounding
    expect(framesStunned / total).toBeLessThan(0.4);
    expect(framesStunned / total).toBeGreaterThan(0.2);
  });

  it('a mob with 0 stun is never stunned (boss-style)', () => {
    const mob = spawn({ hitStunMs: 0 });
    for (let i = 0; i < 10; i++) hitMob(engine, mob.id, 1);
    expect(mob.hitStunDurationMs ?? 0).toBe(0);
    expect(mob.animationState).not.toBe('damage');
    expect(mob.health).toBe(100000 - 10);
  });

  it('uses the global defaults when the mob data has no stun settings', () => {
    const mob = spawn();
    expect(mob.hitStunMs).toBe(MINING_CONFIG.MOB_HIT_STUN_MS);
    expect(mob.stunImmunityMs).toBe(MINING_CONFIG.MOB_STUN_IMMUNITY_MS);
  });

  it.each([[-5], [NaN], ['soon' as any]])('ignores an invalid stun setting (%s) and uses the default', (bad) => {
    const mob = spawn({ hitStunMs: bad, stunImmunityMs: bad });
    expect(mob.hitStunMs).toBe(MINING_CONFIG.MOB_HIT_STUN_MS);
    expect(mob.stunImmunityMs).toBe(MINING_CONFIG.MOB_STUN_IMMUNITY_MS);
  });

  it('reads per-mob stun settings from the mob definition (database-backed)', () => {
    const mob = spawn({ hitStunMs: 80, stunImmunityMs: 1200 });
    expect(mob).toMatchObject({ hitStunMs: 80, stunImmunityMs: 1200 });
  });

  it('knockback still applies to a mob that cannot be stunned right now', () => {
    const mob = spawn({ hitStunMs: 200, stunImmunityMs: 1000 });
    hitMob(engine, mob.id, 1);
    ms(300); // immune
    mob.mobBody.velocity.x = 0;
    hitMob(engine, mob.id, 1, { knockback: { x: 4.5, y: -3.2 } });
    expect(mob.hitStunDurationMs).toBe(0);
    expect(mob.mobBody.velocity).toMatchObject({ x: 4.5, y: -3.2 });
  });

  it('a stun interrupts digging and clears the dig feedback batching', () => {
    const mob = spawn({ miningSpeed: 1 }); // (clears the room, so place the block afterwards)
    engine.grid[20][27] = { type: MiningTileType.DIRT, revealed: true };
    // The AI step marks the mob as digging; the dig itself batches feedback per target
    mob.isMining = true;
    mob.miningTarget = { x: 27, y: 20 };
    engine.handleMobMining(mob, { x: 27, y: 20 }, 0.1);
    expect(mob.digTargetKey).toBe('27,20');

    hitMob(engine, mob.id, 1);
    expect(mob.isMining).toBe(false);
    expect(mob.miningTarget).toBeNull();
    expect(mob.digTargetKey).toBeNull();
  });

  it('a hit that is ignored for stun (already stunned) does not interrupt anything new', () => {
    const mob = spawn({ hitStunMs: 500, stunImmunityMs: 0 });
    hitMob(engine, mob.id, 1);
    mob.isMining = true; // set again after the first stun interrupted it
    hitMob(engine, mob.id, 1);
    expect(mob.isMining).toBe(true);
  });

  it('a killing blow skips the stun and goes straight to the death state', () => {
    const mob = spawn({ health: 10 });
    hitMob(engine, mob.id, 999);
    expect(mob.animationState).toBe('death');
    expect(mob.hitStunDurationMs).toBe(0);
  });
});
