// SweetAlert Component for React Native
// Modern, minimal modal alerts

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../hooks/useResponsive';
import { useThemeColors } from '../context/ThemeContext';


const getAlertTypes = (COLORS) => ({
  success: {
    icon: 'checkmark',
    color: COLORS.success,
    bgColor: '#ECFDF5',
    borderColor: '#D1FAE5',
  },
  error: {
    icon: 'close',
    color: COLORS.danger,
    bgColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  warning: {
    icon: 'alert',
    color: COLORS.warning,
    bgColor: '#FFFBEB',
    borderColor: '#FEF3C7',
  },
  info: {
    icon: 'information',
    color: COLORS.info,
    bgColor: '#EFF6FF',
    borderColor: '#DBEAFE',
  },
  question: {
    icon: 'help',
    color: COLORS.question,
    bgColor: '#F5F3FF',
    borderColor: '#EDE9FE',
  },
  loading: {
    icon: null,
    color: COLORS.primary,
    bgColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
});

// Main SweetAlert Component
export function SweetAlert({
  visible,
  type = 'info',
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  showCancel = false,
  showCancelButton,
  showConfirm = true,
  onConfirm,
  onCancel,
  onClose,
  confirmColor,
  cancelColor,
  closeOnOverlayPress = true,
  autoClose = 0,
  showLoading = false,
  customIcon,
}) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const shouldShowCancel = showCancelButton !== undefined ? showCancelButton : showCancel;
  
  const {
    width: screenWidth,
    isMobile,
    isTablet,
    isDesktop,
    sp,
    fp,
    responsive,
  } = useResponsive();
  
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const isClosing = useRef(false);

  useEffect(() => {
    if (visible) {
      isClosing.current = false;
      // Reset animation values for fresh entry
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
      translateY.setValue(20);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 10,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 10,
          tension: 60,
          useNativeDriver: true,
        }),
      ]).start();

      if (autoClose > 0) {
        const timer = setTimeout(() => {
          handleClose();
        }, autoClose);
        return () => clearTimeout(timer);
      }
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
      translateY.setValue(20);
      isClosing.current = false;
    }
  }, [visible, autoClose, type, title]);

  const handleClose = () => {
    if (isClosing.current) return;
    isClosing.current = true;
    
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 20,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose?.();
    });
  };

  const handleConfirm = () => {
    if (showLoading || isClosing.current) return;
    onConfirm?.();
    if (!showLoading) handleClose();
  };

  const handleCancel = () => {
    if (isClosing.current) return;
    onCancel?.();
    handleClose();
  };

  const ALERT_TYPES = useMemo(() => getAlertTypes(COLORS), [COLORS]);
  const alertConfig = ALERT_TYPES[type] || ALERT_TYPES.info;
  const iconColor = confirmColor || alertConfig.color;

  if (!visible) return null;

  const containerWidth = responsive({ mobile: '88%', tablet: '60%', desktop: '40%' });
  const containerMaxWidth = responsive({ mobile: 380, tablet: 440, desktop: 460 });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={closeOnOverlayPress ? handleClose : undefined}
        >
          <Animated.View
            style={[
              styles.alertContainer,
              {
                width: containerWidth,
                maxWidth: containerMaxWidth,
                transform: [{ scale: scaleAnim }, { translateY }],
              },
            ]}
          >
            <TouchableOpacity activeOpacity={1} style={styles.alertInnerContent}>
              {/* Top accent line */}
              <View style={[styles.accentLine, { backgroundColor: alertConfig.color }]} />
              
              {/* Icon */}
              <View style={[styles.iconWrap, { backgroundColor: alertConfig.bgColor, borderColor: alertConfig.borderColor }]}>
                {type === 'loading' || showLoading ? (
                  <ActivityIndicator size="large" color={alertConfig.color} />
                ) : customIcon ? (
                  customIcon
                ) : (
                  <Ionicons
                    name={alertConfig.icon}
                    size={28}
                    color={alertConfig.color}
                  />
                )}
              </View>

              {/* Title */}
              {title && <Text style={styles.title}>{title}</Text>}

              {/* Message */}
              {message && <Text style={styles.message}>{message}</Text>}

              {/* Buttons */}
              {(showConfirm || shouldShowCancel) && !showLoading && type !== 'loading' && (
                <View style={styles.buttonContainer}>
                  {shouldShowCancel && (
                    <TouchableOpacity
                      style={[styles.button, styles.cancelButton]}
                      onPress={handleCancel}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.cancelButtonText, cancelColor && { color: cancelColor }]}>
                        {cancelText}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {showConfirm && (
                    <TouchableOpacity
                      style={[
                        styles.button,
                        styles.confirmButton,
                        { backgroundColor: iconColor },
                        shouldShowCancel && { flex: 1.5 },
                      ]}
                      onPress={handleConfirm}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.confirmButtonText}>{confirmText}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// Hook for easier usage
export function useSweetAlert() {
  const COLORS = useThemeColors();
  const [alertState, setAlertState] = useState({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    confirmText: 'OK',
    cancelText: 'Cancel',
    showCancel: false,
    showConfirm: true,
    onConfirm: null,
    onCancel: null,
    confirmColor: null,
    cancelColor: null,
    closeOnOverlayPress: true,
    autoClose: 0,
    showLoading: false,
  });

  const showAlert = (options) => {
    setAlertState({
      visible: true,
      type: options.type || 'info',
      title: options.title || '',
      message: options.message || '',
      confirmText: options.confirmText || 'OK',
      cancelText: options.cancelText || 'Cancel',
      showCancel: options.showCancel || false,
      showConfirm: options.showConfirm !== false,
      onConfirm: options.onConfirm || null,
      onCancel: options.onCancel || null,
      confirmColor: options.confirmColor || null,
      cancelColor: options.cancelColor || null,
      closeOnOverlayPress: options.closeOnOverlayPress !== false,
      autoClose: options.autoClose || 0,
      showLoading: options.showLoading || false,
    });
  };

  const hideAlert = () => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  };

  const showSuccess = (title, message, options = {}) => {
    showAlert({ type: 'success', title, message, autoClose: 2000, ...options });
  };

  const showError = (title, message, options = {}) => {
    showAlert({ type: 'error', title, message, ...options });
  };

  const showWarning = (title, message, options = {}) => {
    showAlert({ type: 'warning', title, message, ...options });
  };

  const showInfo = (title, message, options = {}) => {
    showAlert({ type: 'info', title, message, ...options });
  };

  const showConfirm = (title, message, onConfirm, options = {}) => {
    showAlert({
      type: 'question',
      title,
      message,
      showCancel: true,
      confirmText: options.confirmText || 'Yes',
      cancelText: options.cancelText || 'No',
      onConfirm,
      onCancel: options.onCancel,
      confirmColor: options.confirmColor,
      ...options,
    });
  };

  const showLoading = (title = 'Loading...', message = 'Please wait') => {
    showAlert({
      type: 'loading',
      title,
      message,
      showConfirm: false,
      closeOnOverlayPress: false,
    });
  };

  const showDelete = (title, message, onConfirm, options = {}) => {
    showAlert({
      type: 'warning',
      title: title || 'Delete?',
      message: message || 'This action cannot be undone.',
      showCancel: true,
      confirmText: options.confirmText || 'Delete',
      cancelText: options.cancelText || 'Cancel',
      confirmColor: COLORS.danger,
      onConfirm,
      onCancel: options.onCancel,
      ...options,
    });
  };

  return {
    alert: alertState,
    alertConfig: alertState,
    showAlert,
    hideAlert,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showConfirm,
    showLoading,
    showDelete,
  };
}

const createStyles = (COLORS) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTouchable: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  alertInnerContent: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 28,
    paddingTop: 0,
  },
  accentLine: {
    width: '100%',
    height: 4,
    marginBottom: 24,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
  },
  confirmButtonText: {
    color: COLORS.surface,
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: COLORS.surfaceVariant,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default SweetAlert;
