import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DEFAULT_MINING_MAP_CONFIG } from '@mine-me/shared';
import MiningConfigDamage, { impactSpeedForDrop, SAMPLE_DROP_TILES, SAMPLE_ROCK_SPEEDS } from './MiningConfigDamage';

const renderCard = (config = {}, onFieldChange = vi.fn()) => {
  render(<MiningConfigDamage config={{ ...DEFAULT_MINING_MAP_CONFIG, ...config }} onFieldChange={onFieldChange} />);
  return onFieldChange;
};

describe('MiningConfigDamage', () => {
  it('shows the fall damage settings with the saved values', () => {
    renderCard({ fallDamageMinSpeed: 9, fallDamagePerSpeed: 4, fallDamageMax: 50 });
    expect((screen.getByLabelText('Minimum Impact Speed') as HTMLInputElement).value).toBe('9');
    expect((screen.getByLabelText('Damage per Speed') as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText('Maximum Damage') as HTMLInputElement).value).toBe('50');
  });

  it('reports edits as numbers on the right config field', () => {
    const onChange = renderCard();
    fireEvent.change(screen.getByLabelText('Minimum Impact Speed'), { target: { value: '12.5' } });
    expect(onChange).toHaveBeenCalledWith('fallDamageMinSpeed', 12.5);
    fireEvent.change(screen.getByLabelText('Damage per Speed'), { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith('fallDamagePerSpeed', 8);
    fireEvent.change(screen.getByLabelText('Maximum Damage'), { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith('fallDamageMax', 0);
  });

  it('previews the damage of sample drops from the current settings', () => {
    renderCard({ fallDamageMinSpeed: 0, fallDamagePerSpeed: 1, fallDamageMax: 0, gravity: 28 });
    const preview = within(screen.getByTestId('fall-damage-preview'));
    for (const tiles of SAMPLE_DROP_TILES) {
      const expected = Math.round(impactSpeedForDrop(tiles, 28));
      expect(preview.getByText(`${tiles}-tile drop: ${expected} dmg`)).toBeInTheDocument();
    }
  });

  it('the preview shows no damage for drops below the minimum speed and honours the cap', () => {
    renderCard({ fallDamageMinSpeed: 11, fallDamagePerSpeed: 6, fallDamageMax: 10, gravity: 28 });
    const preview = within(screen.getByTestId('fall-damage-preview'));
    expect(preview.getByText('2-tile drop: 0 dmg')).toBeInTheDocument();
    expect(preview.getByText('10-tile drop: 10 dmg')).toBeInTheDocument();
  });

  it('limits the impact speed to terminal velocity', () => {
    expect(impactSpeedForDrop(1000, 28)).toBe(20);
  });

  describe('falling rock damage', () => {
    it('shows the rock settings with the saved values', () => {
      renderCard({ rockDamageMinSpeed: 4, rockDamagePerSpeed: 3, rockDamageMax: 70 });
      expect((screen.getByLabelText('Minimum Rock Speed') as HTMLInputElement).value).toBe('4');
      expect((screen.getByLabelText('Rock Damage per Speed') as HTMLInputElement).value).toBe('3');
      expect((screen.getByLabelText('Rock Maximum Damage') as HTMLInputElement).value).toBe('70');
    });

    it('reports edits as numbers on the rock config fields, not the fall fields', () => {
      const onChange = renderCard();
      fireEvent.change(screen.getByLabelText('Minimum Rock Speed'), { target: { value: '9' } });
      expect(onChange).toHaveBeenCalledWith('rockDamageMinSpeed', 9);
      fireEvent.change(screen.getByLabelText('Rock Damage per Speed'), { target: { value: '2.5' } });
      expect(onChange).toHaveBeenCalledWith('rockDamagePerSpeed', 2.5);
      fireEvent.change(screen.getByLabelText('Rock Maximum Damage'), { target: { value: '55' } });
      expect(onChange).toHaveBeenCalledWith('rockDamageMax', 55);
      expect(onChange).not.toHaveBeenCalledWith('fallDamageMinSpeed', expect.anything());
    });

    it('previews damage at sample rock speeds, honouring minimum and cap', () => {
      renderCard({ rockDamageMinSpeed: 10, rockDamagePerSpeed: 2, rockDamageMax: 30 });
      const preview = within(screen.getByTestId('rock-damage-preview'));
      expect(SAMPLE_ROCK_SPEEDS).toEqual([8, 12, 20, 30]);
      expect(preview.getByText('8 tiles/s: 0 dmg')).toBeInTheDocument();
      expect(preview.getByText('12 tiles/s: 4 dmg')).toBeInTheDocument();
      expect(preview.getByText('20 tiles/s: 20 dmg')).toBeInTheDocument();
      expect(preview.getByText('30 tiles/s: 30 dmg')).toBeInTheDocument();
    });
  });
});
