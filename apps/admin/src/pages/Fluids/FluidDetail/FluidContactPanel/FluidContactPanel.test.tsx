import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FluidContactPanel from './FluidContactPanel';

describe('FluidContactPanel', () => {
  it('shows empty fields for a harmless fluid', () => {
    render(<FluidContactPanel value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Damage Per Second')).toHaveValue(null);
    expect(screen.getByLabelText('Puts out fires')).not.toBeChecked();
  });

  it('sets damage and ignition', () => {
    const onChange = vi.fn();
    render(<FluidContactPanel value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Damage Per Second'), { target: { value: '25' } });
    expect(onChange).toHaveBeenLastCalledWith({ damagePerSecond: 25 });
    fireEvent.change(screen.getByLabelText('Ignites (strength %)'), { target: { value: '100' } });
    expect(onChange).toHaveBeenLastCalledWith({ ignites: 100, extinguishes: false });
  });

  it('extinguish and ignite cancel each other', () => {
    const onChange = vi.fn();
    const { rerender } = render(<FluidContactPanel value={{ ignites: 100 }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Puts out fires'));
    expect(onChange).toHaveBeenLastCalledWith({ ignites: 0, extinguishes: true });
    rerender(<FluidContactPanel value={{ extinguishes: true }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Ignites (strength %)'), { target: { value: '50' } });
    expect(onChange).toHaveBeenLastCalledWith({ extinguishes: false, ignites: 50 });
  });

  it('clearing everything saves null', () => {
    const onChange = vi.fn();
    render(<FluidContactPanel value={{ damagePerSecond: 5 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Damage Per Second'), { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
