// HeatMap / Harvest Map Service
// Handles all harvest-pin-related API calls

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, getDefaultApiHeaders } from '../config/api';

const getAuthHeader = async () => {
  const token = await AsyncStorage.getItem('@bignay_auth_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Helper function to make API requests with timeout
const makeRequest = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

  try {
    console.log(`[HeatMapService] ${options.method || 'GET'} ${url}`);
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
      throw new Error('Request timeout');
    }
    throw error;
  }
};

// Format error response
const formatError = (error) => {
  if (error.message.includes('timeout')) {
    return { ok: false, error: 'Server is not responding. Please try again.' };
  }
  return { ok: false, error: `Network error: Unable to connect to ${API_CONFIG.BASE_URL}` };
};

export const HeatMapService = {
  // ==================== PUBLIC METHODS ====================

  /**
   * Get all active harvest pins
   * @param {Object} params - { pin_type?, lat?, lng?, radius?, page?, limit? }
   */
  async getPins(params = {}) {
    try {
      const query = new URLSearchParams();
      if (params.pin_type) query.append('pin_type', params.pin_type);
      if (params.lat !== undefined) query.append('lat', params.lat);
      if (params.lng !== undefined) query.append('lng', params.lng);
      if (params.radius) query.append('radius', params.radius);
      if (params.page) query.append('page', params.page);
      if (params.limit) query.append('limit', params.limit);

      const queryStr = query.toString();
      const url = `${API_CONFIG.BASE_URL}/api/heatmap/pins${queryStr ? '?' + queryStr : ''}`;
      const response = await makeRequest(url);

      if (response.ok) {
        return await response.json();
      }

      const errorData = await response.json().catch(() => ({}));
      return { ok: false, error: errorData.error || `HTTP ${response.status}` };
    } catch (error) {
      return formatError(error);
    }
  },

  /**
   * Get a single pin by ID
   */
  async getPinDetail(pinId) {
    try {
      const url = `${API_CONFIG.BASE_URL}/api/heatmap/pins/${pinId}`;
      const response = await makeRequest(url);

      if (response.ok) {
        return await response.json();
      }

      const errorData = await response.json().catch(() => ({}));
      return { ok: false, error: errorData.error || `HTTP ${response.status}` };
    } catch (error) {
      return formatError(error);
    }
  },

  /**
   * Get available pin types
   */
  async getPinTypes() {
    try {
      const url = `${API_CONFIG.BASE_URL}/api/heatmap/pin-types`;
      const response = await makeRequest(url);

      if (response.ok) {
        return await response.json();
      }

      const errorData = await response.json().catch(() => ({}));
      return { ok: false, error: errorData.error || `HTTP ${response.status}` };
    } catch (error) {
      return formatError(error);
    }
  },

  /**
   * Get heatmap statistics
   */
  async getStats() {
    try {
      const url = `${API_CONFIG.BASE_URL}/api/heatmap/stats`;
      const response = await makeRequest(url);

      if (response.ok) {
        return await response.json();
      }

      const errorData = await response.json().catch(() => ({}));
      return { ok: false, error: errorData.error || `HTTP ${response.status}` };
    } catch (error) {
      return formatError(error);
    }
  },

  // ==================== AUTHENTICATED METHODS ====================

  /**
   * Create a new harvest pin
   * @param {Object} pinData - { latitude, longitude, pin_type, description?, place_name?, contact_person?, contact_details? }
   */
  async createPin(pinData) {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader.Authorization) {
        return { ok: false, error: 'Please log in to create a pin' };
      }

      const url = `${API_CONFIG.BASE_URL}/api/heatmap/pins`;
      const response = await makeRequest(url, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify(pinData),
      });

      if (response.ok) {
        return await response.json();
      }

      const errorData = await response.json().catch(() => ({}));
      return { ok: false, error: errorData.error || `HTTP ${response.status}`, details: errorData.details };
    } catch (error) {
      return formatError(error);
    }
  },

  /**
   * Update an existing pin
   */
  async updatePin(pinId, updateData) {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader.Authorization) {
        return { ok: false, error: 'Please log in to update a pin' };
      }

      const url = `${API_CONFIG.BASE_URL}/api/heatmap/pins/${pinId}`;
      const response = await makeRequest(url, {
        method: 'PUT',
        headers: authHeader,
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        return await response.json();
      }

      const errorData = await response.json().catch(() => ({}));
      return { ok: false, error: errorData.error || `HTTP ${response.status}` };
    } catch (error) {
      return formatError(error);
    }
  },

  /**
   * Delete a pin (soft delete)
   */
  async deletePin(pinId) {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader.Authorization) {
        return { ok: false, error: 'Please log in to delete a pin' };
      }

      const url = `${API_CONFIG.BASE_URL}/api/heatmap/pins/${pinId}`;
      const response = await makeRequest(url, {
        method: 'DELETE',
        headers: authHeader,
      });

      if (response.ok) {
        return await response.json();
      }

      const errorData = await response.json().catch(() => ({}));
      return { ok: false, error: errorData.error || `HTTP ${response.status}` };
    } catch (error) {
      return formatError(error);
    }
  },

  /**
   * Get pins created by the current user
   */
  async getMyPins() {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader.Authorization) {
        return { ok: false, error: 'Please log in to view your pins' };
      }

      const url = `${API_CONFIG.BASE_URL}/api/heatmap/my-pins`;
      const response = await makeRequest(url, {
        headers: authHeader,
      });

      if (response.ok) {
        return await response.json();
      }

      const errorData = await response.json().catch(() => ({}));
      return { ok: false, error: errorData.error || `HTTP ${response.status}` };
    } catch (error) {
      return formatError(error);
    }
  },
};

export default HeatMapService;
