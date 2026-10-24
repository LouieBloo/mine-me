import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DOODAD_MOTION_PRESET_NAMES } from '@mine-me/shared';
import DoodadMotionPanel, { weightParam } from './DoodadMotionPanel';

const PART = { name: 'stem', file: '/assets/a.png', width: 8, height: 16, pivot_anchor: [4, 16] as [number, number], offset_from_anchor: [0, 0] as [number, number], z_index: 0 };
const renderIt = (value: any, onChange = vi.fn(), parts: any[] = []) => {
  render(<DoodadMotionPanel value={value} parts={parts} onChange={onChange} />);
  return onChange;
};

describe('DoodadMotionPanel', () => {
  it('offers every preset of the shared registry, and none', () => {
    renderIt(null);
    const options = screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['', ...DOODAD_MOTION_PRESET_NAMES]);
    expect(screen.queryByLabelText('Speed')).not.toBeInTheDocument();
  });

  it('picks a preset, and clears it with None', () => {
    const onChange = renderIt(null);
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'pulse' } });
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'pulse' });
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows the preset\'s description and defaults, and leaves out what is emptied', () => {
    const onChange = renderIt({ preset: 'sway', speed: 0.7, amplitude: 0.2 });
    expect(screen.getByText(/Leans back and forth/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'sway', amplitude: 0.2 });
    fireEvent.change(screen.getByLabelText('Phase'), { target: { value: '0.5' } });
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'sway', speed: 0.7, amplitude: 0.2, phase: 0.5 });
  });

  it('adds a weight for a part, edits it and removes it', () => {
    const onChange = renderIt({ preset: 'sway' }, vi.fn(), [PART]);
    fireEvent.click(screen.getByRole('button', { name: '+ Weight for stem' }));
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'sway', params: { [weightParam('stem')]: 0 } });
  });

  it('edits and removes an extra number', () => {
    const onChange = renderIt({ preset: 'drip', params: { fallShare: 0.4 } });
    fireEvent.change(screen.getByLabelText('fallShare value'), { target: { value: '0.6' } });
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'drip', params: { fallShare: 0.6 } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove fallShare' }));
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'drip' });
  });

  it('adds a named number and explains the drip drop part', () => {
    const onChange = renderIt({ preset: 'drip' });
    expect(screen.getByText('drop', { selector: 'code' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New extra number name'), { target: { value: 'fallShare' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add Number' }));
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'drip', params: { fallShare: 1 } });
  });
});
