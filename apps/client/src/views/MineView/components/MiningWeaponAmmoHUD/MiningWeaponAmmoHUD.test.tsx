import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MiningWeaponAmmoHUD } from './MiningWeaponAmmoHUD';

describe('MiningWeaponAmmoHUD', () => {
  it('renders cylinder with loaded rounds', () => {
    render(
      <MiningWeaponAmmoHUD
        weaponName="6-Shooter Revolver"
        currentAmmo={4}
        maxAmmo={6}
        isReloading={false}
      />
    );

    expect(screen.getByText('6-Shooter Revolver')).toBeDefined();
    expect(screen.getByText('4 / 6 ROUNDS')).toBeDefined();

    const loadedChamber = screen.getByTestId('ammo-chamber-0');
    expect(loadedChamber.className).toContain('border-amber-400');

    const spentChamber = screen.getByTestId('ammo-chamber-5');
    expect(spentChamber.className).toContain('opacity-40');
  });

  it('renders reloading state', () => {
    render(
      <MiningWeaponAmmoHUD
        weaponName="6-Shooter Revolver"
        currentAmmo={0}
        maxAmmo={6}
        isReloading={true}
      />
    );

    expect(screen.getByText('RELOADING...')).toBeDefined();
  });

  it('calls onReload when clicking reload button', () => {
    const onReload = vi.fn();
    render(
      <MiningWeaponAmmoHUD
        weaponName="6-Shooter Revolver"
        currentAmmo={3}
        maxAmmo={6}
        isReloading={false}
        onReload={onReload}
      />
    );

    const reloadBtn = screen.getByTestId('manual-reload-btn');
    fireEvent.click(reloadBtn);
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
