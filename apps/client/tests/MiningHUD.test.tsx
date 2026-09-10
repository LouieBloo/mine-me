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

  it('renders controls guide with 1-4 Quick Slots and Left Click Mine', () => {
    render(
      <MiningHUD
        sessionState={mockSessionState}
        playerState={mockPlayerState}
        onExit={vi.fn()}
        onAbandon={vi.fn()}
        onRestart={vi.fn()}
      />
    );

    expect(screen.getByText(/1-4/i)).toBeDefined();
    expect(screen.getByText(/Quick Slots/i)).toBeDefined();
    expect(screen.getByText(/Left Click/i)).toBeDefined();
    expect(screen.getAllByText(/Mine/i).length).toBeGreaterThan(0);
  });

  it('renders Hitboxes toggle button and calls onToggleDebug when clicked', () => {
    const onToggleDebugMock = vi.fn();

    render(
      <MiningHUD
        sessionState={mockSessionState}
        playerState={mockPlayerState}
        onExit={vi.fn()}
        onAbandon={vi.fn()}
        onRestart={vi.fn()}
        showDebug={false}
        onToggleDebug={onToggleDebugMock}
      />
    );

    const debugBtn = screen.getByRole('button', { name: /Hitboxes/i });
    expect(debugBtn).toBeDefined();

    fireEvent.click(debugBtn);
    expect(onToggleDebugMock).toHaveBeenCalledTimes(1);
  });

  it('displays active state and position/reach overlay when showDebug is true', () => {
    render(
      <MiningHUD
        sessionState={mockSessionState}
        playerState={mockPlayerState}
        onExit={vi.fn()}
        onAbandon={vi.fn()}
        onRestart={vi.fn()}
        showDebug={true}
        onToggleDebug={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Hitboxes ON/i })).toBeDefined();
    expect(screen.getByText(/Pos: \(15, 0\)/i)).toBeDefined();
    expect(screen.getByText(/Reach:/i)).toBeDefined();
  });
});
