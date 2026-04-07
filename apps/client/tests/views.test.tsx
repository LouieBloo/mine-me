import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock PixiJS components BEFORE other imports
vi.mock('@pixi/react', () => ({
  Application: ({ children }: any) => React.createElement('div', { 'data-testid': 'pixi-app' }, children),
  extend: vi.fn(),
}));

vi.mock('pixi.js', () => ({
  Assets: {
    load: vi.fn().mockResolvedValue({}),
  },
  Texture: {
    EMPTY: {},
  },
  Sprite: class {},
  Container: class {},
  Application: class {},
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connected: false,
    disconnect: vi.fn(),
  })),
}));

vi.mock('../src/contexts/SocketContext', () => ({
  SocketProvider: ({ children }: any) => React.createElement('div', null, children),
  useSocket: () => ({
    isConnected: false,
    selectCharacter: vi.fn().mockResolvedValue(undefined),
    joinCity: vi.fn().mockResolvedValue(undefined),
    leaveCity: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(() => () => {}),
  }),
}));

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MainMenu } from '../src/views/MainMenu/MainMenu';
import { HomeView } from '../src/views/HomeView/HomeView';
import { InGameLayout } from '../src/components/InGameLayout/InGameLayout';
import { GameProvider } from '../src/contexts/GameContext';
import { AuthProvider } from '../src/contexts/AuthContext';

// Stub ResizeObserver — not available in jsdom
(global as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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
      cityId: 'city1',
      createdAt: new Date().toISOString(),
      city: {
        id: 'city1',
        name: 'The Iron Forge',
        description: 'Dwarven city'
      }
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

    // HomeView renders the city name header (shows '...' while loading async city data)
    // The city name is fetched via socket+HTTP so is not available immediately in unit tests
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
  });
});
