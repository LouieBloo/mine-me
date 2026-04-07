import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/contexts/AuthContext';
import { GameProvider } from '../src/contexts/GameContext';
import { CharacterSelection } from '../src/views/CharacterSelection/CharacterSelection';

// Mock fetch
global.fetch = vi.fn();

vi.mock('@pixi/react', () => ({
    Application: ({ children }: any) => React.createElement('div', { 'data-testid': 'pixi-app' }, children),
    extend: vi.fn(),
}));

vi.mock('pixi.js', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        Assets: { load: vi.fn().mockResolvedValue({}) },
        Application: class {},
    }
});

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

const mockCharacters = [
    { id: '1', name: 'Althea', class: 'Mage', level: 5, status: 'ACTIVE', sol: 10, lear: 0, stamina: 100, maxStamina: 100, combatScore: 20, defenseScore: 10, ageInDays: 6000, createdAt: new Date().toISOString() },
    { id: '2', name: 'Boric', class: 'Warrior', level: 2, status: 'ACTIVE', sol: 5, lear: 0, stamina: 100, maxStamina: 100, combatScore: 15, defenseScore: 15, ageInDays: 6500, createdAt: new Date(Date.now() - 10000).toISOString() },
];

describe('CharacterSelection View', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('nvg_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MjUzNDA2NTAwMH0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockCharacters,
        });
    });

    it('should render the character list and preview the first one', async () => {
        render(
            <AuthProvider>
                <GameProvider>
                    <MemoryRouter>
                        <CharacterSelection />
                    </MemoryRouter>
                </GameProvider>
            </AuthProvider>
        );

        // Wait for characters to load
        const altheaElements = await screen.findAllByText(/Althea/i);
        expect(altheaElements.length).toBeGreaterThanOrEqual(1);
        
        expect(await screen.findByText(/Boric/i)).toBeDefined();

        // Preview should show Althea (first in list)
        expect(screen.getByText(/Master Mage/i)).toBeDefined();
    });

    it('should switch preview when a different character is selected', async () => {
        render(
            <AuthProvider>
                <GameProvider>
                    <MemoryRouter>
                        <CharacterSelection />
                    </MemoryRouter>
                </GameProvider>
            </AuthProvider>
        );

        const boricButton = await screen.findByText(/Boric/i);
        fireEvent.click(boricButton);
        
        expect(await screen.findByText(/Master Warrior/i)).toBeDefined();
    });

    it('should show the creation form when "Create New Character" is clicked', async () => {
        render(
            <AuthProvider>
                <GameProvider>
                    <MemoryRouter>
                        <CharacterSelection />
                    </MemoryRouter>
                </GameProvider>
            </AuthProvider>
        );

        await waitFor(() => screen.getByText(/Create New Character/i));
        
        fireEvent.click(screen.getByText(/Create New Character/i));
        
        expect(screen.getByText(/Establish Your Legacy/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/Choose a name.../i)).toBeDefined();
    });
});
