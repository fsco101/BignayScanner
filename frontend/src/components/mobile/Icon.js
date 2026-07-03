// Mobile-specific Icon component
// Wraps Ionicons for mobile, can be swapped for web icons later

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../context/ThemeContext';

/**
 * Platform-specific Icon component for mobile
 * Uses Ionicons from @expo/vector-icons
 * 
 * Note: When creating a web version, create a web/Icon.js that uses
 * a web-compatible icon library (e.g., react-icons, heroicons)
 */
export function Icon({ name, size = 24, color, style }) {
  const COLORS = useThemeColors();
  return (
    <Ionicons
      name={name}
      size={size}
      color={color || COLORS.text}
      style={style}
    />
  );
}

// Common icon mappings for cross-platform consistency
export const IconNames = {
  // Navigation
  menu: 'menu',
  close: 'close',
  back: 'arrow-back',
  forward: 'arrow-forward',
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  chevronLeft: 'chevron-back',
  chevronRight: 'chevron-forward',
  
  // Actions
  add: 'add',
  edit: 'create-outline',
  delete: 'trash-outline',
  save: 'save-outline',
  share: 'share-outline',
  search: 'search',
  filter: 'filter',
  refresh: 'refresh',
  
  // Content
  home: 'home',
  news: 'newspaper',
  calendar: 'calendar',
  people: 'people',
  leaf: 'leaf',
  document: 'document-text-outline',
  image: 'image-outline',
  
  // Status
  star: 'star',
  starOutline: 'star-outline',
  pin: 'pin',
  pinOutline: 'pin-outline',
  eye: 'eye',
  eyeOff: 'eye-off',
  heart: 'heart',
  heartOutline: 'heart-outline',
  
  // User
  person: 'person',
  personCircle: 'person-circle',
  login: 'log-in-outline',
  logout: 'log-out-outline',
  
  // App-specific
  scanner: 'camera',
  chatbot: 'chatbubbles',
  marketplace: 'cart',
  heatmap: 'map',
  trending: 'trending-up',
  history: 'time',
  settings: 'settings',
  
  // Feedback
  checkmark: 'checkmark-circle',
  error: 'close-circle',
  warning: 'warning',
  info: 'information-circle',
  question: 'help-circle',
};

export default Icon;
