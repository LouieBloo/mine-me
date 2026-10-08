import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemHoldPreview from './ItemHoldPreview';

// Mock ModularCharacterCanvas to isolate ItemHoldPreview controls and logic
vi.mock('../../../../components/ModularCharacterCanvas/ModularCharacterCanvas', () => ({
  default: (props: any) => (
    <div data-testid="mock-modular-character-canvas">
      Canvas Mock (aim: {props.aimAngle}, gearCount: {props.selectedGear?.length})
    </div>
  ),
}));

describe('ItemHoldPreview Component', () => {
  const baseItem = {
    id: 'test-item-1',
    name: 'Revolver',
    type: 'GEAR',
    subType: 'WEAPON',
    gearImageUrl: '/assets/gear/revolver_gear.png',
    shootsProjectiles: true,
    holdOffsetX: 10,
    holdOffsetY: 5,
    holdRotation: 15,
    muzzleOffsetX: 35,
    muzzleOffsetY: -8,
  };

  it('renders hold preview controls and canvas when item has an image', () => {
    const handleChange = vi.fn();
    render(<ItemHoldPreview item={baseItem} onChange={handleChange} />);

    expect(screen.getByText('Character Hold Preview & Offsets')).toBeDefined();
    expect(screen.getByText('Shoots Projectiles')).toBeDefined();
    expect(screen.getByTestId('mock-modular-character-canvas')).toBeDefined();
    expect(screen.getByText(/Hand Grip Placement & Rotation/i)).toBeDefined();
    expect(screen.getByText(/Projectile Launch Origin \(Muzzle\)/i)).toBeDefined();
  });

  it('shows empty state warning when no image is available', () => {
    const handleChange = vi.fn();
    render(
      <ItemHoldPreview
        item={{ ...baseItem, gearImageUrl: null, inGameSpriteUrl: null, iconUrl: null }}
        onChange={handleChange}
      />
    );

    expect(screen.getByText('No Image Uploaded Yet')).toBeDefined();
    expect(screen.queryByTestId('mock-modular-character-canvas')).toBeNull();
  });

  it('calls onChange when grip horizontal offset X changes', () => {
    const handleChange = vi.fn();
    render(<ItemHoldPreview item={baseItem} onChange={handleChange} />);

    const input = screen.getByLabelText(/Horizontal Grip Offset \(X\)/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '25' } });

    expect(handleChange).toHaveBeenCalledWith({ holdOffsetX: 25 });
  });

  it('calls onChange when grip vertical offset Y changes', () => {
    const handleChange = vi.fn();
    render(<ItemHoldPreview item={baseItem} onChange={handleChange} />);

    const input = screen.getByLabelText(/Vertical Grip Offset \(Y\)/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-12' } });

    expect(handleChange).toHaveBeenCalledWith({ holdOffsetY: -12 });
  });

  it('calls onChange when rotation changes or preset angle is clicked', () => {
    const handleChange = vi.fn();
    render(<ItemHoldPreview item={baseItem} onChange={handleChange} />);

    const input = screen.getByLabelText(/Weapon \/ Item Rotation/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '45' } });
    expect(handleChange).toHaveBeenCalledWith({ holdRotation: 45 });

    // Click 90° quick preset
    const preset90Btn = screen.getByRole('button', { name: '90°' });
    fireEvent.click(preset90Btn);
    expect(handleChange).toHaveBeenCalledWith({ holdRotation: 90 });
  });

  it('calls onChange when muzzle X and Y change for projectile items', () => {
    const handleChange = vi.fn();
    render(<ItemHoldPreview item={baseItem} onChange={handleChange} />);

    const muzzleX = screen.getByLabelText(/Muzzle Horizontal Offset \(X\)/i) as HTMLInputElement;
    fireEvent.change(muzzleX, { target: { value: '50' } });
    expect(handleChange).toHaveBeenCalledWith({ muzzleOffsetX: 50 });

    const muzzleY = screen.getByLabelText(/Muzzle Vertical Offset \(Y\)/i) as HTMLInputElement;
    fireEvent.change(muzzleY, { target: { value: '-15' } });
    expect(handleChange).toHaveBeenCalledWith({ muzzleOffsetY: -15 });
  });

  it('hides muzzle controls when shootsProjectiles is false', () => {
    const handleChange = vi.fn();
    render(<ItemHoldPreview item={{ ...baseItem, shootsProjectiles: false }} onChange={handleChange} />);

    expect(screen.queryByText(/Projectile Launch Origin \(Muzzle\)/i)).toBeNull();
  });

  it('resets grip offsets on Reset Grip button click', () => {
    const handleChange = vi.fn();
    render(<ItemHoldPreview item={baseItem} onChange={handleChange} />);

    const resetGripBtn = screen.getByRole('button', { name: 'Reset Grip' });
    fireEvent.click(resetGripBtn);

    expect(handleChange).toHaveBeenCalledWith({
      holdOffsetX: 0,
      holdOffsetY: 0,
      holdRotation: 0,
    });
  });

  it('resets muzzle offsets on Reset Muzzle button click', () => {
    const handleChange = vi.fn();
    render(<ItemHoldPreview item={baseItem} onChange={handleChange} />);

    const resetMuzzleBtn = screen.getByRole('button', { name: 'Reset Muzzle' });
    fireEvent.click(resetMuzzleBtn);

    expect(handleChange).toHaveBeenCalledWith({
      muzzleOffsetX: 0,
      muzzleOffsetY: 0,
    });
  });

  it('resets all offsets on Reset All Offsets button click', () => {
    const handleChange = vi.fn();
    render(<ItemHoldPreview item={baseItem} onChange={handleChange} />);

    const resetAllBtn = screen.getByRole('button', { name: 'Reset All Offsets' });
    fireEvent.click(resetAllBtn);

    expect(handleChange).toHaveBeenCalledWith({
      holdOffsetX: 0,
      holdOffsetY: 0,
      holdRotation: 0,
      muzzleOffsetX: 0,
      muzzleOffsetY: 0,
    });
  });
});
