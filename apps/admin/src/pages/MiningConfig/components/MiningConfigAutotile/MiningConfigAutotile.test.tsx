import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DEFAULT_MINING_MAP_CONFIG } from '@mine-me/shared';
import MiningConfigAutotile from './MiningConfigAutotile';

const renderCard = (config = {}, onFieldChange = vi.fn()) => {
  render(<MiningConfigAutotile config={{ ...DEFAULT_MINING_MAP_CONFIG, ...config }} onFieldChange={onFieldChange} />);
  return onFieldChange;
};

describe('MiningConfigAutotile', () => {
  it('shows the built-in look when the map has none', () => {
    renderCard();
    expect(screen.getByText('Built-in look')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom look')).not.toBeChecked();
  });

  it('shows the saved look and saves a change to the map default', () => {
    const onFieldChange = renderCard({ autotileStyle: { radius: 0.3 } });
    expect(screen.getByLabelText('Corner Radius')).toHaveValue(0.3);
    fireEvent.change(screen.getByLabelText('Rim Width'), { target: { value: '0.1' } });
    expect(onFieldChange).toHaveBeenCalledWith('autotileStyle', { radius: 0.3, rimWidth: 0.1 });
  });

  it('goes back to the built-in look with null', () => {
    const onFieldChange = renderCard({ autotileStyle: { radius: 0.3 } });
    fireEvent.click(screen.getByLabelText('Custom look'));
    expect(onFieldChange).toHaveBeenCalledWith('autotileStyle', null);
  });
});
