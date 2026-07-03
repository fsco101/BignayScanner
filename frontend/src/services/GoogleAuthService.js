// Google Authentication Service
// Handles Google Sign-In using expo-web-browser

import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { API_CONFIG } from '../config/api';

// Complete auth session for web
WebBrowser.maybeCompleteAuthSession();

// Google OAuth configuration
const GOOGLE_CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || '';

// Discovery document for Google
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
};

/**
 * Get user info from Google using access token
 */
const getUserInfo = async (accessToken) => {
  try {
    const response = await fetch(discovery.userInfoEndpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching Google user info:', error);
    throw error;
  }
};

/**
 * Generate a random string for state parameter
 */
const generateState = () => {
  const array = new Uint32Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < 4; i++) {
      array[i] = Math.floor(Math.random() * 0xFFFFFFFF);
    }
  }
  return Array.from(array, x => x.toString(16).padStart(8, '0')).join('');
};

/**
 * Get redirect URI based on platform
 */
const getRedirectUri = () => {
  if (Platform.OS === 'web') {
    // For web, use the current origin
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/auth/callback`;
    }
    return 'http://localhost:5000/auth/callback';
  }
  // For native apps
  return 'bignay://auth/callback';
};

/**
 * Google Auth Service
 */
export const GoogleAuthService = {
  /**
   * Get the appropriate client ID based on platform
   */
  getClientId() {
    return GOOGLE_CLIENT_ID_WEB;
  },

  /**
   * Sign in with Google - returns user data and tokens
   */
  async signIn() {
    if (!this.isConfigured()) {
      return { 
        ok: false, 
        error: 'Google Sign-In is not configured. Please set EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB in your environment.' 
      };
    }

    try {
      const clientId = this.getClientId();
      const redirectUri = getRedirectUri();
      const state = generateState();
      
      // Build authorization URL
      const authUrl = new URL(discovery.authorizationEndpoint);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'token');
      authUrl.searchParams.set('scope', 'openid profile email');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('prompt', 'select_account');

      console.log('[GoogleAuth] Starting auth with URL:', authUrl.toString());

      // Open browser for authentication
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl.toString(),
        redirectUri
      );

      console.log('[GoogleAuth] Auth result type:', result.type);

      if (result.type === 'success' && result.url) {
        // Parse the URL to get the access token
        const url = new URL(result.url);
        const hashParams = new URLSearchParams(url.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        
        if (!accessToken) {
          return { ok: false, error: 'No access token received from Google' };
        }

        // Get user info from Google
        const userInfo = await getUserInfo(accessToken);
        
        console.log('[GoogleAuth] Got user info:', userInfo.email);

        // Send to backend for verification/registration
        const backendResult = await this.authenticateWithBackend({
          googleId: userInfo.sub,
          email: userInfo.email,
          firstName: userInfo.given_name || '',
          lastName: userInfo.family_name || '',
          profileImage: userInfo.picture || '',
          accessToken: accessToken,
        });

        return backendResult;
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        return { ok: false, error: 'Sign in was cancelled' };
      } else {
        return { ok: false, error: 'Authentication failed. Please try again.' };
      }
    } catch (error) {
      console.error('[GoogleAuth] Sign in error:', error);
      return { ok: false, error: error.message || 'Google sign in failed' };
    }
  },

  /**
   * Authenticate with backend using Google credentials
   */
  async authenticateWithBackend(googleData) {
    try {
      console.log('[GoogleAuth] Authenticating with backend...');
      
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          google_id: googleData.googleId,
          email: googleData.email,
          first_name: googleData.firstName,
          last_name: googleData.lastName,
          profile_image: googleData.profileImage,
          access_token: googleData.accessToken,
        }),
      });

      const data = await response.json();
      
      console.log('[GoogleAuth] Backend response:', data.ok ? 'Success' : data.error);

      return data;
    } catch (error) {
      console.error('[GoogleAuth] Backend auth error:', error);
      return { 
        ok: false, 
        error: 'Failed to connect to server. Please try again.' 
      };
    }
  },

  /**
   * Check if Google Sign-In is configured
   */
  isConfigured() {
    return Boolean(GOOGLE_CLIENT_ID_WEB);
  },
};

export default GoogleAuthService;
