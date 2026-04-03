import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider } from '../src/contexts/AuthContext';
import { useAuth } from '../src/hooks/useAuth';
import { useEffect } from 'react';

const TestComponent = () => {
  const { signin, logout, token, user } = useAuth();
  
  useEffect(() => {
    if (!token) {
      signin('111');
    }
  }, [token, signin]);
  
  return (
    <div>
      <span data-testid="token">{token}</span>
      <span data-testid="user">{user?.familyName}</span>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    Storage.prototype.setItem = vi.fn();
    Storage.prototype.removeItem = vi.fn();
    Storage.prototype.getItem = vi.fn().mockReturnValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ 
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MjUzNDA2NTAwMH0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', 
        user: { familyName: 'Fam' } 
      })
    });
  });

  it('provides signin and logout functionality', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // After mount, signin is called, which calls fetch
    const tokenEl = await screen.findByText('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MjUzNDA2NTAwMH0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    expect(tokenEl).toBeDefined();
    
    expect(screen.getByTestId('user').textContent).toBe('Fam');
    expect(localStorage.setItem).toHaveBeenCalled();
    
    act(() => {
      screen.getByText('Logout').click();
    });
    
    expect(localStorage.removeItem).toHaveBeenCalled();
  });
});
