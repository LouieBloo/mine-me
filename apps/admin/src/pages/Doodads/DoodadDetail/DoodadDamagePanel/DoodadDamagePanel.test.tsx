import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DoodadDamagePanel from './DoodadDamagePanel';

const effects = [{ id: 'p1', name: 'Puff' }];
const renderIt = (props: Partial<React.ComponentProps<typeof DoodadDamagePanel>> = {}) => {
  const handlers = { onHealthChange: vi.fn(), onFallDamageChange: vi.fn(), onDeathEffectChange: vi.fn() };
  render(<DoodadDamagePanel anchor="FLOOR" health={null} fallDamage={null} deathParticleEffectId={null} particleEffects={effects} {...handlers} {...props} />);
  return handlers;
};

describe('DoodadDamagePanel', () => {
  it('sets health as a number, and clears it back to null when emptied', () => {
    const { onHealthChange } = renderIt({ health: 10 });
    const input = screen.getByLabelText('Health');
    expect(input).toHaveValue(10);
    fireEvent.change(input, { target: { value: '15' } });
    expect(onHealthChange).toHaveBeenLastCalledWith(15);
    fireEvent.change(input, { target: { value: '' } });
    expect(onHealthChange).toHaveBeenLastCalledWith(null);
  });

  it('only offers fall damage for a ceiling doodad', () => {
    renderIt({ anchor: 'FLOOR' });
    expect(screen.queryByLabelText('Fall Damage (mass)')).not.toBeInTheDocument();
  });

  it('sets fall damage on a ceiling doodad', () => {
    const { onFallDamageChange } = renderIt({ anchor: 'CEILING' });
    fireEvent.change(screen.getByLabelText('Fall Damage (mass)'), { target: { value: '4.5' } });
    expect(onFallDamageChange).toHaveBeenLastCalledWith(4.5);
  });

  it('picks a death effect from the library, or none', () => {
    const { onDeathEffectChange } = renderIt();
    fireEvent.change(screen.getByLabelText('Death Effect'), { target: { value: 'p1' } });
    expect(onDeathEffectChange).toHaveBeenLastCalledWith('p1');
    fireEvent.change(screen.getByLabelText('Death Effect'), { target: { value: '' } });
    expect(onDeathEffectChange).toHaveBeenLastCalledWith(null);
  });

  it('shows a deleted effect so it can be replaced', () => {
    renderIt({ deathParticleEffectId: 'gone' });
    expect(screen.getByRole('option', { name: '(missing effect)' })).toBeInTheDocument();
  });
});
