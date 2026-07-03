// Responsive Layout Components
// Provides layout containers that adapt to web and mobile screens

import React from 'react';
import { View, ScrollView, StyleSheet, Platform } from 'react-native';
import { useResponsive, MAX_CONTENT_WIDTH } from '../hooks/useResponsive';

/**
 * Root layout wrapper that ensures full viewport usage on web
 * and proper flex behavior on mobile
 */
export function WebRootLayout({ children, style }) {
  const { isWeb } = useResponsive();

  if (isWeb) {
    return (
      <View style={[styles.webRoot, style]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.mobileRoot, style]}>
      {children}
    </View>
  );
}

/**
 * Container that centers content with max-width on desktop
 * while remaining full-width on mobile
 */
export function ResponsiveContainer({ 
  children, 
  style, 
  maxWidth = MAX_CONTENT_WIDTH,
  padding = true,
}) {
  const { isDesktop, contentPadding, isWeb } = useResponsive();

  const containerStyle = [
    styles.container,
    isDesktop && { maxWidth, alignSelf: 'center' },
    padding && { paddingHorizontal: contentPadding },
    // On web desktop, add background to distinguish content area
    isWeb && isDesktop && styles.webDesktopContainer,
    style,
  ];

  return (
    <View style={containerStyle}>
      {children}
    </View>
  );
}

/**
 * ScrollView wrapper with responsive content width
 */
export function ResponsiveScrollView({ 
  children, 
  style, 
  contentContainerStyle,
  maxWidth = MAX_CONTENT_WIDTH,
  ...props 
}) {
  const { isDesktop, contentPadding, isWeb } = useResponsive();

  return (
    <ScrollView
      style={[styles.scrollView, style]}
      contentContainerStyle={[
        styles.scrollContent,
        isDesktop && { 
          maxWidth, 
          alignSelf: 'center',
          width: '100%',
        },
        { paddingHorizontal: contentPadding },
        contentContainerStyle,
      ]}
      {...props}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Responsive grid container
 */
export function ResponsiveGrid({ 
  children, 
  style,
  gap = 16,
  minItemWidth = 280,
}) {
  const { width, isDesktop, contentPadding } = useResponsive();
  
  // Calculate available width for grid
  const availableWidth = isDesktop 
    ? Math.min(width - contentPadding * 2, MAX_CONTENT_WIDTH)
    : width - contentPadding * 2;

  // Calculate number of columns
  const columns = Math.max(1, Math.floor(availableWidth / minItemWidth));
  const itemWidth = (availableWidth - gap * (columns - 1)) / columns;

  return (
    <View style={[styles.grid, { gap }, style]}>
      {React.Children.map(children, (child, index) => (
        <View style={{ width: itemWidth }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * Two-column layout for desktop, stacked for mobile
 */
export function ResponsiveTwoColumn({ 
  left, 
  right, 
  style,
  leftWidth = '30%',
  gap = 24,
}) {
  const { isDesktop } = useResponsive();

  if (!isDesktop) {
    return (
      <View style={[styles.stackedContainer, style]}>
        {left}
        {right}
      </View>
    );
  }

  return (
    <View style={[styles.twoColumnContainer, { gap }, style]}>
      <View style={{ width: leftWidth }}>
        {left}
      </View>
      <View style={{ flex: 1 }}>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Root layouts
  webRoot: {
    flex: 1,
    minHeight: Platform.OS === 'web' ? '100vh' : undefined,
    width: '100%',
  },
  mobileRoot: {
    flex: 1,
  },

  // Container
  container: {
    flex: 1,
    width: '100%',
  },
  webDesktopContainer: {
    // Optional: add subtle background or shadow for content area
  },

  // ScrollView
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  // Two column
  twoColumnContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stackedContainer: {
    flexDirection: 'column',
  },
});

export default {
  WebRootLayout,
  ResponsiveContainer,
  ResponsiveScrollView,
  ResponsiveGrid,
  ResponsiveTwoColumn,
};
