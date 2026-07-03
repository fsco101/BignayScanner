/**
 * Notification Service
 * Handles API calls for in-app notifications
 */
import { API_CONFIG } from '../config/api';
import AuthService from './AuthService';

const getHeaders = async () => {
  const token = await AuthService.getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const NotificationService = {
  /**
   * Get paginated notifications
   */
  async getNotifications(page = 1, limit = 20, unreadOnly = false) {
    try {
      const headers = await getHeaders();
      const params = new URLSearchParams({ page, limit, unread_only: unreadOnly });
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/notifications/?${params}`, { headers });
      return await res.json();
    } catch (error) {
      console.error('[NotificationService] getNotifications error:', error);
      return { ok: false, error: error.message };
    }
  },

  /**
   * Get unread notification count
   */
  async getUnreadCount() {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/notifications/unread-count`, { headers });
      return await res.json();
    } catch (error) {
      console.error('[NotificationService] getUnreadCount error:', error);
      return { ok: false, count: 0 };
    }
  },

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId) {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers,
      });
      return await res.json();
    } catch (error) {
      console.error('[NotificationService] markAsRead error:', error);
      return { ok: false, error: error.message };
    }
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead() {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/notifications/read-all`, {
        method: 'PUT',
        headers,
      });
      return await res.json();
    } catch (error) {
      console.error('[NotificationService] markAllAsRead error:', error);
      return { ok: false, error: error.message };
    }
  },

  /**
   * Delete a single notification
   */
  async deleteNotification(notificationId) {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers,
      });
      return await res.json();
    } catch (error) {
      console.error('[NotificationService] deleteNotification error:', error);
      return { ok: false, error: error.message };
    }
  },

  /**
   * Clear all notifications
   */
  async clearAll() {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/notifications/clear-all`, {
        method: 'DELETE',
        headers,
      });
      return await res.json();
    } catch (error) {
      console.error('[NotificationService] clearAll error:', error);
      return { ok: false, error: error.message };
    }
  },

  /**
   * Bulk delete notifications by IDs
   */
  async bulkDelete(ids) {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/notifications/bulk-delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids }),
      });
      return await res.json();
    } catch (error) {
      console.error('[NotificationService] bulkDelete error:', error);
      return { ok: false, error: error.message };
    }
  },

  /**
   * Delete all read notifications
   */
  async deleteRead() {
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/notifications/delete-read`, {
        method: 'DELETE',
        headers,
      });
      return await res.json();
    } catch (error) {
      console.error('[NotificationService] deleteRead error:', error);
      return { ok: false, error: error.message };
    }
  },
};

export default NotificationService;
