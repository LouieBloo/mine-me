import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import Music from './Music';
import { matchesFilter } from './soundFilters';
import { ToastProvider } from '../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({ fetchWithAuth: mockFetchWithAuth }),
}));

const sound = (over: any) => ({
  id: 'x', name: 'X', type: 'SFX', category: 'GENERAL', url: '/assets/sounds/x.mp3', fileName: 'x.mp3',
  fileSize: 2048, mimeType: 'audio/mpeg', volume: 1, loop: false, isActive: true, usedBy: [], ...over,
});

const SOUNDS = [
  sound({ id: 'bgm1', name: 'Cave Theme', type: 'BGM', loop: true }),
  sound({ id: 'mob1', name: 'Mole Growl', category: 'MOB', usedBy: ['Mob: Mole (attack)'] }),
  sound({ id: 'item1', name: 'Pistol Shot', category: 'ITEM', url: '/assets/sounds/items/p.wav' }),
  sound({ id: 'blk1', name: 'Dirt Hit', category: 'BLOCK' }),
  sound({ id: 'gen1', name: 'UI Click' }),
];

const json = (body: unknown, ok = true, status = ok ? 200 : 500) => Promise.resolve({ ok, status, json: async () => body });

const renderPage = () => render(<ToastProvider><Music /></ToastProvider>);

describe('matchesFilter', () => {
  it('groups music by type and sound effects by category (missing category = general)', () => {
    const bgm = sound({ type: 'BGM', category: 'MOB' });
    const legacySfx = sound({ category: undefined });
    expect(matchesFilter(bgm, 'ALL')).toBe(true);
    expect(matchesFilter(bgm, 'BGM')).toBe(true);
    expect(matchesFilter(bgm, 'MOB')).toBe(false);
    expect(matchesFilter(legacySfx, 'GENERAL')).toBe(true);
    expect(matchesFilter(legacySfx, 'BGM')).toBe(false);
  });
});

describe('Music page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockImplementation(() => json(SOUNDS));
  });

  it('lists every sound in the library, not just music', async () => {
    renderPage();
    for (const s of SOUNDS) expect(await screen.findByText(s.name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All Sounds (5)' })).toBeInTheDocument();
    expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/admin/sounds');
  });

  it('filters by category with counts', async () => {
    renderPage();
    await screen.findByText('Mole Growl');
    fireEvent.click(screen.getByRole('button', { name: 'Mob SFX (1)' }));
    expect(screen.getByText('Mole Growl')).toBeInTheDocument();
    expect(screen.queryByText('Pistol Shot')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Music (BGM) (1)' }));
    expect(screen.getByText('Cave Theme')).toBeInTheDocument();
    expect(screen.queryByText('Mole Growl')).not.toBeInTheDocument();
  });

  it('shows what uses each sound', async () => {
    renderPage();
    expect(await screen.findByText('Mob: Mole (attack)')).toBeInTheDocument();
    expect(screen.getAllByText('Not used').length).toBe(4);
  });

  it('sync adds files found on disk and refreshes the list', async () => {
    renderPage();
    await screen.findByText('Mole Growl');
    mockFetchWithAuth.mockImplementation((url: string) =>
      url.endsWith('/sync')
        ? json({ dryRun: false, added: [{ url: '/a.mp3', category: 'MOB' }], missing: [{ id: 'g', name: 'ghost', url: '/g.mp3' }] })
        : json(SOUNDS)
    );
    fireEvent.click(screen.getByRole('button', { name: /sync from disk/i }));

    expect(await screen.findByText(/1 new sound added to the library; 1 library entry has no file on disk/)).toBeInTheDocument();
    const [, opts] = mockFetchWithAuth.mock.calls.find((c) => c[0] === '/api/admin/sounds/sync')!;
    expect(opts.method).toBe('POST');
    await waitFor(() => expect(mockFetchWithAuth.mock.calls.filter((c) => c[0] === '/api/admin/sounds').length).toBe(2));
  });

  it('shows the error when sync fails', async () => {
    renderPage();
    await screen.findByText('Mole Growl');
    mockFetchWithAuth.mockImplementation(() => json({ error: 'disk unreadable' }, false));
    fireEvent.click(screen.getByRole('button', { name: /sync from disk/i }));
    expect(await screen.findByText('disk unreadable')).toBeInTheDocument();
  });

  it('shows the server reason when a sound in use cannot be deleted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    const row = (await screen.findByText('Mole Growl')).closest('tr')!;
    mockFetchWithAuth.mockImplementation(() => json({ error: '"Mole Growl" is still used by: Mob: Mole (attack)' }, false, 409));
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/still used by: Mob: Mole \(attack\)/)).toBeInTheDocument();
    expect(screen.getByText('Mole Growl')).toBeInTheDocument();
  });

  it('shows an error when the library cannot be loaded', async () => {
    mockFetchWithAuth.mockImplementation(() => json({}, false));
    renderPage();
    expect(await screen.findByText('Failed to fetch sound tracks')).toBeInTheDocument();
  });
});
