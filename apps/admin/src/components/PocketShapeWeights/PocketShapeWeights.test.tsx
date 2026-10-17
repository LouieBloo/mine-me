import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PocketShapeWeights from './PocketShapeWeights';

describe('PocketShapeWeights', () => {
  it('shows every shape as 1 when nothing is set', () => {
    render(<PocketShapeWeights value={null} onChange={vi.fn()} />);
    for (const name of ['Squares weight', 'Rectangles weight', 'Veins weight']) expect(screen.getByLabelText(name)).toHaveValue(1);
  });

  it('changing one weight saves all three', () => {
    const onChange = vi.fn();
    render(<PocketShapeWeights value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Veins weight'), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith({ SQUARE: 1, RECTANGLE: 1, VEIN: 3 });
  });

  it('shows the weights it was given, with missing ones as 0 once any is listed', () => {
    render(<PocketShapeWeights value={{ VEIN: 2 }} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Veins weight')).toHaveValue(2);
    expect(screen.getByLabelText('Squares weight')).toHaveValue(0);
  });

  it('making them all equal again goes back to "no setting"', () => {
    const onChange = vi.fn();
    render(<PocketShapeWeights value={{ SQUARE: 1, RECTANGLE: 1, VEIN: 3 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Veins weight'), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('an emptied field becomes NaN so validation can reject it', () => {
    const onChange = vi.fn();
    render(<PocketShapeWeights value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Squares weight'), { target: { value: '' } });
    expect(onChange.mock.calls[0][0].SQUARE).toBeNaN();
  });
});
