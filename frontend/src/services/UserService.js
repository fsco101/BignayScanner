// User Service
// Handles admin user management operations

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, getDefaultApiHeaders } from '../config/api';

const TOKEN_KEY = '@bignay_auth_token';

// Helper function to make API requests with timeout and auto URL fallback
const makeRequest = async (endpoint, options = {}, tryFallback = true) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
  
  const url = `${API_CONFIG.BASE_URL}${endpoint}`;
  
  try {
    console.log(`[UserService] ${options.method || 'GET'} ${url}`);
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

// Get auth token
const getAuthHeaders = async () => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

export const UserService = {
  // Get all users (admin only)
  async getUsers(page = 1, limit = 20, role = null, search = '') {
    try {
      const headers = await getAuthHeaders();
      let endpoint = `/api/users/?page=${page}&limit=${limit}`;
      
      if (role) {
        endpoint += `&role=${role}`;
      }
      if (search) {
        endpoint += `&search=${encodeURIComponent(search)}`;
      }
      
      const response = await makeRequest(endpoint, {
        method: 'GET',
        headers,
      });
      
      return await response.json();
    } catch (error) {
      console.error('[UserService] getUsers error:', error);
      return { ok: false, error: error.message };
    }
  },

  // Get single user by ID (admin only)
  async getUser(userId) {
    try {
      const headers = await getAuthHeaders();
      const response = await makeRequest(`/api/users/${userId}`, {
        method: 'GET',
        headers,
      });
      
      return await response.json();
    } catch (error) {
      console.error('[UserService] getUser error:', error);
      return { ok: false, error: error.message };
    }
  },

  // Get suspension types
  async getSuspensionTypes() {
    try {
      const headers = await getAuthHeaders();
      const response = await makeRequest('/api/users/suspension-types', {
        method: 'GET',
        headers,
      });
      
      return await response.json();
    } catch (error) {
      console.error('[UserService] getSuspensionTypes error:', error);
      return { ok: false, error: error.message };
    }
  },

  // Suspend a user (admin only)
  async suspendUser(userId, suspensionType, reason) {
    try {
      const headers = await getAuthHeaders();
      const response = await makeRequest(`/api/users/${userId}/suspend`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          suspension_type: suspensionType,
          reason: reason,
        }),
      });
      
      return await response.json();
    } catch (error) {
      console.error('[UserService] suspendUser error:', error);
      return { ok: false, error: error.message };
    }
  },

  // Unsuspend/lift suspension (admin only)
  async unsuspendUser(userId) {
    try {
      const headers = await getAuthHeaders();
      const response = await makeRequest(`/api/users/${userId}/unsuspend`, {
        method: 'POST',
        headers,
      });
      
      return await response.json();
    } catch (error) {
      console.error('[UserService] unsuspendUser error:', error);
      return { ok: false, error: error.message };
    }
  },

  // Update user status (activate/deactivate) (admin only)
  async updateUserStatus(userId, isActive) {
    try {
      const headers = await getAuthHeaders();
      const response = await makeRequest(`/api/users/${userId}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ is_active: isActive }),
      });
      
      return await response.json();
    } catch (error) {
      console.error('[UserService] updateUserStatus error:', error);
      return { ok: false, error: error.message };
    }
  },

  // Update user role (admin only)
  async updateUserRole(userId, role) {
    try {
      const headers = await getAuthHeaders();
      const response = await makeRequest(`/api/users/${userId}/role`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ role }),
      });
      
      return await response.json();
    } catch (error) {
      console.error('[UserService] updateUserRole error:', error);
      return { ok: false, error: error.message };
    }
  },
};

export default UserService;
