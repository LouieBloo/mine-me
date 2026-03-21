import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserProfile } from '../src/views/UserProfile/UserProfile';
import { AuthContext } from '../src/contexts/AuthContext';

describe('UserProfile Component', () => {
  it('renders user details from AuthContext', async () => {
    const mockUser = {
      id: 'u1',
      phoneNumber: '+19999999999',
      familyName: 'Stark',
      createdAt: new Date().toISOString()
    } as any;

    render(
      <MemoryRouter>
        <AuthContext.Provider value={{ user: mockUser, token: 'fake', loading: false, signin: vi.fn(), signup: vi.fn(), logout: vi.fn(), error: null }}>
          <UserProfile />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Stark/i)).toBeDefined();
      expect(screen.getByText(/\+19999999999/i)).toBeDefined();
    });
  });
});
