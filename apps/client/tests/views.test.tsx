import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MainMenu } from '../src/views/MainMenu/MainMenu';
import { HomeView } from '../src/views/HomeView/HomeView';
import { GameProvider } from '../src/contexts/GameContext';
import { AuthProvider } from '../src/contexts/AuthContext';

// PixiCanvas mock removed as it is not used for now

describe('Client UI Components', () => {
  it('should render the Main Menu with the game title', () => {
    render(
      <MemoryRouter>
        <MainMenu />
      </MemoryRouter>
    );
    
    expect(screen.getByText(/NEED VS. GREED/i)).toBeDefined();
    expect(screen.getByText(/Play Game/i)).toBeDefined();
  });

  it('should render the HomeView wrapped with GameProvider', () => {
    localStorage.setItem('nvg_active_character', JSON.stringify({
      id: '1', 
      name: 'Arya', 
      class: 'Rogue', 
      level: 14, 
      status: 'ACTIVE',
      sol: 100,
      lear: 5,
      stamina: 100,
      maxStamina: 100,
      combatScore: 50,
      defenseScore: 20,
      ageInDays: 7000,
      createdAt: new Date().toISOString()
    }));
    render(
      <MemoryRouter>
        <AuthProvider>
          <GameProvider>
            <HomeView />
          </GameProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Mock player name from the CityView standard mock
    expect(screen.getByText(/Arya/i)).toBeDefined();
    // Verify the ad layout exists conceptually or Pixi loads
    expect(screen.getByText(/Town of Beginnings/i)).toBeDefined();
    // Currency 
    expect(screen.getByText(/Sol/i)).toBeDefined();
    expect(screen.getByText(/Lear/i)).toBeDefined();
  });
});
