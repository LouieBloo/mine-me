import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MainMenu } from '../src/views/MainMenu/MainMenu';
import { HomeView } from '../src/views/HomeView/HomeView';
import { InGameLayout } from '../src/components/InGameLayout/InGameLayout';
import { GameProvider } from '../src/contexts/GameContext';
import { AuthProvider } from '../src/contexts/AuthContext';

// PixiCanvas mock removed as it is not used for now

describe('Client UI Components', () => {
  it('should render the Main Menu with the game title', () => {
    // Note: MainMenu now has sidebars too because it's under InGameLayout in the App
    // But in this unit test we render it standalone, which is fine if we only care about Title
    render(
      <MemoryRouter>
        <MainMenu />
      </MemoryRouter>
    );
    
    expect(screen.getByText(/NEED VS. GREED/i)).toBeDefined();
    expect(screen.getByText(/Play Game/i)).toBeDefined();
  });

  it('should render the HomeView through the InGameLayout', () => {
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
      <MemoryRouter initialEntries={['/home']}>
        <AuthProvider>
          <GameProvider>
            <Routes>
              <Route element={<InGameLayout />}>
                <Route path="/home" element={<HomeView />} />
              </Route>
            </Routes>
          </GameProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Character Panel (rendered by InGameLayout)
    expect(screen.getByText(/Arya/i)).toBeDefined();
    expect(screen.getByText(/Sol/i)).toBeDefined();
    expect(screen.getByText(/Lear/i)).toBeDefined();

    // HomeView specific content
    expect(screen.getByText(/Town of Beginnings/i)).toBeDefined();
  });
});
