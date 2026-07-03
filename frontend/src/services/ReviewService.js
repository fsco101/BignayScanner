// Review Service
// Handles product reviews and ratings

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
    console.log(`[ReviewService] ${options.method || 'GET'} ${url}`);
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

export const ReviewService = {
  // Get product reviews
  async getProductReviews(productId, params = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.sort) queryParams.append('sort', params.sort);
      if (params.order) queryParams.append('order', params.order);

      const response = await makeRequest(
        `${API_CONFIG.BASE_URL}/api/reviews/product/${productId}?${queryParams.toString()}`
      );
      return await response.json();
    } catch (error) {
      console.error('Get reviews error:', error);
      return formatError(error);
    }
  },

  // Create review
  async createReview(productId, reviewData) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/reviews/product/${productId}`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify(reviewData),
      });
      return await response.json();
    } catch (error) {
      console.error('Create review error:', error);
      return formatError(error);
    }
  },

  // Update review
  async updateReview(reviewId, reviewData) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/reviews/${reviewId}`, {
        method: 'PUT',
        headers: authHeader,
        body: JSON.stringify(reviewData),
      });
      return await response.json();
    } catch (error) {
      console.error('Update review error:', error);
      return formatError(error);
    }
  },

  // Delete review
  async deleteReview(reviewId) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('Delete review error:', error);
      return formatError(error);
    }
  },

  // Mark review as helpful
  async markHelpful(reviewId) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/reviews/${reviewId}/helpful`, {
        method: 'POST',
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('Mark helpful error:', error);
      return formatError(error);
    }
  },

  // Get my reviews
  async getMyReviews() {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/reviews/my-reviews`, {
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('Get my reviews error:', error);
      return formatError(error);
    }
  },

  // Check if can review product
  async canReviewProduct(productId) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/reviews/can-review/${productId}`, {
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('Can review check error:', error);
      return formatError(error);
    }
  },
};

export default ReviewService;
