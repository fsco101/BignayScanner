// Toast Component for user feedback
// Provides non-intrusive notifications for various actions

import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../hooks/useResponsive';


const ICONS = {
  success: 'checkmark-circle',
  error: 'close-circle',
  warning: 'warning',
  info: 'information-circle',
};

export const Toast = ({ visible, message, type = 'info', onHide, duration = 3000 }) => {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-100)).current;
  
  // Use responsive hook for dynamic sizing
  const {
    width: screenWidth,
    isMobile,
    isTablet,
    isDesktop,
    sp,
    fp,
    responsive,
  } = useResponsive();
  
  // Dynamic responsive styles
  const dynamicStyles = useMemo(() => ({
    container: {
      left: responsive({ mobile: sp(16), tablet: sp(24), desktop: sp(32) }),
      right: responsive({ mobile: sp(16), tablet: sp(24), desktop: sp(32) }),
      maxWidth: isDesktop ? sp(500) : '100%',
      alignSelf: isDesktop ? 'center' : 'stretch',
      padding: responsive({ mobile: sp(14), tablet: sp(16), desktop: sp(18) }),
      borderRadius: responsive({ mobile: sp(10), tablet: sp(12), desktop: sp(14) }),
    },
    messageText: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(15), desktop: fp(16) }),
    },
    iconSize: responsive({ mobile: sp(20), tablet: sp(22), desktop: sp(24) }),
  }), [screenWidth, isMobile, isTablet, isDesktop, sp, fp, responsive]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        hideToast();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onHide) onHide();
    });
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: COLORS[type] || COLORS.info },
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Ionicons name={ICONS[type] || ICONS.info} size={24} color={COLORS.text} />
      <Text style={styles.message} numberOfLines={2}>{message}</Text>
      <TouchableOpacity onPress={hideToast} style={styles.closeButton}>
        <Ionicons name="close" size={20} color={COLORS.text} />
      </TouchableOpacity>
    </Animated.View>
  );
};

// Toast hook for easy usage
import { useState, useCallback } from 'react';
import { useThemeColors } from '../context/ThemeContext';

export const useToast = () => {
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'info',
  });

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    setToast({ visible: true, message, type, duration });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  const showSuccess = useCallback((message) => showToast(message, 'success'), [showToast]);
  const showError = useCallback((message) => showToast(message, 'error'), [showToast]);
  const showWarning = useCallback((message) => showToast(message, 'warning'), [showToast]);
  const showInfo = useCallback((message) => showToast(message, 'info'), [showToast]);

  return {
    toast,
    showToast,
    hideToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
};

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 9999,
  },
  message: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 12,
  },
  closeButton: {
    padding: 4,
  },
});

export default Toast;
