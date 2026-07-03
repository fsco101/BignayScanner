// Forum Service
// Handles all forum/blog-related API calls

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, getDefaultApiHeaders } from '../config/api';

const getAuthHeader = async () => {
  const token = await AsyncStorage.getItem('@bignay_auth_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Helper function to make API requests with timeout
// Returns parsed JSON directly; throws on network/timeout/non-JSON errors.
const makeRequest = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
  
  try {
    console.log(`[ForumService] ${options.method || 'GET'} ${url}`);
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

// Forum categories
export const FORUM_CATEGORIES = [
  { id: 'news', name: 'News', icon: 'newspaper', color: '#2196F3' },
  { id: 'events', name: 'Events', icon: 'calendar', color: '#9C27B0' },
  { id: 'about_us', name: 'About Us', icon: 'people', color: '#4CAF50' },
  { id: 'about_bignay', name: 'About Bignay', icon: 'leaf', color: '#FF9800' },
];

export const ForumService = {
  // ==================== PUBLIC METHODS ====================

  // Get all published posts
  async getPosts(params = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.category) queryParams.append('category', params.category);
      if (params.search) queryParams.append('search', params.search);
      if (params.featured) queryParams.append('featured', params.featured);

      const url = `${API_CONFIG.BASE_URL}/api/forum/posts?${queryParams.toString()}`;
      return await makeRequest(url);
    } catch (error) {
      console.error('[ForumService] Get posts error:', error);
      return formatError(error);
    }
  },

  // Get a single post by ID
  async getPost(postId) {
    try {
      const authHeader = await getAuthHeader();
      return await makeRequest(`${API_CONFIG.BASE_URL}/api/forum/posts/${postId}`, {
        headers: authHeader,
      });
    } catch (error) {
      console.error('[ForumService] Get post error:', error);
      return formatError(error);
    }
  },

  // Like a post
  async likePost(postId) {
    try {
      return await makeRequest(`${API_CONFIG.BASE_URL}/api/forum/posts/${postId}/like`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('[ForumService] Like post error:', error);
      return formatError(error);
    }
  },

  // Get featured posts for home page
  async getFeaturedPosts(limit = 5) {
    try {
      return await makeRequest(`${API_CONFIG.BASE_URL}/api/forum/featured?limit=${limit}`);
    } catch (error) {
      console.error('[ForumService] Get featured posts error:', error);
      return formatError(error);
    }
  },

  // Get categories with post counts
  async getCategories() {
    try {
      return await makeRequest(`${API_CONFIG.BASE_URL}/api/forum/categories`);
    } catch (error) {
      console.error('[ForumService] Get categories error:', error);
      return formatError(error);
    }
  },

  // ==================== ADMIN METHODS ====================

  // Get all posts (admin - including unpublished)
  async getAdminPosts(params = {}) {
    try {
      const authHeader = await getAuthHeader();
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.category) queryParams.append('category', params.category);
      if (params.is_published !== undefined) queryParams.append('is_published', params.is_published);
      if (params.search) queryParams.append('search', params.search);

      const url = `${API_CONFIG.BASE_URL}/api/forum/admin/posts?${queryParams.toString()}`;
      return await makeRequest(url, {
        headers: authHeader,
      });
    } catch (error) {
      console.error('[ForumService] Get admin posts error:', error);
      return formatError(error);
    }
  },

  // Create a new post
  async createPost(postData) {
    try {
      const authHeader = await getAuthHeader();
      return await makeRequest(`${API_CONFIG.BASE_URL}/api/forum/admin/posts`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify(postData),
      });
    } catch (error) {
      console.error('[ForumService] Create post error:', error);
      return formatError(error);
    }
  },

  // Update an existing post
  async updatePost(postId, postData) {
    try {
      const authHeader = await getAuthHeader();
      return await makeRequest(`${API_CONFIG.BASE_URL}/api/forum/admin/posts/${postId}`, {
        method: 'PUT',
        headers: authHeader,
        body: JSON.stringify(postData),
      });
    } catch (error) {
      console.error('[ForumService] Update post error:', error);
      return formatError(error);
    }
  },

  // Delete a post
  async deletePost(postId) {
    try {
      const authHeader = await getAuthHeader();
      return await makeRequest(`${API_CONFIG.BASE_URL}/api/forum/admin/posts/${postId}`, {
        method: 'DELETE',
        headers: authHeader,
      });
    } catch (error) {
      console.error('[ForumService] Delete post error:', error);
      return formatError(error);
    }
  },

  // Toggle publish status
  async togglePublish(postId) {
    try {
      const authHeader = await getAuthHeader();
      return await makeRequest(`${API_CONFIG.BASE_URL}/api/forum/admin/posts/${postId}/publish`, {
        method: 'PUT',
        headers: authHeader,
      });
    } catch (error) {
      console.error('[ForumService] Toggle publish error:', error);
      return formatError(error);
    }
  },

  // Toggle featured status
  async toggleFeature(postId) {
    try {
      const authHeader = await getAuthHeader();
      return await makeRequest(`${API_CONFIG.BASE_URL}/api/forum/admin/posts/${postId}/feature`, {
        method: 'PUT',
        headers: authHeader,
      });
    } catch (error) {
      console.error('[ForumService] Toggle feature error:', error);
      return formatError(error);
    }
  },

  // Toggle pinned status
  async togglePin(postId) {
    try {
      const authHeader = await getAuthHeader();
      return await makeRequest(`${API_CONFIG.BASE_URL}/api/forum/admin/posts/${postId}/pin`, {
        method: 'PUT',
        headers: authHeader,
      });
    } catch (error) {
      console.error('[ForumService] Toggle pin error:', error);
      return formatError(error);
    }
  },
};

export default ForumService;
