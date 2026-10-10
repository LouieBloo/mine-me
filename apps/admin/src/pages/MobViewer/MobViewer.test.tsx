import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MobViewer from './MobViewer';
import { ToastProvider } from '../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: mockFetchWithAuth,
  }),
}));

vi.mock('../../components/ModularRigEditor/ModularRigEditor', () => ({
  ModularRigEditor: vi.fn(({ target }) => (
    <div data-testid="mock-modular-rig-editor">
      ModularRigEditor for {target.type}: {target.mobName} ({target.mobId})
    </div>
  )),
}));

describe('MobViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleMobs = [
    {
      id: 'cmn_mole_person_001',
      name: 'Mole Person',
      level: 1,
      health: 40,
      mobEffects: [{ value: 6, effect: { damageModifier: true } }],
      defense: 2,
      aiType: 'CHASE_AND_MINE',
      moveSpeed: 2.5,
      animations: { parts: {} },
    },
    {
      id: 'cmn1zl1bk0001ihw48b0c492z',
      name: 'Dawg',
      level: 2,
      health: 50,
      mobEffects: [{ value: 20, effect: { damageModifier: true } }],
      defense: 5,
      aiType: 'PATROL',
      moveSpeed: 3.0,
      animations: { parts: {} },
    },
  ];

  it('renders loading state initially', () => {
    mockFetchWithAuth.mockReturnValue(new Promise(() => {})); // Never resolves
    render(
      <MemoryRouter>
        <ToastProvider>
          <MobViewer />
        </ToastProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading Mob Rigging Editor/i)).toBeInTheDocument();
  });

  it('fetches mobs and displays the first mob with ModularRigEditor', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleMobs,
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <MobViewer />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('MOB VIEWER')).toBeInTheDocument();
    });

    expect(screen.getByText('Mole Person')).toBeInTheDocument();
    expect(screen.getByTestId('mock-modular-rig-editor')).toHaveTextContent(
      'ModularRigEditor for mob: Mole Person (cmn_mole_person_001)'
    );
    expect(screen.getByText('HP: 40')).toBeInTheDocument();
    expect(screen.getByText('AI: CHASE_AND_MINE')).toBeInTheDocument();
  });

  it('switches active mob when selecting a different mob from dropdown', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleMobs,
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <MobViewer />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('MOB VIEWER')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'cmn1zl1bk0001ihw48b0c492z' } });

    await waitFor(() => {
      expect(screen.getByTestId('mock-modular-rig-editor')).toHaveTextContent(
        'ModularRigEditor for mob: Dawg (cmn1zl1bk0001ihw48b0c492z)'
      );
    });

    expect(screen.getByText('HP: 50')).toBeInTheDocument();
    expect(screen.getByText('AI: PATROL')).toBeInTheDocument();
  });

  it('shows error banner when fetch fails and allows retry', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <MobViewer />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Failed to fetch mobs/i).length).toBeGreaterThan(0);
    });

    // Retry succeeds
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleMobs,
    });

    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Mole Person')).toBeInTheDocument();
    });
  });

  it('displays empty state when no mobs exist', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <MobViewer />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No Mobs Found')).toBeInTheDocument();
    });
    expect(screen.getByText('+ Create New Mob')).toBeInTheDocument();
  });
});
