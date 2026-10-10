import {
  type DamageEvent,
  type MiningGunshotEvent,
  type Vector2D,
  getItemDamageEffect,
  type GameItem,
  type ItemProjectileConfig,
  segmentAabbEntryTime,
} from '@mine-me/shared';
import { isInBounds } from '../../miningMap.service';
import { MiningProjectileEntity } from '../physics/MiningProjectileEntity';
import { resolveMuzzlePosition } from './miningMuzzle';
import type { MiningPlayerSession } from './MiningPlayerManager';
import type { MiningActiveMobSession } from './MiningMobSubsystem';
import { WeaponMagazines, resolveWeaponLimits } from './WeaponMagazines';
import type { MiningWorld } from '../MiningWorld';

export type ShootResult = {
  success: boolean;
  error?: string;
  remainingAmmo?: number;
  isReloading?: boolean;
};

export class MiningProjectileSubsystem {
  public activeProjectiles: MiningProjectileEntity[] = [];
  public readonly magazines = new WeaponMagazines();
  public pendingGunshots: MiningGunshotEvent[] = [];

  constructor(private readonly world: MiningWorld) {}

  /** The ranged weapon definition a player currently has equipped, if any. */
  private resolveEquippedWeapon(session: MiningPlayerSession): GameItem | undefined {
    const weapon = session.equippedWeaponId ? this.world.data.getItemData(session.equippedWeaponId) : undefined;
    return weapon && weapon.shootsProjectiles === true ? weapon : undefined;
  }

  /** Ammo shown to the client for the currently equipped weapon, or null if none. */
  public getAmmoStatus(session: MiningPlayerSession): { current: number; max: number; isReloading: boolean } | null {
    const weapon = this.resolveEquippedWeapon(session);
    if (!weapon) return null;
    const mag = this.magazines.get(session.characterId, weapon.id, resolveWeaponLimits(weapon));
    return { current: mag.currentAmmo, max: mag.maxAmmo, isReloading: mag.isReloading };
  }

  public shootProjectile(
    session: MiningPlayerSession | undefined,
    target: Vector2D,
    muzzlePosition?: Vector2D
  ): ShootResult {
    if (!session) return { success: false, error: 'Player session not found.' };

    const characterId = session.characterId;
    // 1. The weapon is whatever the server knows the character has equipped (never client-supplied)
    const { data, grid, simTime } = this.world;
    const weaponItem = this.resolveEquippedWeapon(session);
    if (!weaponItem) {
      return { success: false, error: 'No ranged weapon equipped.' };
    }

    // Limits come from the weapon's database-backed definition; each weapon has its own magazine
    const limits = resolveWeaponLimits(weaponItem);
    const projConfig: Partial<ItemProjectileConfig> = weaponItem.projectileConfig ?? {};
    const mag = this.magazines.get(characterId, weaponItem.id, limits);

    // 2. Check if reloading
    if (mag.isReloading) {
      return { success: false, error: 'Reloading weapon...', isReloading: true, remainingAmmo: mag.currentAmmo };
    }

    // 3. Check if empty
    if (mag.currentAmmo <= 0) {
      this.magazines.startReload(mag);
      return { success: false, error: 'Weapon is empty. Reloading...', isReloading: true, remainingAmmo: 0 };
    }

    // 4. Fire rate rate-limiting
    const minCooldownSeconds = 1 / mag.fireRate;
    if (simTime - mag.lastShotAt < minCooldownSeconds) {
      return { success: false, error: 'Firing too fast.', remainingAmmo: mag.currentAmmo };
    }

    // 5. Deduct 1 shot
    mag.currentAmmo--;
    mag.lastShotAt = simTime;

    // If the magazine is now empty, immediately begin reload countdown
    if (mag.currentAmmo === 0) {
      this.magazines.startReload(mag);
    }

    // 7. Calculate firing launch vector (client muzzle is only trusted when plausible)
    const muzzlePos = resolveMuzzlePosition(
      session.playerBody.position,
      target,
      grid,
      muzzlePosition && Number.isFinite(muzzlePosition.x) && Number.isFinite(muzzlePosition.y)
        ? muzzlePosition
        : undefined
    );

    const dx = target.x - muzzlePos.x;
    const dy = target.y - muzzlePos.y;
    const dist = Math.hypot(dx, dy) || 1.0;
    const dirX = dx / dist;
    const dirY = dy / dist;

    const speed = projConfig.projectileSpeed ?? 28.0;
    const initialVel: Vector2D = {
      x: dirX * speed,
      y: dirY * speed,
    };

    const projectileId = `proj_${characterId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    let bulletSpriteUrl: string | null = '/assets/sprites/items/gun_bullet_ingame.png';
    let bulletScale = 1.0;
    if (projConfig.projectileItemId) {
      const bulletItem = data.getItemData(projConfig.projectileItemId);
      if (bulletItem) {
        if (bulletItem.inGameSpriteUrl) {
          bulletSpriteUrl = bulletItem.inGameSpriteUrl;
        }
        if (typeof bulletItem.inGameScale === 'number' && bulletItem.inGameScale > 0) {
          bulletScale = bulletItem.inGameScale;
        }
      }
    }

    // Projectile damage is resolved from the item that fired it via the effect table
    const weaponDamage = getItemDamageEffect(weaponItem) || weaponItem?.combatScore || 35;

    const projectile = new MiningProjectileEntity(
      projectileId,
      characterId,
      muzzlePos,
      initialVel,
      {
        damage: weaponDamage,
        weaponItemId: weaponItem.id,
        itemId: projConfig.projectileItemId,
        spriteUrl: bulletSpriteUrl,
        inGameScale: bulletScale,
        gravityScale: projConfig.projectileGravityScale ?? 0.05,
        pierceCount: projConfig.pierceCount,
      }
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
      remainingAmmo: mag.currentAmmo,
      isReloading: mag.isReloading,
    };
  }

  public reloadWeapon(session: MiningPlayerSession | undefined): ShootResult {
    if (!session) return { success: false, error: 'Player session not found.' };

    const characterId = session.characterId;
    const weapon = this.resolveEquippedWeapon(session);
    if (!weapon) return { success: false, error: 'No ranged weapon equipped.' };

    const mag = this.magazines.get(characterId, weapon.id, resolveWeaponLimits(weapon));

    if (mag.isReloading) {
      return { success: true, remainingAmmo: mag.currentAmmo, isReloading: true };
    }

    if (mag.currentAmmo >= mag.maxAmmo) {
      return {
        success: false,
        error: 'Magazine is already full.',
        remainingAmmo: mag.currentAmmo,
        isReloading: false,
      };
    }

    this.magazines.startReload(mag);
    return { success: true, remainingAmmo: mag.currentAmmo, isReloading: true };
  }

  public updateActiveProjectiles(dt: number): void {
    const { grid } = this.world;
    // 1. Advance reload timers for every weapon of every character
    this.magazines.tick(dt);

    if (this.activeProjectiles.length === 0) return;

    // Snapshot the mobs: hits can change the mob map while we iterate
    const mobList = Array.from(this.world.mobs.activeMobs.values());

    // A projectile's hit: attributed to the player who fired it, via their weapon
    const hitEvent = (proj: MiningProjectileEntity): DamageEvent => ({
      amount: proj.damage,
      type: 'ranged',
      source: {
        kind: 'projectile',
        id: proj.id,
        ownerId: proj.characterId,
        itemId: proj.weaponItemId,
        position: { x: proj.position.x, y: proj.position.y },
      },
    });

    for (const proj of this.activeProjectiles) {
      proj.update(dt, grid);

      // 2. Swept test against every living mob's collider along the path travelled this step (the path
      //    already stops at a wall, so a mob behind a wall is not hit). Mobs are hit nearest first; a
      //    piercing bullet carries on through as many as it has left, otherwise the first one stops it.
      if (!proj.expired) {
        const { previousPosition: from, position: to } = proj;
        const along: { mob: MiningActiveMobSession; t: number }[] = [];
        for (const mob of mobList) {
          if (mob.health <= 0 || mob.animationState === 'death' || proj.hitMobIds.has(mob.id)) continue;
          const body = mob.mobBody;
          const t = segmentAabbEntryTime(from, to, body.position, body.halfWidth, body.halfHeight, proj.hitRadius);
          if (t !== null) along.push({ mob, t });
        }
        along.sort((m, n) => m.t - n.t);
        for (const { mob, t } of along) {
          proj.hitMobIds.add(mob.id);
          this.world.damage.applyDamage({ kind: 'mob', id: mob.id }, hitEvent(proj));
          if (proj.pierceRemaining > 0) {
            proj.pierceRemaining--;
            continue;
          }
          proj.position = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
          proj.hasHit = true;
          proj.hitTile = undefined; // the mob was reached first
          proj.hitMobId = mob.id;
          break;
        }
      }

      // 3. Tile hit handling
      if (proj.hitTile) {
        const { x, y } = proj.hitTile;
        if (isInBounds(x, y)) {
          this.world.damage.damageTile(x, y, hitEvent(proj));
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
