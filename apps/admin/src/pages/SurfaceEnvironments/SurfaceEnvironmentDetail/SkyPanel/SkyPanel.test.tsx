import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SkyPanel from './SkyPanel';
import { newEnvironment } from '../../surfaceEnvironmentForm';

const renderIt = (over: Partial<ReturnType<typeof newEnvironment>> = {}) => {
  const onChange = vi.fn();
  render(<SkyPanel form={{ ...newEnvironment(), ...over }} onChange={onChange} />);
  return onChange;
};

describe('SkyPanel', () => {
  it('shows the sky colours and changes them', () => {
    const onChange = renderIt();
    expect(screen.getByLabelText('Top Colour')).toHaveValue('#2f8fd8');
    fireEvent.change(screen.getByLabelText('Top Colour'), { target: { value: '#112233' } });
    expect(onChange).toHaveBeenCalledWith('skyTop', '#112233');
    fireEvent.change(screen.getByLabelText('Horizon Colour'), { target: { value: '#445566' } });
    expect(onChange).toHaveBeenCalledWith('skyHorizon', '#445566');
  });

  it('tints the light, and clears the tint', () => {
    const onChange = renderIt({ ambientTint: '#ffe0a0' });
    expect(screen.getByLabelText('Light Tint')).toHaveValue('#ffe0a0');
    fireEvent.click(screen.getByText('No tint'));
    expect(onChange).toHaveBeenCalledWith('ambientTint', '');
    fireEvent.change(screen.getByLabelText('Light Tint'), { target: { value: '#aabbcc' } });
    expect(onChange).toHaveBeenCalledWith('ambientTint', '#aabbcc');
  });

  it('cannot clear a tint that is not set', () => {
    renderIt({ ambientTint: '' });
    expect(screen.getByText('No tint')).toBeDisabled();
  });

  it('edits the sun, and hides its settings when the sun is off', () => {
    const onChange = renderIt();
    fireEvent.change(screen.getByLabelText('Position (0-1)'), { target: { value: '0.25' } });
    expect(onChange).toHaveBeenCalledWith('sunX', 0.25);
    fireEvent.change(screen.getByLabelText('Height (blocks)'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('sunHeight', NaN);
    fireEvent.change(screen.getByLabelText('Size (blocks)'), { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith('sunSize', 4);
    fireEvent.change(screen.getByLabelText('Sun Colour'), { target: { value: '#ffffff' } });
    expect(onChange).toHaveBeenLastCalledWith('sunColor', '#ffffff');
    fireEvent.click(screen.getByLabelText('Show a sun'));
    expect(onChange).toHaveBeenLastCalledWith('sunEnabled', false);
  });

  it('has no sun settings with the sun off', () => {
    renderIt({ sunEnabled: false });
    expect(screen.queryByLabelText('Sun Colour')).not.toBeInTheDocument();
  });
});
