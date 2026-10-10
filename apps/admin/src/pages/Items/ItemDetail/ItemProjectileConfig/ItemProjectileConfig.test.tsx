import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ItemProjectileConfig from './ItemProjectileConfig';

describe('ItemProjectileConfig', () => {
  const mockAvailableItems = [
    { id: 'cmn_bullet_gun_round', name: 'Gun Bullet', iconUrl: '/icons/bullet.png' },
    { id: 'cmn_rock_001', name: 'Rock Pebble', iconUrl: null },
  ];

  it('renders unchecked checkbox when shootsProjectiles is false and hides panel', () => {
    render(
      <ItemProjectileConfig
        shootsProjectiles={false}
        projectileConfig={null}
        availableItems={mockAvailableItems}
        onToggleShootsProjectiles={() => {}}
        onChangeConfig={() => {}}
      />
    );

    const checkbox = screen.getByTestId('shoots-projectiles-checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.queryByTestId('projectile-item-select')).toBeNull();
    expect(screen.queryByTestId('magazine-size-input')).toBeNull();
  });

  it('calls onToggleShootsProjectiles when clicking checkbox', () => {
    const onToggle = vi.fn();
    const onChange = vi.fn();

    render(
      <ItemProjectileConfig
        shootsProjectiles={false}
        projectileConfig={null}
        availableItems={mockAvailableItems}
        onToggleShootsProjectiles={onToggle}
        onChangeConfig={onChange}
      />
    );

    const checkbox = screen.getByTestId('shoots-projectiles-checkbox');
    fireEvent.click(checkbox);

    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onChange).toHaveBeenCalled();
  });

  it('displays configuration panel and inputs when shootsProjectiles is true', () => {
    render(
      <ItemProjectileConfig
        shootsProjectiles={true}
        projectileConfig={{
          magazineSize: 6,
          fireRate: 2.5,
          reloadTime: 1.5,
          projectileSpeed: 28,
          projectileGravityScale: 0.05,
          projectileItemId: 'cmn_bullet_gun_round',
        }}
        availableItems={mockAvailableItems}
        onToggleShootsProjectiles={() => {}}
        onChangeConfig={() => {}}
      />
    );

    expect(screen.getByTestId('projectile-item-select')).toBeDefined();
    expect(screen.getByText('Weapon Damage')).toBeDefined();
    const magInput = screen.getByTestId('magazine-size-input') as HTMLInputElement;
    expect(magInput.value).toBe('6');

    const fireRateInput = screen.getByTestId('fire-rate-input') as HTMLInputElement;
    expect(fireRateInput.value).toBe('2.5');

    const reloadInput = screen.getByTestId('reload-time-input') as HTMLInputElement;
    expect(reloadInput.value).toBe('1.5');
  });

  it('updates projectileConfig when changing magazine size or bullet item dropdown', () => {
    const onChange = vi.fn();

    render(
      <ItemProjectileConfig
        shootsProjectiles={true}
        projectileConfig={{
          magazineSize: 6,
          fireRate: 2.5,
          reloadTime: 1.5,
          projectileSpeed: 28,
          projectileGravityScale: 0.05,
        }}
        availableItems={mockAvailableItems}
        onToggleShootsProjectiles={() => {}}
        onChangeConfig={onChange}
      />
    );

    // Change magazine size
    const magInput = screen.getByTestId('magazine-size-input');
    fireEvent.change(magInput, { target: { value: '12' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ magazineSize: 12 })
    );

    // Select bullet item
    const select = screen.getByTestId('projectile-item-select');
    fireEvent.change(select, { target: { value: 'cmn_bullet_gun_round' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ projectileItemId: 'cmn_bullet_gun_round' })
    );
  });

  it('edits the pierce count as a whole number between 0 and 10', () => {
    const onChange = vi.fn();
    render(
      <ItemProjectileConfig
        shootsProjectiles={true}
        projectileConfig={{ magazineSize: 6, fireRate: 2.5 }}
        availableItems={mockAvailableItems}
        onToggleShootsProjectiles={() => {}}
        onChangeConfig={onChange}
      />
    );
    const input = screen.getByTestId('pierce-count-input');
    expect((input as HTMLInputElement).value).toBe('0');
    fireEvent.change(input, { target: { value: '2.7' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pierceCount: 2 }));
    fireEvent.change(input, { target: { value: '99' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pierceCount: 10 }));
    fireEvent.change(input, { target: { value: '-3' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pierceCount: 0 }));
  });
});
