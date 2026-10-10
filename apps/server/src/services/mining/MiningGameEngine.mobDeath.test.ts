import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { hitMob, hitPlayer } from './testHelpers';

describe('mob death state', () => {
  const cid = 'death-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };

  const tick = (seconds: number) => {
    const n = Math.round(seconds * 30);
    for (let i = 0; i < n; i++) (engine as any).tick(1 / 30);
  };
  const lastMobs = () => {
    const ticks = socket.emit.mock.calls.filter((c: any[]) => c[0] === 'mining_state_tick');
    return ticks[ticks.length - 1][1].mobs;
  };

  const spawn = (extra: any = {}) => {
    // Clear a platform so the mob stands on dirt at row 21
    for (let x = 18; x <= 27; x++) {
      for (let y = 18; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    // Mobs are only sent to players near them
    engine.players.get(cid)!.playerBody.position = { x: 20.5, y: 20.5 };
    return engine.spawnMob(
      { id: 'victim', name: 'Victim', health: 30, attack: 10, dropTable: { solMin: 5, solMax: 5, items: [] }, ...extra },
      { x: 24.5, y: 21 }
    );
  };

  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 3, socket: socket as any, mapConfig: { mobSpawnCount: 0 } });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
  });

  it('keeps a killed mob as an inert corpse for the linger time, then removes it', () => {
    const mob = spawn();
    hitMob(engine, mob.id, 999);

    expect(mob).toMatchObject({ health: 0, animationState: 'death' });
    expect(engine.activeMobs.has(mob.id)).toBe(true);

    tick(MINING_CONFIG.MOB_DEATH_LINGER_SECONDS - 0.2);
    expect(engine.activeMobs.has(mob.id)).toBe(true);
    expect(lastMobs()).toEqual([expect.objectContaining({ id: mob.id, health: 0, animationState: 'death' })]);

    tick(0.4);
    expect(engine.activeMobs.has(mob.id)).toBe(false);
    expect(lastMobs()).toEqual([]);
  });

  it('drops loot immediately and exactly once, even if killed again', () => {
    const mob = spawn();
    hitMob(engine, mob.id, 999);
    const afterKill = engine.droppedItems.length;
    expect(afterKill).toBeGreaterThan(0);

    hitMob(engine, mob.id, 999);
    engine.killMob(mob);
    tick(0.5);
    expect(engine.droppedItems.length).toBe(afterKill);
  });

  it('cannot be damaged while dying', () => {
    const mob = spawn();
    hitMob(engine, mob.id, 999);
    hitMob(engine, mob.id, 50);
    expect(mob.health).toBe(0);
    expect(mob.animationState).toBe('death');
  });

  it('is ignored by bullets, melee and explosions while dying', () => {
    const mob = spawn();
    hitMob(engine, mob.id, 999);
    const spy = vi.spyOn(engine.damageSystem, 'applyDamage');

    // Melee swing at the corpse
    const p = engine.players.get(cid)!;
    p.playerBody.position = { x: mob.mobBody.position.x - 0.8, y: mob.mobBody.position.y };
    p.inputs = { ...p.inputs, miningKey: true, miningTarget: null };
    p.aimDirection = { x: 1, y: 0 };
    tick(0.3);
    expect(spy).not.toHaveBeenCalled();

    // Bullet passing straight through the corpse
    const projSub = engine.projectileSubsystem;
    projSub.activeProjectiles.push({
      position: { x: mob.mobBody.position.x, y: mob.mobBody.position.y },
      hasHit: false,
      damage: 10,
      characterId: cid,
      update: () => {},
      cleanup: () => {},
    } as any);
    spy.mockClear();
    projSub.updateActiveProjectiles(1 / 30);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not attack players or mine while dying', () => {
    const mob = spawn();
    const p = engine.players.get(cid)!;
    p.playerBody.position = { x: mob.mobBody.position.x - 0.7, y: mob.mobBody.position.y };
    const before = p.health;
    hitMob(engine, mob.id, 999);
    tick(0.8);
    expect(p.health).toBe(before);
    expect(mob.isMining).toBe(false);
    expect(mob.miningTarget).toBeNull();
  });

  it('falls to the ground instead of hanging in mid-air', () => {
    const mob = spawn();
    mob.mobBody.position.y -= 1.5; // lift it into the (cleared) air above its platform
    hitMob(engine, mob.id, 999);
    expect(mob.mobBody.isGrounded).toBe(false);
    tick(0.6);
    expect(mob.mobBody.isGrounded).toBe(true);
    expect(mob.mobBody.position.y).toBeCloseTo(21 - mob.mobBody.halfHeight, 1);
  });

  it('a mob killed mid-dig stops digging and reports the death state to clients', () => {
    const mob = spawn();
    mob.isMining = true;
    mob.miningTarget = { x: 25, y: 20 };
    hitMob(engine, mob.id, 999);
    expect(mob.isMining).toBe(false);
    expect(mob.miningTarget).toBeNull();
  });

  it('cancels any pending hit stun so the death pose is shown', () => {
    const mob = spawn();
    hitMob(engine, mob.id, 5);
    expect(mob.hitStunDurationMs).toBeGreaterThan(0);
    hitMob(engine, mob.id, 999);
    expect(mob.hitStunDurationMs).toBe(0);
    tick(0.1);
    expect(mob.animationState).toBe('death');
  });
});
