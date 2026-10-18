import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BLOCK_SCALE, DEFAULT_MINING_MAP_CONFIG, MINING_CONFIG } from '@mine-me/shared';
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
    renderCard({ fallDamageMinSpeed: 0, fallDamagePerSpeed: 1, fallDamageMax: 0, gravity: 28 * BLOCK_SCALE });
    const preview = within(screen.getByTestId('fall-damage-preview'));
    for (const tiles of SAMPLE_DROP_TILES) {
      const expected = Math.round(impactSpeedForDrop(tiles, 28 * BLOCK_SCALE));
      expect(preview.getByText(`${tiles}-tile drop: ${expected} dmg`)).toBeInTheDocument();
    }
  });

  it('the preview shows no damage for drops below the minimum speed and honours the cap', () => {
    const S = BLOCK_SCALE;
    renderCard({ fallDamageMinSpeed: 11 * S, fallDamagePerSpeed: 6 / S, fallDamageMax: 10, gravity: 28 * S });
    const preview = within(screen.getByTestId('fall-damage-preview'));
    expect(preview.getByText(`${2 * S}-tile drop: 0 dmg`)).toBeInTheDocument();
    expect(preview.getByText(`${10 * S}-tile drop: 10 dmg`)).toBeInTheDocument();
  });

  it('limits the impact speed to terminal velocity', () => {
    expect(impactSpeedForDrop(1000, 28 * BLOCK_SCALE)).toBe(MINING_CONFIG.TERMINAL_FALL_SPEED);
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
      fireEvent.change(screen.getByLabelText('Rock Damage per Speed'), { target: { value: '3.5' } });
      expect(onChange).toHaveBeenCalledWith('rockDamagePerSpeed', 3.5);
      fireEvent.change(screen.getByLabelText('Rock Maximum Damage'), { target: { value: '55' } });
      expect(onChange).toHaveBeenCalledWith('rockDamageMax', 55);
      expect(onChange).not.toHaveBeenCalledWith('fallDamageMinSpeed', expect.anything());
    });

    it('previews damage at sample rock speeds, honouring minimum and cap', () => {
      const S = BLOCK_SCALE;
      renderCard({ rockDamageMinSpeed: 10 * S, rockDamagePerSpeed: 2 / S, rockDamageMax: 30 });
      const preview = within(screen.getByTestId('rock-damage-preview'));
      expect(SAMPLE_ROCK_SPEEDS).toEqual([8 * S, 12 * S, 20 * S, 30 * S]);
      expect(preview.getByText(`${8 * S} tiles/s: 0 dmg`)).toBeInTheDocument();
      expect(preview.getByText(`${12 * S} tiles/s: 4 dmg`)).toBeInTheDocument();
      expect(preview.getByText(`${20 * S} tiles/s: 20 dmg`)).toBeInTheDocument();
      expect(preview.getByText(`${30 * S} tiles/s: 30 dmg`)).toBeInTheDocument();
    });
  });

  describe('fire damage', () => {
    it('shows the fire settings with the saved values', () => {
      renderCard({ burnDamagePerSecond: 8, burnSeconds: 6, heatRadius: 3, heatDamagePerSecond: 2 });
      expect((screen.getByLabelText('Burn Damage per Second') as HTMLInputElement).value).toBe('8');
      expect((screen.getByLabelText('Burn Time (s)') as HTMLInputElement).value).toBe('6');
      expect((screen.getByLabelText('Heat Radius (tiles)') as HTMLInputElement).value).toBe('3');
      expect((screen.getByLabelText('Heat Damage per Second') as HTMLInputElement).value).toBe('2');
    });

    it('reports edits as numbers on the right config field', () => {
      const onChange = renderCard();
      fireEvent.change(screen.getByLabelText('Burn Damage per Second'), { target: { value: '9.5' } });
      expect(onChange).toHaveBeenCalledWith('burnDamagePerSecond', 9.5);
      fireEvent.change(screen.getByLabelText('Burn Time (s)'), { target: { value: '3' } });
      expect(onChange).toHaveBeenCalledWith('burnSeconds', 3);
      fireEvent.change(screen.getByLabelText('Heat Radius (tiles)'), { target: { value: '0' } });
      expect(onChange).toHaveBeenCalledWith('heatRadius', 0);
      fireEvent.change(screen.getByLabelText('Heat Damage per Second'), { target: { value: '4' } });
      expect(onChange).toHaveBeenCalledWith('heatDamagePerSecond', 4);
    });

    it('previews what one burn costs and how hot oil is near and far', () => {
      renderCard({ burnDamagePerSecond: 6, burnSeconds: 5, heatRadius: 2.5, heatDamagePerSecond: 1.5 });
      const preview = within(screen.getByTestId('fire-damage-preview'));
      expect(preview.getByText('One burn: 30 dmg over 5s')).toBeInTheDocument();
      expect(preview.getByText(/at the fire:\s*4\.5 dmg\/s/)).toBeInTheDocument();
      expect(preview.getByText(/at 1\.3 tiles:\s*2\.3 dmg\/s/)).toBeInTheDocument();
    });

    it('starts from the game defaults', () => {
      renderCard();
      expect((screen.getByLabelText('Burn Damage per Second') as HTMLInputElement).value).toBe(String(DEFAULT_MINING_MAP_CONFIG.burnDamagePerSecond));
    });
  });
});
