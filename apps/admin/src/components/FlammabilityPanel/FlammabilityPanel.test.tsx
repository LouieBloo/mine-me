import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlammabilityPanel, { DEFAULT_EXPLOSION, DEFAULT_FLAMMABILITY } from './FlammabilityPanel';
import type { Flammability } from '@mine-me/shared';

const BURNS: Flammability = { ignitionChance: 0.8, spreadChance: 0.5, burnDuration: 8, heat: 3, burnsInto: null };

describe('FlammabilityPanel', () => {
  it('shows only the switch for something that does not burn', () => {
    render(<FlammabilityPanel value={null} onChange={vi.fn()} />);
    expect(screen.getByText('Does not burn')).toBeInTheDocument();
    expect(screen.getByLabelText('Can burn')).not.toBeChecked();
    expect(screen.queryByLabelText('Ignition Chance')).not.toBeInTheDocument();
  });

  it('switching on gives sensible starting values', () => {
    const onChange = vi.fn();
    render(<FlammabilityPanel value={null} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Can burn'));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FLAMMABILITY);
  });

  it('switching off saves null, not a zeroed object', () => {
    const onChange = vi.fn();
    render(<FlammabilityPanel value={BURNS} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Can burn'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows the fire settings and edits one at a time', () => {
    const onChange = vi.fn();
    render(<FlammabilityPanel value={BURNS} onChange={onChange} />);
    expect(screen.getByText('Can burn')).toBeInTheDocument();
    expect(screen.getByLabelText('Ignition Chance')).toHaveValue(0.8);
    fireEvent.change(screen.getByLabelText('Burn Duration (s)'), { target: { value: '12' } });
    expect(onChange).toHaveBeenCalledWith({ ...BURNS, burnDuration: 12 });
    fireEvent.change(screen.getByLabelText('Heat'), { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...BURNS, heat: 0 });
  });

  it('turns an emptied number field into NaN so validation can reject it', () => {
    const onChange = vi.fn();
    render(<FlammabilityPanel value={BURNS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Spread Chance'), { target: { value: '' } });
    expect(onChange.mock.calls[0][0].spreadChance).toBeNaN();
  });

  it('stores the burns-into block key upper case, and empty as null', () => {
    const onChange = vi.fn();
    render(<FlammabilityPanel value={BURNS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Burns Into (block key)'), { target: { value: ' dirt ' } });
    expect(onChange).toHaveBeenCalledWith({ ...BURNS, burnsInto: 'DIRT' });
  });

  it('clearing the burns-into block key saves null', () => {
    const onChange = vi.fn();
    render(<FlammabilityPanel value={{ ...BURNS, burnsInto: 'DIRT' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Burns Into (block key)'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ ...BURNS, burnsInto: null });
  });

  describe('flames', () => {
    const effects = [{ id: 'pe1', name: 'Oil Fire' }, { id: 'pe2', name: 'Ember' }];

    it('hides the flame settings when no particle library is given', () => {
      render(<FlammabilityPanel value={BURNS} onChange={vi.fn()} />);
      expect(screen.queryByLabelText('Flame Effect')).not.toBeInTheDocument();
      expect(screen.queryByText('Flame Light')).not.toBeInTheDocument();
    });

    it('offers every effect in the library, and none', () => {
      render(<FlammabilityPanel value={BURNS} onChange={vi.fn()} particleEffects={effects} />);
      const options = screen.getAllByRole('option').map((o) => o.textContent);
      expect(options).toEqual(['None (no flames drawn)', 'Oil Fire', 'Ember']);
    });

    it('picks an effect, and clears it back to null', () => {
      const onChange = vi.fn();
      const { rerender } = render(<FlammabilityPanel value={BURNS} onChange={onChange} particleEffects={effects} />);
      fireEvent.change(screen.getByLabelText('Flame Effect'), { target: { value: 'pe2' } });
      expect(onChange).toHaveBeenCalledWith({ ...BURNS, flameEffectId: 'pe2' });
      rerender(<FlammabilityPanel value={{ ...BURNS, flameEffectId: 'pe2' }} onChange={onChange} particleEffects={effects} />);
      expect(screen.getByLabelText('Flame Effect')).toHaveValue('pe2');
      fireEvent.change(screen.getByLabelText('Flame Effect'), { target: { value: '' } });
      expect(onChange).toHaveBeenLastCalledWith({ ...BURNS, flameEffectId: null });
    });

    it('turns the flame light on with the usual light settings, and keeps the rest of the fire settings', () => {
      const onChange = vi.fn();
      render(<FlammabilityPanel value={BURNS} onChange={onChange} particleEffects={effects} />);
      expect(screen.getByText('Flame Light')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Disabled')); // the light's own switch (the first switch is Can burn)
      const call = onChange.mock.calls[0][0];
      expect(call).toMatchObject({ ...BURNS, flameLight: { enabled: true, type: 'POINT' } });
    });
  });

  it('uses a custom title for other materials', () => {
    render(<FlammabilityPanel value={null} onChange={vi.fn()} title="Block Flammability" />);
    expect(screen.getByText('Block Flammability')).toBeInTheDocument();
  });
});

describe('FlammabilityPanel for gases that can explode', () => {
  const EXPLODES: Flammability = { ...BURNS, explosion: { blastRadius: 3, damage: 8, frontSpeed: 3, minConcentration: 0.1 } };

  it('offers no explosion settings unless asked to (fluids and blocks never explode)', () => {
    render(<FlammabilityPanel value={EXPLODES} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Explodes when lit')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Blast Radius')).not.toBeInTheDocument();
  });

  it('shows "burns without exploding" until switched on, then starts from sensible values', () => {
    const onChange = vi.fn();
    render(<FlammabilityPanel value={BURNS} onChange={onChange} allowExplosion />);
    expect(screen.getByLabelText('Explodes when lit')).not.toBeChecked();
    expect(screen.getByText('Burns without exploding')).toBeInTheDocument();
    expect(screen.queryByLabelText('Blast Radius')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Explodes when lit'));
    expect(onChange).toHaveBeenCalledWith({ ...BURNS, explosion: DEFAULT_EXPLOSION });
  });

  it('switching it off saves null for the explosion and keeps the rest of the fire settings', () => {
    const onChange = vi.fn();
    render(<FlammabilityPanel value={EXPLODES} onChange={onChange} allowExplosion />);
    expect(screen.getByLabelText('Explodes when lit')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Explodes when lit'));
    expect(onChange).toHaveBeenCalledWith({ ...BURNS, explosion: null });
  });

  it('shows each blast setting and edits one at a time', () => {
    const onChange = vi.fn();
    render(<FlammabilityPanel value={EXPLODES} onChange={onChange} allowExplosion />);
    expect(screen.getByLabelText('Blast Radius')).toHaveValue(3);
    expect(screen.getByLabelText('Damage per Cell')).toHaveValue(8);
    expect(screen.getByLabelText('Front Speed')).toHaveValue(3);
    expect(screen.getByLabelText('Minimum Concentration')).toHaveValue(0.1);
    fireEvent.change(screen.getByLabelText('Damage per Cell'), { target: { value: '12' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EXPLODES, explosion: { ...EXPLODES.explosion, damage: 12 } });
    fireEvent.change(screen.getByLabelText('Front Speed'), { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EXPLODES, explosion: { ...EXPLODES.explosion, frontSpeed: 5 } });
  });

  it('turns an emptied blast field into NaN so validation can reject it', () => {
    const onChange = vi.fn();
    render(<FlammabilityPanel value={EXPLODES} onChange={onChange} allowExplosion />);
    fireEvent.change(screen.getByLabelText('Blast Radius'), { target: { value: '' } });
    expect(onChange.mock.calls[0][0].explosion.blastRadius).toBeNaN();
  });

  it('words the flame settings as the explosion\'s flash', () => {
    render(<FlammabilityPanel value={EXPLODES} onChange={vi.fn()} allowExplosion particleEffects={[{ id: 'pe1', name: 'Flash' }]} />);
    expect(screen.getByLabelText('Flame / Explosion Effect')).toBeInTheDocument();
    expect(screen.getByText(/The particle effect that bursts from every cell/)).toBeInTheDocument();
    expect(screen.getByText(/The flash of light every exploding cell gives off/)).toBeInTheDocument();
  });
});
