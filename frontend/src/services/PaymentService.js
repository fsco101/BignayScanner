// Payment Service
// Handles PayMongo online payments and order payment processing

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
    console.log(`[PaymentService] ${options.method || 'GET'} ${url}`);
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

const PaymentService = {
  // ============================================
  // ORDER PAYMENT ENDPOINTS
  // ============================================

  // Create online payment (PayMongo checkout) - GCash or GrabPay
  // billingDetails: { billing_name, billing_email, billing_phone, billing_address,
  //                   billing_city, billing_province, billing_postal_code }
  // redirectUrl: environment-correct deep link for payment callback (from expo-linking createURL)
  async payOnline(orderId, paymentMethodType = 'gcash', billingDetails = {}, redirectUrl = null) {
    try {
      const authHeader = await getAuthHeader();
      const body = {
        order_id: orderId,
        payment_method_type: paymentMethodType,
        billing_name: billingDetails.billing_name,
        billing_email: billingDetails.billing_email,
        billing_phone: billingDetails.billing_phone,
        billing_address: billingDetails.billing_address,
        billing_city: billingDetails.billing_city,
        billing_province: billingDetails.billing_province,
        billing_postal_code: billingDetails.billing_postal_code,
      };
      if (redirectUrl) body.redirect_url = redirectUrl;
      const response = await makeRequest(
        `${API_CONFIG.BASE_URL}/api/payments/order/pay/online`,
        {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify(body),
        }
      );
      return await response.json();
    } catch (error) {
      console.error('Pay online error:', error);
      return formatError(error);
    }
  },

  // Lightweight DB-only check of order payment status (for polling after redirect).
  // Does NOT call PayMongo — returns whatever the webhook has written to the DB.
  async checkPaymentStatus(orderId) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(
        `${API_CONFIG.BASE_URL}/api/payments/order/${orderId}/payment-status`,
        { method: 'GET', headers: authHeader }
      );
      return await response.json();
    } catch (error) {
      console.error('Check payment status error:', error);
      return formatError(error);
    }
  },

  // Verify order payment (calls PayMongo as fallback when webhook is delayed)
  async verifyOrderPayment(orderId) {
    try {
      const authHeader = await getAuthHeader();
      const response = await makeRequest(
        `${API_CONFIG.BASE_URL}/api/payments/order/verify`,
        {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify({ order_id: orderId }),
        }
      );
      return await response.json();
    } catch (error) {
      console.error('Verify order payment error:', error);
      return formatError(error);
    }
  },

  // ============================================
  // CONFIGURATION
  // ============================================

  // Get payment configuration
  async getPaymentConfig() {
    try {
      const response = await makeRequest(
        `${API_CONFIG.BASE_URL}/api/payments/config`
      );
      return await response.json();
    } catch (error) {
      console.error('Get payment config error:', error);
      return formatError(error);
    }
  },
};

export default PaymentService;
