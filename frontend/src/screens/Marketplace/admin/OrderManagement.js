// Order Management Screen (Admin)
// Manage all orders and update order statuses with PDF receipt generation

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { savePdfOnMobile } from '../../../utils/pdfExport';
import OrderService from '../../../services/OrderService';
import SweetAlert, { useSweetAlert } from '../../../components/SweetAlert';
import { formatPhilippineDateTime } from '../../../utils/dateTime';
import { useThemeColors } from '../../../context/ThemeContext';


const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'ready_for_pickup', 'cancelled'];

const STATUS_CONFIG = {
  pending: { color: '#FFA000', icon: 'time-outline', label: 'Pending' },
  processing: { color: '#2196F3', icon: 'cube-outline', label: 'Processing' },
  shipped: { color: '#9C27B0', icon: 'car-outline', label: 'Shipped' },
  ready_for_pickup: { color: '#F97316', icon: 'storefront-outline', label: 'Ready for Pickup' },
  delivered: { color: '#4CAF50', icon: 'checkmark-circle-outline', label: 'Delivered' },
  cancelled: { color: '#D32F2F', icon: 'close-circle-outline', label: 'Cancelled' },
};

// Lock duration for delivered orders (3 minutes in milliseconds)
const DELIVERED_LOCK_DURATION = 3 * 60 * 1000;

export default function OrderManagement({ visible, onClose }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { alertConfig, showSuccess, showError, showWarning, hideAlert } = useSweetAlert();

  const formatCurrency = (amount) => `₱${(Number(amount) || 0).toFixed(2)}`;

  const getUserAvatarUri = (order) => {
    if (!order) return '';
    return (
      order.user_avatar ||
      order.user_profile_image ||
      order.user_photo ||
      order.profile_image ||
      order.profileImage ||
      ''
    );
  };

  const formatPaymentMethod = (method) => {
    const methods = {
      'cod': 'Cash on Delivery',
      'cash_on_delivery': 'Cash on Delivery',
      'online': 'Online Payment',
      'online_payment': 'Online Payment',
      'wallet': 'Wallet',
    };
    return methods[method] || (method || 'Cash on Delivery').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getOrderNumber = (order) => {
    return order?.order_number || order?._id?.slice(-6).toUpperCase() || 'N/A';
  };

  // State
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Handle PDF receipt download
  const handleDownloadReceipt = async (orderId, orderNumber) => {
    if (isDownloadingPdf) return;
    
    setIsDownloadingPdf(true);
    try {
      if (Platform.OS === 'web') {
        // For web, open in new tab with auth token
        const url = OrderService.getReceiptPreviewUrl(orderId);
        const token = await require('@react-native-async-storage/async-storage').default.getItem('@bignay_auth_token');
        if (token) {
          const authUrl = `${url}?token=${encodeURIComponent(token)}`;
          Linking.openURL(authUrl);
        } else {
          Linking.openURL(url);
        }
        showSuccess('Opening receipt...');
      } else {
        // For mobile, use arrayBuffer approach (more reliable than FileReader+blob)
        const filename = `order_${orderNumber || orderId}_receipt.pdf`;
        const response = await OrderService.downloadReceiptRaw(orderId);
        const result = await savePdfOnMobile(response, filename, {
          dialogTitle: 'Order Receipt',
          UTI: 'com.adobe.pdf',
        });
        if (result.success) {
          showSuccess(result.message);
        } else {
          showError(result.message);
        }
      }
    } catch (error) {
      console.error('Error downloading receipt:', error);
      showError('Failed to download receipt: ' + error.message);
    }
    setIsDownloadingPdf(false);
  };

  // Load orders
  const loadOrders = useCallback(async (page = 1, refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else if (page === 1) {
      setIsLoading(true);
    }

    try {
      const params = { page, limit: 20 };
      if (filterStatus !== 'all') {
        params.status = filterStatus;
      }

      const result = await OrderService.getAdminOrders(params);

      if (result.ok) {
        const newOrders = result.orders || [];
        if (page === 1 || refresh) {
          setOrders(newOrders);
        } else {
          setOrders(prev => [...prev, ...newOrders]);
        }
        setHasMore(newOrders.length >= 20);
        setCurrentPage(page);
      } else {
        showError(result.error || 'Failed to load orders');
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      showError('An error occurred while loading orders');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    if (visible) {
      loadOrders(1, true);
    }
  }, [visible, filterStatus]);

  // Refresh orders
  const handleRefresh = () => {
    loadOrders(1, true);
  };

  // Load more orders
  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      loadOrders(currentPage + 1);
    }
  };

  // Check if order status can be changed
  const canChangeStatus = (order) => {
    // Cannot change cancelled orders
    if (order.status === 'cancelled') {
      return { allowed: false, reason: 'Cancelled orders cannot be modified' };
    }

    // Delivered orders are managed by users, admin cannot modify
    if (order.status === 'delivered') {
      return { allowed: false, reason: 'Delivered orders can only be managed by the buyer' };
    }

    return { allowed: true };
  };

  // Update order status
  const handleUpdateStatus = async (newStatus) => {
    if (!selectedOrder) return;

    const statusCheck = canChangeStatus(selectedOrder);
    if (!statusCheck.allowed) {
      showWarning(statusCheck.reason);
      setShowStatusPicker(false);
      return;
    }

    if (newStatus === selectedOrder.status) {
      showWarning('Order already has this status');
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const result = await OrderService.updateOrderStatus(selectedOrder._id, newStatus);

      if (result.ok) {
        showSuccess(`Order status updated to ${STATUS_CONFIG[newStatus].label}`);
        
        // Update local state
        setOrders(prev =>
          prev.map(order =>
            order._id === selectedOrder._id
              ? { 
                  ...order, 
                  status: newStatus, 
                  updated_at: new Date().toISOString(),
                  ...(newStatus === 'delivered' && { delivered_at: new Date().toISOString() })
                }
              : order
          )
        );
        
        setSelectedOrder(prev => ({ 
          ...prev, 
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...(newStatus === 'delivered' && { delivered_at: new Date().toISOString() })
        }));
        setShowStatusPicker(false);
      } else {
        showError(result.error || 'Failed to update order status');
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      showError('An error occurred while updating the order');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // View order details
  const handleViewOrder = (order) => {
    setSelectedOrder(order);
    setShowOrderDetail(true);
  };

  // Open status picker
  const handleOpenStatusPicker = (order) => {
    const statusCheck = canChangeStatus(order);
    if (!statusCheck.allowed) {
      showWarning(statusCheck.reason);
      return;
    }

    if (statusCheck.warning) {
      showWarning(statusCheck.warning);
    }

    setSelectedOrder(order);
    setShowStatusPicker(true);
  };

  // Format date
  const formatDate = (dateString) => {
    return formatPhilippineDateTime(dateString);
  };

  // Render order card
  const renderOrderCard = ({ item }) => {
    const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const statusCheck = canChangeStatus(item);

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => handleViewOrder(item)}
        activeOpacity={0.7}
      >
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderId}>Order #{getOrderNumber(item)}</Text>
            <Text style={styles.orderDate}>{formatDate(item.created_at)} PHT</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '20' }]}>
            <Ionicons name={statusConfig.icon} size={14} color={statusConfig.color} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        <View style={styles.orderCustomer}>
          <Ionicons name="person-outline" size={16} color={COLORS.textSecondary} />
          <Text style={styles.customerName}>{item.user_name || 'Unknown'}</Text>
        </View>

        <View style={styles.orderSummary}>
          <Text style={styles.orderItems}>
            {item.items?.length || 0} item(s)
          </Text>
          <Text style={styles.orderTotal}>{formatCurrency(item.total_amount ?? item.total)}</Text>
        </View>

        <View style={styles.paymentMethodRow}>
          <Ionicons name={item.payment_method === 'online' || item.payment_method === 'online_payment' ? 'card-outline' : 'cash-outline'} size={14} color={COLORS.textSecondary} />
          <Text style={styles.paymentMethodText}>{formatPaymentMethod(item.payment_method)}</Text>
        </View>

        <View style={styles.orderActions}>
          <TouchableOpacity
            style={[
              styles.updateStatusButton,
              !statusCheck.allowed && styles.buttonDisabled,
            ]}
            onPress={() => handleOpenStatusPicker(item)}
            disabled={!statusCheck.allowed}
          >
            <Ionicons name="swap-horizontal" size={16} color={COLORS.textOnPrimary} />
            <Text style={styles.updateStatusText}>Update Status</Text>
          </TouchableOpacity>
          
          {!statusCheck.allowed && item.status === 'delivered' && (
            <View style={styles.lockedBadge}>
              <Ionicons name="lock-closed" size={12} color={COLORS.warning} />
              <Text style={styles.lockedText}>Locked</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="arrow-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Order Management</Text>
            </View>
            <TouchableOpacity onPress={handleRefresh} style={styles.headerBtn}>
              <Ionicons name="refresh" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {/* Status Filter */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContent}
          >
            <TouchableOpacity
              style={[
                styles.filterChip,
                filterStatus === 'all' && styles.filterChipActive,
              ]}
              onPress={() => setFilterStatus('all')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterStatus === 'all' && styles.filterChipTextActive,
                ]}
              >
                All Orders
              </Text>
            </TouchableOpacity>
            {ORDER_STATUSES.map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.filterChip,
                  filterStatus === status && styles.filterChipActive,
                  { borderColor: STATUS_CONFIG[status].color },
                ]}
                onPress={() => setFilterStatus(status)}
              >
                <Ionicons
                  name={STATUS_CONFIG[status].icon}
                  size={14}
                  color={filterStatus === status ? COLORS.textOnPrimary : STATUS_CONFIG[status].color}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    filterStatus === status && styles.filterChipTextActive,
                  ]}
                >
                  {STATUS_CONFIG[status].label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Orders List */}
          {isLoading && orders.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading orders...</Text>
            </View>
          ) : (
            <FlatList
              data={orders}
              keyExtractor={(item) => item._id}
              renderItem={renderOrderCard}
              contentContainerStyle={styles.ordersList}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  colors={[COLORS.primary]}
                />
              }
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                isLoading && orders.length > 0 ? (
                  <ActivityIndicator style={{ padding: 16 }} color={COLORS.primary} />
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyList}>
                  <Ionicons name="receipt-outline" size={64} color={COLORS.textLight} />
                  <Text style={styles.emptyText}>No orders found</Text>
                  <Text style={styles.emptySubtext}>
                    {filterStatus !== 'all'
                      ? `No ${filterStatus} orders`
                      : 'Orders will appear here'}
                  </Text>
                </View>
              }
            />
          )}

        {/* Order Detail Modal */}
        <Modal
          visible={showOrderDetail}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowOrderDetail(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailModalContent}>
              <View style={styles.detailHeader}>
                <Text style={styles.detailTitle}>Order Details</Text>
                <TouchableOpacity onPress={() => setShowOrderDetail(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              {selectedOrder && (
                <ScrollView style={styles.detailBody}>
                  {/* Order ID & Status */}
                  <View style={styles.detailSection}>
                    <Text style={styles.detailOrderId}>
                      Order #{getOrderNumber(selectedOrder)}
                    </Text>
                    <View
                      style={[
                        styles.statusBadgeLarge,
                        { backgroundColor: STATUS_CONFIG[selectedOrder.status]?.color + '20' },
                      ]}
                    >
                      <Ionicons
                        name={STATUS_CONFIG[selectedOrder.status]?.icon}
                        size={18}
                        color={STATUS_CONFIG[selectedOrder.status]?.color}
                      />
                      <Text
                        style={[
                          styles.statusTextLarge,
                          { color: STATUS_CONFIG[selectedOrder.status]?.color },
                        ]}
                      >
                        {STATUS_CONFIG[selectedOrder.status]?.label}
                      </Text>
                    </View>
                  </View>

                  {/* Customer Info */}
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>Customer</Text>
                    <View style={styles.customerProfileRow}>
                      {getUserAvatarUri(selectedOrder) ? (
                        <Image
                          source={{ uri: getUserAvatarUri(selectedOrder) }}
                          style={styles.customerAvatar}
                        />
                      ) : (
                        <View style={styles.customerAvatarFallback}>
                          <Ionicons name="person" size={20} color={COLORS.textOnPrimary} />
                        </View>
                      )}
                      <View style={styles.customerNameWrap}>
                        <Text style={styles.infoText}>{selectedOrder.user_name || 'Unknown'}</Text>
                      </View>
                    </View>
                    {(selectedOrder.shipping_address || selectedOrder.shipping_city) && (
                      <>
                        <View style={styles.infoRow}>
                          <Ionicons name="location-outline" size={18} color={COLORS.textSecondary} />
                          <Text style={styles.infoText}>
                            {selectedOrder.shipping_address || [selectedOrder.shipping_city, selectedOrder.shipping_province, selectedOrder.shipping_postal_code].filter(Boolean).join(', ')}
                          </Text>
                        </View>
                        {selectedOrder.shipping_phone && (
                          <View style={styles.infoRow}>
                            <Ionicons name="call-outline" size={18} color={COLORS.textSecondary} />
                            <Text style={styles.infoText}>{selectedOrder.shipping_phone}</Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>

                  {/* Order Items */}
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>Items</Text>
                    {selectedOrder.items?.map((item, index) => (
                      <View key={index} style={styles.orderItem}>
                        <View style={styles.itemImageContainer}>
                          {item.product_image ? (
                            <Image
                              source={{ uri: item.product_image }}
                              style={styles.itemImage}
                            />
                          ) : (
                            <View style={styles.itemImagePlaceholder}>
                              <Ionicons name="leaf" size={20} color={COLORS.primaryLight} />
                            </View>
                          )}
                        </View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName}>{item.product_name}</Text>
                          <Text style={styles.itemPrice}>
                            Price: {formatCurrency(item.unit_price ?? item.price)}
                          </Text>
                          <Text style={styles.itemQuantity}>
                            Qty: {item.quantity} × {formatCurrency(item.unit_price ?? item.price)}
                          </Text>
                        </View>
                        <Text style={styles.itemTotal}>
                          {formatCurrency(item.subtotal || (item.quantity * (item.unit_price ?? item.price)))}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Order Summary */}
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>Order Summary</Text>
                    <View style={styles.summarySubtotalRow}>
                      <Text style={styles.summarySubLabel}>Payment Method</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={selectedOrder.payment_method === 'online' || selectedOrder.payment_method === 'online_payment' ? 'card-outline' : 'cash-outline'} size={16} color={COLORS.textSecondary} />
                        <Text style={styles.summaryValue}>{formatPaymentMethod(selectedOrder.payment_method)}</Text>
                      </View>
                    </View>
                    <View style={styles.summaryTotalRow}>
                      <Text style={styles.summaryTotalLabel}>Total</Text>
                      <Text style={styles.summaryTotal}>{formatCurrency(selectedOrder.total_amount ?? selectedOrder.total)}</Text>
                    </View>
                  </View>

                  {/* Timestamps */}
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>Timeline</Text>
                    <View style={styles.timelineRow}>
                      <Text style={styles.timelineLabel}>Created:</Text>
                      <Text style={styles.timelineValue}>{formatDate(selectedOrder.created_at)} PHT</Text>
                    </View>
                    {selectedOrder.updated_at && (
                      <View style={styles.timelineRow}>
                        <Text style={styles.timelineLabel}>Last Updated:</Text>
                        <Text style={styles.timelineValue}>{formatDate(selectedOrder.updated_at)} PHT</Text>
                      </View>
                    )}
                    {selectedOrder.delivered_at && (
                      <View style={styles.timelineRow}>
                        <Text style={styles.timelineLabel}>Delivered:</Text>
                        <Text style={styles.timelineValue}>{formatDate(selectedOrder.delivered_at)} PHT</Text>
                      </View>
                    )}
                  </View>

                  {/* Notes */}
                  {selectedOrder.notes && (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionTitle}>Notes</Text>
                      <Text style={styles.notesText}>{selectedOrder.notes}</Text>
                    </View>
                  )}

                  {/* Cancellation Reason */}
                  {selectedOrder.status === 'cancelled' && (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionTitle}>Cancellation Reason</Text>
                      <View style={styles.cancelReasonBox}>
                        <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
                        <Text style={styles.cancelReasonText}>
                          {selectedOrder.cancel_reason || 'No reason provided'}
                        </Text>
                      </View>
                    </View>
                  )}
                </ScrollView>
              )}

              {/* Update Status Button */}
              {selectedOrder && canChangeStatus(selectedOrder).allowed && (
                <View style={styles.detailFooter}>
                  <TouchableOpacity
                    style={styles.receiptButton}
                    onPress={() => handleDownloadReceipt(selectedOrder._id, getOrderNumber(selectedOrder))}
                    disabled={isDownloadingPdf}
                  >
                    {isDownloadingPdf ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <>
                        <Ionicons name="document-text" size={20} color={COLORS.primary} />
                        <Text style={styles.receiptButtonText}>Receipt</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.updateStatusButtonLarge}
                    onPress={() => {
                      setShowOrderDetail(false);
                      setTimeout(() => setShowStatusPicker(true), 300);
                    }}
                  >
                    <Ionicons name="swap-horizontal" size={20} color={COLORS.textOnPrimary} />
                    <Text style={styles.updateStatusTextLarge}>Update Status</Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* Show receipt button even for non-changeable status */}
              {selectedOrder && !canChangeStatus(selectedOrder).allowed && (
                <View style={styles.detailFooter}>
                  <TouchableOpacity
                    style={[styles.receiptButton, { flex: 1 }]}
                    onPress={() => handleDownloadReceipt(selectedOrder._id, getOrderNumber(selectedOrder))}
                    disabled={isDownloadingPdf}
                  >
                    {isDownloadingPdf ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <>
                        <Ionicons name="document-text" size={20} color={COLORS.primary} />
                        <Text style={styles.receiptButtonText}>Download Receipt</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* Status Picker Modal */}
        <Modal
          visible={showStatusPicker}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowStatusPicker(false)}
        >
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerContent}>
              <Text style={styles.pickerTitle}>Update Order Status</Text>
              <Text style={styles.pickerSubtitle}>
                Order #{getOrderNumber(selectedOrder)}
              </Text>

              {ORDER_STATUSES.map((status) => {
                const config = STATUS_CONFIG[status];
                const isCurrentStatus = selectedOrder?.status === status;

                return (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.statusOption,
                      isCurrentStatus && styles.statusOptionCurrent,
                    ]}
                    onPress={() => handleUpdateStatus(status)}
                    disabled={isUpdatingStatus}
                  >
                    <View style={[styles.statusOptionIcon, { backgroundColor: config.color + '20' }]}>
                      <Ionicons name={config.icon} size={20} color={config.color} />
                    </View>
                    <Text style={styles.statusOptionText}>{config.label}</Text>
                    {isCurrentStatus && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current</Text>
                      </View>
                    )}
                    {isUpdatingStatus && isCurrentStatus && (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={styles.pickerCancelButton}
                onPress={() => setShowStatusPicker(false)}
              >
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* SweetAlert Component */}
        <SweetAlert
          visible={alertConfig.visible}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
          onConfirm={alertConfig.onConfirm}
          onCancel={hideAlert}
          onClose={hideAlert}
          showCancel={alertConfig.showCancel}
          autoClose={alertConfig.autoClose}
          closeOnOverlayPress={alertConfig.closeOnOverlayPress}
        />
      </View>
    </Modal>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    elevation: 2,
  },
  headerBtn: {
    padding: 6,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  filterContainer: {
    minHeight: 44,
    maxHeight: 56,
    zIndex: 10,
    elevation: 3,
    backgroundColor: COLORS.surface,
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceVariant,
    marginRight: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  filterChipTextActive: {
    color: COLORS.textOnPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  ordersList: {
    padding: 16,
  },
  orderCard: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  orderDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  customerName: {
    fontSize: 14,
    color: COLORS.text,
  },
  orderSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  orderItems: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  orderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  updateStatusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  updateStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.warning + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  lockedText: {
    fontSize: 12,
    color: COLORS.warning,
    fontWeight: '500',
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  paymentMethodText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  emptyList: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  // Detail Modal
  detailModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  detailBody: {
    padding: 20,
    maxHeight: 500,
  },
  detailSection: {
    marginBottom: 24,
  },
  detailOrderId: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  statusBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 8,
  },
  statusTextLarge: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  customerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  customerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.surfaceVariant,
  },
  customerAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerNameWrap: {
    flex: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  itemImageContainer: {
    width: 50,
    height: 50,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 12,
  },
  itemImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  itemImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 4,
  },
  itemQuantity: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  summarySubtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  summarySubLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: COLORS.primary,
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  summaryTotal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  itemPrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timelineLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  timelineValue: {
    fontSize: 13,
    color: COLORS.text,
  },
  notesText: {
    fontSize: 14,
    color: COLORS.text,
    fontStyle: 'italic',
    backgroundColor: COLORS.surfaceVariant,
    padding: 12,
    borderRadius: 8,
  },
  detailFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    flexDirection: 'row',
    gap: 12,
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    minWidth: 100,
  },
  receiptButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  updateStatusButtonLarge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  updateStatusTextLarge: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  // Status Picker
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  pickerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: COLORS.surfaceVariant,
  },
  statusOptionCurrent: {
    backgroundColor: COLORS.primary + '15',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  statusOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  currentBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  currentBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  pickerCancelButton: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickerCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  cancelReasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.danger + '10',
    borderWidth: 1,
    borderColor: COLORS.danger + '30',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  cancelReasonText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.danger,
    lineHeight: 20,
  },
});
