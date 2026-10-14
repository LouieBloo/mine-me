import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FluidGenerationPanel, { DEFAULT_GENERATION } from './FluidGenerationPanel';
import type { FluidGeneration } from '@mine-me/shared';

const GEN: FluidGeneration = { minDepth: 8, maxDepth: 30, percentage: 1.5, minSize: 2, maxSize: 4 };

describe('FluidGenerationPanel', () => {
  it('shows only the switch for a fluid that is never generated', () => {
    render(<FluidGenerationPanel value={null} onChange={vi.fn()} />);
    expect(screen.getByText('Never generated')).toBeInTheDocument();
    expect(screen.queryByLabelText('Shallowest Row')).not.toBeInTheDocument();
  });

  it('switching on uses the defaults, switching off saves null', () => {
    const onChange = vi.fn();
    const { rerender } = render(<FluidGenerationPanel value={null} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Appears in generated mines'));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_GENERATION);
    rerender(<FluidGenerationPanel value={GEN} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Appears in generated mines'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('edits each setting', () => {
    const onChange = vi.fn();
    render(<FluidGenerationPanel value={GEN} onChange={onChange} />);
    expect(screen.getByLabelText('Shallowest Row')).toHaveValue(8);
    fireEvent.change(screen.getByLabelText('Shallowest Row'), { target: { value: '12' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...GEN, minDepth: 12 });
    fireEvent.change(screen.getByLabelText('Amount (% of diggable tiles)'), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...GEN, percentage: 3 });
    fireEvent.change(screen.getByLabelText('Smallest Pocket'), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...GEN, minSize: 1 });
    fireEvent.change(screen.getByLabelText('Largest Pocket'), { target: { value: '6' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...GEN, maxSize: 6 });
  });

  it('an empty deepest row means no limit (null), and shows empty for null', () => {
    const onChange = vi.fn();
    const { rerender } = render(<FluidGenerationPanel value={GEN} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Deepest Row'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ ...GEN, maxDepth: null });
    rerender(<FluidGenerationPanel value={{ ...GEN, maxDepth: null }} onChange={onChange} />);
    expect(screen.getByLabelText('Deepest Row')).toHaveValue(null);
  });

  it('turns an emptied required field into NaN so validation can reject it', () => {
    const onChange = vi.fn();
    render(<FluidGenerationPanel value={GEN} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Smallest Pocket'), { target: { value: '' } });
    expect(onChange.mock.calls[0][0].minSize).toBeNaN();
  });
});
