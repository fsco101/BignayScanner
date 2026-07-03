/**
 * Socket.IO service for real-time analytics and notification updates
 */
import { io } from 'socket.io-client';
import { API_CONFIG, getBackendUrl } from '../config/api';

let socket = null;
let listeners = {};
let notificationListeners = {};
let currentUserId = null;

/**
 * Connect to the WebSocket server
 */
export const connectSocket = () => {
  if (socket?.connected) return socket;

  try {
    const baseUrl = getBackendUrl();
    socket = io(baseUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 15000,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      // Join the analytics room
      socket.emit('join_analytics', { room: 'analytics' });
      // Rejoin notification room if user was set
      if (currentUserId) {
        socket.emit('join_notifications', { user_id: currentUserId });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.log('[Socket] Connection error:', error.message);
    });

    socket.on('analytics_update', (data) => {
      // Notify all registered analytics listeners
      Object.values(listeners).forEach((callback) => {
        try {
          callback(data);
        } catch (e) {
          console.error('[Socket] Listener error:', e);
        }
      });
    });

    // Listen for real-time notification events
    socket.on('new_notification', (data) => {
      console.log('[Socket] New notification:', data?.title);
      Object.values(notificationListeners).forEach((callback) => {
        try {
          callback(data);
        } catch (e) {
          console.error('[Socket] Notification listener error:', e);
        }
      });
    });

    // Listen for notification count updates
    socket.on('notification_count', (data) => {
      Object.values(notificationListeners).forEach((callback) => {
        try {
          callback({ _type: 'count_update', count: data.count });
        } catch (e) {
          console.error('[Socket] Notification count listener error:', e);
        }
      });
    });

    return socket;
  } catch (error) {
    console.error('[Socket] Failed to connect:', error);
    return null;
  }
};

/**
 * Disconnect from the WebSocket server
 */
export const disconnectSocket = () => {
  if (socket) {
    if (currentUserId) {
      socket.emit('leave_notifications', { user_id: currentUserId });
    }
    socket.emit('leave_analytics', { room: 'analytics' });
    socket.disconnect();
    socket = null;
    currentUserId = null;
  }
};

/**
 * Join the user's personal notification room
 * @param {string} userId - The user's ID
 */
export const joinNotificationRoom = (userId) => {
  currentUserId = userId;
  if (socket?.connected && userId) {
    socket.emit('join_notifications', { user_id: userId });
    console.log('[Socket] Joining notification room for user:', userId);
  }
};

/**
 * Leave the user's notification room
 */
export const leaveNotificationRoom = () => {
  if (socket?.connected && currentUserId) {
    socket.emit('leave_notifications', { user_id: currentUserId });
  }
  currentUserId = null;
};

/**
 * Subscribe to real-time notifications
 * @param {string} id - Unique listener ID
 * @param {function} callback - Callback receiving notification data
 * @returns {function} Unsubscribe function
 */
export const subscribeToNotifications = (id, callback) => {
  notificationListeners[id] = callback;
  return () => {
    delete notificationListeners[id];
  };
};

/**
 * Subscribe to analytics updates
 * @param {string} id - Unique listener ID
 * @param {function} callback - Callback function receiving update data
 * @returns {function} Unsubscribe function
 */
export const subscribeToAnalytics = (id, callback) => {
  listeners[id] = callback;
  return () => {
    delete listeners[id];
  };
};

/**
 * Get current socket connection status
 */
export const isSocketConnected = () => {
  return socket?.connected || false;
};

export default {
  connectSocket,
  disconnectSocket,
  subscribeToAnalytics,
  subscribeToNotifications,
  joinNotificationRoom,
  leaveNotificationRoom,
  isSocketConnected,
};
