import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MiningHUD } from './MiningHUD';
import { type MiningSessionClientState, type PlayerState } from '@mine-me/shared';

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

    expect(screen.getByText('Subterranean Mine')).toBeDefined();
    expect(screen.getByText('Mine')).toBeDefined();
  });
});
