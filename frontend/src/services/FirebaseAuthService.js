// Firebase Authentication Service
// Handles Firebase authentication for Google, Email/Password, and other providers
// Compatible with Expo and React Native

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { API_CONFIG } from '../config/api';
import firebaseConfig, { isFirebaseConfigured } from '../config/firebase';

// Complete auth session for web
WebBrowser.maybeCompleteAuthSession();

// Firebase Auth REST API endpoints
const FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1';
const FIREBASE_SECURETOKEN_URL = 'https://securetoken.googleapis.com/v1';

// Google OAuth Discovery Document
const googleDiscovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
};

const GOOGLE_CLIENT_IDS = {
  web: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || '',
  android: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || '',
  ios: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '',
};

const EXPO_OWNER = process.env.EXPO_PUBLIC_EXPO_OWNER || 'chunmaru';
const EXPO_SLUG = process.env.EXPO_PUBLIC_EXPO_SLUG || 'bignay-scanner';
const EXPO_PROJECT_NAME_FOR_PROXY = `@${EXPO_OWNER}/${EXPO_SLUG}`;
const GOOGLE_REDIRECT_URI_WEB = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI_WEB || '';
const GOOGLE_REDIRECT_URI_NATIVE = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI_NATIVE || '';

const isUsableClientId = (clientId) => {
  return !!clientId && !clientId.includes('xxxxxxxx');
};

const getGoogleClientIdForPlatform = () => {
  if (Platform.OS === 'android' && isUsableClientId(GOOGLE_CLIENT_IDS.android)) {
    return GOOGLE_CLIENT_IDS.android;
  }
  if (Platform.OS === 'ios' && isUsableClientId(GOOGLE_CLIENT_IDS.ios)) {
    return GOOGLE_CLIENT_IDS.ios;
  }
  if (isUsableClientId(GOOGLE_CLIENT_IDS.web)) {
    return GOOGLE_CLIENT_IDS.web;
  }
  return '';
};

const getGoogleRedirectUri = () => {
  if (Platform.OS === 'web') {
    if (GOOGLE_REDIRECT_URI_WEB) {
      return GOOGLE_REDIRECT_URI_WEB;
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return AuthSession.makeRedirectUri({ preferLocalhost: false });
  }

  if (GOOGLE_REDIRECT_URI_NATIVE) {
    return GOOGLE_REDIRECT_URI_NATIVE;
  }

  return `https://auth.expo.io/${EXPO_PROJECT_NAME_FOR_PROXY}`;
};

/**
 * Firebase Authentication Service
 * Supports Google Sign-In, Email/Password, and more
 */
export const FirebaseAuthService = {
  /**
   * Check if Firebase is configured
   */
  isConfigured() {
    return isFirebaseConfigured();
  },

  /**
   * Sign in with Email and Password using Firebase
   */
  async signInWithEmailPassword(email, password) {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Firebase is not configured' };
    }

    try {
      const response = await fetch(
        `${FIREBASE_AUTH_URL}/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          ok: false,
          error: this._parseFirebaseError(data.error?.message),
        };
      }

      // Authenticate with our backend
      return await this._authenticateWithBackend({
        firebaseUid: data.localId,
        email: data.email,
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        provider: 'password',
      });
    } catch (error) {
      console.error('[FirebaseAuth] Sign in error:', error);
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  /**
   * Sign up with Email and Password using Firebase
   */
  async signUpWithEmailPassword(email, password, displayName = '') {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Firebase is not configured' };
    }

    try {
      // Create account
      const response = await fetch(
        `${FIREBASE_AUTH_URL}/accounts:signUp?key=${firebaseConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          ok: false,
          error: this._parseFirebaseError(data.error?.message),
        };
      }

      // Update display name if provided
      if (displayName && data.idToken) {
        await this._updateProfile(data.idToken, { displayName });
      }

      // Send email verification
      await this._sendEmailVerification(data.idToken);

      return {
        ok: true,
        message: 'Account created. Please check your email to verify your account.',
        needsVerification: true,
        email: data.email,
      };
    } catch (error) {
      console.error('[FirebaseAuth] Sign up error:', error);
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  /**
   * Sign in with Google using Firebase
   * Uses AuthSession.AuthRequest (implicit token flow, no PKCE) so that
   * the redirect URI is generated correctly for web, Expo Go, and standalone.
   */
  async signInWithGoogle() {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Firebase is not configured' };
    }

    const googleClientId = getGoogleClientIdForPlatform();
    if (!googleClientId) {
      return { ok: false, error: 'Google Client ID is not configured for this platform' };
    }

    try {
      // Build redirect URI using Expo AuthSession for cross-platform correctness.
      // This generates the right URI for Expo Go, dev builds, and web automatically.
      // The `native` override is needed because Google OAuth only accepts http(s)
      // redirect URIs, not custom schemes like exp:// that Expo Go would generate.
      const redirectUri = getGoogleRedirectUri();

      console.log('\n' + '='.repeat(60));
      console.log('[FirebaseAuth] Platform:', Platform.OS);
      console.log('[FirebaseAuth] Redirect URI:', redirectUri);
      console.log('[FirebaseAuth] Client ID:', googleClientId);
      console.log('[FirebaseAuth] >>> Register this EXACT redirect URI in');
      console.log('[FirebaseAuth] >>> Google Cloud Console > APIs & Services > Credentials');
      console.log('[FirebaseAuth] >>> Edit your OAuth 2.0 Client > Authorized redirect URIs');
      console.log('='.repeat(60) + '\n');

      // Use AuthSession.AuthRequest which handles redirect detection correctly
      // across web, Expo Go, and standalone builds. usePKCE: false avoids
      // code_challenge params that the implicit (token) flow does not need.
      const request = new AuthSession.AuthRequest({
        clientId: googleClientId,
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.Token,
        redirectUri,
        usePKCE: false,
        extraParams: { prompt: 'select_account' },
      });

      const result = await request.promptAsync({
        authorizationEndpoint: googleDiscovery.authorizationEndpoint,
      });

      console.log('[FirebaseAuth] Google auth result type:', result.type);

      if (result.type === 'success') {
        // AuthSession puts implicit-flow params in result.params
        const access_token = result.params?.access_token;

        if (!access_token) {
          return { ok: false, error: 'No access token received from Google' };
        }

        // Get Google user info
        const userInfoResponse = await fetch(googleDiscovery.userInfoEndpoint, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const userInfo = await userInfoResponse.json();

        console.log('[FirebaseAuth] Got Google user:', userInfo.email);

        // Sign in to Firebase with Google credential
        const firebaseResponse = await fetch(
          `${FIREBASE_AUTH_URL}/accounts:signInWithIdp?key=${firebaseConfig.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postBody: `access_token=${access_token}&providerId=google.com`,
              requestUri: redirectUri,
              returnIdpCredential: true,
              returnSecureToken: true,
            }),
          }
        );

        const firebaseData = await firebaseResponse.json();

        if (!firebaseResponse.ok) {
          return {
            ok: false,
            error: this._parseFirebaseError(firebaseData.error?.message),
          };
        }

        // Authenticate with our backend
        // Send Google access_token as fallback for servers without Firebase Admin SDK
        return await this._authenticateWithBackend({
          firebaseUid: firebaseData.localId,
          email: firebaseData.email || userInfo.email,
          firstName: userInfo.given_name || firebaseData.firstName || '',
          lastName: userInfo.family_name || firebaseData.lastName || '',
          profileImage: userInfo.picture || firebaseData.photoUrl || '',
          idToken: firebaseData.idToken,
          refreshToken: firebaseData.refreshToken,
          provider: 'google.com',
          googleAccessToken: access_token,
        });
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        return { ok: false, error: 'Sign in was cancelled' };
      } else {
        return { ok: false, error: 'Authentication failed. Please try again.' };
      }
    } catch (error) {
      console.error('[FirebaseAuth] Google sign in error:', error);
      return { ok: false, error: 'Failed to sign in with Google: ' + error.message };
    }
  },

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email) {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Firebase is not configured' };
    }

    try {
      const response = await fetch(
        `${FIREBASE_AUTH_URL}/accounts:sendOobCode?key=${firebaseConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestType: 'PASSWORD_RESET',
            email,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          ok: false,
          error: this._parseFirebaseError(data.error?.message),
        };
      }

      return {
        ok: true,
        message: 'Password reset email sent. Please check your inbox.',
      };
    } catch (error) {
      console.error('[FirebaseAuth] Password reset error:', error);
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  /**
   * Refresh the ID token
   */
  async refreshToken(refreshToken) {
    if (!this.isConfigured() || !refreshToken) {
      return null;
    }

    try {
      const response = await fetch(
        `${FIREBASE_SECURETOKEN_URL}/token?key=${firebaseConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return null;
      }

      return {
        idToken: data.id_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };
    } catch (error) {
      console.error('[FirebaseAuth] Token refresh error:', error);
      return null;
    }
  },

  /**
   * Get current user from stored tokens
   */
  async getCurrentUser() {
    try {
      const firebaseTokens = await AsyncStorage.getItem('@bignay_firebase_tokens');
      if (!firebaseTokens) return null;

      const tokens = JSON.parse(firebaseTokens);
      
      // Check if token needs refresh (tokens expire after 1 hour)
      const tokenAge = Date.now() - (tokens.issuedAt || 0);
      if (tokenAge > 55 * 60 * 1000) { // 55 minutes
        const refreshed = await this.refreshToken(tokens.refreshToken);
        if (refreshed) {
          const newTokens = {
            ...tokens,
            idToken: refreshed.idToken,
            refreshToken: refreshed.refreshToken,
            issuedAt: Date.now(),
          };
          await AsyncStorage.setItem('@bignay_firebase_tokens', JSON.stringify(newTokens));
          return newTokens;
        }
        return null;
      }

      return tokens;
    } catch (error) {
      console.error('[FirebaseAuth] Get current user error:', error);
      return null;
    }
  },

  /**
   * Sign out
   */
  async signOut() {
    try {
      await AsyncStorage.removeItem('@bignay_firebase_tokens');
      await AsyncStorage.removeItem('@bignay_auth_token');
      await AsyncStorage.removeItem('@bignay_user_data');
      return { ok: true };
    } catch (error) {
      console.error('[FirebaseAuth] Sign out error:', error);
      return { ok: false, error: 'Failed to sign out' };
    }
  },

  // =====================
  // Private helper methods
  // =====================

  async _authenticateWithBackend(userData) {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/auth/firebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      const result = await response.json();

      if (result.ok) {
        // Store tokens
        await AsyncStorage.setItem('@bignay_auth_token', result.token);
        await AsyncStorage.setItem('@bignay_user_data', JSON.stringify(result.user));
        
        // Store Firebase tokens for refresh
        await AsyncStorage.setItem(
          '@bignay_firebase_tokens',
          JSON.stringify({
            idToken: userData.idToken,
            refreshToken: userData.refreshToken,
            issuedAt: Date.now(),
            provider: userData.provider,
          })
        );
      }

      return result;
    } catch (error) {
      console.error('[FirebaseAuth] Backend auth error:', error);
      return { ok: false, error: 'Failed to authenticate with server' };
    }
  },

  async _updateProfile(idToken, { displayName, photoUrl }) {
    try {
      await fetch(
        `${FIREBASE_AUTH_URL}/accounts:update?key=${firebaseConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            displayName,
            photoUrl,
            returnSecureToken: false,
          }),
        }
      );
    } catch (error) {
      console.error('[FirebaseAuth] Update profile error:', error);
    }
  },

  async _sendEmailVerification(idToken) {
    try {
      await fetch(
        `${FIREBASE_AUTH_URL}/accounts:sendOobCode?key=${firebaseConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestType: 'VERIFY_EMAIL',
            idToken,
          }),
        }
      );
    } catch (error) {
      console.error('[FirebaseAuth] Send verification error:', error);
    }
  },

  _parseFirebaseError(errorCode) {
    const errorMessages = {
      'EMAIL_NOT_FOUND': 'No account found with this email address.',
      'INVALID_PASSWORD': 'Incorrect password. Please try again.',
      'INVALID_LOGIN_CREDENTIALS': 'Invalid email or password.',
      'USER_DISABLED': 'This account has been disabled.',
      'EMAIL_EXISTS': 'An account with this email already exists.',
      'WEAK_PASSWORD': 'Password should be at least 6 characters.',
      'TOO_MANY_ATTEMPTS_TRY_LATER': 'Too many failed attempts. Please try again later.',
      'OPERATION_NOT_ALLOWED': 'This sign-in method is not enabled.',
      'INVALID_EMAIL': 'Please enter a valid email address.',
    };

    return errorMessages[errorCode] || 'Authentication failed. Please try again.';
  },
};

export default FirebaseAuthService;
