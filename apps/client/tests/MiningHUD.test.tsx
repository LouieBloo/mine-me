import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiningHUD } from '../src/views/MineView/components/MiningHUD/MiningHUD';
import type { MiningSessionClientState, PlayerState } from '@mine-me/shared';

describe('MiningHUD', () => {
  const mockSessionState: MiningSessionClientState = {
    grid: [],
    position: { x: 15, y: 0 },
    droppedItems: [],
    temporaryBackpack: [],
    visionRange: 3,
    canExtract: true,
    isMining: false,
  };

  const mockPlayerState: PlayerState = {
    character: {
      id: 'char-1',
      name: 'Miner Hero',
      cityId: 'city-1',
      attributes: {
        health: 100,
        maxHealth: 100,
        stamina: 50,
        maxStamina: 100,
      } as any,
    } as any,
    cityId: 'city-1',
    attributes: {
      health: 100,
      maxHealth: 100,
      stamina: 50,
      maxStamina: 100,
    } as any,
  } as any;

  it('renders top-right Refresh Mine button and calls onRestart when clicked', () => {
    const onRestartMock = vi.fn();
    const onExitMock = vi.fn();
    const onAbandonMock = vi.fn();

    render(
      <MiningHUD
        sessionState={mockSessionState}
        playerState={mockPlayerState}
        onExit={onExitMock}
        onAbandon={onAbandonMock}
        onRestart={onRestartMock}
      />
    );

    const refreshButton = screen.getByRole('button', { name: /Refresh Mine/i });
    expect(refreshButton).toBeDefined();

    fireEvent.click(refreshButton);
    expect(onRestartMock).toHaveBeenCalledTimes(1);
  });

  it('displays loading state and disables button when isRestarting is true', () => {
    const onRestartMock = vi.fn();

    render(
      <MiningHUD
        sessionState={mockSessionState}
        playerState={mockPlayerState}
        onExit={vi.fn()}
        onAbandon={vi.fn()}
        onRestart={onRestartMock}
        isRestarting={true}
      />
    );

    const refreshButton = screen.getByRole('button', { name: /Generating.../i });
    expect(refreshButton).toBeDefined();
    expect((refreshButton as HTMLButtonElement).disabled).toBe(true);
  });
});
