import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render as rtlRender, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { DEFAULT_BIOME_BLEND_WIDTH, DEFAULT_MINING_MAP_CONFIG } from '@mine-me/shared';
import MiningConfigBiomes from './MiningConfigBiomes';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const BIOMES = [
  { id: 'b0', key: 'default', name: 'Default', isDefault: true, weight: 1 },
  { id: 'b1', key: 'frozen', name: 'Frozen Caves', isDefault: false, weight: 2.5 },
];
const render = (ui: ReactElement) => rtlRender(<ToastProvider>{ui}</ToastProvider>);

describe('MiningConfigBiomes', () => {
  beforeEach(() => {
    mockFetchWithAuth.mockReset();
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => BIOMES });
  });
  afterEach(cleanup);

  it('shows the configured softness, or the default when the config has none', () => {
    const { rerender } = render(<MiningConfigBiomes config={{ ...DEFAULT_MINING_MAP_CONFIG, biomeBlendWidth: 0.3 }} onFieldChange={vi.fn()} />);
    expect((screen.getByLabelText('Border Softness') as HTMLInputElement).value).toBe('0.3');
    rerender(
      <ToastProvider>
        <MiningConfigBiomes config={{ ...DEFAULT_MINING_MAP_CONFIG, biomeBlendWidth: undefined }} onFieldChange={vi.fn()} />
      </ToastProvider>
    );
    expect((screen.getByLabelText('Border Softness') as HTMLInputElement).value).toBe(String(DEFAULT_BIOME_BLEND_WIDTH));
  });

  it('calls zero hard edges', () => {
    render(<MiningConfigBiomes config={{ ...DEFAULT_MINING_MAP_CONFIG, biomeBlendWidth: 0 }} onFieldChange={vi.fn()} />);
    expect(screen.getByText('Hard edges')).toBeInTheDocument();
  });

  it('reports a change as a number', () => {
    const onFieldChange = vi.fn();
    render(<MiningConfigBiomes config={DEFAULT_MINING_MAP_CONFIG} onFieldChange={onFieldChange} />);
    fireEvent.change(screen.getByLabelText('Border Softness'), { target: { value: '0.25' } });
    expect(onFieldChange).toHaveBeenCalledWith('biomeBlendWidth', 0.25);
  });

  it('says every biome is on the map when none are chosen', () => {
    render(<MiningConfigBiomes config={{ ...DEFAULT_MINING_MAP_CONFIG, biomeWeights: null }} onFieldChange={vi.fn()} />);
    expect(screen.getByText(/every biome is on this map/i)).toBeInTheDocument();
  });

  it('adds a biome to the map at its own weight, and offers every biome but the default', async () => {
    const onFieldChange = vi.fn();
    render(<MiningConfigBiomes config={{ ...DEFAULT_MINING_MAP_CONFIG, biomeWeights: null }} onFieldChange={onFieldChange} />);
    const picker = (await screen.findByRole('option', { name: 'Frozen Caves' })).closest('select')!;
    expect(Array.from(picker.options).map((o) => o.text)).toEqual(['Frozen Caves']);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onFieldChange).toHaveBeenCalledWith('biomeWeights', { frozen: 2.5 });
  });

  it('keeps a weight the admin already set, and goes back to null when the last biome is removed', async () => {
    const onFieldChange = vi.fn();
    render(<MiningConfigBiomes config={{ ...DEFAULT_MINING_MAP_CONFIG, biomeWeights: { frozen: 4 } }} onFieldChange={onFieldChange} />);
    fireEvent.change(await screen.findByLabelText('Biomes On This Map: Frozen Caves'), { target: { value: '3' } });
    expect(onFieldChange).toHaveBeenLastCalledWith('biomeWeights', { frozen: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Frozen Caves from Biomes On This Map' }));
    expect(onFieldChange).toHaveBeenLastCalledWith('biomeWeights', null);
  });

  it('shows the error when the biomes cannot be loaded', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<MiningConfigBiomes config={DEFAULT_MINING_MAP_CONFIG} onFieldChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Failed to load biomes')).toBeInTheDocument());
  });
});
