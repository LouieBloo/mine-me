import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemHoldPreview from './ItemHoldPreview';

// Mock ModularCharacterCanvas to isolate ItemHoldPreview controls and logic
vi.mock('../../../../components/ModularCharacterCanvas/ModularCharacterCanvas', () => ({
  default: (props: any) => (
    <div
      data-testid="mock-modular-character-canvas"
      data-held-particle={JSON.stringify(props.selectedGear?.[0]?.heldParticle ?? null)}
      data-held-light={JSON.stringify(props.selectedGear?.[0]?.heldLight ?? null)}
    >
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
  describe('held particle effect origin', () => {
    const flame = { emitterType: 'continuous', rate: 30 } as any;
    const flameItem = { ...baseItem, shootsProjectiles: false, heldParticleEffectId: 'pe_flame', heldParticleOffsetX: 20, heldParticleOffsetY: -40 };

    it('is hidden when the item has no held particle effect', () => {
      render(<ItemHoldPreview item={baseItem} onChange={vi.fn()} />);
      expect(screen.queryByTestId('held-particle-card')).toBeNull();
      expect(screen.getByTestId('mock-modular-character-canvas').getAttribute('data-held-particle')).toBe('null');
    });

    it('shows the X/Y controls with the saved offsets and names the effect', () => {
      render(<ItemHoldPreview item={flameItem} heldParticleConfig={flame} heldParticleName="Flame" onChange={vi.fn()} />);
      expect(screen.getByTestId('held-particle-card')).toBeDefined();
      expect(screen.getByText(/"Flame" is emitted/)).toBeDefined();
      expect((screen.getByLabelText('Particle Horizontal Offset (X)') as HTMLInputElement).value).toBe('20');
      expect((screen.getByLabelText('Particle Vertical Offset (Y)') as HTMLInputElement).value).toBe('-40');
    });

    it('hands the canvas the effect config and origin so it can draw the marker and emit', () => {
      render(<ItemHoldPreview item={flameItem} heldParticleConfig={flame} onChange={vi.fn()} />);
      const held = JSON.parse(screen.getByTestId('mock-modular-character-canvas').getAttribute('data-held-particle')!);
      expect(held).toEqual({ config: flame, offsetX: 20, offsetY: -40 });
    });

    it('does not ask the canvas to emit while the effect config is not loaded', () => {
      render(<ItemHoldPreview item={flameItem} heldParticleConfig={null} onChange={vi.fn()} />);
      expect(screen.getByTestId('held-particle-card')).toBeDefined();
      expect(screen.getByTestId('mock-modular-character-canvas').getAttribute('data-held-particle')).toBe('null');
    });

    it('reports offset edits from the number box, the slider and the +/- buttons', () => {
      const onChange = vi.fn();
      render(<ItemHoldPreview item={flameItem} heldParticleConfig={flame} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText('Particle Horizontal Offset (X)'), { target: { value: '55' } });
      expect(onChange).toHaveBeenLastCalledWith({ heldParticleOffsetX: 55 });

      fireEvent.change(screen.getByLabelText('Particle Vertical Offset (Y) slider'), { target: { value: '-90' } });
      expect(onChange).toHaveBeenLastCalledWith({ heldParticleOffsetY: -90 });

      fireEvent.click(screen.getByLabelText('Increase Particle Horizontal Offset (X)'));
      expect(onChange).toHaveBeenLastCalledWith({ heldParticleOffsetX: 21 });

      fireEvent.click(screen.getByLabelText('Decrease Particle Vertical Offset (Y)'));
      expect(onChange).toHaveBeenLastCalledWith({ heldParticleOffsetY: -41 });
    });

    it('resets only the particle origin, and Reset All includes it', () => {
      const onChange = vi.fn();
      render(<ItemHoldPreview item={flameItem} heldParticleConfig={flame} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Reset Origin' }));
      expect(onChange).toHaveBeenLastCalledWith({ heldParticleOffsetX: 0, heldParticleOffsetY: 0 });

      fireEvent.click(screen.getByRole('button', { name: 'Reset All Offsets' }));
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ holdOffsetX: 0, muzzleOffsetX: 0, heldParticleOffsetX: 0, heldParticleOffsetY: 0 })
      );
    });
  });
  describe('held light origin', () => {
    const lamp = { enabled: true, type: 'POINT', effect: 'FLICKER', color: '#ff8a2a', radius: 3, intensity: 0.6, offsetX: 15, offsetY: -25 } as any;
    const lampItem = { ...baseItem, shootsProjectiles: false, heldLightConfig: lamp };

    it('is hidden without a light, or when the light is disabled', () => {
      const { rerender } = render(<ItemHoldPreview item={baseItem} onChange={vi.fn()} />);
      expect(screen.queryByTestId('held-light-card')).toBeNull();
      expect(screen.getByTestId('mock-modular-character-canvas').getAttribute('data-held-light')).toBe('null');

      rerender(<ItemHoldPreview item={{ ...baseItem, heldLightConfig: { ...lamp, enabled: false } }} onChange={vi.fn()} />);
      expect(screen.queryByTestId('held-light-card')).toBeNull();
    });

    it('shows the saved offsets and hands the canvas the origin for its marker', () => {
      render(<ItemHoldPreview item={lampItem} onChange={vi.fn()} />);
      expect((screen.getByLabelText('Light Horizontal Offset (X)') as HTMLInputElement).value).toBe('15');
      expect((screen.getByLabelText('Light Vertical Offset (Y)') as HTMLInputElement).value).toBe('-25');
      expect(JSON.parse(screen.getByTestId('mock-modular-character-canvas').getAttribute('data-held-light')!)).toEqual({ offsetX: 15, offsetY: -25 });
    });

    it('writes offset edits back into the light config, keeping the rest of it', () => {
      const onChange = vi.fn();
      render(<ItemHoldPreview item={lampItem} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText('Light Horizontal Offset (X)'), { target: { value: '40' } });
      expect(onChange).toHaveBeenLastCalledWith({ heldLightConfig: { ...lamp, offsetX: 40 } });

      fireEvent.click(screen.getByLabelText('Decrease Light Vertical Offset (Y)'));
      expect(onChange).toHaveBeenLastCalledWith({ heldLightConfig: { ...lamp, offsetY: -26 } });
    });

    it('resets only the light origin, and Reset All includes it', () => {
      const onChange = vi.fn();
      render(<ItemHoldPreview item={lampItem} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Reset Origin' }));
      expect(onChange).toHaveBeenLastCalledWith({ heldLightConfig: { ...lamp, offsetX: 0, offsetY: 0 } });

      fireEvent.click(screen.getByRole('button', { name: 'Reset All Offsets' }));
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ heldLightConfig: { ...lamp, offsetX: 0, offsetY: 0 } }));
    });

    it('can show both origins side by side', () => {
      render(<ItemHoldPreview item={{ ...lampItem, heldParticleEffectId: 'pe_flame' }} onChange={vi.fn()} />);
      expect(screen.getByTestId('held-light-card')).toBeDefined();
      expect(screen.getByTestId('held-particle-card')).toBeDefined();
    });
  });
});
