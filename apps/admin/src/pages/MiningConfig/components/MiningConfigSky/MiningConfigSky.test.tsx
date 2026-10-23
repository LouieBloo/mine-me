import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DEFAULT_MINING_MAP_CONFIG, DEFAULT_SKY_ROWS } from '@mine-me/shared';
import MiningConfigSky from './MiningConfigSky';

describe('MiningConfigSky', () => {
  afterEach(cleanup);

  it('shows the configured sky height, or the default when the config has none', () => {
    const { rerender } = render(<MiningConfigSky config={{ ...DEFAULT_MINING_MAP_CONFIG, skyRows: 30 }} onFieldChange={vi.fn()} />);
    expect((screen.getByLabelText('Sky Height') as HTMLInputElement).value).toBe('30');
    rerender(<MiningConfigSky config={{ ...DEFAULT_MINING_MAP_CONFIG, skyRows: undefined }} onFieldChange={vi.fn()} />);
    expect((screen.getByLabelText('Sky Height') as HTMLInputElement).value).toBe(String(DEFAULT_SKY_ROWS));
  });

  it('reports a change as a number', () => {
    const onFieldChange = vi.fn();
    render(<MiningConfigSky config={DEFAULT_MINING_MAP_CONFIG} onFieldChange={onFieldChange} />);
    fireEvent.change(screen.getByLabelText('Sky Height'), { target: { value: '12' } });
    expect(onFieldChange).toHaveBeenCalledWith('skyRows', 12);
  });
});
