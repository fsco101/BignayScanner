/**
 * useNotificationPermission Hook
 * Manages push notification permission for mobile platforms (Android/iOS).
 *
 * Features:
 * - Checks permission status on mount
 * - Shows permission prompt on first launch
 * - Tracks permission state: granted, denied, undetermined
 * - Graceful handling when denied (no crash, no repeated prompts)
 * - No-op on web platform
 * - Expo notifications compatible
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, Alert, Linking, AppState } from 'react-native';

// Permission states
export const PERMISSION_STATUS = {
  UNDETERMINED: 'undetermined',
  GRANTED: 'granted',
  DENIED: 'denied',
  LOADING: 'loading',
};

let Notifications = null;

/**
 * Hook to manage notification permission state.
 *
 * @param {Object} options
 * @param {boolean} options.autoRequest - Automatically request permission on mount (default: true)
 * @returns {{ status, requestPermission, openSettings }}
 */
export function useNotificationPermission({ autoRequest = true } = {}) {
  const [status, setStatus] = useState(PERMISSION_STATUS.LOADING);
  const initialized = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  // Load expo-notifications module (non-web only)
  const loadNotificationsModule = useCallback(async () => {
    if (Platform.OS === 'web') return false;
    if (Notifications) return true;
    try {
      Notifications = require('expo-notifications');
      return true;
    } catch (e) {
      console.log('[NotificationPermission] expo-notifications not available');
      return false;
    }
  }, []);

  // Check current permission status without prompting
  const checkPermission = useCallback(async () => {
    if (Platform.OS === 'web') {
      setStatus(PERMISSION_STATUS.GRANTED); // Web notifications handled differently
      return PERMISSION_STATUS.GRANTED;
    }

    const available = await loadNotificationsModule();
    if (!available || !Notifications) {
      setStatus(PERMISSION_STATUS.DENIED);
      return PERMISSION_STATUS.DENIED;
    }

    try {
      const { status: currentStatus } = await Notifications.getPermissionsAsync();
      const mapped = currentStatus === 'granted'
        ? PERMISSION_STATUS.GRANTED
        : currentStatus === 'denied'
          ? PERMISSION_STATUS.DENIED
          : PERMISSION_STATUS.UNDETERMINED;
      setStatus(mapped);
      return mapped;
    } catch (e) {
      console.log('[NotificationPermission] Check error:', e.message);
      setStatus(PERMISSION_STATUS.UNDETERMINED);
      return PERMISSION_STATUS.UNDETERMINED;
    }
  }, [loadNotificationsModule]);

  // Request permission from the user
  const requestPermission = useCallback(async () => {
    if (Platform.OS === 'web') {
      setStatus(PERMISSION_STATUS.GRANTED);
      return PERMISSION_STATUS.GRANTED;
    }

    const available = await loadNotificationsModule();
    if (!available || !Notifications) {
      setStatus(PERMISSION_STATUS.DENIED);
      return PERMISSION_STATUS.DENIED;
    }

    try {
      // First check existing status
      const { status: existingStatus } = await Notifications.getPermissionsAsync();

      if (existingStatus === 'granted') {
        setStatus(PERMISSION_STATUS.GRANTED);
        return PERMISSION_STATUS.GRANTED;
      }

      // Request permission
      const { status: newStatus } = await Notifications.requestPermissionsAsync();

      if (newStatus === 'granted') {
        setStatus(PERMISSION_STATUS.GRANTED);
        return PERMISSION_STATUS.GRANTED;
      }

      // Permission denied — show a helpful message
      setStatus(PERMISSION_STATUS.DENIED);

      Alert.alert(
        'Notifications Disabled',
        'You won\'t receive order updates, forum replies, or important alerts. You can enable notifications anytime in your device settings.',
        [
          { text: 'Maybe Later', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              // Open app settings so user can enable notifications manually
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ],
        { cancelable: true }
      );

      return PERMISSION_STATUS.DENIED;
    } catch (e) {
      console.log('[NotificationPermission] Request error:', e.message);
      setStatus(PERMISSION_STATUS.DENIED);
      return PERMISSION_STATUS.DENIED;
    }
  }, [loadNotificationsModule]);

  // Open device settings (for manual permission enable)
  const openSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else if (Platform.OS === 'android') {
      Linking.openSettings();
    }
  }, []);

  // Check permission on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      if (Platform.OS === 'web') {
        setStatus(PERMISSION_STATUS.GRANTED);
        return;
      }

      const currentStatus = await checkPermission();

      // Auto-request if undetermined and autoRequest is enabled
      if (currentStatus === PERMISSION_STATUS.UNDETERMINED && autoRequest) {
        await requestPermission();
      }
    })();
  }, [checkPermission, requestPermission, autoRequest]);

  // Re-check permission when app returns to foreground
  // (user may have changed it in device settings)
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        await checkPermission();
      }
      appStateRef.current = nextState;
    });

    return () => subscription?.remove();
  }, [checkPermission]);

  return {
    /** Current permission status: 'granted' | 'denied' | 'undetermined' | 'loading' */
    status,
    /** Manually request notification permission */
    requestPermission,
    /** Open device settings for manual permission toggle */
    openSettings,
    /** Whether notifications are currently allowed */
    isGranted: status === PERMISSION_STATUS.GRANTED,
    /** Whether permission has been explicitly denied */
    isDenied: status === PERMISSION_STATUS.DENIED,
  };
}

export default useNotificationPermission;
