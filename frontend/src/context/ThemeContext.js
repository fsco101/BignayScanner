// Theme Context
// Provides dark mode / light mode support across the entire app

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = '@bignay_theme_mode';

// ── Light palette ──────────────────────────────────────────────────────
export const LIGHT_COLORS = {
  // Brand
  primary: '#2E7D32',
  primaryLight: '#4CAF50',
  primaryDark: '#1B5E20',
  secondary: '#81C784',
  accent: '#F59E0B',

  // Semantic
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  info: '#2563EB',
  infoBg: '#DBEAFE',
  success: '#16A34A',
  successBg: '#DCFCE7',
  error: '#DC2626',

  // Surfaces
  background: '#F8FAF8',
  surface: '#FFFFFF',
  surfaceVariant: '#F0F4F0',
  card: '#FFFFFF',

  // Text
  text: '#1B1B1B',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  textMuted: '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  // Borders
  border: '#E5E7EB',
  divider: '#F0F0F0',

  // Status
  online: '#16A34A',
  offline: '#9CA3AF',
  pending: '#F59E0B',

  // Special
  overlay: 'rgba(0,0,0,0.5)',
  transparent: 'transparent',
  gold: '#F59E0B',
  google: '#DB4437',
  question: '#2563EB',
  selected: '#E8F5E9',
  selectedBorder: '#4CAF50',
  unread: '#FFF8E1',
  unreadBorder: '#FFD54F',
  suspended: '#EF4444',
  buttonText: '#FFFFFF',
  link: '#1565C0',
  linkBg: '#E3F2FD',
  errorLight: '#FFEBEE',

  // Dashboard accent colors (sales tracking, charts, etc.)
  cyan: '#06B6D4',
  cyanBg: '#ECFEFF',
  indigo: '#6366F1',
  indigoBg: '#EEF2FF',
  orange: '#F97316',
  orangeBg: '#FFF7ED',
  pink: '#EC4899',
  pinkBg: '#FDF2F8',
  purple: '#8B5CF6',
  purpleBg: '#F5F3FF',
  teal: '#14B8A6',
  tealBg: '#F0FDFA',
  primaryBg: '#E8F5E9',
  secondaryBg: '#F0F4F0',
};

// ── Dark palette ───────────────────────────────────────────────────────
export const DARK_COLORS = {
  // Brand (keep primary recognisable but lighten slightly)
  primary: '#4CAF50',
  primaryLight: '#66BB6A',
  primaryDark: '#2E7D32',
  secondary: '#388E3C',
  accent: '#FFC107',

  // Semantic
  danger: '#EF4444',
  dangerBg: '#3B1212',
  warning: '#FFC107',
  warningBg: '#3B2F08',
  info: '#60A5FA',
  infoBg: '#1E293B',
  success: '#34D399',
  successBg: '#0D2818',
  error: '#EF4444',

  // Surfaces
  background: '#121212',
  surface: '#1E1E1E',
  surfaceVariant: '#2A2A2A',
  card: '#1E1E1E',

  // Text
  text: '#E4E4E7',
  textSecondary: '#A1A1AA',
  textLight: '#71717A',
  textMuted: '#71717A',
  textOnPrimary: '#FFFFFF',

  // Borders
  border: '#3F3F46',
  divider: '#2A2A2A',

  // Status
  online: '#34D399',
  offline: '#71717A',
  pending: '#FFC107',

  // Special
  overlay: 'rgba(0,0,0,0.7)',
  transparent: 'transparent',
  gold: '#FFC107',
  google: '#EA4335',
  question: '#60A5FA',
  selected: '#1B3A1B',
  selectedBorder: '#4CAF50',
  unread: '#3B2F08',
  unreadBorder: '#FFC107',
  suspended: '#EF4444',
  buttonText: '#FFFFFF',
  link: '#64B5F6',
  linkBg: '#1A2332',
  errorLight: '#3B1212',

  // Dashboard accent colors
  cyan: '#22D3EE',
  cyanBg: '#0C2D33',
  indigo: '#818CF8',
  indigoBg: '#1E1B4B',
  orange: '#FB923C',
  orangeBg: '#3B1F08',
  pink: '#F472B6',
  pinkBg: '#3B0C26',
  purple: '#A78BFA',
  purpleBg: '#2E1065',
  teal: '#2DD4BF',
  tealBg: '#0D3331',
  primaryBg: '#1A3A1A',
  secondaryBg: '#2A2A2A',
};

// ── Context ────────────────────────────────────────────────────────────
const ThemeContext = createContext(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider (e.g. static StyleSheet)
    return { isDark: false, colors: LIGHT_COLORS, toggleTheme: () => {}, themeMode: 'light' };
  }
  return ctx;
};

/** Shorthand — returns the active color palette directly. */
export const useThemeColors = () => useTheme().colors;

export const ThemeProvider = ({ children }) => {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [themeMode, setThemeMode] = useState('system'); // 'light' | 'dark' | 'system'
  const [isLoaded, setIsLoaded] = useState(false);

  // Load persisted preference
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved && ['light', 'dark', 'system'].includes(saved)) {
          setThemeMode(saved);
        }
      } catch {
        // ignore
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const isDark = useMemo(() => {
    if (themeMode === 'system') return systemScheme === 'dark';
    return themeMode === 'dark';
  }, [themeMode, systemScheme]);

  const colors = useMemo(() => (isDark ? DARK_COLORS : LIGHT_COLORS), [isDark]);

  const setTheme = useCallback(async (mode) => {
    setThemeMode(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark');
  }, [isDark, setTheme]);

  const value = useMemo(
    () => ({ isDark, colors, themeMode, setTheme, toggleTheme }),
    [isDark, colors, themeMode, setTheme, toggleTheme],
  );

  if (!isLoaded) return null; // avoid flash of wrong theme

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export default ThemeContext;
