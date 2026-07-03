// UserOrderManagement.js
// Seller-facing order management — shows only orders containing the seller's own products.
// Sellers can update order status to: Processing, Shipped, Ready for Pickup.
// Design mirrors the admin OrderManagement screen.

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
import { useAuth } from '../../../context/AuthContext';
import { useThemeColors } from '../../../context/ThemeContext';

// -------------------------------------------------------
//  Constants
// -------------------------------------------------------

const SELLER_STATUSES = ['processing', 'shipped', 'ready_for_pickup'];

const STATUS_CONFIG = {
  pending:          { color: '#FFA000', icon: 'time-outline',              label: 'Pending' },
  processing:       { color: '#2196F3', icon: 'cube-outline',             label: 'Processing' },
  shipped:          { color: '#9C27B0', icon: 'car-outline',              label: 'Shipped' },
  ready_for_pickup: { color: '#F97316', icon: 'storefront-outline',       label: 'Ready for Pickup' },
  delivered:        { color: '#4CAF50', icon: 'checkmark-circle-outline', label: 'Delivered' },
  cancelled:        { color: '#D32F2F', icon: 'close-circle-outline',     label: 'Cancelled' },
  refunded:         { color: '#6B7280', icon: 'return-down-back-outline', label: 'Refunded' },
};

const STATUS_FILTERS = [
  { key: 'all',              label: 'All' },
  { key: 'pending',          label: 'Pending' },
  { key: 'processing',       label: 'Processing' },
  { key: 'shipped',          label: 'Shipped' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'delivered',        label: 'Delivered' },
  { key: 'cancelled',        label: 'Cancelled' },
];

// -------------------------------------------------------
//  Helpers
// -------------------------------------------------------

const formatCurrency = (amount) => {
  const n = Number(amount) || 0;
  return '\u20B1' + n.toFixed(2);
};

const formatPaymentMethod = (method) => {
  const methods = {
    cod: 'Cash on Delivery',
    cash_on_delivery: 'Cash on Delivery',
    online: 'Online Payment',
    online_payment: 'Online Payment',
    wallet: 'Wallet',
  };
  return methods[method] || (method || 'Cash on Delivery').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const getOrderNumber = (order) =>
  order?.order_number || order?.id?.slice(-6).toUpperCase() || order?._id?.slice(-6).toUpperCase() || 'N/A';

// -------------------------------------------------------
//  Main Component
// -------------------------------------------------------

export default function UserOrderManagement({ visible, onClose }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const { alertConfig, showSuccess, showError, showWarning, hideAlert } = useSweetAlert();

  // -- State --
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

  // -- Receipt download (mirrors admin) --
  const handleDownloadReceipt = async (orderId, orderNumber) => {
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      if (Platform.OS === 'web') {
        const url = OrderService.getReceiptPreviewUrl(orderId);
        const token = await OrderService.getAuthToken();
        Linking.openURL(token ? url + '?token=' + encodeURIComponent(token) : url);
        showSuccess('Opening receipt...');
      } else {
        // For mobile, use arrayBuffer approach (more reliable than FileReader+blob)
        const filename = 'order_' + (orderNumber || orderId) + '_receipt.pdf';
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
    } catch (error) { showError('Failed to download receipt: ' + error.message); }
    setIsDownloadingPdf(false);
  };

  // -- Fetch --
  const loadOrders = useCallback(async (page = 1, refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else if (page === 1) setIsLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filterStatus !== 'all') params.status = filterStatus;
      const result = await OrderService.getSellerOrders(params);
      if (result.ok) {
        const newOrders = result.orders || [];
        if (page === 1 || refresh) setOrders(newOrders);
        else setOrders(prev => [...prev, ...newOrders]);
        setHasMore(newOrders.length >= 20);
        setCurrentPage(page);
      } else {
        showError(result.error || 'Failed to load orders');
      }
    } catch (error) {
      showError('An error occurred while loading orders');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    if (visible) loadOrders(1, true);
  }, [visible, filterStatus]);

  const handleRefresh = () => loadOrders(1, true);
  const handleLoadMore = () => { if (!isLoading && hasMore) loadOrders(currentPage + 1); };

  // -- Status helpers --
  const canChangeStatus = (order) => {
    const s = order?.status;
    if (['delivered', 'cancelled', 'refunded'].includes(s))
      return { allowed: false, reason: s === 'delivered' ? 'Delivered orders cannot be modified' : (s.charAt(0).toUpperCase() + s.slice(1)) + ' orders cannot be modified' };
    return { allowed: true };
  };

  // -- Update status --
  const handleUpdateStatus = async (newStatus) => {
    if (!selectedOrder) return;
    const check = canChangeStatus(selectedOrder);
    if (!check.allowed) { showWarning(check.reason); setShowStatusPicker(false); return; }
    if (newStatus === selectedOrder.status) { showWarning('Order already has this status'); return; }
    setIsUpdatingStatus(true);
    try {
      const oid = selectedOrder.id || selectedOrder._id;
      const result = await OrderService.updateSellerOrderStatus(oid, newStatus);
      if (result.ok) {
        showSuccess('Order status updated to ' + (STATUS_CONFIG[newStatus]?.label || newStatus));
        setOrders(prev => prev.map(o =>
          (o.id === oid || o._id === oid)
            ? { ...o, status: newStatus, updated_at: new Date().toISOString() }
            : o
        ));
        setSelectedOrder(prev => ({ ...prev, status: newStatus, updated_at: new Date().toISOString() }));
        setShowStatusPicker(false);
      } else {
        showError(result.error || 'Failed to update order status');
      }
    } catch (error) {
      showError('An error occurred while updating the order');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // -- View details --
  const handleViewOrder = (order) => { setSelectedOrder(order); setShowOrderDetail(true); };
  const handleOpenStatusPicker = (order) => {
    const check = canChangeStatus(order);
    if (!check.allowed) { showWarning(check.reason); return; }
    setSelectedOrder(order);
    setShowStatusPicker(true);
  };

  const formatDate = (dateString) => formatPhilippineDateTime(dateString);

  // -- Render order card (matches admin design) --
  const renderOrderCard = ({ item }) => {
    const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const statusCheck = canChangeStatus(item);
    const sellerItems = item.seller_items || item.items || [];
    const total = item.seller_subtotal ?? item.total_amount ?? item.total ?? 0;

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
          <Text style={styles.customerName}>{item.user_name || 'Buyer'}</Text>
        </View>

        <View style={styles.orderSummary}>
          <Text style={styles.orderItems}>
            {sellerItems.length} item(s)
          </Text>
          <Text style={styles.orderTotal}>{formatCurrency(total)}</Text>
        </View>

        <View style={styles.paymentMethodRow}>
          <Ionicons
            name={item.payment_method === 'online' || item.payment_method === 'online_payment' ? 'card-outline' : 'cash-outline'}
            size={14}
            color={COLORS.textSecondary}
          />
          <Text style={styles.paymentMethodText}>{formatPaymentMethod(item.payment_method)}</Text>
        </View>

        <View style={styles.orderActions}>
          <TouchableOpacity
            style={[styles.updateStatusButton, !statusCheck.allowed && styles.buttonDisabled]}
            onPress={() => handleOpenStatusPicker(item)}
            disabled={!statusCheck.allowed}
          >
            <Ionicons name="swap-horizontal" size={16} color={COLORS.textOnPrimary} />
            <Text style={styles.updateStatusText}>Update Status</Text>
          </TouchableOpacity>

          {!statusCheck.allowed && (
            <View style={styles.lockedBadge}>
              <Ionicons name="lock-closed" size={12} color={COLORS.warning || '#FFA000'} />
              <Text style={styles.lockedText}>Locked</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  // ====================================================
  //  RENDER
  // ====================================================

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* -- Header -- */}
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

        {/* -- Status filter chips -- */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterContainer}
          contentContainerStyle={styles.filterContent}
        >
          {STATUS_FILTERS.map(f => {
            const cfg = STATUS_CONFIG[f.key];
            const isActive = filterStatus === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  isActive && styles.filterChipActive,
                  cfg && { borderColor: cfg.color },
                ]}
                onPress={() => setFilterStatus(f.key)}
              >
                {cfg && (
                  <Ionicons
                    name={cfg.icon}
                    size={14}
                    color={isActive ? COLORS.textOnPrimary : cfg.color}
                  />
                )}
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* -- Orders list -- */}
        {isLoading && orders.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading orders...</Text>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={item => item.id || item._id || String(Math.random())}
            renderItem={renderOrderCard}
            contentContainerStyle={styles.ordersList}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} />
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoading && orders.length > 0
                ? <ActivityIndicator style={{ padding: 16 }} color={COLORS.primary} />
                : null
            }
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Ionicons name="receipt-outline" size={64} color={COLORS.textLight || COLORS.textSecondary} />
                <Text style={styles.emptyText}>No orders found</Text>
                <Text style={styles.emptySubtext}>
                  {filterStatus !== 'all'
                    ? 'No ' + filterStatus.replace(/_/g, ' ') + ' orders'
                    : 'Customer orders for your products will appear here'}
                </Text>
              </View>
            }
          />
        )}

        {/* ====================================================
            Order Detail Modal (bottom sheet)
           ==================================================== */}
        <Modal
          visible={showOrderDetail}
          animationType="slide"
          transparent
          onRequestClose={() => setShowOrderDetail(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailModalContent}>
              {/* Header */}
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
                        { backgroundColor: (STATUS_CONFIG[selectedOrder.status]?.color || '#999') + '20' },
                      ]}
                    >
                      <Ionicons
                        name={STATUS_CONFIG[selectedOrder.status]?.icon || 'ellipse-outline'}
                        size={18}
                        color={STATUS_CONFIG[selectedOrder.status]?.color || '#999'}
                      />
                      <Text
                        style={[
                          styles.statusTextLarge,
                          { color: STATUS_CONFIG[selectedOrder.status]?.color || '#999' },
                        ]}
                      >
                        {STATUS_CONFIG[selectedOrder.status]?.label || selectedOrder.status}
                      </Text>
                    </View>
                  </View>

                  {/* Buyer Info */}
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>Buyer</Text>
                    <View style={styles.customerProfileRow}>
                      {(selectedOrder.user_avatar || selectedOrder.user_profile_image) ? (
                        <Image
                          source={{ uri: selectedOrder.user_avatar || selectedOrder.user_profile_image }}
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
                        {selectedOrder.shipping_phone ? (
                          <View style={styles.infoRow}>
                            <Ionicons name="call-outline" size={18} color={COLORS.textSecondary} />
                            <Text style={styles.infoText}>{selectedOrder.shipping_phone}</Text>
                          </View>
                        ) : null}
                      </>
                    )}
                  </View>

                  {/* Seller Items */}
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>Your Products in this Order</Text>
                    {(selectedOrder.seller_items || selectedOrder.items || []).map((item, index) => (
                      <View key={index} style={styles.orderItem}>
                        <View style={styles.itemImageContainer}>
                          {item.product_image ? (
                            <Image source={{ uri: item.product_image }} style={styles.itemImage} />
                          ) : (
                            <View style={styles.itemImagePlaceholder}>
                              <Ionicons name="leaf" size={20} color={COLORS.primaryLight || COLORS.primary} />
                            </View>
                          )}
                        </View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName}>{item.product_name || 'Product'}</Text>
                          <Text style={styles.itemPrice}>
                            Price: {formatCurrency(item.unit_price ?? item.price)}
                          </Text>
                          <Text style={styles.itemQuantity}>
                            Qty: {item.quantity} x {formatCurrency(item.unit_price ?? item.price)}
                          </Text>
                        </View>
                        <Text style={styles.itemTotal}>
                          {formatCurrency(item.subtotal || (item.quantity * (item.unit_price ?? item.price ?? 0)))}
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
                        <Ionicons
                          name={selectedOrder.payment_method === 'online' || selectedOrder.payment_method === 'online_payment' ? 'card-outline' : 'cash-outline'}
                          size={16}
                          color={COLORS.textSecondary}
                        />
                        <Text style={styles.summaryValue}>{formatPaymentMethod(selectedOrder.payment_method)}</Text>
                      </View>
                    </View>
                    <View style={styles.summaryTotalRow}>
                      <Text style={styles.summaryTotalLabel}>Your Items Total</Text>
                      <Text style={styles.summaryTotal}>
                        {formatCurrency(selectedOrder.seller_subtotal ?? selectedOrder.total_amount ?? selectedOrder.total)}
                      </Text>
                    </View>
                  </View>

                  {/* Timeline */}
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
                  {selectedOrder.notes ? (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionTitle}>Notes</Text>
                      <Text style={styles.notesText}>{selectedOrder.notes}</Text>
                    </View>
                  ) : null}

                  {/* Cancellation Reason */}
                  {selectedOrder.status === 'cancelled' && (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionTitle}>Cancellation Reason</Text>
                      <View style={styles.cancelReasonBox}>
                        <Ionicons name="alert-circle" size={18} color={COLORS.danger || '#D32F2F'} />
                        <Text style={styles.cancelReasonText}>
                          {selectedOrder.cancel_reason || 'No reason provided'}
                        </Text>
                      </View>
                    </View>
                  )}
                </ScrollView>
              )}

              {/* Footer: Receipt + Update Status */}
              {selectedOrder && canChangeStatus(selectedOrder).allowed && (
                <View style={styles.detailFooter}>
                  <TouchableOpacity
                    style={styles.receiptButton}
                    onPress={() => handleDownloadReceipt(selectedOrder.id || selectedOrder._id, getOrderNumber(selectedOrder))}
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
                    onPress={() => { setShowOrderDetail(false); setTimeout(() => setShowStatusPicker(true), 300); }}
                  >
                    <Ionicons name="swap-horizontal" size={20} color={COLORS.textOnPrimary} />
                    <Text style={styles.updateStatusTextLarge}>Update Status</Text>
                  </TouchableOpacity>
                </View>
              )}
              {selectedOrder && !canChangeStatus(selectedOrder).allowed && (
                <View style={styles.detailFooter}>
                  <TouchableOpacity
                    style={[styles.receiptButton, { flex: 1 }]}
                    onPress={() => handleDownloadReceipt(selectedOrder.id || selectedOrder._id, getOrderNumber(selectedOrder))}
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

        {/* ====================================================
            Status Picker Modal
           ==================================================== */}
        <Modal
          visible={showStatusPicker}
          animationType="fade"
          transparent
          onRequestClose={() => setShowStatusPicker(false)}
        >
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerContent}>
              <Text style={styles.pickerTitle}>Update Order Status</Text>
              <Text style={styles.pickerSubtitle}>
                Order #{getOrderNumber(selectedOrder)}
              </Text>

              {SELLER_STATUSES.map((status) => {
                const config = STATUS_CONFIG[status];
                const isCurrentStatus = selectedOrder?.status === status;
                return (
                  <TouchableOpacity
                    key={status}
                    style={[styles.statusOption, isCurrentStatus && styles.statusOptionCurrent]}
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

        {/* SweetAlert */}
        <SweetAlert
          visible={alertConfig.visible}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
          onConfirm={alertConfig.onConfirm || hideAlert}
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

// -------------------------------------------------------
//  Styles (mirrors admin OrderManagement)
// -------------------------------------------------------

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
    borderBottomColor: COLORS.divider || COLORS.border,
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
  // Filter
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
    borderBottomColor: COLORS.divider || COLORS.border,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceVariant || COLORS.surface,
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
  // Loading / Empty
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
  // Order list
  ordersList: {
    padding: 16,
  },
  // Card
  orderCard: {
    backgroundColor: COLORS.surfaceVariant || COLORS.surface,
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
    borderTopColor: COLORS.divider || COLORS.border,
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
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider || COLORS.border,
  },
  paymentMethodText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  orderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider || COLORS.border,
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
    backgroundColor: (COLORS.warning || '#FFA000') + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  lockedText: {
    fontSize: 12,
    color: COLORS.warning || '#FFA000',
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // -- Detail Modal --
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
    borderBottomColor: COLORS.divider || COLORS.border,
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
    backgroundColor: COLORS.surfaceVariant || COLORS.surface,
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
    borderBottomColor: COLORS.divider || COLORS.border,
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
    backgroundColor: COLORS.surfaceVariant || COLORS.surface,
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
  itemPrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
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
    borderTopColor: COLORS.divider || COLORS.border,
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
    backgroundColor: COLORS.surfaceVariant || COLORS.surface,
    padding: 12,
    borderRadius: 8,
  },
  cancelReasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: (COLORS.danger || '#D32F2F') + '10',
    borderWidth: 1,
    borderColor: (COLORS.danger || '#D32F2F') + '30',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  cancelReasonText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.danger || '#D32F2F',
    lineHeight: 20,
  },
  // -- Detail Footer --
  detailFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider || COLORS.border,
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
  // -- Status Picker --
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
    backgroundColor: COLORS.surfaceVariant || COLORS.surface,
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
});
