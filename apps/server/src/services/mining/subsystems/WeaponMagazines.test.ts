import { describe, it, expect } from 'vitest';
import { WeaponMagazines, resolveWeaponLimits, DEFAULT_WEAPON_LIMITS } from './WeaponMagazines';

const limits = { maxAmmo: 3, fireRate: 2, reloadDuration: 1 };

describe('resolveWeaponLimits', () => {
  it('reads limits from the weapon projectileConfig', () => {
    expect(resolveWeaponLimits({ projectileConfig: { magazineSize: 8, fireRate: 4, reloadTime: 2.5 } })).toEqual({
      maxAmmo: 8,
      fireRate: 4,
      reloadDuration: 2.5,
    });
  });

  it('falls back to documented defaults for missing, zero or invalid values', () => {
    const expected = {
      maxAmmo: DEFAULT_WEAPON_LIMITS.magazineSize,
      fireRate: DEFAULT_WEAPON_LIMITS.fireRate,
      reloadDuration: DEFAULT_WEAPON_LIMITS.reloadTime,
    };
    expect(resolveWeaponLimits(undefined)).toEqual(expected);
    expect(resolveWeaponLimits({})).toEqual(expected);
    expect(resolveWeaponLimits({ projectileConfig: { magazineSize: 0, fireRate: -1, reloadTime: 'x' } })).toEqual(expected);
  });

  it('floors fractional magazine sizes', () => {
    expect(resolveWeaponLimits({ projectileConfig: { magazineSize: 5.9 } }).maxAmmo).toBe(5);
  });
});

describe('WeaponMagazines', () => {
  it('creates a full magazine from the weapon limits on first use and reuses it', () => {
    const m = new WeaponMagazines();
    const mag = m.get('c1', 'gunA', limits);
    expect(mag).toMatchObject({ currentAmmo: 3, maxAmmo: 3, isReloading: false, fireRate: 2, reloadDuration: 1 });
    mag.currentAmmo = 1;
    expect(m.get('c1', 'gunA', limits).currentAmmo).toBe(1);
  });

  it('keeps magazines separate per weapon and per character', () => {
    const m = new WeaponMagazines();
    m.get('c1', 'gunA', limits).currentAmmo = 0;
    expect(m.get('c1', 'gunB', { ...limits, maxAmmo: 9 }).currentAmmo).toBe(9);
    expect(m.get('c2', 'gunA', limits).currentAmmo).toBe(3);
  });

  it('refills when a reload finishes and not before', () => {
    const m = new WeaponMagazines();
    const mag = m.get('c1', 'gunA', limits);
    mag.currentAmmo = 0;
    m.startReload(mag);
    m.tick(0.6);
    expect(mag.isReloading).toBe(true);
    expect(mag.currentAmmo).toBe(0);
    m.tick(0.5);
    expect(mag.isReloading).toBe(false);
    expect(mag.currentAmmo).toBe(3);
  });

  it('reloads every weapon in progress simultaneously (independent timers)', () => {
    const m = new WeaponMagazines();
    const a = m.get('c1', 'gunA', limits);
    const b = m.get('c1', 'gunB', { ...limits, reloadDuration: 3 });
    a.currentAmmo = 0;
    b.currentAmmo = 0;
    m.startReload(a);
    m.startReload(b);
    m.tick(1.1);
    expect(a.isReloading).toBe(false);
    expect(b.isReloading).toBe(true);
  });

  it('cancelling a reload keeps the rounds and drops the progress', () => {
    const m = new WeaponMagazines();
    const mag = m.get('c1', 'gunA', limits);
    mag.currentAmmo = 1;
    m.startReload(mag);
    m.tick(0.4);
    m.cancelReload('c1', 'gunA');
    expect(mag).toMatchObject({ isReloading: false, reloadTimer: 0, currentAmmo: 1 });
    m.tick(5);
    expect(mag.currentAmmo).toBe(1);
  });

  it('cancelReload on an unknown weapon is a no-op', () => {
    expect(() => new WeaponMagazines().cancelReload('nobody', 'nothing')).not.toThrow();
  });

  it('removeCharacter forgets all of that character\'s magazines', () => {
    const m = new WeaponMagazines();
    m.get('c1', 'gunA', limits).currentAmmo = 0;
    m.removeCharacter('c1');
    expect(m.peek('c1', 'gunA')).toBeUndefined();
    expect(m.get('c1', 'gunA', limits).currentAmmo).toBe(3);
  });
});
