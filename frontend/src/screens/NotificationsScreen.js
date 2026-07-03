/**
 * Notifications Screen
 * Full-featured notification list with:
 * - Unread highlighting (green tint for unread)
 * - Click-to-read (only marks read on explicit click)
 * - Click navigates/redirects to the relevant screen (order, forum, product)
 * - Multi-select mode for bulk delete
 * - "Delete selected" + "Delete all read" actions
 * - Mark all as read
 * - Persistent across refresh (data from MongoDB)
 * - Responsive layout
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import { SweetAlert, useSweetAlert } from '../components/SweetAlert';
import { formatPhilippineDateTime, formatTimeAgo } from '../utils/dateTime';
import { useThemeColors } from '../context/ThemeContext';


// Build notification icon colors from theme
const getIconColors = (COLORS) => ({
  order_placed: COLORS.primary,
  order_confirmed: COLORS.primaryLight,
  order_processing: COLORS.warning,
  order_shipped: COLORS.info,
  order_delivered: COLORS.success,
  order_cancelled: COLORS.danger,
  order_refunded: COLORS.purple || '#9C27B0',
  new_review: COLORS.warning,
  product_update: COLORS.info,
  forum_post: COLORS.purple || '#7B1FA2',
  system: COLORS.textSecondary,
});

// Format date to Philippine Standard Time (UTC+8)
function formatToPHT(dateStr) {
  return formatPhilippineDateTime(dateStr) || '';
}

// formatTimeAgo is now imported from shared dateTime utility

export default function NotificationsScreen({ navigation }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const ICON_COLORS = useMemo(() => getIconColors(COLORS), [COLORS]);

  const { isAuthenticated, isAdmin } = useAuth();
  const {
    notifications,
    unreadCount,
    isLoading,
    page,
    totalPages,
    fetchNotifications,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    bulkDelete,
    clearAll,
    deleteRead,
  } = useNotifications();
  const { layout } = useResponsive();
  const { alertConfig, showDelete, showConfirm, showWarning, hideAlert } = useSweetAlert();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const isDesktop = layout === 'desktop';
  const maxWidth = isDesktop ? 700 : '100%';

  const handleRefresh = useCallback(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  // Toggle select mode
  const toggleSelectMode = useCallback(() => {
    setSelectMode(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  // Toggle selection of a notification
  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Select / deselect all
  const selectAll = useCallback(() => {
    if (selectedIds.size === notifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notifications.map(n => n.id)));
    }
  }, [selectedIds.size, notifications]);

  // Navigate to the relevant screen based on notification data
  const navigateToTarget = useCallback((item) => {
    const data = item.data || {};
    const type = item.type || '';

    // Forum post notifications
    if (type === 'forum_post' || data.navigate === 'ForumPostDetail') {
      if (data.post_id) {
        navigation.navigate('ForumPostDetail', {
          postId: data.post_id,
          title: data.post_title || 'Forum Post',
        });
        return;
      }
    }

    // Order-related notifications
    // Admin users go to OrderManagement; regular users go to Marketplace order history
    if (type.startsWith('order_') || data.order_id) {
      if (isAdmin) {
        navigation.navigate('Marketplace', { openOrderManagement: true });
      } else {
        navigation.navigate('Marketplace', { openOrderHistory: true });
      }
      return;
    }

    // Product notifications
    if (type === 'product_update' && data.product_id) {
      navigation.navigate('ProductDetail', {
        product: { _id: data.product_id },
      });
      return;
    }

    // Review notifications
    if (type === 'new_review' && data.product_id) {
      navigation.navigate('ProductDetail', {
        product: { _id: data.product_id },
      });
      return;
    }
  }, [navigation]);

  // Handle notification press: mark as read + navigate
  const handleNotificationPress = useCallback((item) => {
    if (selectMode) {
      toggleSelect(item.id);
      return;
    }
    // Mark as read on click
    if (!item.is_read) {
      markAsRead(item.id);
    }
    // Navigate to the relevant screen
    navigateToTarget(item);
  }, [selectMode, markAsRead, navigateToTarget, toggleSelect]);

  // Long press to enter select mode
  const handleLongPress = useCallback((item) => {
    if (!selectMode) {
      setSelectMode(true);
      setSelectedIds(new Set([item.id]));
    }
  }, [selectMode]);

  // Delete selected notifications
  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    showDelete(
      'Delete Notifications',
      `Delete ${ids.length} selected notification(s)?`,
      async () => {
        await bulkDelete(ids);
        setSelectedIds(new Set());
        setSelectMode(false);
        hideAlert();
      },
      { cancelText: 'Cancel', confirmText: 'Delete' }
    );
  }, [selectedIds, bulkDelete, showDelete, hideAlert]);

  // Delete all read notifications
  const handleDeleteRead = useCallback(async () => {
    const readCount = notifications.filter(n => n.is_read).length;
    if (readCount === 0) return;
    showDelete(
      'Delete Read Notifications',
      `Delete ${readCount} read notification(s)?`,
      async () => {
        await deleteRead();
        hideAlert();
      },
      { cancelText: 'Cancel', confirmText: 'Delete' }
    );
  }, [notifications, deleteRead, showDelete, hideAlert]);

  // Handle clear all
  const handleClearAll = useCallback(() => {
    if (notifications.length === 0) return;
    showDelete(
      'Clear All Notifications',
      'Delete all notifications? This cannot be undone.',
      async () => {
        await clearAll();
        setSelectedIds(new Set());
        setSelectMode(false);
        hideAlert();
      },
      { cancelText: 'Cancel', confirmText: 'Delete All' }
    );
  }, [notifications, clearAll, showDelete, hideAlert]);

  const readCount = useMemo(() => notifications.filter(n => n.is_read).length, [notifications]);

  const renderNotification = useCallback(({ item }) => {
    const iconColor = ICON_COLORS[item.type] || COLORS.textSecondary;
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.notifItem,
          !item.is_read && styles.notifUnread,
          isSelected && styles.notifSelected,
        ]}
        onPress={() => handleNotificationPress(item)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
      >
        {/* Select checkbox in select mode */}
        {selectMode && (
          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => toggleSelect(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={22}
              color={isSelected ? COLORS.primary : COLORS.textSecondary}
            />
          </TouchableOpacity>
        )}

        {/* Unread dot indicator */}
        {!item.is_read && !selectMode && (
          <View style={styles.unreadDot} />
        )}

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: iconColor + '15' }]}>
          <Ionicons name={item.icon || 'notifications'} size={22} color={iconColor} />
        </View>

        {/* Content */}
        <View style={styles.notifContent}>
          <View style={styles.notifHeader}>
            <Text
              style={[styles.notifTitle, !item.is_read && styles.notifTitleUnread]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={styles.notifTime}>{formatTimeAgo(item.created_at)}</Text>
          </View>
          <Text style={styles.notifFullDate}>{formatToPHT(item.created_at)}</Text>
          <Text style={[styles.notifMessage, !item.is_read && styles.notifMessageUnread]} numberOfLines={2}>
            {item.message}
          </Text>
          {/* Navigation hint */}
          {!selectMode && (item.data?.order_id || item.data?.post_id || item.data?.product_id) && (
            <View style={styles.tapHint}>
              <Ionicons name="open-outline" size={11} color={COLORS.primary} />
              <Text style={styles.tapHintText}>Tap to view</Text>
            </View>
          )}
        </View>

        {/* Delete button (only outside of select mode) */}
        {!selectMode && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => deleteNotification(item.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [handleNotificationPress, handleLongPress, deleteNotification, selectMode, selectedIds, toggleSelect, ICON_COLORS]);

  const ListHeader = useMemo(() => (
    <View style={styles.listHeader}>
      {/* Top row: Title + unread badge */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={styles.unreadBadgeLarge}>
            <Text style={styles.unreadBadgeLargeText}>
              {unreadCount} unread
            </Text>
          </View>
        )}
      </View>

      {/* Action buttons */}
      {notifications.length > 0 && (
        <View style={styles.headerActions}>
          {/* Select mode toggle */}
          <TouchableOpacity
            style={[styles.actionBtn, selectMode && styles.actionBtnActive]}
            onPress={toggleSelectMode}
          >
            <Ionicons
              name={selectMode ? 'close-circle' : 'checkmark-circle-outline'}
              size={16}
              color={selectMode ? COLORS.surface : COLORS.primary}
            />
            <Text style={[styles.actionBtnText, selectMode && styles.actionBtnTextActive]}>
              {selectMode ? 'Cancel' : 'Select'}
            </Text>
          </TouchableOpacity>

          {selectMode ? (
            <>
              {/* Select All */}
              <TouchableOpacity style={styles.actionBtn} onPress={selectAll}>
                <Ionicons name="checkbox-outline" size={16} color={COLORS.primary} />
                <Text style={styles.actionBtnText}>
                  {selectedIds.size === notifications.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>

              {/* Delete selected */}
              {selectedIds.size > 0 && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDanger]}
                  onPress={handleDeleteSelected}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  <Text style={[styles.actionBtnText, { color: COLORS.danger }]}>
                    Delete ({selectedIds.size})
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {/* Mark all as read */}
              {unreadCount > 0 && (
                <TouchableOpacity style={styles.actionBtn} onPress={markAllAsRead}>
                  <Ionicons name="checkmark-done" size={16} color={COLORS.primary} />
                  <Text style={styles.actionBtnText}>Mark all read</Text>
                </TouchableOpacity>
              )}

              {/* Delete all read */}
              {readCount > 0 && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDanger]}
                  onPress={handleDeleteRead}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  <Text style={[styles.actionBtnText, { color: COLORS.danger }]}>
                    Delete read ({readCount})
                  </Text>
                </TouchableOpacity>
              )}

              {/* Clear all */}
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={handleClearAll}
              >
                <Ionicons name="trash" size={16} color={COLORS.danger} />
                <Text style={[styles.actionBtnText, { color: COLORS.danger }]}>Clear all</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  ), [
    unreadCount, notifications.length, readCount, selectMode, selectedIds.size,
    toggleSelectMode, selectAll, handleDeleteSelected, markAllAsRead, handleDeleteRead, handleClearAll,
  ]);

  useEffect(() => {
    if (!isAuthenticated) {
      showWarning('Login Required', 'You must be logged in to view notifications.', {
        onConfirm: () => {
          hideAlert();
          navigation.getParent()?.navigate('Auth', { screen: 'Login' });
        },
      });
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <SweetAlert
          visible={alertConfig.visible}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
          showCancel={alertConfig.showCancel}
          onConfirm={alertConfig.onConfirm}
          onCancel={hideAlert}
          onClose={hideAlert}
          confirmColor={alertConfig.confirmColor}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { alignItems: isDesktop ? 'center' : 'stretch' }]}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        extraData={{ selectMode, selectedIds }}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-outline" size={64} color={COLORS.textSecondary} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySubtitle}>
                You'll receive updates about your orders, forum posts, and more here
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          isLoading ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && page === 1}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        contentContainerStyle={[
          styles.listContainer,
          { maxWidth, width: '100%', alignSelf: 'center' },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {/* SweetAlert Component */}
      <SweetAlert
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        showCancel={alertConfig.showCancel}
        onConfirm={alertConfig.onConfirm}
        onCancel={hideAlert}
        onClose={hideAlert}
        confirmColor={alertConfig.confirmColor}
      />
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContainer: {
    paddingBottom: 24,
  },
  listHeader: {
    padding: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  unreadBadgeLarge: {
    backgroundColor: COLORS.primary + '18',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  unreadBadgeLargeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '0D',
  },
  actionBtnActive: {
    backgroundColor: COLORS.primary,
  },
  actionBtnDanger: {
    backgroundColor: COLORS.danger + '0D',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  actionBtnTextActive: {
    color: COLORS.surface,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  notifUnread: {
    backgroundColor: COLORS.unread,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  notifSelected: {
    backgroundColor: COLORS.selected,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.info,
  },
  checkbox: {
    marginRight: 10,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginRight: 8,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notifContent: {
    flex: 1,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  notifTitleUnread: {
    fontWeight: '700',
    color: COLORS.text,
  },
  notifTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  notifFullDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
    opacity: 0.8,
  },
  notifMessage: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  notifMessageUnread: {
    color: COLORS.textSecondary,
  },
  tapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  tapHintText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 6,
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  loadingFooter: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
