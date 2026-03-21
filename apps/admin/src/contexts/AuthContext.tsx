import React, { createContext, useState, useEffect, type ReactNode } from 'react';

interface User {
  id: string;
  phoneNumber: string;
  familyName: string;
  isAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  signin: (phoneNumber: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('nvg_admin_token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('nvg_admin_user');
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, [token]);

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

      // Check if user is admin
      if (!data.user.isAdmin) {
        throw new Error('Access denied. Admin privileges required.');
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('nvg_admin_token', data.token);
      localStorage.setItem('nvg_admin_user', JSON.stringify(data.user));
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
    localStorage.removeItem('nvg_admin_token');
    localStorage.removeItem('nvg_admin_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signin, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
};
