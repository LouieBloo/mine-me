import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ItemDetail from './ItemDetail';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockFetch = vi.fn();
vi.mock('../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetch }) }));

// The hold preview's own behaviour is tested separately; here only what the page hands it
vi.mock('./ItemHoldPreview/ItemHoldPreview', () => ({
  default: (props: any) => (
    <div
      data-testid="hold-preview"
      data-config={props.heldParticleConfig ? JSON.stringify(props.heldParticleConfig) : ''}
      data-name={props.heldParticleName ?? ''}
    />
  ),
}));

const flameConfig = { emitterType: 'continuous', rate: 30 };
const json = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body });

const pickaxe = {
  id: 'item_flame',
  name: 'Flame Pickaxe',
  description: 'Burns',
  type: 'GEAR',
  subType: 'WEAPON',
  vendorBuyPrice: 0,
  vendorSellPrice: 0,
  userBuyPrice: 0,
  userSellPrice: 0,
  rarity: 'MEDIUM',
  itemEffects: [],
  heldParticleEffectId: 'pe_flame',
  heldParticleOffsetX: 12,
  heldParticleOffsetY: -30,
};

function renderDetail(item: any = pickaxe) {
  mockFetch.mockImplementation((rawUrl: string, opts?: any) => {
    const url = String(rawUrl);
    if (opts?.method === 'PUT') return json({ ...item });
    if (url.includes('/item-enums')) return json({ types: ['GEAR'], subTypes: { GEAR: ['WEAPON'] }, rarities: ['LOW', 'MEDIUM'] });
    if (url.includes('/particle-effects')) {
      return json([
        { id: 'pe_flame', name: 'Flame', type: 'CONTINUOUS', config: flameConfig },
        { id: 'pe_sparks', name: 'Sparks', type: 'CONTINUOUS', config: { emitterType: 'continuous' } },
      ]);
    }
    if (url.endsWith('/items')) return json([]);
    if (url.includes('/effects')) return json([]);
    if (url.includes('/api/admin/items/item_flame')) return json(item);
    return json({});
  });
  render(
    <MemoryRouter initialEntries={['/items/item_flame']}>
      <ToastProvider>
        <Routes>
          <Route path="/items/:id" element={<ItemDetail />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('ItemDetail held particle effect', () => {
  beforeEach(() => mockFetch.mockReset());
  afterEach(cleanup);

  it('shows the held effect chosen on the item, separate from the ground effect', async () => {
    renderDetail();
    const held = (await screen.findByLabelText('Held Particle Effect')) as HTMLSelectElement;
    await waitFor(() => expect(held.value).toBe('pe_flame'));
    expect(screen.getByText('Ground Particle Effect')).toBeInTheDocument();
  });

  it('gives the hold preview the config and name of the held effect', async () => {
    renderDetail();
    const preview = await screen.findByTestId('hold-preview');
    await waitFor(() => expect(preview.getAttribute('data-config')).toBe(JSON.stringify(flameConfig)));
    expect(preview.getAttribute('data-name')).toBe('Flame');
  });

  it('gives the preview nothing when no held effect is chosen', async () => {
    renderDetail({ ...pickaxe, heldParticleEffectId: null });
    const preview = await screen.findByTestId('hold-preview');
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('particle-effects')));
    expect(preview.getAttribute('data-config')).toBe('');
  });

  it('saves the chosen held effect and offsets with the item', async () => {
    renderDetail();
    const held = (await screen.findByLabelText('Held Particle Effect')) as HTMLSelectElement;
    await waitFor(() => expect(held.value).toBe('pe_flame'));
    fireEvent.change(held, { target: { value: 'pe_sparks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Item' }));

    await waitFor(() => expect(mockFetch.mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(true));
    const put = mockFetch.mock.calls.find((c) => c[1]?.method === 'PUT')!;
    const body = JSON.parse(put[1].body);
    expect(body).toMatchObject({ heldParticleEffectId: 'pe_sparks', heldParticleOffsetX: 12, heldParticleOffsetY: -30 });
  });

  it('clears the held effect with None', async () => {
    renderDetail();
    const held = (await screen.findByLabelText('Held Particle Effect')) as HTMLSelectElement;
    await waitFor(() => expect(held.value).toBe('pe_flame'));
    fireEvent.change(held, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Item' }));

    await waitFor(() => expect(mockFetch.mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(true));
    const body = JSON.parse(mockFetch.mock.calls.find((c) => c[1]?.method === 'PUT')![1].body);
    expect(body.heldParticleEffectId).toBeNull();
  });
  it('lets you give the item a held light and saves it with the item', async () => {
    renderDetail();
    await screen.findByLabelText('Held Particle Effect');
    expect(screen.getByText('Held Light')).toBeInTheDocument();

    const panel = screen.getByText('Held Light').closest('.item-light-config-card') as HTMLElement;
    const heldToggle = within(panel).getByRole('checkbox');
    fireEvent.click(heldToggle);
    fireEvent.click(screen.getByRole('button', { name: 'Save Item' }));

    await waitFor(() => expect(mockFetch.mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(true));
    const body = JSON.parse(mockFetch.mock.calls.find((c) => c[1]?.method === 'PUT')![1].body);
    expect(body.heldLightConfig).toMatchObject({ enabled: true });
    expect(body.lightConfig == null || body.lightConfig.enabled !== true).toBe(true);
  });
});
