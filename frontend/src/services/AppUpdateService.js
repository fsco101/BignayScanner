import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { apiRequest, API_CONFIG } from '../config/api';

const getAppVersion = () => {
  return (
    Constants.expoConfig?.version ||
    Constants.manifest2?.extra?.expoClient?.version ||
    '0.0.0'
  );
};

const parseVersion = (version) => {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);

  return { major, minor, patch };
};

const isVersionLower = (currentVersion, minimumVersion) => {
  const current = parseVersion(currentVersion);
  const minimum = parseVersion(minimumVersion);

  if (current.major !== minimum.major) return current.major < minimum.major;
  if (current.minor !== minimum.minor) return current.minor < minimum.minor;
  return current.patch < minimum.patch;
};

const openStoreUrl = async (url) => {
  if (!url) return;
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
};

export const checkAndApplyOtaUpdate = async () => {
  if (__DEV__ || Platform.OS === 'web') {
    return { skipped: true, reason: 'dev_or_web' };
  }

  try {
    const update = await Updates.checkForUpdateAsync();
    if (!update.isAvailable) {
      return { updated: false };
    }

    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return { updated: true };
  } catch (error) {
    console.log('[Update] OTA check failed:', error?.message || error);
    return { updated: false, error: error?.message || 'ota_check_failed' };
  }
};

export const checkBackendCompatibility = async () => {
  try {
    const config = await apiRequest(API_CONFIG.ENDPOINTS.APP_CONFIG);
    const currentVersion = getAppVersion();
    const minSupportedVersion = config?.min_supported_app_version || '0.0.0';

    if (isVersionLower(currentVersion, minSupportedVersion)) {
      Alert.alert(
        'Update Required',
        config?.force_update_message ||
          `This app version (${currentVersion}) is no longer supported. Please update to continue.`,
        [
          {
            text: 'Update App',
            onPress: () => openStoreUrl(config?.android_store_url || Constants.expoConfig?.extra?.androidStoreUrl),
          },
        ],
        { cancelable: false }
      );

      return {
        compatible: false,
        currentVersion,
        minSupportedVersion,
      };
    }

    return {
      compatible: true,
      currentVersion,
      minSupportedVersion,
    };
  } catch (error) {
    console.log('[Update] Backend compatibility check skipped:', error?.message || error);
    return {
      compatible: true,
      skipped: true,
      reason: 'config_unavailable',
    };
  }
};
