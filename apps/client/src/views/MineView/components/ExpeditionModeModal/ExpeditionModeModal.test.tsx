import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExpeditionModeModal } from './ExpeditionModeModal';

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

  it('calls onSelectMode with singleplayer when Single Player card is clicked', () => {
    const handleSelectMode = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ExpeditionModeModal
        isOpen={true}
        onSelectMode={handleSelectMode}
        onCancel={handleCancel}
      />
    );

    fireEvent.click(screen.getByText('Single Player'));
    expect(handleSelectMode).toHaveBeenCalledWith('singleplayer');
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
