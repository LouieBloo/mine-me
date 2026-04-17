import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/contexts/AuthContext';
import { GameProvider } from '../src/contexts/GameContext';
import { TestMobView } from '../src/views/TestMobView/TestMobView';

// Stub ResizeObserver for this test
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver;
globalThis.ResizeObserver = MockResizeObserver;
window.ResizeObserver = MockResizeObserver;

// Mock fetch
global.fetch = vi.fn();

vi.mock('@pixi/react', () => ({
  Application: ({ children }: any) => React.createElement('div', { 'data-testid': 'pixi-app' }, children),
  extend: vi.fn(),
}));

vi.mock('pixi.js', () => ({
  Assets: { load: vi.fn().mockResolvedValue({}) },
  Texture: { EMPTY: {} },
  Sprite: class {},
  Container: class {
    addChild() {}
    removeChild() {}
    destroy() {}
    x = 0;
    y = 0;
    scale = { set: () => {} };
    parent = null;
  },
  AnimatedSprite: class {
    anchor = { set: () => {} };
    animationSpeed = 0;
    loop = true;
    playing = false;
    play() {}
    stop() {}
    destroy() {}
  },
  Spritesheet: class {
    animations = {};
    async parse() {}
  },
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

const mockMobs = [
  {
    id: 'mob-1',
    name: 'Dark Knight',
    level: 5,
    health: 100,
    attack: 15,
    defense: 10,
    animations: { url: '/assets/sprites/mobs/mob1_sprite.png', atlasUrl: '/assets/sprites/mobs/mob1_atlas.json' },
  },
  {
    id: 'mob-2',
    name: 'Fire Imp',
    level: 2,
    health: 30,
    attack: 8,
    defense: 3,
    animations: null,
  },
];

describe('TestMobView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('nvg_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MjUzNDA2NTAwMH0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockMobs,
    });
  });

  it('should render the mob tester heading', async () => {
    render(
      <AuthProvider>
        <GameProvider>
          <MemoryRouter>
            <TestMobView />
          </MemoryRouter>
        </GameProvider>
      </AuthProvider>
    );

    expect(screen.getByText(/Mob Tester/i)).toBeDefined();
  });

  it('should render mob dropdown after loading', async () => {
    render(
      <AuthProvider>
        <GameProvider>
          <MemoryRouter>
            <TestMobView />
          </MemoryRouter>
        </GameProvider>
      </AuthProvider>
    );

    const darkKnight = await screen.findByText(/Dark Knight/i);
    expect(darkKnight).toBeDefined();
  });

  it('should render animation dropdown with whitelisted options', async () => {
    render(
      <AuthProvider>
        <GameProvider>
          <MemoryRouter>
            <TestMobView />
          </MemoryRouter>
        </GameProvider>
      </AuthProvider>
    );

    // Whitelisted animation keys should be present
    expect(screen.getByText('Idle')).toBeDefined();
    expect(screen.getByText('Death')).toBeDefined();
  });
});
