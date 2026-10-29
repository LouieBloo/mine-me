import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PropsEditor, { surfaceDoodads, type PropDoodad } from './PropsEditor';

const doodads: PropDoodad[] = [
  { key: 'oak_tree', name: 'Oak Tree', anchor: 'FLOOR' },
  { key: 'bird', name: 'Bird', anchor: 'AIR' },
  { key: 'moss', name: 'Moss', anchor: 'WALL' },
  { key: 'stalactite', name: 'Stalactite', anchor: 'CEILING' },
];

const renderIt = (props = [] as React.ComponentProps<typeof PropsEditor>['props'], list = doodads) => {
  const onChange = vi.fn();
  render(<PropsEditor props={props} doodads={list} onChange={onChange} />);
  return onChange;
};

describe('surfaceDoodads', () => {
  it('keeps only the doodads that can stand on the ground or fly', () => {
    expect(surfaceDoodads(doodads).map((d) => d.key)).toEqual(['oak_tree', 'bird']);
  });
});

describe('PropsEditor', () => {
  it('says the ground is bare with no props, and adds one with the first usable doodad', () => {
    const onChange = renderIt();
    expect(screen.getByText(/No props/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('+ Add Prop'));
    expect(onChange).toHaveBeenCalledWith([{ doodadKey: 'oak_tree', density: 6, spacing: 4 }]);
  });

  it('only offers floor and air doodads in the picker', () => {
    renderIt([{ doodadKey: 'oak_tree', density: 5 }]);
    const names = [...(screen.getByLabelText('Doodad') as HTMLSelectElement).options].map((o) => o.text);
    expect(names).toEqual(['Pick a doodad…', 'Oak Tree (stands)', 'Bird (flies)']);
  });

  it('explains when there is no usable doodad at all', () => {
    renderIt([], [doodads[2]]);
    expect(screen.getByText(/no floor or air doodads yet/)).toBeInTheDocument();
  });

  it('changes the doodad, the density and the gap of a ground prop', () => {
    const onChange = renderIt([{ doodadKey: 'oak_tree', density: 5, spacing: 3 }]);
    fireEvent.change(screen.getByLabelText('Per 100 columns'), { target: { value: '9' } });
    expect(onChange).toHaveBeenLastCalledWith([{ doodadKey: 'oak_tree', density: 9, spacing: 3 }]);
    fireEvent.change(screen.getByLabelText('Gap (blocks)'), { target: { value: '6' } });
    expect(onChange).toHaveBeenLastCalledWith([{ doodadKey: 'oak_tree', density: 5, spacing: 6 }]);
    fireEvent.change(screen.getByLabelText('Doodad'), { target: { value: 'bird' } });
    expect(onChange).toHaveBeenLastCalledWith([{ doodadKey: 'bird', density: 5, spacing: 3 }]);
  });

  it('asks for flocks and heights, not a gap, for a bird', () => {
    const onChange = renderIt([{ doodadKey: 'bird', density: 2, minHeight: 6, maxHeight: 20 }]);
    expect(screen.getByLabelText('Flocks / 100')).toHaveValue(2);
    expect(screen.queryByLabelText('Gap (blocks)')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Lowest (blocks)'), { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith([{ doodadKey: 'bird', density: 2, minHeight: 4, maxHeight: 20 }]);
    fireEvent.change(screen.getByLabelText('Highest (blocks)'), { target: { value: '30' } });
    expect(onChange).toHaveBeenLastCalledWith([{ doodadKey: 'bird', density: 2, minHeight: 6, maxHeight: 30 }]);
  });

  it('removes a prop', () => {
    const onChange = renderIt([{ doodadKey: 'oak_tree', density: 5 }, { doodadKey: 'bird', density: 2 }]);
    fireEvent.click(screen.getByLabelText('Remove prop 1'));
    expect(onChange).toHaveBeenCalledWith([{ doodadKey: 'bird', density: 2 }]);
  });

  it('warns about a prop whose doodad is gone', () => {
    renderIt([{ doodadKey: 'ghost', density: 5 }]);
    expect(screen.getByText('ghost (missing)')).toBeInTheDocument();
    expect(screen.getByText(/no longer exists/)).toBeInTheDocument();
  });
});
