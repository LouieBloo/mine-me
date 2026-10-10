import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningDataManager } from './subsystems/MiningDataManager';
import { partialDefinitions } from './testHelpers';
import { MINING_CONFIG } from '@mine-me/shared';

const gun = (id: string, magazineSize: number, reloadTime: number, fireRate = 100) => ({
  id,
  itemKey: id,
  name: id,
  type: 'GEAR',
  subType: 'WEAPON',
  shootsProjectiles: true,
  projectileConfig: { magazineSize, reloadTime, fireRate, projectileSpeed: 28 },
  itemEffects: [],
});

describe('per-weapon ammo', () => {
  let original: MiningDataManager;
  let engine: MiningGameEngine;
  let socket: any;
  let ticks: any[];

  const cid = 'char-ammo';
  const mag = (w: string) => engine.projectileSubsystem.magazines.peek(cid, w);
  const shoot = (w?: string) => {
    if (w) mag(w) && (mag(w)!.lastShotAt = -Infinity); // bypass fire-rate cooldown between rapid test shots
    return engine.shootProjectile(cid, { x: 30, y: 0 });
  };
  const equip = (weaponId: string | null) =>
    engine.setLoadout(cid, { miningSpeed: 25, toolDamage: 25, weaponDamage: 25, pickPower: 0, knockback: 0, gearLayers: [], equippedWeaponId: weaponId });
  const lastAmmo = () => ticks[ticks.length - 1].weaponAmmo;

  beforeEach(() => {
    original = MiningDataManager.getInstance();
    MiningDataManager.initialize(
      partialDefinitions({
        items: [...original.getItems(), gun('gunA', 2, 1.0), gun('gunB', 4, 2.0), { id: 'club', name: 'club', type: 'GEAR', subType: 'WEAPON' }],
      })
    );
    ticks = [];
    socket = { connected: true, emit: (e: string, p: any) => e === 'mining_state_tick' && ticks.push(p) };
    engine = new MiningGameEngine({
      characterId: cid,
      cityId: 'c',
      seed: 1,
      socket,
      equippedWeaponId: 'gunA',
      mapConfig: { mobSpawnCount: 0 },
    });
  });

  afterEach(() => {
    engine.stop();
    MiningDataManager.initialize({ items: original.getItems(), mobs: (original as any).mobs, blocks: [...(original as any).blocksByTypeKey.values()] });
  });

  it('uses each weapon\'s own magazine size and reload time', () => {
    expect(shoot().remainingAmmo).toBe(1);
    equip('gunB');
    expect(shoot().remainingAmmo).toBe(3);
    expect(mag('gunA')!.maxAmmo).toBe(2);
    expect(mag('gunB')!.maxAmmo).toBe(4);
    expect(mag('gunB')!.reloadDuration).toBe(2.0);
  });

  it('swapping guns does not refill the one swapped away from', () => {
    shoot();
    shoot('gunA'); // gunA empty -> auto reload
    expect(mag('gunA')).toMatchObject({ currentAmmo: 0, isReloading: true });

    equip('gunB');
    expect(mag('gunA')).toMatchObject({ currentAmmo: 0, isReloading: false });

    // Time passes while holstered: still empty, reload does not continue in the background
    (engine as any).tick(5);
    expect(mag('gunA')!.currentAmmo).toBe(0);

    equip('gunA');
    const res = shoot('gunA');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/empty/i);
    expect(mag('gunA')!.isReloading).toBe(true);
  });

  it('keeps partially used rounds across a swap', () => {
    shoot();
    equip('gunB');
    shoot();
    equip('gunA');
    expect(mag('gunA')!.currentAmmo).toBe(1);
    expect(mag('gunB')!.currentAmmo).toBe(3);
  });

  it('swapping away only cancels the reload of the weapon that was swapped away from', () => {
    shoot();
    shoot('gunA'); // gunA reloading
    equip('gunB');
    equip('club'); // gunB was never reloading; gunA already cancelled
    expect(mag('gunA')!.isReloading).toBe(false);
    expect(mag('gunB')?.isReloading ?? false).toBe(false);
  });

  it('manual reload only affects the equipped weapon and rejects full magazines', () => {
    expect(engine.reloadWeapon(cid)).toMatchObject({ success: false, error: expect.stringMatching(/full/i), remainingAmmo: 2 });
    shoot();
    expect(engine.reloadWeapon(cid)).toEqual({ success: true, remainingAmmo: 1, isReloading: true });
    expect(engine.reloadWeapon(cid)).toEqual({ success: true, remainingAmmo: 1, isReloading: true });
    (engine as any).tick(1.1);
    expect(mag('gunA')).toMatchObject({ currentAmmo: 2, isReloading: false });
  });

  it('rejects shooting and reloading with no ranged weapon equipped', () => {
    equip('club');
    expect(shoot()).toMatchObject({ success: false, error: expect.stringMatching(/no ranged weapon/i) });
    expect(engine.reloadWeapon(cid)).toMatchObject({ success: false, error: expect.stringMatching(/no ranged weapon/i) });
    equip(null);
    expect(shoot().success).toBe(false);
  });

  it('reports the equipped weapon\'s ammo in the tick payload (full for a never-fired gun, none without a gun)', () => {
    shoot();
    (engine as any).tick(1 / 30);
    expect(lastAmmo()).toEqual({ current: 1, max: 2, isReloading: false });

    equip('gunB');
    (engine as any).tick(1 / 30);
    expect(lastAmmo()).toEqual({ current: 4, max: 4, isReloading: false });

    equip('club');
    (engine as any).tick(1 / 30);
    expect(lastAmmo()).toBeUndefined();
  });

  it('does not change anything when the same weapon is re-equipped mid-reload', () => {
    shoot();
    shoot('gunA');
    equip('gunA');
    expect(mag('gunA')!.isReloading).toBe(true);
  });

  it('forgets a player\'s magazines when they leave', () => {
    shoot();
    engine.removePlayer(cid);
    expect(mag('gunA')).toBeUndefined();
  });

  it('range sanity: default revolver data still resolves', () => {
    expect(MINING_CONFIG.GRID_WIDTH).toBeGreaterThan(0);
    equip('cmn_revolver_6shooter');
    expect(shoot().remainingAmmo).toBe(5);
  });
});
