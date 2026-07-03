// Responsive Hook
// Provides reactive screen dimensions and breakpoint utilities for web and mobile

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dimensions, Platform, PixelRatio } from 'react-native';

// Base dimensions (design reference - iPhone 11 Pro)
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

// Breakpoints for responsive design
export const BREAKPOINTS = {
  mobile: 0,      // 0 - 767px
  tablet: 768,    // 768 - 1023px
  desktop: 1024,  // 1024 - 1439px
  wide: 1440,     // 1440px+
};

// Max content width for desktop (use full width, no artificial margin)
export const MAX_CONTENT_WIDTH = Infinity;

/**
 * Hook to get reactive screen dimensions
 * Updates on window resize (important for web)
 */
export function useWindowDimensions() {
  const [dimensions, setDimensions] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return { width, height };
  });

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions({ width: window.width, height: window.height });
    });

    return () => subscription?.remove();
  }, []);

  return dimensions;
}

/**
 * Hook to get current breakpoint and responsive utilities
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const isWeb = Platform.OS === 'web';
  const isMobile = width < BREAKPOINTS.tablet;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isWide = width >= BREAKPOINTS.wide;

  // Get current breakpoint name
  const breakpoint = isWide ? 'wide' : isDesktop ? 'desktop' : isTablet ? 'tablet' : 'mobile';

  // Calculate scale factors based on current screen size
  const scales = useMemo(() => {
    const widthScale = width / BASE_WIDTH;
    const heightScale = height / BASE_HEIGHT;
    const scale = Math.min(widthScale, heightScale);
    return { widthScale, heightScale, scale };
  }, [width, height]);

  // Scale horizontally based on screen width
  const wp = useCallback((size) => {
    return Math.round(size * scales.widthScale);
  }, [scales.widthScale]);

  // Scale vertically based on screen height
  const hp = useCallback((size) => {
    return Math.round(size * scales.heightScale);
  }, [scales.heightScale]);

  // Scale uniformly (uses smaller scale factor)
  const sp = useCallback((size) => {
    return Math.round(size * scales.scale);
  }, [scales.scale]);

  // Scale font size with limits to maintain readability
  const fp = useCallback((size) => {
    const newSize = size * scales.scale;
    const scaledSize = Math.round(PixelRatio.roundToNearestPixel(newSize));
    const minSize = Math.round(size * 0.8);
    const maxSize = Math.round(size * 1.3);
    return Math.min(Math.max(scaledSize, minSize), maxSize);
  }, [scales.scale]);

  // Get percentage of screen width
  const widthPercent = useCallback((percent) => {
    return Math.round((width * percent) / 100);
  }, [width]);

  // Get percentage of screen height  
  const heightPercent = useCallback((percent) => {
    return Math.round((height * percent) / 100);
  }, [height]);

  // Get responsive value based on current breakpoint
  const responsive = useCallback((values) => {
    if (isWide && values.wide !== undefined) return values.wide;
    if (isDesktop && values.desktop !== undefined) return values.desktop;
    if (isTablet && values.tablet !== undefined) return values.tablet;
    if (isMobile && values.mobile !== undefined) return values.mobile;
    return values.default ?? values.mobile;
  }, [isMobile, isTablet, isDesktop, isWide]);

  // Calculate content width (full width on all breakpoints)
  const contentWidth = width;

  // Get horizontal padding for content
  const contentPadding = responsive({
    mobile: sp(16),
    tablet: sp(24),
    desktop: sp(32),
    wide: sp(48),
  });

  // Grid columns based on screen size
  const gridColumns = responsive({
    mobile: 2,
    tablet: 3,
    desktop: 4,
    wide: 5,
  });

  // Get card width based on columns
  const getCardWidth = useCallback((cols = gridColumns, gap = sp(12)) => {
    const totalPadding = contentPadding * 2;
    const totalGaps = gap * (cols - 1);
    const availableWidth = width - totalPadding - totalGaps;
    return Math.floor(availableWidth / cols);
  }, [width, gridColumns, contentPadding, sp]);

  // Responsive spacing scale
  const spacing = useMemo(() => ({
    xs: sp(4),
    sm: sp(8),
    md: sp(12),
    lg: sp(16),
    xl: sp(20),
    xxl: sp(24),
    xxxl: sp(32),
  }), [sp]);

  // Responsive font sizes
  const fontSize = useMemo(() => ({
    xs: fp(10),
    sm: fp(12),
    md: fp(14),
    lg: fp(16),
    xl: fp(18),
    xxl: fp(20),
    xxxl: fp(24),
    title: fp(28),
    hero: fp(32),
  }), [fp]);

  // Responsive border radius
  const radius = useMemo(() => ({
    xs: sp(4),
    sm: sp(8),
    md: sp(12),
    lg: sp(16),
    xl: sp(20),
    xxl: sp(24),
    full: 9999,
  }), [sp]);

  // Responsive icon sizes
  const iconSize = useMemo(() => ({
    xs: sp(12),
    sm: sp(16),
    md: sp(20),
    lg: sp(24),
    xl: sp(28),
    xxl: sp(32),
    xxxl: sp(40),
    huge: sp(48),
  }), [sp]);

  return {
    // Dimensions
    width,
    height,
    // Platform
    isWeb,
    // Breakpoints
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    breakpoint,
    // Scaling functions
    wp,
    hp,
    sp,
    fp,
    widthPercent,
    heightPercent,
    // Utilities
    responsive,
    contentWidth,
    contentPadding,
    gridColumns,
    getCardWidth,
    maxContentWidth: MAX_CONTENT_WIDTH,
    // Preset scales
    spacing,
    fontSize,
    radius,
    iconSize,
  };
}

/**
 * Get responsive styles for a container (full width on all screen sizes)
 */
export function getResponsiveContainerStyle(width, isDesktop) {
  return {
    flex: 1,
    width: '100%',
  };
}

/**
 * Create responsive StyleSheet values
 * Usage: responsiveStyle({ mobile: 16, desktop: 24 })
 */
export function createResponsiveStyles(screenWidth) {
  const isMobile = screenWidth < BREAKPOINTS.tablet;
  const isTablet = screenWidth >= BREAKPOINTS.tablet && screenWidth < BREAKPOINTS.desktop;
  const isDesktop = screenWidth >= BREAKPOINTS.desktop;
  const isWide = screenWidth >= BREAKPOINTS.wide;

  return (values) => {
    if (isWide && values.wide !== undefined) return values.wide;
    if (isDesktop && values.desktop !== undefined) return values.desktop;
    if (isTablet && values.tablet !== undefined) return values.tablet;
    if (isMobile && values.mobile !== undefined) return values.mobile;
    return values.default ?? values.mobile;
  };
}

export default useResponsive;
