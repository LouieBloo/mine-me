import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DEFAULT_DOODAD_MAX_COUNT, DEFAULT_DOODAD_MAX_LIGHTS, DEFAULT_MINING_MAP_CONFIG } from '@mine-me/shared';
import MiningConfigScenery from './MiningConfigScenery';

describe('MiningConfigScenery', () => {
  afterEach(cleanup);

  it('shows the configured cap, or the default when the config has none', () => {
    const { rerender } = render(<MiningConfigScenery config={{ ...DEFAULT_MINING_MAP_CONFIG, doodadMaxCount: 120 }} onFieldChange={vi.fn()} />);
    expect((screen.getByLabelText('Most Doodads') as HTMLInputElement).value).toBe('120');
    rerender(<MiningConfigScenery config={{ ...DEFAULT_MINING_MAP_CONFIG, doodadMaxCount: undefined }} onFieldChange={vi.fn()} />);
    expect((screen.getByLabelText('Most Doodads') as HTMLInputElement).value).toBe(String(DEFAULT_DOODAD_MAX_COUNT));
  });

  it('says None for 0 and reports a change as a number', () => {
    const onFieldChange = vi.fn();
    render(<MiningConfigScenery config={{ ...DEFAULT_MINING_MAP_CONFIG, doodadMaxCount: 0 }} onFieldChange={onFieldChange} />);
    expect(screen.getByText('None')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Most Doodads'), { target: { value: '250' } });
    expect(onFieldChange).toHaveBeenCalledWith('doodadMaxCount', 250);
  });

  it('has a slider for the most doodad lights: the configured value or the default, None for 0, and a number when changed', () => {
    const onFieldChange = vi.fn();
    const { rerender } = render(<MiningConfigScenery config={{ ...DEFAULT_MINING_MAP_CONFIG, doodadMaxLights: 7 }} onFieldChange={onFieldChange} />);
    expect((screen.getByLabelText('Most Doodad Lights') as HTMLInputElement).value).toBe('7');
    rerender(<MiningConfigScenery config={{ ...DEFAULT_MINING_MAP_CONFIG, doodadMaxLights: undefined }} onFieldChange={onFieldChange} />);
    expect((screen.getByLabelText('Most Doodad Lights') as HTMLInputElement).value).toBe(String(DEFAULT_DOODAD_MAX_LIGHTS));
    fireEvent.change(screen.getByLabelText('Most Doodad Lights'), { target: { value: '0' } });
    expect(onFieldChange).toHaveBeenCalledWith('doodadMaxLights', 0);
  });
});
