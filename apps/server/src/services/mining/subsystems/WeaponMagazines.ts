/** Fallbacks used only when a weapon's projectileConfig omits a field. */
export const DEFAULT_WEAPON_LIMITS = {
  magazineSize: 6,
  fireRate: 2.5, // shots per second
  reloadTime: 1.5, // seconds
} as const;

export interface WeaponMagazine {
  currentAmmo: number;
  maxAmmo: number;
  isReloading: boolean;
  /** Seconds remaining until the reload completes. */
  reloadTimer: number;
  reloadDuration: number;
  /** Simulation time (seconds) of the last shot; -Infinity if it has never fired. */
  lastShotAt: number;
  fireRate: number;
}

export interface WeaponLimits {
  maxAmmo: number;
  fireRate: number;
  reloadDuration: number;
}

/** Reads a weapon's limits from its (database-backed) item definition. */
export function resolveWeaponLimits(weaponItem: { projectileConfig?: any } | undefined): WeaponLimits {
  const cfg = weaponItem?.projectileConfig ?? {};
  const positive = (v: unknown, fallback: number) => (typeof v === 'number' && v > 0 ? v : fallback);
  return {
    maxAmmo: Math.floor(positive(cfg.magazineSize, DEFAULT_WEAPON_LIMITS.magazineSize)),
    fireRate: positive(cfg.fireRate, DEFAULT_WEAPON_LIMITS.fireRate),
    reloadDuration: positive(cfg.reloadTime, DEFAULT_WEAPON_LIMITS.reloadTime),
  };
}

/**
 * Magazine state per (character, weapon). Each weapon keeps its own rounds, fire-rate cooldown
 * and reload progress, so swapping guns neither refills nor loses ammo.
 */
export class WeaponMagazines {
  private readonly byCharacter = new Map<string, Map<string, WeaponMagazine>>();

  public peek(characterId: string, weaponId: string): WeaponMagazine | undefined {
    return this.byCharacter.get(characterId)?.get(weaponId);
  }

  /** Returns the magazine, creating a full one from the weapon's limits on first use. */
  public get(characterId: string, weaponId: string, limits: WeaponLimits): WeaponMagazine {
    let weapons = this.byCharacter.get(characterId);
    if (!weapons) {
      weapons = new Map();
      this.byCharacter.set(characterId, weapons);
    }
    let mag = weapons.get(weaponId);
    if (!mag) {
      mag = {
        currentAmmo: limits.maxAmmo,
        maxAmmo: limits.maxAmmo,
        isReloading: false,
        reloadTimer: 0,
        reloadDuration: limits.reloadDuration,
        lastShotAt: -Infinity,
        fireRate: limits.fireRate,
      };
      weapons.set(weaponId, mag);
    }
    return mag;
  }

  public startReload(mag: WeaponMagazine): void {
    mag.isReloading = true;
    mag.reloadTimer = mag.reloadDuration;
  }

  /** Swapping away from a weapon cancels its reload; rounds already in the gun are kept. */
  public cancelReload(characterId: string, weaponId: string): void {
    const mag = this.peek(characterId, weaponId);
    if (mag?.isReloading) {
      mag.isReloading = false;
      mag.reloadTimer = 0;
    }
  }

  public removeCharacter(characterId: string): void {
    this.byCharacter.delete(characterId);
  }

  /** Advances every in-progress reload by dt seconds. */
  public tick(dt: number): void {
    for (const weapons of this.byCharacter.values()) {
      for (const mag of weapons.values()) {
        if (!mag.isReloading) continue;
        mag.reloadTimer -= dt;
        if (mag.reloadTimer <= 0) {
          mag.isReloading = false;
          mag.reloadTimer = 0;
          mag.currentAmmo = mag.maxAmmo;
        }
      }
    }
  }
}
