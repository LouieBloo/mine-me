import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GameProvider, useGame } from '../src/contexts/GameContext';
import { useEffect } from 'react';

const mockCharacter = {
  id: 'c1', name: 'Leon', class: 'Warrior', level: 1, sol: 0, lear: 0, status: 'ACTIVE'
};

const TestComponent = () => {
  const { activeCharacter, setActiveCharacter } = useGame();
  
  useEffect(() => {
    if (!activeCharacter) {
      setActiveCharacter(mockCharacter as any);
    }
  }, [activeCharacter, setActiveCharacter]);
  
  return (
    <div>
      <span data-testid="char-name">{activeCharacter?.name}</span>
      <button onClick={() => setActiveCharacter(null)}>Clear</button>
    </div>
  );
};

describe('GameContext', () => {
  it('provides character management state', () => {
    Storage.prototype.setItem = vi.fn();
    Storage.prototype.removeItem = vi.fn();

    render(
      <GameProvider>
        <TestComponent />
      </GameProvider>
    );

    expect(screen.getByTestId('char-name').textContent).toBe('Leon');
    expect(localStorage.setItem).toHaveBeenCalledWith('nvg_active_character', JSON.stringify(mockCharacter));
    
    act(() => {
      screen.getByText('Clear').click();
    });
    expect(localStorage.removeItem).toHaveBeenCalledWith('nvg_active_character');
  });
});
