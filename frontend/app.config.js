// Dynamic Expo configuration
// This file allows us to use environment variables in our app

export default ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID || config?.extra?.eas?.projectId;

  return {
    ...config,
    scheme: process.env.EXPO_SCHEME || config?.scheme || 'bignay',
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      ...config.updates,
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
    },
    android: {
      ...config.android,
      package: process.env.EXPO_ANDROID_PACKAGE || config?.android?.package || 'com.expo.bignayscanner',
      versionCode: Number(process.env.EXPO_ANDROID_VERSION_CODE || config?.android?.versionCode || 1),
    },
    extra: {
      ...config.extra,
      // API URL from environment variable
      apiUrl: process.env.EXPO_PUBLIC_API_URL || null,
      // Local network API URL for same-WiFi development
      localApiUrl: process.env.EXPO_PUBLIC_LOCAL_API_URL || null,
      // Optional direct APK or Play Store URL used for forced updates
      androidStoreUrl: process.env.EXPO_PUBLIC_ANDROID_STORE_URL || null,
      // Enable development features
      eas: {
        projectId: projectId || undefined,
      },
    },
    // Ensure proper web support
    web: {
      ...config.web,
      bundler: "metro",
      output: "single",
    },
  };
};
