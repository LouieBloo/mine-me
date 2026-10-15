import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GasGenerationPanel, { DEFAULT_GENERATION } from './GasGenerationPanel';
import type { GasGeneration } from '@mine-me/shared';

const GEN: GasGeneration = { minDepth: 8, maxDepth: 30, percentage: 1.5, minSize: 2, maxSize: 4, concentration: 0.8 };

describe('GasGenerationPanel', () => {
  it('shows only the switch for a gas that is never generated', () => {
    render(<GasGenerationPanel value={null} onChange={vi.fn()} />);
    expect(screen.getByText('Never generated')).toBeInTheDocument();
    expect(screen.queryByLabelText('Shallowest Row')).not.toBeInTheDocument();
  });

  it('switching on uses the defaults, switching off saves null', () => {
    const onChange = vi.fn();
    const { rerender } = render(<GasGenerationPanel value={null} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Appears in generated mines'));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_GENERATION);
    rerender(<GasGenerationPanel value={GEN} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Appears in generated mines'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('edits each setting', () => {
    const onChange = vi.fn();
    render(<GasGenerationPanel value={GEN} onChange={onChange} />);
    expect(screen.getByLabelText('Shallowest Row')).toHaveValue(8);
    fireEvent.change(screen.getByLabelText('Shallowest Row'), { target: { value: '12' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...GEN, minDepth: 12 });
    fireEvent.change(screen.getByLabelText('Amount (% of diggable tiles)'), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...GEN, percentage: 3 });
    fireEvent.change(screen.getByLabelText('Smallest Pocket'), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...GEN, minSize: 1 });
    fireEvent.change(screen.getByLabelText('Largest Pocket'), { target: { value: '6' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...GEN, maxSize: 6 });
    fireEvent.change(screen.getByLabelText('Starting Concentration'), { target: { value: '0.5' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...GEN, concentration: 0.5 });
  });

  it('starts pockets full by default, and shows a full cell when none is stored', () => {
    expect(DEFAULT_GENERATION.concentration).toBe(1);
    const { concentration: _c, ...without } = GEN;
    render(<GasGenerationPanel value={without} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Starting Concentration')).toHaveValue(1);
  });

  it('an empty deepest row means no limit (null), and shows empty for null', () => {
    const onChange = vi.fn();
    const { rerender } = render(<GasGenerationPanel value={GEN} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Deepest Row'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ ...GEN, maxDepth: null });
    rerender(<GasGenerationPanel value={{ ...GEN, maxDepth: null }} onChange={onChange} />);
    expect(screen.getByLabelText('Deepest Row')).toHaveValue(null);
  });

  it('turns an emptied required field into NaN so validation can reject it', () => {
    const onChange = vi.fn();
    render(<GasGenerationPanel value={GEN} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Smallest Pocket'), { target: { value: '' } });
    expect(onChange.mock.calls[0][0].minSize).toBeNaN();
  });
});
