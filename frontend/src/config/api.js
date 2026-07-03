// API Configuration for Bignay ML
// This file handles API connectivity for both emulator and physical devices

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PORT = 5000;
const STORAGE_KEY = '@bignay_working_api_url';
// Platform-specific storage key to avoid cross-platform URL conflicts
const getStorageKey = () => `${STORAGE_KEY}_${Platform.OS}`;

const PRODUCTION_BACKEND_URL = null;

// Detect if running inside Expo Go (development client on device)
const isExpoGo = Constants.appOwnership === 'expo'
  || Constants.executionEnvironment === 'storeClient';

// Get environment variables (Expo public env vars)
// On web, these are baked in at build time so we skip them
// and use the same-origin URL from window.location instead.
const getEnvApiUrl = () => {
  // Allow EXPO_PUBLIC_API_URL to override web same-origin logic
  if (Platform.OS === 'web' && !process.env.EXPO_PUBLIC_API_URL) return null;
  const envUrl = Constants.expoConfig?.extra?.apiUrl 
    || process.env.EXPO_PUBLIC_API_URL 
    || null;
  return envUrl;
};

// Get local network API URL from env (for same-WiFi development)
const getEnvLocalApiUrl = () => {
  if (Platform.OS === 'web') return null;
  return process.env.EXPO_PUBLIC_LOCAL_API_URL || null;
};

// Get the actual backend URL for direct connections (e.g. WebSocket)
export const getBackendUrl = () => {
  if (Platform.OS === 'web') {
    const webUrl = getWebApiUrl();
    if (webUrl) return webUrl;
  }
  // In Expo Go, auto-detect backend IP from debugger host
  if (isExpoGo) {
    const autoUrl = getAutoDetectedBackendUrl();
    if (autoUrl) return autoUrl;
    const localEnvUrl = getEnvLocalApiUrl();
    if (localEnvUrl) return localEnvUrl;
  }
  const envUrl = getEnvApiUrl();
  if (envUrl) return envUrl;
  const localEnvUrl = getEnvLocalApiUrl();
  if (localEnvUrl) return localEnvUrl;
  return `http://localhost:${PORT}`;
};

// Get the current web base URL for API (same origin to avoid CORS issues)
const getWebApiUrl = () => {
  if (Platform.OS !== 'web') return null;
  
  try {
    // In browser environment, use window.location to build same-origin API URL
    if (typeof window !== 'undefined' && window.location) {
      const { protocol, hostname, port } = window.location;
      
      // Use same origin: when served through a reverse proxy / tunnel (e.g. ngrok),
      // the page is already on the backend's origin so we must NOT hardcode :5000.
      // For local dev (localhost with separate ports), fall back to the backend port.
      const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
      const apiUrl = isLocalDev
        ? `${protocol}//${hostname}:${PORT}`
        : `${protocol}//${hostname}${port ? ':' + port : ''}`;
      console.log(`[API] Web platform - Frontend hostname: ${hostname}, API URL: ${apiUrl}`);
      
      // Store for debugging
      if (typeof window !== 'undefined') {
        window.__BIGNAY_API_URL = apiUrl;
        window.__BIGNAY_FRONTEND_HOST = hostname;
      }
      
      return apiUrl;
    }
  } catch (e) {
    console.log('[API] Could not get web hostname:', e);
  }
  return `http://localhost:${PORT}`;
};

// Get the local IP address dynamically from Expo's debugger host
const getLocalIP = () => {
  // Try to get from Expo manifest (works with Expo Go)
  const debuggerHost = Constants.expoConfig?.hostUri 
    || Constants.manifest?.debuggerHost
    || Constants.manifest2?.extra?.expoGo?.debuggerHost;
  
  if (debuggerHost) {
    const ip = debuggerHost.split(':')[0];
    if (ip && ip !== 'localhost') {
      return ip;
    }
  }
  
  return null;
};

const LOCAL_IP = getLocalIP();

// Build a dynamic backend URL from Expo Go's detected IP
const getAutoDetectedBackendUrl = () => {
  if (LOCAL_IP) {
    return `http://${LOCAL_IP}:${PORT}`;
  }
  return null;
};

// Default request headers for all API calls
// The ngrok header avoids browser warning/interstitial on free tier tunnels
export const getDefaultApiHeaders = (headers = {}) => ({
  'Accept': 'application/json',
  'ngrok-skip-browser-warning': 'true',
  ...headers,
});

// All possible URLs to try (in order of preference)
const getPossibleUrls = () => {
  const urls = [];

  // In Expo Go, auto-detected backend URL comes first
  if (isExpoGo) {
    const autoUrl = getAutoDetectedBackendUrl();
    if (autoUrl) {
      urls.push(autoUrl);
    }
    const localEnvUrl = getEnvLocalApiUrl();
    if (localEnvUrl && !urls.includes(localEnvUrl)) {
      urls.push(localEnvUrl);
    }
  }
  
  // Environment variable URL (e.g., ngrok tunnel or production)
  const envUrl = getEnvApiUrl();
  if (envUrl && !urls.includes(envUrl)) {
    urls.push(envUrl);
  }
  
  // Local network URL from env (if not already added)
  const localEnvUrl = getEnvLocalApiUrl();
  if (localEnvUrl && !urls.includes(localEnvUrl)) {
    urls.push(localEnvUrl);
  }
  
  // For Android
  if (Platform.OS === 'android') {
    // Emulator special IP (10.0.2.2 maps to host's localhost)
    urls.push(`http://10.0.2.2:${PORT}`);
    // Local network IP for physical devices
    if (LOCAL_IP) {
      urls.push(`http://${LOCAL_IP}:${PORT}`);
    }
    // Localhost
    urls.push(`http://localhost:${PORT}`);
  }
  // For iOS
  else if (Platform.OS === 'ios') {
    urls.push(`http://localhost:${PORT}`);
    if (LOCAL_IP) {
      urls.push(`http://${LOCAL_IP}:${PORT}`);
    }
  }
  // For Web
  else {
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (envUrl && !urls.includes(envUrl)) {
      urls.push(envUrl);
    }
    const webApiUrl = getWebApiUrl();
    if (webApiUrl && !urls.includes(webApiUrl)) {
      urls.push(webApiUrl);
    }
    const localhostUrl = `http://localhost:${PORT}`;
    if (!urls.includes(localhostUrl)) {
      urls.push(localhostUrl);
    }
  }
  // Remove duplicate URLs
  return [...new Set(urls)];
};

// Cached working URL
let _cachedWorkingUrl = null;

// Get or detect the working URL
const getWorkingUrl = async () => {
  // Return cached URL if available (set by initializeApi)
  if (_cachedWorkingUrl) {
    return _cachedWorkingUrl;
  }
  
  // Try to load previously working URL from storage (mobile only)
  try {
    const savedUrl = await AsyncStorage.getItem(getStorageKey());
    if (savedUrl) {
      _cachedWorkingUrl = savedUrl;
      return savedUrl;
    }
  } catch (e) {
    console.log('Could not load saved URL');
  }
  
  // Return default based on platform
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${PORT}`;
  } else if (Platform.OS === 'ios') {
    return `http://localhost:${PORT}`;
  }
  return `http://localhost:${PORT}`;
};

// Set the working URL (call this after successful connection)
const setWorkingUrl = async (url) => {
  _cachedWorkingUrl = url;
  try {
    await AsyncStorage.setItem(getStorageKey(), url);
  } catch (e) {
    console.log('Could not save working URL');
  }
};

// Clear cached URL (useful for debugging)
const clearCachedUrl = async () => {
  _cachedWorkingUrl = null;
  try {
    await AsyncStorage.removeItem(getStorageKey());
  } catch (e) {
    console.log('Could not clear cached URL');
  }
};

// Synchronous URL getter (uses cached or default)
const getBaseUrl = () => {
  // For web, use env var if available, otherwise derive from window location
  if (Platform.OS === 'web') {
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    const url = envUrl || getWebApiUrl();
    
    if (typeof window !== 'undefined' && !window.__apiUrlLogged) {
      console.warn(`[API DEBUG] process.env.EXPO_PUBLIC_API_URL is currently: "${envUrl}"`);
      console.log(`[API] getBaseUrl() returning: ${url}`);
      window.__apiUrlLogged = true;
    }
    return url;
  }

  // In Expo Go (development on device), auto-detect the backend IP from
  // Expo's debugger host so the URL always matches the current network.
  if (isExpoGo) {
    const autoUrl = getAutoDetectedBackendUrl();
    if (autoUrl) {
      return autoUrl;
    }
    // Fall back to .env value if auto-detection failed
    const localEnvUrl = getEnvLocalApiUrl();
    if (localEnvUrl) {
      return localEnvUrl;
    }
  }

  // Env variable (ngrok / production URL) — top priority for standalone builds
  const envUrl = getEnvApiUrl();
  if (envUrl) {
    return envUrl;
  }

  // Local network URL from env (fallback)
  const localEnvUrl = getEnvLocalApiUrl();
  if (localEnvUrl) {
    return localEnvUrl;
  }

  // Use cached URL if initializeApi() already found a working one
  if (_cachedWorkingUrl) {
    return _cachedWorkingUrl;
  }
  
  // Default based on platform
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${PORT}`;
  }
  return `http://localhost:${PORT}`;
};

// Debug function - can be called from browser console as window.debugBignayApi()
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.debugBignayApi = async () => {
    const currentUrl = getBaseUrl();
    console.log('=== Bignay API Debug ===');
    console.log('Frontend URL:', window.location.href);
    console.log('Frontend hostname:', window.location.hostname);
    console.log('API URL being used:', currentUrl);
    console.log('Cached URL:', _cachedWorkingUrl);
    
    console.log('\nTesting API connection...');
    try {
      const response = await fetch(`${currentUrl}/health`);
      const data = await response.json();
      console.log('✓ API Response:', data);
    } catch (error) {
      console.log('✗ API Error:', error.message);
    }
    console.log('========================');
    
    return { 
      frontendUrl: window.location.href,
      apiUrl: currentUrl,
      cached: _cachedWorkingUrl 
    };
  };
}

// API Configuration
export const API_CONFIG = {
  // Dynamic base URL based on platform and environment
  get BASE_URL() {
    return getBaseUrl();
  },
  
  // Set base URL manually
  setBaseUrl: setWorkingUrl,
  clearCachedUrl: clearCachedUrl,
  getPossibleUrls: getPossibleUrls,
  
  ENDPOINTS: {
    PREDICT: '/predict',
    CHECK_QUALITY: '/check-quality',
    HEALTH: '/health',
    APP_CONFIG: '/app-config',
    PREDICTIONS: '/predictions',
    PREDICTIONS_EXPORT_PDF: '/predictions/export-pdf',
    CHAT: '/chat',
    PRICE_PREDICTION: '/price-predict',
    // Auth endpoints
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    LOGOUT: '/api/auth/logout',
    VERIFY: '/api/auth/verify',
    SEND_VERIFICATION: '/api/auth/send-verification',
    VERIFY_CODE: '/api/auth/verify-code',
    FORGOT_PASSWORD: '/api/auth/forgot-password',
    VERIFY_RESET_CODE: '/api/auth/verify-reset-code',
    RESET_PASSWORD: '/api/auth/reset-password',
    // User endpoints
    PROFILE: '/api/users/profile',
    // Product endpoints
    PRODUCTS: '/api/products',
    CATEGORIES: '/api/products/categories',
    FEATURED: '/api/products/featured',
    // Order endpoints
    ORDERS: '/api/orders',
    // Review endpoints
    REVIEWS: '/api/reviews',
    // Training endpoints
    TRAINING_CONTRIBUTE: '/api/training/contribute',
    TRAINING_STATS: '/api/training/stats',
    TRAINING_INFO: '/api/training/info',
    // Heatmap / Harvest Map endpoints
    HEATMAP_PINS: '/api/heatmap/pins',
    HEATMAP_MY_PINS: '/api/heatmap/my-pins',
    HEATMAP_PIN_TYPES: '/api/heatmap/pin-types',
    HEATMAP_STATS: '/api/heatmap/stats',
  },
  
  TIMEOUT: 15000, // 15 seconds (reduced for faster fallback)
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 500, // 500ms between retries
};

// Helper function to build full URL
export const buildApiUrl = (endpoint, baseUrl = null) => {
  return `${baseUrl || API_CONFIG.BASE_URL}${endpoint}`;
};

// Find the best URL based on platform (no connectivity testing)
export const findWorkingUrl = async () => {
  const urls = getPossibleUrls();
  if (urls.length > 0) {
    await setWorkingUrl(urls[0]);
    return urls[0];
  }
  return null;
};

// Initialize API - call this on app start
export const initializeApi = async () => {
  // Determine the best URL based on platform without connectivity testing
  const url = getBaseUrl();
  _cachedWorkingUrl = url;
  console.log(`[API] Initialized with URL: ${url}`);
  return url;
};

// Legacy support
export const apiUrl = buildApiUrl;

// Subject types for classification
export const SUBJECT_TYPES = {
  FRUIT: 'fruit',
  LEAF: 'leaf',
};

// App theme colors - Professional green palette
export const COLORS = {
  primary: '#2E7D32',        // Dark green
  primaryLight: '#4CAF50',   // Medium green
  primaryDark: '#1B5E20',    // Darker green
  secondary: '#81C784',      // Light green
  accent: '#F59E0B',         // Amber
  danger: '#DC2626',         // Red
  warning: '#F59E0B',        // Amber warning
  info: '#2563EB',           // Blue
  success: '#16A34A',        // Success green
  
  // UI Colors
  background: '#F8FAF8',     // Light green-gray
  surface: '#FFFFFF',
  surfaceVariant: '#F0F4F0', // Very light green
  card: '#FFFFFF',
  
  // Text Colors
  text: '#1B1B1B',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  textOnPrimary: '#FFFFFF',
  
  // Border & Divider
  border: '#E5E7EB',
  divider: '#F0F0F0',
  
  // Status Colors
  online: '#16A34A',
  offline: '#9CA3AF',
  pending: '#F59E0B',
};

// Classification result mappings
export const QUALITY_COLORS = {
  good: COLORS.success,
  ok: COLORS.warning,
  reject: COLORS.danger,
};

export const RIPENESS_LABELS = {
  unripe: 'Unripe',
  ripe: 'Ripe', 
  overripe: 'Overripe',
};

// Recommendation icons
export const RECOMMENDATION_ICONS = {
  eat: '🍽️',
  jam: '🫙',
  wine: '🍷',
  vinegar: '🫗',
  discard: '🗑️',
  ferment: '🧪',
};

// API Request helper with timeout and retry logic
export const apiRequest = async (endpoint, options = {}, retryCount = 0) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
  
  try {
    const url = buildApiUrl(endpoint);
    console.log(`[API] ${options.method || 'GET'} ${url}`);
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: getDefaultApiHeaders({
        'Content-Type': 'application/json',
        ...options.headers,
      }),
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle abort/timeout
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - the server took too long to respond');
    }
    
    // Handle network errors with retry
    if (error.message === 'Network request failed' || error.message.includes('fetch')) {
      if (retryCount < API_CONFIG.RETRY_ATTEMPTS) {
        console.log(`[API] Retry attempt ${retryCount + 1}/${API_CONFIG.RETRY_ATTEMPTS}`);
        await new Promise(resolve => setTimeout(resolve, API_CONFIG.RETRY_DELAY));
        return apiRequest(endpoint, options, retryCount + 1);
      }
      throw new Error(`Cannot connect to server at ${API_CONFIG.BASE_URL}. Please ensure the backend is running.`);
    }
    
    throw error;
  }
};

// Check server health/connectivity
export const checkServerHealth = async () => {
  try {
    const response = await apiRequest(API_CONFIG.ENDPOINTS.HEALTH);
    return { connected: true, data: response };
  } catch (error) {
    return { connected: false, error: error.message };
  }
};

// Get current API configuration info (useful for debugging)
export const getApiInfo = () => ({
  baseUrl: API_CONFIG.BASE_URL,
  platform: require('react-native').Platform.OS,
  isDevice: Constants.isDevice,
  timeout: API_CONFIG.TIMEOUT,
});

export default API_CONFIG;
