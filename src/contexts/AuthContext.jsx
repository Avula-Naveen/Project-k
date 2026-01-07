'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on mount
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const signIn = async (email, password) => {
    try {
      // Try to authenticate with API first (if database is configured)
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Database authentication successful
        const userData = {
          ...data.user,
          signedInAt: new Date().toISOString(),
        };
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        return { success: true };
      } else {
        // If API fails (database not configured), fall back to demo mode
        if (response.status === 500 && data.error?.includes('not configured')) {
          console.warn('Database not configured, using demo mode');
          const userData = {
            email,
            name: email.split('@')[0],
            signedInAt: new Date().toISOString(),
          };
          setUser(userData);
          localStorage.setItem('user', JSON.stringify(userData));
          return { success: true };
        }
        // Return API error
        return { success: false, error: data.error || 'Sign in failed' };
      }
    } catch (error) {
      console.error('Sign in error:', error);
      // Fallback to demo mode if API call fails
      const userData = {
        email,
        name: email.split('@')[0],
        signedInAt: new Date().toISOString(),
      };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      return { success: true };
    }
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

