import React, { createContext, useState, useEffect, type ReactNode } from 'react';

interface User {
  id: string;
  phoneNumber: string;
  familyName: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  signup: (familyName: string, phoneNumber: string) => Promise<void>;
  signin: (phoneNumber: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = 'http://localhost:4000';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('nvg_token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('nvg_user');
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, [token]);

  const signup = async (familyName: string, phoneNumber: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ familyName, phoneNumber }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('nvg_token', data.token);
      localStorage.setItem('nvg_user', JSON.stringify(data.user));
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signin = async (phoneNumber: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signin failed');
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('nvg_token', data.token);
      localStorage.setItem('nvg_user', JSON.stringify(data.user));
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('nvg_token');
    localStorage.removeItem('nvg_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signup, signin, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
};
