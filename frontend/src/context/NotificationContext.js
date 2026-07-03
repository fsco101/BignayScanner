/**
 * Notification Context
 * Provides global notification state, real-time updates via WebSocket,
 * and mobile push notifications via expo-notifications (local).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import NotificationService from '../services/NotificationService';
import {
  connectSocket,
  subscribeToNotifications,
  joinNotificationRoom,
  leaveNotificationRoom,
} from '../services/socketService';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

// Try to import expo-notifications for mobile push (optional dependency)
let Notifications = null;
const loadExpoNotifications = async () => {
  if (Platform.OS === 'web') return;
  try {
    Notifications = require('expo-notifications');
  } catch (e) {
    console.log('[Notifications] expo-notifications not available — mobile popups disabled');
  }
};

export const NotificationProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const appState = useRef(AppState.currentState);
  const notifInitialized = useRef(false);
  const mobileNotificationsEnabled = useRef(false);
  const isFetching = useRef(false);

  // Setup expo-notifications for mobile
  useEffect(() => {
    loadExpoNotifications().then(() => {
      if (Notifications && Platform.OS !== 'web') {
        setupMobileNotifications();
      }
    });
  }, []);

  const setupMobileNotifications = async () => {
    if (!Notifications || notifInitialized.current) return;
    notifInitialized.current = true;
    try {
      // Check existing permission first before prompting
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Only request if not yet determined
      if (existingStatus === 'undetermined') {
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        finalStatus = newStatus;
      }

      if (finalStatus !== 'granted') {
        mobileNotificationsEnabled.current = false;
        return;
      }

      mobileNotificationsEnabled.current = true;
      // Permission granted — set up notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    } catch (e) {
      mobileNotificationsEnabled.current = false;
      console.log('[Notifications] Setup error:', e.message);
    }
  };

  const showMobilePopup = useCallback(async (notification) => {
    if (!Notifications || Platform.OS === 'web' || !mobileNotificationsEnabled.current) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title || 'Bignay',
          body: notification.message || '',
          data: notification.data || {},
          sound: true,
        },
        trigger: null,
      });
    } catch (e) {
      console.log('[Notifications] Mobile popup error:', e.message);
    }
  }, []);

  // Fetch unread count from API
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const result = await NotificationService.getUnreadCount();
      if (result.ok) {
        setUnreadCount(result.count);
      }
    } catch (e) {
      console.error('[Notifications] Fetch unread count error:', e);
    }
  }, [isAuthenticated]);

  // Fetch notifications list from API (persisted in MongoDB)
  const fetchNotifications = useCallback(async (pageNum = 1, append = false) => {
    if (!isAuthenticated || isFetching.current) return;
    isFetching.current = true;
    setIsLoading(true);
    try {
      const result = await NotificationService.getNotifications(pageNum, 20);
      if (result.ok) {
        if (append && pageNum > 1) {
          setNotifications(prev => {
            const existingIds = new Set(prev.map(n => n.id));
            const newItems = result.notifications.filter(n => !existingIds.has(n.id));
            return [...prev, ...newItems];
          });
        } else {
          setNotifications(result.notifications || []);
        }
        setTotalPages(result.pages || 1);
        setPage(pageNum);
      }
    } catch (e) {
      console.error('[Notifications] Fetch notifications error:', e);
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [isAuthenticated]);

  // Load more (pagination)
  const loadMore = useCallback(() => {
    if (page < totalPages && !isLoading) {
      fetchNotifications(page + 1, true);
    }
  }, [page, totalPages, isLoading, fetchNotifications]);

  // Mark single as read (only by explicit user click)
  const markAsRead = useCallback(async (notificationId) => {
    // Optimistic update
    const wasUnread = notifications.find(n => n.id === notificationId && !n.is_read);
    if (wasUnread) {
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    try {
      const result = await NotificationService.markAsRead(notificationId);
      if (!result.ok && wasUnread) {
        // Revert on failure
        setNotifications(prev =>
          prev.map(n => n.id === notificationId ? { ...n, is_read: false } : n)
        );
        setUnreadCount(prev => prev + 1);
      }
      return result;
    } catch (e) {
      console.error('[Notifications] Mark as read error:', e);
      return { ok: false };
    }
  }, [notifications]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    const prevCount = unreadCount;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      const result = await NotificationService.markAllAsRead();
      if (!result.ok) {
        // Revert
        fetchNotifications(1);
        fetchUnreadCount();
      }
      return result;
    } catch (e) {
      console.error('[Notifications] Mark all as read error:', e);
      fetchNotifications(1);
      fetchUnreadCount();
      return { ok: false };
    }
  }, [unreadCount, fetchNotifications, fetchUnreadCount]);

  // Delete single notification
  const deleteNotification = useCallback(async (notificationId) => {
    const removed = notifications.find(n => n.id === notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    if (removed && !removed.is_read) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    try {
      const result = await NotificationService.deleteNotification(notificationId);
      if (!result.ok) {
        fetchNotifications(1);
        fetchUnreadCount();
      }
      return result;
    } catch (e) {
      console.error('[Notifications] Delete error:', e);
      return { ok: false };
    }
  }, [notifications, fetchNotifications, fetchUnreadCount]);

  // Bulk delete notifications by IDs
  const bulkDelete = useCallback(async (ids) => {
    const removedUnreadCount = notifications.filter(n => ids.includes(n.id) && !n.is_read).length;
    setNotifications(prev => prev.filter(n => !ids.includes(n.id)));
    setUnreadCount(prev => Math.max(0, prev - removedUnreadCount));
    try {
      const result = await NotificationService.bulkDelete(ids);
      if (result.ok && result.unread_count !== undefined) {
        setUnreadCount(result.unread_count);
      } else if (!result.ok) {
        fetchNotifications(1);
        fetchUnreadCount();
      }
      return result;
    } catch (e) {
      console.error('[Notifications] Bulk delete error:', e);
      return { ok: false };
    }
  }, [notifications, fetchNotifications, fetchUnreadCount]);

  // Clear all
  const clearAll = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);
    try {
      const result = await NotificationService.clearAll();
      if (!result.ok) {
        fetchNotifications(1);
        fetchUnreadCount();
      }
      return result;
    } catch (e) {
      console.error('[Notifications] Clear all error:', e);
      return { ok: false };
    }
  }, [fetchNotifications, fetchUnreadCount]);

  // Delete all read notifications
  const deleteRead = useCallback(async () => {
    setNotifications(prev => prev.filter(n => !n.is_read));
    try {
      const result = await NotificationService.deleteRead();
      if (!result.ok) {
        fetchNotifications(1);
      }
      return result;
    } catch (e) {
      console.error('[Notifications] Delete read error:', e);
      return { ok: false };
    }
  }, [fetchNotifications]);

  // WebSocket connection & real-time listener
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setNotifications([]);
      setUnreadCount(0);
      leaveNotificationRoom();
      return;
    }

    const userId = user._id || user.id;
    if (!userId) return;

    // Connect socket and join personal room
    connectSocket();
    joinNotificationRoom(userId);

    // Fetch initial data from persistent storage
    fetchUnreadCount();
    fetchNotifications(1);

    // Subscribe to real-time notifications
    const unsubscribe = subscribeToNotifications('notification_context', (data) => {
      if (data._type === 'count_update') {
        setUnreadCount(data.count);
        return;
      }
      // New notification received via WebSocket — prepend (it's already in DB)
      setNotifications(prev => {
        // Prevent duplicates
        if (prev.some(n => n.id === data.id)) return prev;
        return [data, ...prev];
      });
      setUnreadCount(prev => prev + 1);

      // Show mobile popup notification
      if (Platform.OS !== 'web') {
        showMobilePopup(data);
      }
    });

    return () => {
      unsubscribe();
      leaveNotificationRoom();
    };
  }, [isAuthenticated, user]);

  // Refresh when app comes back to foreground (mobile)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        if (isAuthenticated) {
          fetchUnreadCount();
          fetchNotifications(1);
        }
      }
      appState.current = nextState;
    });

    return () => subscription?.remove();
  }, [isAuthenticated, fetchUnreadCount, fetchNotifications]);

  const value = {
    notifications,
    unreadCount,
    isLoading,
    page,
    totalPages,
    fetchNotifications,
    fetchUnreadCount,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    bulkDelete,
    clearAll,
    deleteRead,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
