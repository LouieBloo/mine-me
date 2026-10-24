import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DoodadEffectsPanel from './DoodadEffectsPanel';

const effects = [{ id: 'p1', name: 'Spore Cloud' }];
const LIGHT = { enabled: true, type: 'POINT', effect: 'PULSE', color: '#38bdf8', radius: 9, intensity: 0.5, offsetX: 4, offsetY: -6 } as const;
const renderIt = (props: Partial<React.ComponentProps<typeof DoodadEffectsPanel>> = {}) => {
  const onLightChange = vi.fn();
  const onParticleChange = vi.fn();
  render(<DoodadEffectsPanel light={null} particleEffectId={null} particleEffects={effects} onLightChange={onLightChange} onParticleChange={onParticleChange} {...props} />);
  return { onLightChange, onParticleChange };
};

describe('DoodadEffectsPanel', () => {
  it('turns the light on with a position at the anchor point', () => {
    const { onLightChange } = renderIt();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onLightChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, offsetX: 0, offsetY: 0 }));
  });

  it('keeps where the light sits when the light is edited', () => {
    const { onLightChange } = renderIt({ light: { ...LIGHT } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onLightChange).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false, offsetX: 4, offsetY: -6, color: '#38bdf8' }));
  });

  it('picks a particle effect from the library, or none', () => {
    const { onParticleChange } = renderIt();
    fireEvent.change(screen.getByLabelText('Particle Effect'), { target: { value: 'p1' } });
    expect(onParticleChange).toHaveBeenLastCalledWith('p1');
    fireEvent.change(screen.getByLabelText('Particle Effect'), { target: { value: '' } });
    expect(onParticleChange).toHaveBeenLastCalledWith(null);
  });

  it('shows an effect that was deleted, so it can be replaced', () => {
    renderIt({ particleEffectId: 'gone' });
    expect(screen.getByRole('option', { name: '(missing effect)' })).toBeInTheDocument();
  });
});
