import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemInGameScale from './ItemInGameScale';

describe('ItemInGameScale Component', () => {
  it('renders default scale at 1.0x with rendered pixel dimensions', () => {
    const handleChange = vi.fn();
    render(
      <ItemInGameScale
        value={1.0}
        onChange={handleChange}
        itemName="Iron Ore"
      />
    );

    expect(screen.getByText('In-Game World Scale')).toBeDefined();
    expect(screen.getAllByText('1.00x').length).toBeGreaterThan(0);
    // 32px is base size (0.5 * 64)
    expect(screen.getByText('32px × 32px')).toBeDefined();
    expect(screen.getByText('50%')).toBeDefined();
  });

  it('calls onChange when slider value changes', () => {
    const handleChange = vi.fn();
    render(
      <ItemInGameScale
        value={1.0}
        onChange={handleChange}
      />
    );

    const slider = screen.getByLabelText(/Scale Multiplier/i) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '1.5' } });

    expect(handleChange).toHaveBeenCalledWith(1.5);
  });

  it('calls onChange when number input changes and clamps appropriately', () => {
    const handleChange = vi.fn();
    render(
      <ItemInGameScale
        value={1.0}
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/Exact Multiplier/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2.5' } });
    expect(handleChange).toHaveBeenCalledWith(2.5);

    // Test clamped value above max 5.0
    fireEvent.change(input, { target: { value: '99' } });
    expect(handleChange).toHaveBeenCalledWith(5.0);
  });

  it('shows reset button when scale is not 1.0 and resets to 1.0 on click', () => {
    const handleChange = vi.fn();
    render(
      <ItemInGameScale
        value={1.8}
        onChange={handleChange}
      />
    );

    const resetBtn = screen.getByRole('button', { name: /Reset to 1.0x/i });
    expect(resetBtn).toBeDefined();

    fireEvent.click(resetBtn);
    expect(handleChange).toHaveBeenCalledWith(1.0);
  });

  it('displays validation error if error prop is provided', () => {
    render(
      <ItemInGameScale
        value={1.0}
        onChange={vi.fn()}
        error="inGameScale must be between 0.1 and 5.0"
      />
    );

    expect(screen.getByText('inGameScale must be between 0.1 and 5.0')).toBeDefined();
  });
});
