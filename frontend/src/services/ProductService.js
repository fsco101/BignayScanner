// Product Service
// Handles all product-related API calls

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
    console.log(`[ProductService] ${options.method || 'GET'} ${url}`);
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

export const ProductService = {
  // Get all products (public)
  async getProducts(params = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.category) queryParams.append('category', params.category);
      if (params.search) queryParams.append('search', params.search);
      if (params.min_price) queryParams.append('min_price', params.min_price);
      if (params.max_price) queryParams.append('max_price', params.max_price);
      if (params.in_stock) queryParams.append('in_stock', params.in_stock);
      if (params.sort) queryParams.append('sort', params.sort);
      if (params.order) queryParams.append('order', params.order);

      const url = `${API_CONFIG.BASE_URL}/api/products?${queryParams.toString()}`;
      const response = await makeRequest(url);
      return await response.json();
    } catch (error) {
      console.error('Get products error:', error);
      return formatError(error);
    }
  },

  // Get featured products (for carousels)
  async getFeaturedProducts(limit = 10) {
    try {
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/featured?limit=${limit}`);
      return await response.json();
    } catch (error) {
      console.error('Get featured products error:', error);
      return formatError(error);
    }
  },

  // Get categories
  async getCategories() {
    try {
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/categories`);
      return await response.json();
    } catch (error) {
      console.error('Get categories error:', error);
      return formatError(error);
    }
  },

  // Get single product
  async getProduct(productId) {
    try {
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/${productId}`);
      return await response.json();
    } catch (error) {
      console.error('Get product error:', error);
      return formatError(error);
    }
  },

  // ADMIN: Create product
  async createProduct(productData) {
    try {
      const authHeader = await getAuthHeader();
      
      // Log what we're sending (truncate large image data)
      const logData = { ...productData };
      if (logData.images) {
        logData.images = logData.images.map(img => 
          img ? `${img.substring(0, 50)}... (length: ${img.length})` : 'null'
        );
      }
      if (logData.image) {
        logData.image = `${logData.image.substring(0, 50)}... (length: ${logData.image.length})`;
      }
      console.log('[ProductService] Creating product with data:', logData);
      
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify(productData),
      });
      
      const result = await response.json();
      console.log('[ProductService] Create product response:', result.ok ? 'SUCCESS' : result.error);
      return result;
    } catch (error) {
      console.error('[ProductService] Create product error:', error);
      return formatError(error);
    }
  },

  // ADMIN: Update product
  async updateProduct(productId, productData) {
    try {
      const authHeader = await getAuthHeader();
      
      // Log what we're sending (truncate large image data)
      const logData = { ...productData };
      if (logData.images) {
        logData.images = logData.images.map(img => 
          img ? `${img.substring(0, 50)}... (length: ${img.length})` : 'null'
        );
      }
      if (logData.image) {
        logData.image = `${logData.image.substring(0, 50)}... (length: ${logData.image.length})`;
      }
      console.log('[ProductService] Updating product with data:', logData);
      
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/${productId}`, {
        method: 'PUT',
        headers: authHeader,
        body: JSON.stringify(productData),
      });
      
      const result = await response.json();
      console.log('[ProductService] Update product response:', result.ok ? 'SUCCESS' : result.error);
      return result;
    } catch (error) {
      console.error('[ProductService] Update product error:', error);
      return formatError(error);
    }
  },

  // ADMIN: Delete product
  async deleteProduct(productId, reason = '') {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/${productId}`, {
        method: 'DELETE',
        headers: authHeader,
        body: JSON.stringify({ reason: reason || 'Product removed by administrator' }),
      });
      return await response.json();
    } catch (error) {
      console.error('Delete product error:', error);
      return formatError(error);
    }
  },

  // ADMIN: Restore product (reactivate)
  async restoreProduct(productId) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/${productId}/restore`, {
        method: 'PUT',
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('Restore product error:', error);
      return formatError(error);
    }
  },

  // ADMIN: Add images to product
  async addProductImages(productId, images) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/${productId}/images`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ images }),
      });
      return await response.json();
    } catch (error) {
      console.error('Add images error:', error);
      return formatError(error);
    }
  },

  // ADMIN: Remove image from product
  async removeProductImage(productId, imageIndex) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/${productId}/images/${imageIndex}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('Remove image error:', error);
      return formatError(error);
    }
  },

  // ADMIN: Get all products (including inactive)
  async getAdminProducts(params = {}) {
    try {
      const authHeader = await getAuthHeader();
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.is_active !== undefined) queryParams.append('is_active', params.is_active);
      if (params.search) queryParams.append('search', params.search);

      const response = await makeRequest(
        `${API_CONFIG.BASE_URL}/api/products/admin/all?${queryParams.toString()}`,
        { headers: authHeader }
      );
      return await response.json();
    } catch (error) {
      console.error('Get admin products error:', error);
      return formatError(error);
    }
  },

  // ============================================
  // USER PRODUCT MANAGEMENT (for sellers)
  // ============================================

  // Get current user's products
  async getMyProducts(params = {}) {
    try {
      const authHeader = await getAuthHeader();
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.search) queryParams.append('search', params.search);
      if (params.category) queryParams.append('category', params.category);

      const response = await makeRequest(
        `${API_CONFIG.BASE_URL}/api/products/user/my-products?${queryParams.toString()}`,
        { headers: authHeader }
      );
      return await response.json();
    } catch (error) {
      console.error('Get my products error:', error);
      return formatError(error);
    }
  },

  // Create product (user)
  async userCreateProduct(productData) {
    try {
      const authHeader = await getAuthHeader();
      
      // Log what we're sending (truncate large image data)
      const logData = { ...productData };
      if (logData.images) {
        logData.images = logData.images.map(img => 
          img ? `${img.substring(0, 50)}... (length: ${img.length})` : 'null'
        );
      }
      if (logData.image) {
        logData.image = `${logData.image.substring(0, 50)}... (length: ${logData.image.length})`;
      }
      console.log('[ProductService] User creating product with data:', logData);
      
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/user/create`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify(productData),
      });
      
      const result = await response.json();
      console.log('[ProductService] User create product response:', result.ok ? 'SUCCESS' : result.error);
      return result;
    } catch (error) {
      console.error('[ProductService] User create product error:', error);
      return formatError(error);
    }
  },

  // Update product (user - own products only)
  async userUpdateProduct(productId, productData) {
    try {
      const authHeader = await getAuthHeader();
      
      // Log what we're sending (truncate large image data)
      const logData = { ...productData };
      if (logData.images) {
        logData.images = logData.images.map(img => 
          img ? `${img.substring(0, 50)}... (length: ${img.length})` : 'null'
        );
      }
      if (logData.image) {
        logData.image = `${logData.image.substring(0, 50)}... (length: ${logData.image.length})`;
      }
      console.log('[ProductService] User updating product with data:', logData);
      
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/user/${productId}`, {
        method: 'PUT',
        headers: authHeader,
        body: JSON.stringify(productData),
      });
      
      const result = await response.json();
      console.log('[ProductService] User update product response:', result.ok ? 'SUCCESS' : result.error);
      return result;
    } catch (error) {
      console.error('[ProductService] User update product error:', error);
      return formatError(error);
    }
  },

  // Delete product (user - own products only)
  async userDeleteProduct(productId) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/user/${productId}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('User delete product error:', error);
      return formatError(error);
    }
  },

  // Restore product (user - own products only)
  async userRestoreProduct(productId) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/products/user/${productId}/restore`, {
        method: 'PUT',
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('User restore product error:', error);
      return formatError(error);
    }
  },
};

export default ProductService;
