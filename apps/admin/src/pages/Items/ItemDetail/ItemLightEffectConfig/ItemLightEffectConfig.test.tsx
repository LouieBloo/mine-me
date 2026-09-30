import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemLightEffectConfig from './ItemLightEffectConfig';
import type { ItemLightConfig } from '@mine-me/shared';

describe('ItemLightEffectConfig', () => {
  it('renders disabled state when lightConfig is null or disabled', () => {
    const handleChange = vi.fn();
    render(<ItemLightEffectConfig lightConfig={null} onChange={handleChange} />);

    expect(screen.getByText('In-Game Light Effect')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    const toggle = screen.getByRole('checkbox');
    expect(toggle).not.toBeChecked();

    // Controls should not be visible when disabled
    expect(screen.queryByText('Light Shape / Type')).not.toBeInTheDocument();
  });

  it('enables light config when toggle checkbox is clicked', () => {
    const handleChange = vi.fn();
    render(<ItemLightEffectConfig lightConfig={null} onChange={handleChange} />);

    const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        type: 'POINT',
        effect: 'PULSE',
      })
    );
  });

  it('renders active light controls when enabled', () => {
    const config: ItemLightConfig = {
      enabled: true,
      type: 'POINT',
      effect: 'PULSE',
      color: '#fbbf24',
      radius: 2.0,
      intensity: 0.5,
      pulseSpeed: 3.0,
      minIntensity: 0.2,
      maxIntensity: 0.8,
    };
    const handleChange = vi.fn();
    render(<ItemLightEffectConfig lightConfig={config} onChange={handleChange} />);

    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Light Shape / Type')).toBeInTheDocument();
    expect(screen.getByText('Lighting Animation Mode')).toBeInTheDocument();
    expect(screen.getByText(/Radius/i)).toBeInTheDocument();
    expect(screen.getByText(/Pulse Speed/i)).toBeInTheDocument();
  });

  it('allows switching between POINT and SPOT geometry', () => {
    const config: ItemLightConfig = {
      enabled: true,
      type: 'POINT',
      effect: 'STATIC',
      color: '#ffffff',
      radius: 1.5,
      intensity: 0.4,
    };
    const handleChange = vi.fn();
    render(<ItemLightEffectConfig lightConfig={config} onChange={handleChange} />);

    const spotButton = screen.getByRole('button', { name: /Directional Spot/i });
    fireEvent.click(spotButton);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SPOT',
        enabled: true,
      })
    );
  });

  it('allows switching between STATIC, PULSE, and FLICKER emission modes', () => {
    const config: ItemLightConfig = {
      enabled: true,
      type: 'POINT',
      effect: 'STATIC',
      color: '#ffffff',
      radius: 1.5,
      intensity: 0.4,
    };
    const handleChange = vi.fn();
    render(<ItemLightEffectConfig lightConfig={config} onChange={handleChange} />);

    const pulseButton = screen.getByRole('button', { name: /^Pulse$/i });
    fireEvent.click(pulseButton);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        effect: 'PULSE',
        enabled: true,
      })
    );

    const flickerButton = screen.getByRole('button', { name: /^Flicker$/i });
    fireEvent.click(flickerButton);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        effect: 'FLICKER',
        enabled: true,
      })
    );
  });

  it('selects color from color presets', () => {
    const config: ItemLightConfig = {
      enabled: true,
      type: 'POINT',
      effect: 'STATIC',
      color: '#ffffff',
      radius: 1.5,
      intensity: 0.4,
    };
    const handleChange = vi.fn();
    render(<ItemLightEffectConfig lightConfig={config} onChange={handleChange} />);

    const crystalCyan = screen.getByRole('button', { name: /Crystal Cyan/i });
    fireEvent.click(crystalCyan);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        color: '#38bdf8',
        enabled: true,
      })
    );
  });

  it('updates radius slider value', () => {
    const config: ItemLightConfig = {
      enabled: true,
      type: 'POINT',
      effect: 'STATIC',
      color: '#fbbf24',
      radius: 1.5,
      intensity: 0.4,
    };
    const handleChange = vi.fn();
    render(<ItemLightEffectConfig lightConfig={config} onChange={handleChange} />);

    // Find the range inputs
    const rangeInputs = screen.getAllByRole('slider');
    // First slider is radius
    fireEvent.change(rangeInputs[0], { target: { value: '2.5' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        radius: 2.5,
        enabled: true,
      })
    );
  });
});
