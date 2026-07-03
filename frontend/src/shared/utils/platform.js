// Platform detection utilities
// Helps distinguish between web and mobile environments

import { Platform, Dimensions } from 'react-native';

/**
 * Check if running on web platform
 */
export const isWeb = Platform.OS === 'web';

/**
 * Check if running on iOS
 */
export const isIOS = Platform.OS === 'ios';

/**
 * Check if running on Android
 */
export const isAndroid = Platform.OS === 'android';

/**
 * Check if running on mobile (iOS or Android)
 */
export const isMobile = isIOS || isAndroid;

/**
 * Get screen dimensions
 */
export const getScreenDimensions = () => {
  const { width, height } = Dimensions.get('window');
  return { width, height };
};

/**
 * Check if screen is small (phone)
 */
export const isSmallScreen = () => {
  const { width } = getScreenDimensions();
  return width < 768;
};

/**
 * Check if screen is medium (tablet)
 */
export const isMediumScreen = () => {
  const { width } = getScreenDimensions();
  return width >= 768 && width < 1024;
};

/**
 * Check if screen is large (desktop)
 */
export const isLargeScreen = () => {
  const { width } = getScreenDimensions();
  return width >= 1024;
};

/**
 * Get platform-specific value
 * @param {object} options - Object with platform keys (web, ios, android, default)
 * @returns {any} The value for the current platform
 */
export const platformSelect = (options) => {
  if (isWeb && options.web !== undefined) return options.web;
  if (isIOS && options.ios !== undefined) return options.ios;
  if (isAndroid && options.android !== undefined) return options.android;
  if (isMobile && options.mobile !== undefined) return options.mobile;
  return options.default;
};

/**
 * Get responsive value based on screen size
 * @param {object} options - Object with size keys (small, medium, large, default)
 * @returns {any} The value for the current screen size
 */
export const responsiveValue = (options) => {
  if (isSmallScreen() && options.small !== undefined) return options.small;
  if (isMediumScreen() && options.medium !== undefined) return options.medium;
  if (isLargeScreen() && options.large !== undefined) return options.large;
  return options.default;
};

export default {
  isWeb,
  isIOS,
  isAndroid,
  isMobile,
  getScreenDimensions,
  isSmallScreen,
  isMediumScreen,
  isLargeScreen,
  platformSelect,
  responsiveValue,
};
