import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MainMenu } from '../src/views/MainMenu';
import { CityView } from '../src/views/CityView';

vi.mock('../src/components/game/PixiCanvas', () => ({
  PixiCanvas: () => <div data-testid="mock-pixi-canvas" />
}));

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

  it('should render the City View with character stats', () => {
    render(
      <MemoryRouter>
        <CityView />
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
