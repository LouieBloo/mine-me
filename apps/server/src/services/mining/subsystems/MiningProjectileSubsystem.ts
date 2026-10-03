import {
  type MiningGunshotEvent,
  type MiningRigidWorld,
  type Vector2D,
} from '@mine-me/shared';
import { isInBounds, type ServerMiningGrid } from '../../miningMap.service';
import { MiningProjectileEntity } from '../physics/MiningProjectileEntity';
import type { MiningDataManager } from './MiningDataManager';
import type { MiningPlayerSession } from './MiningPlayerManager';

export interface PlayerAmmoState {
  currentAmmo: number;
  maxAmmo: number;
  isReloading: boolean;
  reloadTimer: number;
  reloadDuration: number;
  lastShotTime: number;
  fireRate: number;
}

export class MiningProjectileSubsystem {
  public activeProjectiles: MiningProjectileEntity[] = [];
  public playerWeaponAmmo: Map<string, PlayerAmmoState> = new Map();
  public pendingGunshots: MiningGunshotEvent[] = [];

  public shootProjectile(
    session: MiningPlayerSession | undefined,
    target: Vector2D,
    weaponItemId: string | undefined,
    dataManager: MiningDataManager,
    rigidWorld: MiningRigidWorld
  ): { success: boolean; error?: string; remainingAmmo?: number; isReloading?: boolean } {
    if (!session) return { success: false, error: 'Player session not found.' };

    const characterId = session.characterId;
    const now = Date.now();

    // 1. Get weapon definition from items.json or item cache using item framework
    let weaponItem = weaponItemId ? dataManager.getItemData(weaponItemId) : undefined;
    if (!weaponItem) {
      const items = dataManager.getItems();
      weaponItem = items.find((it: any) => it.shootsProjectiles === true);
      if (!weaponItem) {
        weaponItem = dataManager.getItemData('revolver_6shooter');
      }
    }

    const projConfig = weaponItem?.projectileConfig || {
      magazineSize: 6,
      fireRate: 2.5,
      reloadTime: 1.5,
      projectileSpeed: 28.0,
      projectileGravityScale: 0.05,
      damage: 35,
    };

    const maxAmmo = projConfig.magazineSize ?? 6;
    const fireRate = projConfig.fireRate ?? 2.5;
    const minCooldownMs = 1000 / fireRate;
    const reloadDuration = projConfig.reloadTime ?? 1.5;

    // 2. Retrieve or initialize character weapon ammo state
    let ammoState = this.playerWeaponAmmo.get(characterId);
    if (!ammoState) {
      ammoState = {
        currentAmmo: maxAmmo,
        maxAmmo,
        isReloading: false,
        reloadTimer: 0,
        reloadDuration,
        lastShotTime: 0,
        fireRate,
      };
      this.playerWeaponAmmo.set(characterId, ammoState);
    }

    // 3. Check if reloading
    if (ammoState.isReloading) {
      return { success: false, error: 'Reloading weapon...', isReloading: true, remainingAmmo: 0 };
    }

    // 4. Check if empty
    if (ammoState.currentAmmo <= 0) {
      ammoState.isReloading = true;
      ammoState.reloadTimer = reloadDuration;
      return { success: false, error: 'Weapon is empty. Reloading...', isReloading: true, remainingAmmo: 0 };
    }

    // 5. Fire rate rate-limiting
    if (now - ammoState.lastShotTime < minCooldownMs) {
      return { success: false, error: 'Firing too fast.', remainingAmmo: ammoState.currentAmmo };
    }

    // 6. Deduct 1 shot
    ammoState.currentAmmo--;
    ammoState.lastShotTime = now;

    // If cylinder is now empty, immediately begin reload countdown
    if (ammoState.currentAmmo === 0) {
      ammoState.isReloading = true;
      ammoState.reloadTimer = reloadDuration;
    }

    // 7. Calculate firing launch vector
    const startX = session.playerBody.position.x;
    const startY = session.playerBody.position.y - 0.1;

    const dx = target.x - startX;
    const dy = target.y - startY;
    const dist = Math.hypot(dx, dy) || 1.0;
    const dirX = dx / dist;
    const dirY = dy / dist;

    const speed = projConfig.projectileSpeed ?? 28.0;
    const initialVel: Vector2D = {
      x: dirX * speed,
      y: dirY * speed,
    };

    const muzzleDist = 0.45;
    const muzzlePos: Vector2D = {
      x: startX + dirX * muzzleDist,
      y: startY + dirY * muzzleDist,
    };

    const projectileId = `proj_${characterId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    let bulletSpriteUrl: string | null = '/assets/sprites/items/gun_bullet_ingame.png';
    let bulletScale = 1.0;
    if (projConfig.projectileItemId) {
      const bulletItem = dataManager.getItemData(projConfig.projectileItemId);
      if (bulletItem) {
        if (bulletItem.inGameSpriteUrl) {
          bulletSpriteUrl = bulletItem.inGameSpriteUrl;
        }
        if (typeof bulletItem.inGameScale === 'number' && bulletItem.inGameScale > 0) {
          bulletScale = bulletItem.inGameScale;
        }
      }
    }

    const projectile = new MiningProjectileEntity(
      projectileId,
      characterId,
      muzzlePos,
      initialVel,
      {
        damage: projConfig.damage ?? 35,
        itemId: projConfig.projectileItemId,
        spriteUrl: bulletSpriteUrl,
        inGameScale: bulletScale,
        gravityScale: projConfig.projectileGravityScale ?? 0.05,
      },
      rigidWorld
    );

    this.activeProjectiles.push(projectile);

    // 8. Record gunshot event using standardized weapon sound slot framework
    const soundUrl =
      weaponItem?.soundEffects?.shoot?.url ||
      weaponItem?.soundEffectUrl ||
      null;

    this.pendingGunshots.push({
      id: `shot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      characterId,
      position: muzzlePos,
      target,
      direction: { x: dirX, y: dirY },
      soundUrl,
    });

    return {
      success: true,
      remainingAmmo: ammoState.currentAmmo,
      isReloading: ammoState.isReloading,
    };
  }

  public reloadWeapon(
    characterId: string,
    session: MiningPlayerSession | undefined,
    dataManager: MiningDataManager
  ): { success: boolean; error?: string; remainingAmmo?: number; isReloading?: boolean } {
    if (!session) return { success: false, error: 'Player session not found.' };

    let ammoState = this.playerWeaponAmmo.get(characterId);
    if (!ammoState) {
      ammoState = {
        currentAmmo: 6,
        maxAmmo: 6,
        isReloading: false,
        reloadTimer: 0,
        reloadDuration: 1.5,
        lastShotTime: 0,
        fireRate: 2.5,
      };
      this.playerWeaponAmmo.set(characterId, ammoState);
    }

    if (ammoState.isReloading) {
      return { success: true, remainingAmmo: 0, isReloading: true };
    }

    if (ammoState.currentAmmo >= ammoState.maxAmmo) {
      return {
        success: false,
        error: 'Magazine is already full.',
        remainingAmmo: ammoState.currentAmmo,
        isReloading: false,
      };
    }

    ammoState.isReloading = true;
    ammoState.reloadTimer = ammoState.reloadDuration;
    return { success: true, remainingAmmo: 0, isReloading: true };
  }

  public updateActiveProjectiles(
    dt: number,
    grid: ServerMiningGrid,
    mobs: Iterable<{ id: string; health: number; animationState: string; mobBody: any }>,
    onDamageMob: (mobId: string, damage: number) => void,
    onMineTileDamage: (x: number, y: number, damage: number, characterId: string) => void
  ): void {
    // 1. Advance reload timers for all characters
    for (const [, ammo] of this.playerWeaponAmmo.entries()) {
      if (ammo.isReloading) {
        ammo.reloadTimer -= dt;
        if (ammo.reloadTimer <= 0) {
          ammo.isReloading = false;
          ammo.reloadTimer = 0;
          ammo.currentAmmo = ammo.maxAmmo;
        }
      }
    }

    if (this.activeProjectiles.length === 0) return;

    for (const proj of this.activeProjectiles) {
      proj.update(dt, grid);

      // 2. Check collision against active mobs if not already hit a solid tile
      if (!proj.hasHit) {
        for (const mob of mobs) {
          if (mob.health > 0 && mob.animationState !== 'death') {
            const mobX = mob.mobBody.position.x;
            const mobY = mob.mobBody.position.y;
            const dist = Math.hypot(proj.position.x - mobX, proj.position.y - mobY);
            if (dist < 0.7) {
              proj.hasHit = true;
              proj.hitMobId = mob.id;
              onDamageMob(mob.id, proj.damage);
              proj.cleanup();
              break;
            }
          }
        }
      }

      // 3. Tile hit handling
      if (proj.hitTile) {
        const { x, y } = proj.hitTile;
        if (isInBounds(x, y)) {
          onMineTileDamage(x, y, proj.damage, proj.characterId);
        }
      }
    }

    // Clean up hit or expired projectiles
    this.activeProjectiles = this.activeProjectiles.filter((p) => !p.hasHit);
  }

  public consumePendingGunshots(): MiningGunshotEvent[] {
    const list = this.pendingGunshots;
    this.pendingGunshots = [];
    return list;
  }
}
