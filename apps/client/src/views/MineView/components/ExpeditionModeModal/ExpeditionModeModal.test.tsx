import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExpeditionModeModal } from './ExpeditionModeModal';

const fetchWithAuth = vi.fn();
vi.mock('../../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth }) }));
fetchWithAuth.mockResolvedValue({ ok: true, json: () => Promise.resolve([{ key: 'frozen_caves', name: 'Frozen Caves', description: null }]) });

describe('ExpeditionModeModal', () => {
  it('renders Single Player and Multiplayer options when open', () => {
    const handleSelectMode = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ExpeditionModeModal
        isOpen={true}
        onSelectMode={handleSelectMode}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('Select Mining Expedition')).toBeInTheDocument();
    expect(screen.getByText('Single Player')).toBeInTheDocument();
    expect(screen.getByText('Multiplayer Lobby')).toBeInTheDocument();
    expect(screen.getByText('Start Solo Expedition')).toBeInTheDocument();
    expect(screen.getByText('Enter Shared Lobby')).toBeInTheDocument();
  });

  it('opens the biome step when Single Player is clicked, and starts a normal run from it', () => {
    const handleSelectMode = vi.fn();
    render(<ExpeditionModeModal isOpen={true} onSelectMode={handleSelectMode} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText('Single Player'));
    expect(handleSelectMode).not.toHaveBeenCalled();
    expect(screen.getByText('Choose Biomes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start Expedition' }));
    expect(handleSelectMode).toHaveBeenCalledWith('singleplayer', { biomeKeys: [] });
  });

  it('starts Single Player with the biomes that were picked', async () => {
    const handleSelectMode = vi.fn();
    render(<ExpeditionModeModal isOpen={true} onSelectMode={handleSelectMode} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText('Single Player'));
    fireEvent.click(await screen.findByLabelText('Frozen Caves'));
    fireEvent.click(screen.getByRole('button', { name: 'Start with 1 biome' }));
    expect(handleSelectMode).toHaveBeenCalledWith('singleplayer', { biomeKeys: ['frozen_caves'] });
  });

  it('goes back from the biome step to the modes', () => {
    render(<ExpeditionModeModal isOpen={true} onSelectMode={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Single Player'));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Select Mining Expedition')).toBeInTheDocument();
  });

  it('starts at the modes again when it is reopened', () => {
    const { rerender } = render(<ExpeditionModeModal isOpen={true} onSelectMode={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Single Player'));
    rerender(<ExpeditionModeModal isOpen={false} onSelectMode={vi.fn()} onCancel={vi.fn()} />);
    rerender(<ExpeditionModeModal isOpen={true} onSelectMode={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Select Mining Expedition')).toBeInTheDocument();
  });

  it('calls onSelectMode with multiplayer when Multiplayer card is clicked', () => {
    const handleSelectMode = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ExpeditionModeModal
        isOpen={true}
        onSelectMode={handleSelectMode}
        onCancel={handleCancel}
      />
    );

    fireEvent.click(screen.getByText('Multiplayer Lobby'));
    expect(handleSelectMode).toHaveBeenCalledWith('multiplayer');
    expect(handleSelectMode.mock.calls[0]).toHaveLength(1);
  });

  it('offers the sandbox and selects it', () => {
    const handleSelectMode = vi.fn();
    render(<ExpeditionModeModal isOpen={true} onSelectMode={handleSelectMode} onCancel={vi.fn()} />);

    expect(screen.getByText('Enter Sandbox')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sandbox'));
    expect(handleSelectMode).toHaveBeenCalledWith('sandbox');
  });

  it('calls onCancel when Return to Town button is clicked', () => {
    const handleSelectMode = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ExpeditionModeModal
        isOpen={true}
        onSelectMode={handleSelectMode}
        onCancel={handleCancel}
      />
    );

    fireEvent.click(screen.getByText('Return to Town'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

});

describe('ExpeditionModeModal mission step (ticket 111)', () => {
  const offer = (id: string, name: string) => ({ id, name, description: null, tier: 1, objectives: [{ type: 'KILL_MOB' as const, label: `Kill 3 ${name}`, target: 3, unit: 'count' as const }], reward: { sol: 10, xp: 5, items: [] } });

  it('asks for missions after the biome step, shows the offers, and starts with the one picked', async () => {
    const onSelectMode = vi.fn();
    const loadMissionOffers = vi.fn().mockResolvedValue({ offers: [offer('m1', 'Moles'), offer('m2', 'Dawgs')] });
    render(<ExpeditionModeModal isOpen={true} onSelectMode={onSelectMode} onCancel={vi.fn()} loadMissionOffers={loadMissionOffers} />);
    fireEvent.click(screen.getByText('Single Player'));
    fireEvent.click(await screen.findByLabelText('Frozen Caves'));
    fireEvent.click(screen.getByRole('button', { name: 'Start with 1 biome' }));
    expect(await screen.findByText('Choose a Mission')).toBeInTheDocument();
    expect(loadMissionOffers).toHaveBeenCalledWith('singleplayer');
    expect(screen.getByRole('button', { name: 'Start Mission' })).toBeDisabled();
    fireEvent.click(screen.getByText('Dawgs'));
    fireEvent.click(screen.getByRole('button', { name: 'Start Mission' }));
    expect(onSelectMode).toHaveBeenCalledWith('singleplayer', { biomeKeys: ['frozen_caves'], missionId: 'm2' });
  });

  it('goes to the mission step from the shared lobby too', async () => {
    const onSelectMode = vi.fn();
    const loadMissionOffers = vi.fn().mockResolvedValue({ offers: [offer('m1', 'Moles')] });
    render(<ExpeditionModeModal isOpen={true} onSelectMode={onSelectMode} onCancel={vi.fn()} loadMissionOffers={loadMissionOffers} />);
    fireEvent.click(screen.getByText('Multiplayer Lobby'));
    expect(await screen.findByText('Choose a Mission')).toBeInTheDocument();
    expect(loadMissionOffers).toHaveBeenCalledWith('multiplayer');
    fireEvent.click(screen.getByText('Moles'));
    fireEvent.click(screen.getByRole('button', { name: 'Start Mission' }));
    expect(onSelectMode).toHaveBeenCalledWith('multiplayer', { missionId: 'm1' });
  });

  it('starts at once when there is nothing to pick, or the lobby already has a mission', async () => {
    const onSelectMode = vi.fn();
    const none = vi.fn().mockResolvedValue({ offers: [] });
    const { rerender } = render(<ExpeditionModeModal isOpen={true} onSelectMode={onSelectMode} onCancel={vi.fn()} loadMissionOffers={none} />);
    fireEvent.click(screen.getByText('Multiplayer Lobby'));
    await waitFor(() => expect(onSelectMode).toHaveBeenCalledWith('multiplayer', {}));

    onSelectMode.mockClear();
    rerender(<ExpeditionModeModal isOpen={false} onSelectMode={onSelectMode} onCancel={vi.fn()} loadMissionOffers={none} />);
    const joining = vi.fn().mockResolvedValue({ offers: [], joining: { id: 'm9', name: 'Shared' } });
    rerender(<ExpeditionModeModal isOpen={true} onSelectMode={onSelectMode} onCancel={vi.fn()} loadMissionOffers={joining} />);
    fireEvent.click(screen.getByText('Multiplayer Lobby'));
    await waitFor(() => expect(onSelectMode).toHaveBeenCalledWith('multiplayer', {}));
  });

  it('lets the player start without a mission, and does not ask for missions in the sandbox', async () => {
    const onSelectMode = vi.fn();
    const loadMissionOffers = vi.fn().mockResolvedValue({ offers: [offer('m1', 'Moles')] });
    render(<ExpeditionModeModal isOpen={true} onSelectMode={onSelectMode} onCancel={vi.fn()} loadMissionOffers={loadMissionOffers} />);
    fireEvent.click(screen.getByText('Enter Sandbox').closest('button')!);
    expect(onSelectMode).toHaveBeenCalledWith('sandbox');
    expect(loadMissionOffers).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Multiplayer Lobby'));
    fireEvent.click(await screen.findByRole('button', { name: 'Start without a mission' }));
    expect(onSelectMode).toHaveBeenLastCalledWith('multiplayer', {});
  });

  it('shows an error with a retry when the offers cannot be loaded, and goes back', async () => {
    const loadMissionOffers = vi.fn().mockRejectedValueOnce(new Error('Server asleep')).mockResolvedValue({ offers: [offer('m1', 'Moles')] });
    render(<ExpeditionModeModal isOpen={true} onSelectMode={vi.fn()} onCancel={vi.fn()} loadMissionOffers={loadMissionOffers} />);
    fireEvent.click(screen.getByText('Multiplayer Lobby'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server asleep');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Moles')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Select Mining Expedition')).toBeInTheDocument();
  });
});
