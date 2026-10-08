import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningProjectileEntity } from './physics/MiningProjectileEntity';
import { MiningTileType } from '@mine-me/shared';

describe('MiningGameEngine - Projectiles & 6-Shooter Revolver', () => {
  let engine: MiningGameEngine;
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      connected: true,
      emit: () => {},
    };
    engine = new MiningGameEngine({
      characterId: 'char-shooter-1',
      cityId: 'city-1',
      gameMode: 'singleplayer',
      socket: mockSocket,
    });
  });

  afterEach(() => {
    engine.stop();
  });

  it('shoots a projectile towards the target and tracks magazine rounds (6 shots)', () => {
    const res1 = engine.shootProjectile('char-shooter-1', { x: 35, y: 0 });
    expect(res1.success).toBe(true);
    expect(res1.remainingAmmo).toBe(5);
    expect(res1.isReloading).toBe(false);
    expect(engine.activeProjectiles.length).toBe(1);

    const proj = engine.activeProjectiles[0];
    expect(proj.characterId).toBe('char-shooter-1');
    expect(proj.velocity.x).toBeGreaterThan(0); // Firing to the right
  });

  it('enforces 6 shots per cylinder before initiating automatic reload', () => {
    // Fire remaining shots by clearing fire rate restriction between shots
    for (let i = 0; i < 6; i++) {
      const ammo = engine.playerWeaponAmmo.get('char-shooter-1');
      if (ammo) ammo.lastShotTime = 0; // bypass cooldown for rapid testing
      const res = engine.shootProjectile('char-shooter-1', { x: 20, y: 10 });
      expect(res.success).toBe(true);
      if (i < 5) {
        expect(res.remainingAmmo).toBe(5 - i);
        expect(res.isReloading).toBe(false);
      } else {
        // Last shot (6th round) empties cylinder and triggers reload
        expect(res.remainingAmmo).toBe(0);
        expect(res.isReloading).toBe(true);
      }
    }

    // 7th shot attempt while reloading must fail
    const res7 = engine.shootProjectile('char-shooter-1', { x: 20, y: 10 });
    expect(res7.success).toBe(false);
    expect(res7.isReloading).toBe(true);
    expect(res7.error).toContain('Reloading');
  });

  it('completes reload after reload duration expires in simulation update', () => {
    // Empty cylinder
    for (let i = 0; i < 6; i++) {
      const ammo = engine.playerWeaponAmmo.get('char-shooter-1');
      if (ammo) ammo.lastShotTime = 0;
      engine.shootProjectile('char-shooter-1', { x: 20, y: 10 });
    }

    const ammo = engine.playerWeaponAmmo.get('char-shooter-1')!;
    expect(ammo.isReloading).toBe(true);

    // Advance 0.5s (reload duration is 1.5s)
    (engine as any).tick(0.5);
    expect(ammo.isReloading).toBe(true);
    expect(ammo.currentAmmo).toBe(0);

    // Advance another 1.1s (total 1.6s >= 1.5s)
    (engine as any).tick(1.1);
    expect(ammo.isReloading).toBe(false);
    expect(ammo.currentAmmo).toBe(6); // Refilled to 6 shots
  });

  it('damages active mob upon projectile collision', () => {
    // Clear 3-high corridor around y=10 in both grid and rigid world
    for (let y = 9; y <= 11; y++) {
      for (let x = 3; x <= 15; x++) {
        engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
        (engine as any).rigidWorld.removeTileCollider(x, y);
      }
    }

    // Spawn a test mob at x=10, y=10
    const mob = engine.spawnMob({ id: 'cmn_mole_person_001', health: 100 }, { x: 10, y: 10 });
    expect(mob).toBeDefined();
    const initialHealth = mob!.health;

    // Position player directly at x=5, y=10.45
    const player = engine.players.get('char-shooter-1')!;
    player.playerBody.position = { x: 5, y: 10.45 }; // muzzle will be at y=10.0

    // Shoot directly at mob
    const res = engine.shootProjectile('char-shooter-1', { x: 10, y: 10 });
    expect(res.success).toBe(true);

    // Advance simulation frames so projectile reaches mob
    for (let step = 0; step < 10; step++) {
      (engine as any).tick(0.033);
    }

    // Mob should have taken damage
    expect(mob!.health).toBeLessThan(initialHealth);
    expect(mob!.health).toBeLessThan(initialHealth);
  });

  it('includes activeProjectiles and gunshots in state tick broadcast', () => {
    for (let x = 20; x <= 30; x++) {
      engine.grid[0][x] = { type: MiningTileType.EMPTY, revealed: true };
    }

    let emittedPayload: any = null;
    mockSocket.emit = (event: string, payload: any) => {
      if (event === 'mining_state_tick') {
        emittedPayload = payload;
      }
    };

    engine.shootProjectile('char-shooter-1', { x: 30, y: 0 });

    (engine as any).tick(0.033);

    expect(emittedPayload).toBeDefined();
    expect(emittedPayload.activeProjectiles).toBeDefined();
    expect(emittedPayload.activeProjectiles.length).toBeGreaterThan(0);
    expect(emittedPayload.activeProjectiles[0].inGameScale).toBe(0.4);
    expect(emittedPayload.gunshots).toBeDefined();
    expect(emittedPayload.gunshots.length).toBe(1);
    expect(emittedPayload.gunshots[0].characterId).toBe('char-shooter-1');
    expect(emittedPayload.weaponAmmo).toBeDefined();
    expect(emittedPayload.weaponAmmo.current).toBe(5);
    expect(emittedPayload.weaponAmmo.max).toBe(6);
    expect(emittedPayload.weaponAmmo.isReloading).toBe(false);
  });

  it('inherits configured inGameScale from projectileItemId definition', () => {
    engine.shootProjectile('char-shooter-1', { x: 25, y: 0 });
    expect(engine.activeProjectiles.length).toBe(1);
    const projectile = engine.activeProjectiles[0];
    // In items.json, cmn_bullet_gun_round has inGameScale: 0.4
    expect(projectile.inGameScale).toBe(0.4);
  });

  it('spawns projectile at specified muzzlePosition and aims directly towards target', () => {
    const muzzlePos = { x: 22.4, y: -0.3 };
    const target = { x: 30.0, y: 10.0 };
    const res = engine.shootProjectile('char-shooter-1', target, undefined, muzzlePos);
    expect(res.success).toBe(true);
    expect(engine.activeProjectiles.length).toBe(1);
    const projectile = engine.activeProjectiles[0];
    expect(projectile.position.x).toBeCloseTo(muzzlePos.x, 2);
    expect(projectile.position.y).toBeCloseTo(muzzlePos.y, 2);
    // Velocity vector direction should match (target - muzzlePos)
    const expectedDx = target.x - muzzlePos.x;
    const expectedDy = target.y - muzzlePos.y;
    const expectedAngle = Math.atan2(expectedDy, expectedDx);
    const actualAngle = Math.atan2(projectile.velocity.y, projectile.velocity.x);
    expect(actualAngle).toBeCloseTo(expectedAngle, 4);
  });

  it('derives projectile damage from weapon item effects and tracks weaponItemId', () => {
    engine.shootProjectile('char-shooter-1', { x: 25, y: 0 }, 'cmn_revolver_6shooter');
    expect(engine.activeProjectiles.length).toBe(1);
    const projectile = engine.activeProjectiles[0];
    expect(projectile.weaponItemId).toBe('cmn_revolver_6shooter');
    // cmn_revolver_6shooter has Damage effect with value 35 in items.json
    expect(projectile.damage).toBe(35);
  });

  it('lets every in-flight projectile hit mobs, not just the first one', () => {
    const mob = engine.spawnMob({ id: 'mob_dummy_like', name: 'Dummy', health: 1000 }, { x: 10.5, y: 0 });
    // Spawned away from the auto-spawned surface target dummy so it is the only mob in range
    const hitPos = { x: mob.mobBody.position.x, y: mob.mobBody.position.y };

    // First projectile is far from the mob and stays alive; second sits right on the mob
    const mkProj = (id: string, pos: { x: number; y: number }) =>
      new MiningProjectileEntity(id, 'char-shooter-1', pos, { x: 0, y: 0 }, { damage: 10 });
    engine.activeProjectiles = [mkProj('far', { x: 5, y: -5 }), mkProj('near', hitPos)];

    (engine as any).tick(0.033);

    expect(mob.health).toBe(990);
  });
});
