/**
 * useBackHandler Hook
 * Handles Android/iOS hardware back button:
 * - On root screen (Forum): shows exit confirmation alert
 * - On other screens: navigates back via navigation stack
 * - Properly cleans up event listeners
 * - No-op on web platform
 *
 * Can be used in two ways:
 * 1. Inside a Screen component (uses useNavigation/useNavigationState automatically)
 * 2. With a navigationRef (for use outside navigators, e.g., App root)
 */

import { useEffect, useCallback } from 'react';
import { BackHandler, Platform, Alert } from 'react-native';

/**
 * Hook to handle device back button presses.
 *
 * @param {Object} options
 * @param {Object} options.navigationRef - A createNavigationContainerRef() ref object
 * @param {string} options.rootScreen - Name of the root/home screen (default: 'Forum')
 * @param {string} options.exitTitle - Title for exit confirmation dialog
 * @param {string} options.exitMessage - Message for exit confirmation dialog
 */
export function useBackHandler({
  navigationRef,
  rootScreen = 'Forum',
  exitTitle = 'Exit App',
  exitMessage = 'Are you sure you want to exit the app?',
} = {}) {

  const handleBackPress = useCallback(() => {
    if (Platform.OS === 'web') return false;
    if (!navigationRef?.isReady?.()) return false;

    // Find the drawer navigator state to determine current screen & history
    const rootState = navigationRef.getRootState();
    const findDrawerInfo = (navState) => {
      if (!navState) return null;
      if (navState.type === 'drawer') {
        const activeRoute = navState.routes?.[navState.index];
        return {
          routeName: activeRoute?.name,
          historyLength: navState.history?.length || 0,
        };
      }
      if (navState.routes) {
        for (const r of navState.routes) {
          if (r.state) {
            const result = findDrawerInfo(r.state);
            if (result) return result;
          }
        }
      }
      return null;
    };

    const drawerInfo = findDrawerInfo(rootState);
    const currentRoute = drawerInfo?.routeName || navigationRef.getCurrentRoute()?.name;
    const historyLength = drawerInfo?.historyLength || 0;
    const isAtRoot = currentRoute === rootScreen;

    // At root screen with no back history → confirm exit
    if (isAtRoot && historyLength <= 1) {
      Alert.alert(
        exitTitle,
        exitMessage,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
        ],
        { cancelable: true }
      );
      return true;
    }

    // Otherwise go back
    if (navigationRef.canGoBack()) {
      navigationRef.goBack();
      return true;
    }

    // Fallback: navigate to root
    if (!isAtRoot) {
      navigationRef.navigate(rootScreen);
      return true;
    }

    return false;
  }, [navigationRef, rootScreen, exitTitle, exitMessage]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [handleBackPress]);
}

export default useBackHandler;
