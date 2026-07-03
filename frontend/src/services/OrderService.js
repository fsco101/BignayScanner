// Order Service
// Handles checkout and order management

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
    console.log(`[OrderService] ${options.method || 'GET'} ${url}`);
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

export const OrderService = {
  // Checkout (create order)
  async checkout(orderData) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/orders/checkout`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify(orderData),
      });
      return await response.json();
    } catch (error) {
      console.error('Checkout error:', error);
      return formatError(error);
    }
  },

  // Get my orders
  async getMyOrders(params = {}) {
    try {
      const authHeader = await getAuthHeader();
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.status) queryParams.append('status', params.status);

      const response = await makeRequest(
        `${API_CONFIG.BASE_URL}/api/orders?${queryParams.toString()}`,
        { headers: authHeader }
      );
      return await response.json();
    } catch (error) {
      console.error('Get orders error:', error);
      return formatError(error);
    }
  },

  // Get single order
  async getOrder(orderId) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/orders/${orderId}`, {
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('Get order error:', error);
      return formatError(error);
    }
  },

  // Cancel order
  async cancelOrder(orderId, reason = '') {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ reason }),
      });
      return await response.json();
    } catch (error) {
      console.error('Cancel order error:', error);
      return formatError(error);
    }
  },

  // Confirm delivery (user marks order as delivered)
  async confirmDelivery(orderId) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/orders/${orderId}/confirm-delivery`, {
        method: 'POST',
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('Confirm delivery error:', error);
      return formatError(error);
    }
  },

  // ADMIN: Get all orders
  async getAdminOrders(params = {}) {
    try {
      const authHeader = await getAuthHeader();
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.status) queryParams.append('status', params.status);
      if (params.user_id) queryParams.append('user_id', params.user_id);

      const response = await makeRequest(
        `${API_CONFIG.BASE_URL}/api/orders/admin/all?${queryParams.toString()}`,
        { headers: authHeader }
      );
      return await response.json();
    } catch (error) {
      console.error('Get admin orders error:', error);
      return formatError(error);
    }
  },

  // ADMIN: Update order status
  async updateOrderStatus(orderId, status) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/orders/admin/${orderId}/status`, {
        method: 'PUT',
        headers: authHeader,
        body: JSON.stringify({ status }),
      });
      return await response.json();
    } catch (error) {
      console.error('Update order status error:', error);
      return formatError(error);
    }
  },

  // ADMIN: Get order statistics
  async getOrderStats() {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/orders/admin/stats`, {
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('Get order stats error:', error);
      return formatError(error);
    }
  },

  // Delete a single order (only delivered/cancelled)
  async deleteOrder(orderId) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/orders/${orderId}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      return await response.json();
    } catch (error) {
      console.error('Delete order error:', error);
      return formatError(error);
    }
  },

  // Bulk delete orders (only delivered/cancelled)
  async bulkDeleteOrders(orderIds) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(`${API_CONFIG.BASE_URL}/api/orders/bulk-delete`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ order_ids: orderIds }),
      });
      return await response.json();
    } catch (error) {
      console.error('Bulk delete orders error:', error);
      return formatError(error);
    }
  },

  // Get PDF receipt download URL
  getReceiptDownloadUrl(orderId) {
    return `${API_CONFIG.BASE_URL}/api/orders/${orderId}/receipt`;
  },

  // ── Seller Order Management ──────────────────────────────────────

  // Get orders containing the seller's products
  async getSellerOrders({ page = 1, limit = 20, status = '', search = '' } = {}) {
    try {
      const authHeader = await getAuthHeader();
      const params = new URLSearchParams({ page, limit });
      if (status && status !== 'all') params.set('status', status);
      if (search) params.set('search', search);
      const response = await makeRequest(
        `${API_CONFIG.BASE_URL}/api/orders/seller/my-orders?${params.toString()}`,
        { headers: authHeader }
      );
      return await response.json();
    } catch (error) {
      console.error('Get seller orders error:', error);
      return formatError(error);
    }
  },

  // Update order status (seller — processing/shipped/ready_for_pickup)
  async updateSellerOrderStatus(orderId, status) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(
        `${API_CONFIG.BASE_URL}/api/orders/seller/${orderId}/status`,
        {
          method: 'PUT',
          headers: authHeader,
          body: JSON.stringify({ status }),
        }
      );
      return await response.json();
    } catch (error) {
      console.error('Update seller order status error:', error);
      return formatError(error);
    }
  },

  // Get PDF receipt preview URL (opens in browser)
  getReceiptPreviewUrl(orderId) {
    return `${API_CONFIG.BASE_URL}/api/orders/${orderId}/receipt/preview`;
  },

  // Get auth token for URL-based auth
  async getAuthToken() {
    return await AsyncStorage.getItem('@bignay_auth_token');
  },

  // Download order receipt PDF (returns blob for backward compat)
  async downloadReceipt(orderId) {
    try {
      const authHeader = await getAuthHeader();
      const url = `${API_CONFIG.BASE_URL}/api/orders/${orderId}/receipt`;
      
      console.log(`[OrderService] Downloading receipt for order ${orderId}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: getDefaultApiHeaders({
          ...authHeader,
          'Accept': 'application/pdf',
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { ok: false, error: errorData.error || 'Failed to download receipt' };
      }
      
      // Return blob for download
      const blob = await response.blob();
      return { ok: true, blob, contentType: 'application/pdf' };
    } catch (error) {
      console.error('Download receipt error:', error);
      return formatError(error);
    }
  },

  // Download order receipt PDF - returns raw fetch Response (for mobile arrayBuffer usage)
  async downloadReceiptRaw(orderId) {
    const authHeader = await getAuthHeader();
    const url = `${API_CONFIG.BASE_URL}/api/orders/${orderId}/receipt`;
    console.log(`[OrderService] Downloading receipt (raw) for order ${orderId}`);
    return fetch(url, {
      method: 'GET',
      headers: getDefaultApiHeaders({
        ...authHeader,
        'Accept': 'application/pdf',
      }),
    });
  },
};

export default OrderService;
