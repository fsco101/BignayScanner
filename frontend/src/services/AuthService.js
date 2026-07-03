// Authentication Service
// Handles login, registration, and token management

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, getDefaultApiHeaders } from '../config/api';

const TOKEN_KEY = '@bignay_auth_token';
const USER_KEY = '@bignay_user';

// Helper function to make API requests with timeout and auto URL fallback
const makeRequest = async (endpoint, options = {}, tryFallback = true) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
  
  const url = `${API_CONFIG.BASE_URL}${endpoint}`;
  
  try {
    console.log(`[AuthService] ${options.method || 'GET'} ${url}`);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: getDefaultApiHeaders({
        'Content-Type': 'application/json',
        ...options.headers,
      }),
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - server took too long to respond');
    }
    
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - server took too long to respond');
    }
    throw error;
  }
};

export const AuthService = {
  // Store auth token
  async setToken(token) {
    try {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      console.error('Error storing token:', error);
    }
  },

  // Get stored token
  async getToken() {
    try {
      return await AsyncStorage.getItem(TOKEN_KEY);
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  },

  // Remove token (logout)
  async removeToken() {
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(USER_KEY);
    } catch (error) {
      console.error('Error removing token:', error);
    }
  },

  // Store user data
  async setUser(user) {
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (error) {
      console.error('Error storing user:', error);
    }
  },

  // Get stored user
  async getUser() {
    try {
      const userData = await AsyncStorage.getItem(USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  },

  // Login
  async login(email, password) {
    try {
      const response = await makeRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.ok) {
        await this.setToken(data.token);
        await this.setUser(data.user);
      }

      return data;
    } catch (error) {
      console.error('Login error:', error);
      // More specific error messages based on error type
      let errorMessage;
      if (error.message.includes('timeout')) {
        errorMessage = 'Server is not responding. Please try again.';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorMessage = 'Cannot connect to server. Please check if the backend is running.';
      } else {
        errorMessage = `Login failed: ${error.message}`;
      }
      return { ok: false, error: errorMessage };
    }
  },

  // Register
  async register(userData) {
    try {
      const response = await makeRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (data.ok) {
        await this.setToken(data.token);
        await this.setUser(data.user);
      }

      return data;
    } catch (error) {
      console.error('Registration error:', error);
      // More specific error messages based on error type
      let errorMessage;
      if (error.message.includes('timeout')) {
        errorMessage = 'Server is not responding. Please try again.';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorMessage = 'Cannot connect to server. Please check if the backend is running.';
      } else {
        errorMessage = `Registration failed: ${error.message}`;
      }
      return { ok: false, error: errorMessage };
    }
  },

  // Logout
  async logout() {
    try {
      const token = await this.getToken();
      if (token) {
        try {
          await makeRequest('/api/auth/logout', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
        } catch (e) {
          // Ignore logout errors - we'll clear local data anyway
        }
      }
      await this.removeToken();
      return { ok: true };
    } catch (error) {
      console.error('Logout error:', error);
      await this.removeToken();
      return { ok: true };
    }
  },

  // Verify token and get current user
  async verifyToken() {
    try {
      const token = await this.getToken();
      if (!token) {
        return { ok: false, error: 'No token found' };
      }

      const response = await makeRequest('/api/auth/verify', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.ok) {
        await this.setUser(data.user);
      } else {
        await this.removeToken();
      }

      return data;
    } catch (error) {
      console.error('Token verification error:', error);
      return { ok: false, error: 'Network error' };
    }
  },

  // Change password
  async changePassword(currentPassword, newPassword) {
    try {
      const token = await this.getToken();
      const response = await makeRequest('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });

      return await response.json();
    } catch (error) {
      console.error('Change password error:', error);
      return { ok: false, error: 'Network error' };
    }
  },

  // Update profile
  async updateProfile(profileData) {
    try {
      const token = await this.getToken();
      const response = await makeRequest('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(profileData),
      });

      const data = await response.json();

      if (data.ok) {
        await this.setUser(data.user);
      }

      return data;
    } catch (error) {
      console.error('Update profile error:', error);
      return { ok: false, error: 'Network error' };
    }
  },

  // Get profile
  async getProfile() {
    try {
      const token = await this.getToken();
      const response = await makeRequest('/api/users/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return await response.json();
    } catch (error) {
      console.error('Get profile error:', error);
      return { ok: false, error: 'Network error' };
    }
  },

  // Update profile image (upload to Cloudinary via backend)
  async updateProfileImage(base64Image) {
    try {
      const token = await this.getToken();
      const response = await makeRequest('/api/users/profile/image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ image: base64Image }),
      });

      const data = await response.json();

      if (data.ok) {
        // Update stored user with new image
        const user = await this.getUser();
        if (user) {
          user.profile_image = data.image_url;
          await this.setUser(user);
        }
      }

      return data;
    } catch (error) {
      console.error('Update profile image error:', error);
      return { ok: false, error: 'Network error' };
    }
  },

  // Check if user is authenticated
  async isAuthenticated() {
    const token = await this.getToken();
    return !!token;
  },

  // Check if user is admin
  async isAdmin() {
    const user = await this.getUser();
    return user?.role === 'admin';
  },

  // ──────────────────────────────────────────
  // Email Verification (Registration)
  // ──────────────────────────────────────────

  // Check if email is already registered
  async checkEmailExists(email) {
    try {
      const response = await makeRequest('/api/auth/check-email', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      return await response.json();
    } catch (error) {
      console.error('Check email error:', error);
      return { ok: false, error: 'Unable to verify email. Please try again.' };
    }
  },

  // Send verification code for registration
  async sendVerificationCode(userData) {
    try {
      const response = await makeRequest('/api/auth/send-verification', {
        method: 'POST',
        body: JSON.stringify(userData),
      });
      return await response.json();
    } catch (error) {
      console.error('Send verification error:', error);
      let errorMessage;
      if (error.message.includes('timeout')) {
        errorMessage = 'Server is not responding. Please try again.';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorMessage = 'Cannot connect to server. Please check if the backend is running.';
      } else {
        errorMessage = error.message || 'Failed to send verification code.';
      }
      return { ok: false, error: errorMessage };
    }
  },

  // Verify code and complete registration
  async verifyCodeAndRegister(email, code) {
    try {
      const response = await makeRequest('/api/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json();
      if (data.ok) {
        await this.setToken(data.token);
        await this.setUser(data.user);
      }
      return data;
    } catch (error) {
      console.error('Verify code error:', error);
      return { ok: false, error: error.message || 'Verification failed.' };
    }
  },

  // ──────────────────────────────────────────
  // Password Reset
  // ──────────────────────────────────────────

  // Request password reset code
  async forgotPassword(email) {
    try {
      const response = await makeRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      return await response.json();
    } catch (error) {
      console.error('Forgot password error:', error);
      let errorMessage;
      if (error.message.includes('timeout')) {
        errorMessage = 'Server is not responding. Please try again.';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorMessage = 'Cannot connect to server.';
      } else {
        errorMessage = error.message || 'Failed to send reset code.';
      }
      return { ok: false, error: errorMessage };
    }
  },

  // Verify reset code
  async verifyResetCode(email, code) {
    try {
      const response = await makeRequest('/api/auth/verify-reset-code', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      });
      return await response.json();
    } catch (error) {
      console.error('Verify reset code error:', error);
      return { ok: false, error: error.message || 'Verification failed.' };
    }
  },

  // Reset password with verified code
  async resetPassword(email, code, newPassword) {
    try {
      const response = await makeRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, new_password: newPassword }),
      });
      return await response.json();
    } catch (error) {
      console.error('Reset password error:', error);
      return { ok: false, error: error.message || 'Password reset failed.' };
    }
  },
};

export default AuthService;
