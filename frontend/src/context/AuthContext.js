// Authentication Context
// Provides global authentication state and methods

import React, { createContext, useContext, useState, useEffect } from 'react';
import AuthService from '../services/AuthService';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Initialize auth state on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setIsLoading(true);
      const result = await AuthService.verifyToken();
      if (result.ok) {
        setUser(result.user);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const result = await AuthService.login(email, password);
      if (result.ok) {
        setUser(result.user);
        setIsAuthenticated(true);
      }
      return result;
    } catch (error) {
      console.error('Login error:', error);
      return { ok: false, error: 'Login failed' };
    }
  };

  const register = async (userData) => {
    try {
      const result = await AuthService.register(userData);
      if (result.ok) {
        setUser(result.user);
        setIsAuthenticated(true);
      }
      return result;
    } catch (error) {
      console.error('Register error:', error);
      return { ok: false, error: 'Registration failed' };
    }
  };

  const logout = async () => {
    try {
      await AuthService.logout();
      setUser(null);
      setIsAuthenticated(false);
      return { ok: true };
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
      setIsAuthenticated(false);
      return { ok: true };
    }
  };

  const loginWithGoogle = async (token, user) => {
    try {
      // Store token and user data directly (already received from GoogleAuthService)
      await AuthService.setToken(token);
      await AuthService.setUser(user);
      setUser(user);
      setIsAuthenticated(true);
      return { ok: true };
    } catch (error) {
      console.error('Google login storage error:', error);
      return { ok: false, error: 'Failed to store login data' };
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const result = await AuthService.updateProfile(profileData);
      if (result.ok) {
        setUser(result.user);
      }
      return result;
    } catch (error) {
      console.error('Update profile error:', error);
      return { ok: false, error: 'Update failed' };
    }
  };

  const refreshUser = async () => {
    try {
      const result = await AuthService.getProfile();
      if (result.ok) {
        setUser(result.user);
      }
      return result;
    } catch (error) {
      console.error('Refresh user error:', error);
      return { ok: false, error: 'Refresh failed' };
    }
  };

  const value = {
    user,
    isLoading,
    isAuthenticated,
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
    loginWithGoogle,
    updateProfile,
    refreshUser,
    checkAuthStatus,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
