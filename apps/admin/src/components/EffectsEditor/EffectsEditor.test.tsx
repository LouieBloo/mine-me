import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EffectsEditor } from './EffectsEditor';

const damage = { id: 'e_dmg', name: 'Damage', description: 'Hit size', damageModifier: true };
const speed = { id: 'e_spd', name: 'Mining Speed', description: 'Swing rate', miningSpeedModifier: true };

describe('EffectsEditor', () => {
  it('shows an empty state that names the owner', () => {
    render(<EffectsEditor value={[]} available={[damage]} onChange={vi.fn()} ownerLabel="mob" />);
    expect(screen.getByText('No effects configured for this mob.')).toBeInTheDocument();
  });

  it('lists the available effects with their kind', () => {
    render(<EffectsEditor value={[]} available={[damage, speed]} onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: /Damage \(Damage\)/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Mining Speed \(Mining Speed\)/ })).toBeInTheDocument();
  });

  it('adds the selected effect with the entered value', () => {
    const onChange = vi.fn();
    render(<EffectsEditor value={[]} available={[damage, speed]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Select Effect'), { target: { value: 'e_spd' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Effect' }));
    expect(onChange).toHaveBeenCalledWith([{ effectId: 'e_spd', value: 25, effect: speed }]);
  });

  it('does nothing when no effect is chosen', () => {
    const onChange = vi.fn();
    render(<EffectsEditor value={[]} available={[damage]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Effect' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuses to add the same effect twice and says so', () => {
    const onChange = vi.fn();
    render(<EffectsEditor value={[{ effectId: 'e_dmg', value: 5, effect: damage }]} available={[damage]} onChange={onChange} ownerLabel="mob" />);
    fireEvent.change(screen.getByLabelText('Select Effect'), { target: { value: 'e_dmg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Effect' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('already added to the mob');
  });

  it('edits the value of an attached effect', () => {
    const onChange = vi.fn();
    render(<EffectsEditor value={[{ effectId: 'e_dmg', value: 5, effect: damage }, { effectId: 'e_spd', value: 25, effect: speed }]} available={[damage, speed]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Damage value'), { target: { value: '9' } });
    expect(onChange).toHaveBeenCalledWith([
      { effectId: 'e_dmg', value: 9, effect: damage },
      { effectId: 'e_spd', value: 25, effect: speed },
    ]);
  });

  it('removes an attached effect', () => {
    const onChange = vi.fn();
    render(<EffectsEditor value={[{ effectId: 'e_dmg', value: 5, effect: damage }, { effectId: 'e_spd', value: 25, effect: speed }]} available={[damage, speed]} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(onChange).toHaveBeenCalledWith([{ effectId: 'e_spd', value: 25, effect: speed }]);
  });
});
