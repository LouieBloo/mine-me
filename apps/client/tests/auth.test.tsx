import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/contexts/AuthContext';
import { Auth } from '../src/views/Auth/Auth';

describe('Auth View', () => {
    it('should render the Signin form by default', () => {
        render(
            <AuthProvider>
                <MemoryRouter>
                    <Auth />
                </MemoryRouter>
            </AuthProvider>
        );
        
        expect(screen.getByText(/Welcome Back/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/e.g. \+1234567890/i)).toBeDefined();
        expect(screen.getByText(/Don't have an account\? Sign up/i)).toBeDefined();
    });

    it('should switch to the Signup form when the toggle is clicked', () => {
        render(
            <AuthProvider>
                <MemoryRouter>
                    <Auth />
                </MemoryRouter>
            </AuthProvider>
        );
        
        const toggleButton = screen.getByText(/Don't have an account\? Sign up/i);
        fireEvent.click(toggleButton);
        
        expect(screen.getByText(/Start Your Journey/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/e.g. Ironheart/i)).toBeDefined();
        expect(screen.getByText(/Already have an account\? Sign in/i)).toBeDefined();
    });
});
