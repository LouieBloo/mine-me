import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DEFAULT_MINING_MAP_CONFIG } from '@mine-me/shared';
import MiningConfigMobs from './MiningConfigMobs';
import { ToastProvider } from '../../../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const MOBS = [
  { id: 'mole', name: 'Mole Person', aiType: 'CHASE_AND_MINE' },
  { id: 'dummy', name: 'Target Dummy', aiType: 'STATIONARY' },
];

const renderCard = (config = {}, onFieldChange = vi.fn()) => {
  render(
    <ToastProvider>
      <MiningConfigMobs config={{ ...DEFAULT_MINING_MAP_CONFIG, ...config }} onFieldChange={onFieldChange} />
    </ToastProvider>
  );
  return onFieldChange;
};

describe('MiningConfigMobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => MOBS });
  });

  it('lists the mobs from the database instead of a hard-coded species', async () => {
    renderCard();
    await waitFor(() => expect(screen.getByText('Mole Person')).toBeInTheDocument());
    expect(screen.getByText('Target Dummy')).toBeInTheDocument();
    expect(mockFetchWithAuth).toHaveBeenCalledWith(expect.stringContaining('/api/admin/mobs'));
  });

  it('shows which mobs spawn underground and lets you toggle them', async () => {
    const onChange = renderCard({ allowedMobIds: ['mole'] });
    await waitFor(() => screen.getByText('Mole Person'));

    const [mole, dummy] = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(mole.checked).toBe(true);
    expect(dummy.checked).toBe(false);

    fireEvent.click(dummy);
    expect(onChange).toHaveBeenCalledWith('allowedMobIds', ['mole', 'dummy']);
    fireEvent.click(mole);
    expect(onChange).toHaveBeenCalledWith('allowedMobIds', []);
  });

  it('treats a config with no mobs as "none spawn", and says so', async () => {
    renderCard({ allowedMobIds: undefined });
    await waitFor(() => screen.getByText('Mole Person'));
    expect((screen.getAllByRole('checkbox') as HTMLInputElement[]).every((c) => !c.checked)).toBe(true);
    expect(screen.getByText(/no hostiles spawn underground/i)).toBeInTheDocument();
  });

  it('chooses the surface dummy from the mobs, or none', async () => {
    const onChange = renderCard({ surfaceDummyMobId: 'dummy' });
    await waitFor(() => screen.getByText('Mole Person'));

    const select = screen.getByLabelText(/surface target dummy/i) as HTMLSelectElement;
    expect(select.value).toBe('dummy');

    fireEvent.change(select, { target: { value: 'mole' } });
    expect(onChange).toHaveBeenCalledWith('surfaceDummyMobId', 'mole');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('surfaceDummyMobId', null);
  });

  it('shows "None" when the config has no dummy', async () => {
    renderCard({ surfaceDummyMobId: null });
    await waitFor(() => screen.getByText('Mole Person'));
    expect((screen.getByLabelText(/surface target dummy/i) as HTMLSelectElement).value).toBe('');
  });

  it('tells the admin when there are no mobs yet', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderCard();
    await waitFor(() => expect(screen.getByText(/no mobs exist yet/i)).toBeInTheDocument());
  });

  it('surfaces a load failure instead of failing silently', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderCard();
    await waitFor(() => expect(screen.getByText(/failed to load mobs/i)).toBeInTheDocument());
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
