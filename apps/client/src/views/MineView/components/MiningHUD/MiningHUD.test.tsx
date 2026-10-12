import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MiningHUD } from './MiningHUD';
import { type MiningSessionClientState, type PlayerState } from '@mine-me/shared';

vi.mock('../../../../components/QuickAccessBar/QuickAccessBar', () => ({
  QuickAccessBar: () => <div data-testid="quick-access-bar" />,
}));

describe('MiningHUD', () => {
  const mockSessionState: MiningSessionClientState = {
    grid: [],
    position: { x: 5, y: 5 },
    droppedItems: [],
    temporaryBackpack: [],
    visionRange: 6,
    isMining: false,
    canExtract: true,
  };

  const mockPlayerState: PlayerState = {
    id: 'char-1',
    familyName: 'Miner',
    characterName: 'TestMiner',
    characterClass: 'WARRIOR' as any,
    status: 'ACTIVE',
    sol: 100,
    lear: 50,
    cityId: 'cmn_city_1',
    attributes: {
      health: 100,
      maxHealth: 100,
      stamina: 80,
      maxStamina: 100,
    } as any,
    inventory: {
      items: [],
      capacity: 20,
    } as any,
    gear: {},
  };

  it('renders standard HUD controls when no weapon ammo is active', () => {
    render(
      <MiningHUD
        sessionState={mockSessionState}
        playerState={mockPlayerState}
        onExit={vi.fn()}
        onAbandon={vi.fn()}
        onRestart={vi.fn()}
      />
    );

    expect(screen.getByText('Mine')).toBeDefined();
  });

  it('does not render the Subterranean Mine title panel', () => {
    render(
      <MiningHUD
        sessionState={{ ...mockSessionState, gameMode: 'multiplayer', isMining: true }}
        playerState={mockPlayerState}
        onExit={vi.fn()}
        onAbandon={vi.fn()}
        onRestart={vi.fn()}
        showDebug
      />
    );

    expect(screen.queryByText('Subterranean Mine')).toBeNull();
    expect(screen.queryByText(/Solo Mine/)).toBeNull();
    expect(screen.queryByText(/Excavating block/)).toBeNull();
    expect(screen.queryByText(/Reach:/)).toBeNull();
  });

  it('renders the hotbar at the top of the top-left column, above the temporary backpack', () => {
    render(
      <MiningHUD
        sessionState={mockSessionState}
        playerState={mockPlayerState}
        onExit={vi.fn()}
        onAbandon={vi.fn()}
        onRestart={vi.fn()}
      />
    );

    const bar = screen.getByTestId('quick-access-bar');
    expect(bar.parentElement?.firstElementChild).toBe(bar);
  });

  it('keeps the zoom control hidden until the zoom changes', () => {
    const props = {
      sessionState: mockSessionState,
      playerState: mockPlayerState,
      onExit: vi.fn(),
      onAbandon: vi.fn(),
      onRestart: vi.fn(),
      onZoomChange: vi.fn(),
    };
    const { rerender } = render(<MiningHUD {...props} zoom={1.5} />);
    expect(screen.getByTestId('zoom-control').getAttribute('data-visible')).toBe('false');

    rerender(<MiningHUD {...props} zoom={1.55} />);
    expect(screen.getByTestId('zoom-control').getAttribute('data-visible')).toBe('true');
  });
});
