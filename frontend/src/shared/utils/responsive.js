// Responsive Utility System
// Provides flexible sizing that adapts to any screen size and zoom level

import { Dimensions, PixelRatio, Platform } from 'react-native';

// Base dimensions (design reference - iPhone 11 Pro)
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

// Get screen dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Responsive breakpoints
export const BREAKPOINTS = {
  xs: 0,      // Extra small phones
  sm: 360,    // Small phones
  md: 414,    // Medium phones
  lg: 768,    // Tablets
  xl: 1024,   // Small desktops/landscape tablets
  xxl: 1280,  // Large desktops
};

// Scale factor calculations
const widthScale = SCREEN_WIDTH / BASE_WIDTH;
const heightScale = SCREEN_HEIGHT / BASE_HEIGHT;
const scale = Math.min(widthScale, heightScale);

/**
 * Scale a size horizontally based on screen width
 * @param {number} size - Size in base design pixels
 * @returns {number} - Scaled size
 */
export const wp = (size) => {
  return Math.round(size * widthScale);
};

/**
 * Scale a size vertically based on screen height
 * @param {number} size - Size in base design pixels
 * @returns {number} - Scaled size
 */
export const hp = (size) => {
  return Math.round(size * heightScale);
};

/**
 * Scale a size uniformly (uses smaller scale factor)
 * Good for icons, borders, and elements that shouldn't stretch
 * @param {number} size - Size in base design pixels
 * @returns {number} - Scaled size
 */
export const sp = (size) => {
  return Math.round(size * scale);
};

/**
 * Scale font size with moderate scaling to maintain readability
 * @param {number} size - Font size in base design pixels
 * @returns {number} - Scaled font size
 */
export const fp = (size) => {
  const newSize = size * scale;
  // Limit font scaling to prevent too large/small fonts
  const scaledSize = Math.round(PixelRatio.roundToNearestPixel(newSize));
  // Clamp between 80% and 130% of original size
  const minSize = Math.round(size * 0.8);
  const maxSize = Math.round(size * 1.3);
  return Math.min(Math.max(scaledSize, minSize), maxSize);
};

/**
 * Get percentage of screen width
 * @param {number} percent - Percentage (0-100)
 * @returns {number} - Width in pixels
 */
export const widthPercent = (percent) => {
  return Math.round((SCREEN_WIDTH * percent) / 100);
};

/**
 * Get percentage of screen height
 * @param {number} percent - Percentage (0-100)
 * @returns {number} - Height in pixels
 */
export const heightPercent = (percent) => {
  return Math.round((SCREEN_HEIGHT * percent) / 100);
};

/**
 * Responsive spacing scale
 * Returns scaled spacing values based on a multiplier
 */
export const spacing = {
  xs: sp(4),
  sm: sp(8),
  md: sp(12),
  lg: sp(16),
  xl: sp(20),
  xxl: sp(24),
  xxxl: sp(32),
};

/**
 * Responsive font sizes
 */
export const fontSize = {
  xs: fp(10),
  sm: fp(12),
  md: fp(14),
  lg: fp(16),
  xl: fp(18),
  xxl: fp(20),
  xxxl: fp(24),
  title: fp(28),
  hero: fp(32),
};

/**
 * Responsive border radius
 */
export const radius = {
  xs: sp(4),
  sm: sp(8),
  md: sp(12),
  lg: sp(16),
  xl: sp(20),
  xxl: sp(24),
  full: sp(9999),
};

/**
 * Responsive icon sizes
 */
export const iconSize = {
  xs: sp(12),
  sm: sp(16),
  md: sp(20),
  lg: sp(24),
  xl: sp(28),
  xxl: sp(32),
  xxxl: sp(40),
  huge: sp(48),
};

/**
 * Get current breakpoint name
 * @param {number} width - Current screen width
 * @returns {string} - Breakpoint name
 */
export const getBreakpoint = (width = SCREEN_WIDTH) => {
  if (width >= BREAKPOINTS.xxl) return 'xxl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
};

/**
 * Check if screen is at least a certain breakpoint
 * @param {string} breakpoint - Breakpoint to check
 * @param {number} width - Current screen width
 * @returns {boolean}
 */
export const isAtLeast = (breakpoint, width = SCREEN_WIDTH) => {
  return width >= BREAKPOINTS[breakpoint];
};

/**
 * Check if current device is a tablet
 * @param {number} width - Current screen width
 * @returns {boolean}
 */
export const isTablet = (width = SCREEN_WIDTH) => {
  return width >= BREAKPOINTS.lg;
};

/**
 * Check if current device is a desktop
 * @param {number} width - Current screen width
 * @returns {boolean}
 */
export const isDesktop = (width = SCREEN_WIDTH) => {
  return width >= BREAKPOINTS.xl;
};

/**
 * Get number of columns based on screen width
 * @param {number} width - Current screen width
 * @param {Object} config - Column configuration per breakpoint
 * @returns {number}
 */
export const getColumns = (width = SCREEN_WIDTH, config = {}) => {
  const defaultConfig = { xs: 1, sm: 2, md: 2, lg: 3, xl: 4, xxl: 5 };
  const merged = { ...defaultConfig, ...config };
  const breakpoint = getBreakpoint(width);
  return merged[breakpoint];
};

/**
 * Calculate responsive card width based on columns and padding
 * @param {number} columns - Number of columns
 * @param {number} containerPadding - Container horizontal padding
 * @param {number} gap - Gap between cards
 * @param {number} screenWidth - Screen width
 * @returns {number}
 */
export const getCardWidth = (columns, containerPadding = 16, gap = 12, screenWidth = SCREEN_WIDTH) => {
  const totalPadding = containerPadding * 2;
  const totalGaps = gap * (columns - 1);
  const availableWidth = screenWidth - totalPadding - totalGaps;
  return Math.floor(availableWidth / columns);
};

/**
 * Responsive max content width for centered layouts
 * @param {number} width - Current screen width
 * @returns {number}
 */
export const getMaxContentWidth = (width = SCREEN_WIDTH) => {
  if (width >= BREAKPOINTS.xxl) return 1400;
  if (width >= BREAKPOINTS.xl) return 1200;
  if (width >= BREAKPOINTS.lg) return 960;
  return width;
};

/**
 * Create responsive style values based on breakpoints
 * @param {Object} values - Values per breakpoint { xs, sm, md, lg, xl, xxl }
 * @param {number} width - Current screen width
 * @returns {any} - Value for current breakpoint
 */
export const responsive = (values, width = SCREEN_WIDTH) => {
  const breakpoint = getBreakpoint(width);
  const breakpointOrder = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'];
  const currentIndex = breakpointOrder.indexOf(breakpoint);
  
  // Find the closest defined value at or below current breakpoint
  for (let i = currentIndex; i >= 0; i--) {
    if (values[breakpointOrder[i]] !== undefined) {
      return values[breakpointOrder[i]];
    }
  }
  
  // Fallback to first defined value
  return Object.values(values)[0];
};

/**
 * Create responsive padding/margin
 * @param {number} base - Base padding value
 * @param {number} width - Current screen width
 * @returns {number}
 */
export const responsivePadding = (base, width = SCREEN_WIDTH) => {
  return responsive({
    xs: sp(base * 0.75),
    sm: sp(base * 0.85),
    md: sp(base),
    lg: sp(base * 1.15),
    xl: sp(base * 1.25),
    xxl: sp(base * 1.4),
  }, width);
};

/**
 * Normalize size for consistent rendering across platforms
 * @param {number} size - Size to normalize
 * @returns {number}
 */
export const normalize = (size) => {
  if (Platform.OS === 'web') {
    return size;
  }
  return Math.round(PixelRatio.roundToNearestPixel(size * scale));
};

/**
 * Get responsive container padding based on screen size
 * @param {number} width - Current screen width
 * @returns {number}
 */
export const getContainerPadding = (width = SCREEN_WIDTH) => {
  return responsive({
    xs: sp(12),
    sm: sp(14),
    md: sp(16),
    lg: sp(20),
    xl: sp(24),
    xxl: sp(32),
  }, width);
};

/**
 * Create a set of common responsive styles
 * @param {number} width - Current screen width
 * @returns {Object}
 */
export const createResponsiveStyles = (width = SCREEN_WIDTH) => ({
  containerPadding: getContainerPadding(width),
  maxContentWidth: getMaxContentWidth(width),
  columns: getColumns(width),
  isTablet: isTablet(width),
  isDesktop: isDesktop(width),
  breakpoint: getBreakpoint(width),
});

// Export screen dimensions for convenience
export { SCREEN_WIDTH, SCREEN_HEIGHT };

// Default export with all utilities
export default {
  wp,
  hp,
  sp,
  fp,
  widthPercent,
  heightPercent,
  spacing,
  fontSize,
  radius,
  iconSize,
  getBreakpoint,
  isAtLeast,
  isTablet,
  isDesktop,
  getColumns,
  getCardWidth,
  getMaxContentWidth,
  responsive,
  responsivePadding,
  normalize,
  getContainerPadding,
  createResponsiveStyles,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  BREAKPOINTS,
};
