import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DoodadBiomeLinks from './DoodadBiomeLinks';

const biomes = [{ id: 'b1', key: 'frozen_caves', name: 'Frozen Caves' }, { id: 'b2', key: 'clay_pits', name: 'Clay Pits' }];
const renderIt = (value: any[], onChange = vi.fn(), list = biomes) => {
  render(<DoodadBiomeLinks value={value} biomes={list} onChange={onChange} />);
  return onChange;
};

describe('DoodadBiomeLinks', () => {
  it('says the doodad is never placed while it is in no biome', () => {
    renderIt([]);
    expect(screen.getByText(/never places it/)).toBeInTheDocument();
  });

  it('adds the chosen biome with weight and density 1, and offers only biomes not yet added', () => {
    const onChange = renderIt([{ biomeId: 'b1', biomeKey: 'frozen_caves', weight: 2, density: 1 }]);
    expect(screen.getByRole('option', { name: 'Clay Pits' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Frozen Caves' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Add Biome' }));
    expect(onChange).toHaveBeenCalledWith([
      { biomeId: 'b1', biomeKey: 'frozen_caves', weight: 2, density: 1 },
      { biomeId: 'b2', biomeKey: 'clay_pits', weight: 1, density: 1 },
    ]);
  });

  it('edits a biome\'s weight and density without touching the others', () => {
    const onChange = renderIt([
      { biomeId: 'b1', biomeKey: 'frozen_caves', weight: 1, density: 1 },
      { biomeId: 'b2', biomeKey: 'clay_pits', weight: 1, density: 1 },
    ]);
    fireEvent.change(screen.getByLabelText('Clay Pits density'), { target: { value: '2.5' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { biomeId: 'b1', biomeKey: 'frozen_caves', weight: 1, density: 1 },
      { biomeId: 'b2', biomeKey: 'clay_pits', weight: 1, density: 2.5 },
    ]);
    fireEvent.change(screen.getByLabelText('Frozen Caves weight'), { target: { value: '' } });
    expect((onChange.mock.calls.at(-1)![0] as any[])[0].weight).toBeNaN();
  });

  it('removes a biome', () => {
    const onChange = renderIt([{ biomeId: 'b1', biomeKey: 'frozen_caves', weight: 1, density: 1 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Frozen Caves' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('names a biome that no longer exists by its key, and disables adding when there are no biomes', () => {
    renderIt([{ biomeId: 'gone', biomeKey: 'old_biome', weight: 1, density: 1 }], vi.fn(), []);
    expect(screen.getByText('old_biome')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add Biome' })).toBeDisabled();
    expect(screen.getByText('Create biomes on the Biomes page first.')).toBeInTheDocument();
  });
});
