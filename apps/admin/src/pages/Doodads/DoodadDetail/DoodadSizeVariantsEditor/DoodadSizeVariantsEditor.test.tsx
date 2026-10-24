import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DoodadSizeVariantsEditor from './DoodadSizeVariantsEditor';

const renderIt = (value: any[], onChange = vi.fn()) => {
  render(<DoodadSizeVariantsEditor value={value} baseWidth={3} baseHeight={6} onChange={onChange} />);
  return onChange;
};

describe('DoodadSizeVariantsEditor', () => {
  it('says the doodad is always its own size when none are listed', () => {
    renderIt([]);
    expect(screen.getByText('Always its own size.')).toBeInTheDocument();
  });

  it('adds a size that starts from the doodad\'s own footprint', () => {
    const onChange = renderIt([]);
    fireEvent.click(screen.getByRole('button', { name: '+ Add Size' }));
    expect(onChange).toHaveBeenCalledWith([{ width: 3, height: 6, weight: 1 }]);
  });

  it('edits a size, and turns a cleared picture into none', () => {
    const onChange = renderIt([{ width: 3, height: 6, weight: 1, textureUrl: '/assets/a.png' }]);
    fireEvent.change(screen.getByLabelText('Size 1 width'), { target: { value: '6' } });
    expect(onChange).toHaveBeenLastCalledWith([{ width: 6, height: 6, weight: 1, textureUrl: '/assets/a.png' }]);
    fireEvent.change(screen.getByLabelText('Size 1 picture'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith([{ width: 3, height: 6, weight: 1, textureUrl: null }]);
  });

  it('shows the size in original blocks and each size\'s chance', () => {
    renderIt([{ width: 3, height: 6, weight: 1 }, { width: 6, height: 9, weight: 3 }]);
    expect(screen.getByText('1 x 2 blocks, 25%')).toBeInTheDocument();
    expect(screen.getByText('2 x 3 blocks, 75%')).toBeInTheDocument();
  });

  it('removes a size', () => {
    const onChange = renderIt([{ width: 3, height: 6, weight: 1 }, { width: 6, height: 9, weight: 3 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove size 1' }));
    expect(onChange).toHaveBeenCalledWith([{ width: 6, height: 9, weight: 3 }]);
  });
});
