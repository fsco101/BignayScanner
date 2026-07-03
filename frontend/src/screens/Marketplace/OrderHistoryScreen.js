// Order History Screen
// Displays user's order history with filtering, details, cancellation, delete, review, and PDF receipt features

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { savePdfOnMobile } from '../../utils/pdfExport';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useResponsive } from '../../hooks/useResponsive';
import OrderService from '../../services/OrderService';
import ReviewService from '../../services/ReviewService';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';
import { rules, validateField } from '../../utils/validation';
import { formatPhilippineDateTime } from '../../utils/dateTime';
import { useThemeColors } from '../../context/ThemeContext';


const ORDER_STATUSES = [
  { id: 'all', label: 'All', icon: 'list' },
  { id: 'pending', label: 'Pending', icon: 'time', color: '#FFA000' },
  { id: 'processing', label: 'Processing', icon: 'refresh', color: '#2196F3' },
  { id: 'shipped', label: 'Shipped', icon: 'airplane', color: '#9C27B0' },
  { id: 'delivered', label: 'Delivered', icon: 'checkmark-circle', color: '#4CAF50' },
  { id: 'cancelled', label: 'Cancelled', icon: 'close-circle', color: '#D32F2F' },
];

const COMMON_CANCEL_REASONS = [
  'Changed my mind',
  'Ordered by mistake',
  'Found a better price',
  'Need to change delivery address',
  'Item no longer needed',
  'Payment issue',
  'Other',
];

export default function OrderHistoryScreen({ visible, onClose, onProductsRefresh }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { isAuthenticated } = useAuth();
  const { addToCart } = useCart();
  const { alertConfig, showSuccess, showError, showWarning, showConfirm, showDelete, hideAlert } = useSweetAlert();

  // Responsive hook
  const { isDesktop, isTablet, sp, fp, responsive } = useResponsive();
  const modalResponsiveStyle = useMemo(() => ({
    overlay: isDesktop ? { justifyContent: 'center', alignItems: 'center' } : { justifyContent: 'flex-end' },
    content: isDesktop ? { maxWidth: 700, width: '90%', borderRadius: 20, maxHeight: '90%' } : {},
    titleSize: { fontSize: responsive({ mobile: fp(18), tablet: fp(19), desktop: fp(20) }) },
    bodyText: { fontSize: responsive({ mobile: fp(13), tablet: fp(14), desktop: fp(15) }) },
    padding: responsive({ mobile: sp(16), tablet: sp(18), desktop: sp(20) }),
  }), [isDesktop, sp, fp, responsive]);

  // Order history state
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderStatus, setSelectedOrderStatus] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const PAGE_SIZE = 15;

  // Selection state for bulk delete
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Review state
  const [showWriteReviewModal, setShowWriteReviewModal] = useState(false);
  const [reviewingProduct, setReviewingProduct] = useState(null);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [existingReviewId, setExistingReviewId] = useState(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);

  // PDF download state
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Cancel reason state
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedCancelReason, setSelectedCancelReason] = useState('');
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Validation states
  const [reviewError, setReviewError] = useState(null);
  const [reviewTouched, setReviewTouched] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [cancelTouched, setCancelTouched] = useState(false);
  const requiredRule = [rules.required('This field')];

  // Confirm delivery state
  const [isConfirmingDelivery, setIsConfirmingDelivery] = useState(false);

  // Load orders with pagination
  const loadOrders = useCallback(async (page = 1, refresh = false) => {
    if (!isAuthenticated) return;

    if (refresh) {
      setIsRefreshing(true);
    } else if (page === 1) {
      setOrdersLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const params = { page, limit: PAGE_SIZE };
      if (selectedOrderStatus !== 'all') {
        params.status = selectedOrderStatus;
      }
      const result = await OrderService.getMyOrders(params);

      if (result.ok) {
        const newOrders = result.orders || [];
        if (page === 1 || refresh) {
          setOrders(newOrders);
        } else {
          setOrders(prev => [...prev, ...newOrders]);
        }
        setHasMore(newOrders.length >= PAGE_SIZE);
        setCurrentPage(page);
      } else {
        showError(result.error || 'Failed to load orders');
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      showError('Failed to load orders');
    } finally {
      setOrdersLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [isAuthenticated, selectedOrderStatus]);

  // Load more orders (pagination)
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && !ordersLoading) {
      loadOrders(currentPage + 1);
    }
  }, [isLoadingMore, hasMore, ordersLoading, currentPage, loadOrders]);

  // Refresh orders
  const handleRefreshOrders = useCallback(() => {
    loadOrders(1, true);
  }, [loadOrders]);

  useEffect(() => {
    if (visible && isAuthenticated) {
      setCurrentPage(1);
      setHasMore(true);
      loadOrders(1);
    }
  }, [visible, selectedOrderStatus, isAuthenticated]);

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

  // Handle order cancellation
  const handleCancelOrder = async (orderId, orderStatus) => {
    // Only allow cancellation if not shipped or delivered
    if (orderStatus === 'shipped' || orderStatus === 'delivered') {
      showWarning('Cannot cancel this order. Orders that have been shipped or delivered cannot be cancelled.');
      return;
    }
    if (orderStatus !== 'pending' && orderStatus !== 'processing') {
      showWarning('Only pending or processing orders can be cancelled');
      return;
    }

    // Show cancel reason modal
    setCancellingOrderId(orderId);
    setCancelReason('');
    setSelectedCancelReason('');
    setCancelTouched(false);
    setCancelError(null);
    setShowCancelReasonModal(true);
  };

  // Submit cancellation with reason
  const handleSubmitCancellation = async () => {
    const finalReason = cancelReason.trim() || selectedCancelReason.trim();
    setCancelTouched(true);
    const error = validateField(finalReason, requiredRule);
    setCancelError(error);
    if (error) return;

    setIsCancelling(true);
    try {
      const result = await OrderService.cancelOrder(cancellingOrderId, finalReason);
      if (result.ok) {
        showSuccess('Order cancelled successfully. The seller has been notified.');
        loadOrders(1, true);
        setSelectedOrder(null);
        setShowOrderDetailModal(false);
        setShowCancelReasonModal(false);
        setCancelReason('');
        setSelectedCancelReason('');
        setCancelTouched(false);
        setCancelError(null);
        setCancellingOrderId(null);
      } else {
        showError(result.error || 'Failed to cancel order');
      }
    } catch (error) {
      showError('An error occurred while cancelling the order');
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle confirm delivery (user marks order as delivered)
  const handleConfirmDelivery = async (orderId) => {
    showConfirm(
      'Confirm Delivery',
      'Have you received this order? This will mark the order as delivered.',
      async () => {
        setIsConfirmingDelivery(true);
        try {
          const result = await OrderService.confirmDelivery(orderId);
          if (result.ok) {
            showSuccess('Order marked as delivered! Thank you.');
            loadOrders(1, true);
            setSelectedOrder(prev => prev ? { ...prev, status: 'delivered' } : null);
          } else {
            showError(result.error || 'Failed to confirm delivery');
          }
        } catch (error) {
          showError('An error occurred while confirming delivery');
        } finally {
          setIsConfirmingDelivery(false);
        }
      }
    );
  };

  // Handle delete single order
  const handleDeleteOrder = async (orderId, orderStatus) => {
    if (orderStatus !== 'delivered' && orderStatus !== 'cancelled') {
      showWarning('Only delivered or cancelled orders can be deleted');
      return;
    }

    showDelete(
      'Delete Order',
      'Are you sure you want to delete this order? This action cannot be undone.',
      async () => {
        setIsDeleting(true);
        try {
          const result = await OrderService.deleteOrder(orderId);
          if (result.ok) {
            showSuccess('Order deleted successfully');
            loadOrders(1, true);
            setSelectedOrder(null);
            setShowOrderDetailModal(false);
          } else {
            showError(result.error || 'Failed to delete order');
          }
        } catch (error) {
          showError('An error occurred while deleting the order');
        } finally {
          setIsDeleting(false);
        }
      }
    );
  };

  // Handle bulk delete orders
  const handleBulkDelete = async () => {
    if (selectedOrders.length === 0) {
      showWarning('Please select orders to delete');
      return;
    }

    showDelete(
      'Delete Selected Orders',
      `Are you sure you want to delete ${selectedOrders.length} order(s)? This action cannot be undone.`,
      async () => {
        setIsDeleting(true);
        try {
          const result = await OrderService.bulkDeleteOrders(selectedOrders);
          if (result.ok) {
            showSuccess(`${result.deleted_count} order(s) deleted successfully`);
            setSelectedOrders([]);
            setSelectionMode(false);
            loadOrders(1, true);
          } else {
            showError(result.error || 'Failed to delete orders');
          }
        } catch (error) {
          showError('An error occurred while deleting orders');
        } finally {
          setIsDeleting(false);
        }
      }
    );
  };

  // Toggle order selection
  const toggleOrderSelection = (orderId, orderStatus) => {
    if (orderStatus !== 'delivered' && orderStatus !== 'cancelled') {
      return; // Only allow selecting deletable orders
    }
    
    setSelectedOrders(prev => 
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  // Select all deletable orders
  const selectAllDeletable = () => {
    const deletableOrders = orders
      .filter(o => o.status === 'delivered' || o.status === 'cancelled')
      .map(o => o._id);
    setSelectedOrders(deletableOrders);
  };

  // Check if order is deletable
  const isOrderDeletable = (status) => {
    return status === 'delivered' || status === 'cancelled';
  };

  // Handle writing review for delivered order
  const handleWriteReview = async (product) => {
    setReviewingProduct(product);
    setReviewText('');
    setReviewRating(5);
    setExistingReviewId(null);
    setShowWriteReviewModal(true);
    
    // Check if user already has a review for this product and fetch it
    setIsLoadingReview(true);
    try {
      const canReviewResult = await ReviewService.canReviewProduct(product.product_id);
      
      if (canReviewResult.ok) {
        if (canReviewResult.reason === 'already_reviewed' && canReviewResult.existing_review_id) {
          // User already reviewed, fetch the existing review
          setExistingReviewId(canReviewResult.existing_review_id);
          
          // Fetch all reviews for this product to find user's review
          const reviewsResult = await ReviewService.getProductReviews(product.product_id);
          if (reviewsResult.ok && reviewsResult.reviews) {
            const existingReview = reviewsResult.reviews.find(
              r => r._id === canReviewResult.existing_review_id
            );
            if (existingReview) {
              setReviewText(existingReview.comment || '');
              setReviewRating(existingReview.rating || 5);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking review status:', error);
    } finally {
      setIsLoadingReview(false);
    }
  };

  // Submit review for delivered order product (create or update)
  const handleSubmitOrderReview = async () => {
    setReviewTouched(true);
    const error = validateField(reviewText, requiredRule);
    setReviewError(error);
    if (error) return;

    if (!reviewingProduct) {
      showError('No product selected for review');
      return;
    }

    setIsSubmittingReview(true);
    try {
      let result;
      
      if (existingReviewId) {
        // Update existing review
        result = await ReviewService.updateReview(existingReviewId, {
          comment: reviewText,
          rating: reviewRating,
        });
        
        if (result.ok) {
          showSuccess('Review updated successfully!');
        } else {
          showError(result.error || 'Failed to update review');
          return;
        }
      } else {
        // Create new review
        result = await ReviewService.createReview(reviewingProduct.product_id, {
          comment: reviewText,
          rating: reviewRating,
        });

        if (result.ok) {
          showSuccess('Review submitted successfully!');
        } else {
          showError(result.error || 'Failed to submit review');
          return;
        }
      }
      
      // Success - close modal and refresh
      setShowWriteReviewModal(false);
      setReviewingProduct(null);
      setReviewText('');
      setReviewRating(5);
      setExistingReviewId(null);
      if (onProductsRefresh) {
        onProductsRefresh();
      }
    } catch (error) {
      showError('An error occurred while submitting review');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Handle reorder
  const handleReorder = (order, products = []) => {
    order.items?.forEach((item) => {
      // Try to find product in products list to check current stock
      const currentProduct = products.find((p) => p._id === item.product_id);
      if (currentProduct && currentProduct.stock > 0) {
        addToCart(currentProduct, Math.min(item.quantity, currentProduct.stock));
      }
    });
    showSuccess('Items added to cart!');
    setShowOrderDetailModal(false);
    onClose?.();
  };

  // Render order card
  const renderOrderCard = ({ item }) => {
    const isSelected = selectedOrders.includes(item._id);
    const isDeletable = isOrderDeletable(item.status);
    
    return (
      <TouchableOpacity
        style={[
          styles.orderCard,
          selectionMode && isSelected && styles.orderCardSelected,
        ]}
        onPress={() => {
          if (selectionMode) {
            toggleOrderSelection(item._id, item.status);
          } else {
            setSelectedOrder(item);
            setShowOrderDetailModal(true);
          }
        }}
        onLongPress={() => {
          if (isDeletable && !selectionMode) {
            setSelectionMode(true);
            setSelectedOrders([item._id]);
          }
        }}
      >
        {selectionMode && (
          <View style={styles.orderCheckbox}>
            {isDeletable ? (
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={24}
                color={isSelected ? COLORS.primary : COLORS.textSecondary}
              />
            ) : (
              <Ionicons
                name="lock-closed"
                size={20}
                color={COLORS.textLight}
              />
            )}
          </View>
        )}
        <View style={styles.orderCardContent}>
          <View style={styles.orderCardHeader}>
            <Text style={styles.orderNumber}>#{item.order_number}</Text>
            <View
              style={[
                styles.orderStatusBadge,
                {
                  backgroundColor:
                    ORDER_STATUSES.find((s) => s.id === item.status)?.color ||
                    COLORS.textSecondary,
                },
              ]}
            >
              <Text style={styles.orderStatusBadgeText}>
                {item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}
              </Text>
            </View>
          </View>
          <View style={styles.orderCardBody}>
            <Text style={styles.orderItemsPreview} numberOfLines={1}>
              {item.items?.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')}
            </Text>
            <Text style={styles.orderTotal}>
              Total: ₱{item.total_amount?.toFixed(2)}
            </Text>
          </View>
          <View style={styles.orderCardFooter}>
            <Text style={styles.orderDate}>
              {formatPhilippineDateTime(item.created_at)} PHT
            </Text>
            <View style={styles.orderCardActions}>
              {isDeletable && !selectionMode && (
                <TouchableOpacity
                  style={styles.deleteIconButton}
                  onPress={() => handleDeleteOrder(item._id, item.status)}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              )}
              <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, modalResponsiveStyle.overlay]}>
        <View style={[styles.orderHistoryModalContent, modalResponsiveStyle.content]}>
          <View style={styles.orderHistoryHeader}>
            {selectionMode ? (
              <>
                <View style={styles.selectionHeaderLeft}>
                  <TouchableOpacity 
                    onPress={() => {
                      setSelectionMode(false);
                      setSelectedOrders([]);
                    }}
                    style={styles.cancelSelectionButton}
                  >
                    <Ionicons name="close" size={24} color={COLORS.text} />
                  </TouchableOpacity>
                  <Text style={styles.selectionCountText}>
                    {selectedOrders.length} selected
                  </Text>
                </View>
                <View style={styles.selectionHeaderRight}>
                  <TouchableOpacity 
                    onPress={selectAllDeletable}
                    style={styles.selectAllButton}
                  >
                    <Text style={styles.selectAllText}>Select All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={handleBulkDelete}
                    style={[
                      styles.bulkDeleteButton,
                      selectedOrders.length === 0 && styles.bulkDeleteButtonDisabled
                    ]}
                    disabled={selectedOrders.length === 0 || isDeleting}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color={COLORS.buttonText} />
                    ) : (
                      <>
                        <Ionicons name="trash" size={18} color={COLORS.buttonText} />
                        <Text style={styles.bulkDeleteText}>Delete</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.orderHistoryTitle}>Order History</Text>
                <TouchableOpacity onPress={onClose}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Status Filter Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.orderStatusTabs}
            contentContainerStyle={styles.orderStatusTabsContent}
          >
            {ORDER_STATUSES.map((status) => (
              <TouchableOpacity
                key={status.id}
                style={[
                  styles.orderStatusTab,
                  selectedOrderStatus === status.id && styles.orderStatusTabActive,
                ]}
                onPress={() => setSelectedOrderStatus(status.id)}
              >
                <Ionicons
                  name={status.icon}
                  size={16}
                  color={
                    selectedOrderStatus === status.id
                      ? '#FFFFFF'
                      : status.color || COLORS.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.orderStatusTabText,
                    selectedOrderStatus === status.id &&
                      styles.orderStatusTabTextActive,
                  ]}
                >
                  {status.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {ordersLoading ? (
            <View style={styles.ordersLoadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.ordersLoadingText}>Loading orders...</Text>
            </View>
          ) : orders.length > 0 ? (
            <FlatList
              data={orders}
              keyExtractor={(item) => item._id}
              renderItem={renderOrderCard}
              contentContainerStyle={styles.ordersList}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefreshOrders}
                  colors={[COLORS.primary]}
                  tintColor={COLORS.primary}
                />
              }
              ListFooterComponent={
                isLoadingMore ? (
                  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={{ color: COLORS.textSecondary, marginTop: 4, fontSize: 12 }}>Loading more orders...</Text>
                  </View>
                ) : null
              }
            />
          ) : (
            <View style={styles.emptyOrders}>
              <Ionicons name="receipt-outline" size={64} color={COLORS.textLight} />
              <Text style={styles.emptyOrdersText}>No orders found</Text>
              <Text style={styles.emptyOrdersSubtext}>
                {selectedOrderStatus === 'all'
                  ? "You haven't placed any orders yet"
                  : `No ${selectedOrderStatus} orders`}
              </Text>
            </View>
          )}
        </View>

        {/* Order Detail Modal */}
        <Modal
          visible={showOrderDetailModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowOrderDetailModal(false)}
        >
          {selectedOrder && (
            <View style={[styles.modalOverlay, modalResponsiveStyle.overlay]}>
              <View style={[styles.orderDetailModalContent, modalResponsiveStyle.content]}>
                <View style={styles.orderDetailHeader}>
                  <View>
                    <Text style={styles.orderDetailTitle}>
                      Order #{selectedOrder.order_number}
                    </Text>
                    <View
                      style={[
                        styles.orderStatusBadge,
                        {
                          backgroundColor:
                            ORDER_STATUSES.find((s) => s.id === selectedOrder.status)
                              ?.color || COLORS.textSecondary,
                        },
                      ]}
                    >
                      <Text style={styles.orderStatusBadgeText}>
                        {selectedOrder.status?.charAt(0).toUpperCase() +
                          selectedOrder.status?.slice(1)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setShowOrderDetailModal(false)}>
                    <Ionicons name="close" size={24} color={COLORS.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.orderDetailBody}>
                  {/* Order Items */}
                  <View style={styles.orderDetailSection}>
                    <Text style={styles.orderDetailSectionTitle}>Order Items</Text>
                    {selectedOrder.items?.map((item, index) => (
                      <View key={index} style={styles.orderDetailItem}>
                        <View style={styles.orderDetailItemImage}>
                          {item.product_image ? (
                            <Image
                              source={{ uri: item.product_image }}
                              style={styles.orderDetailItemImg}
                            />
                          ) : (
                            <View style={styles.orderDetailItemPlaceholder}>
                              <Ionicons
                                name="leaf"
                                size={20}
                                color={COLORS.primaryLight}
                              />
                            </View>
                          )}
                        </View>
                        <View style={styles.orderDetailItemInfo}>
                          <Text style={styles.orderDetailItemName}>
                            {item.product_name}
                          </Text>
                          <Text style={styles.orderDetailItemPrice}>
                            ₱{item.unit_price?.toFixed(2)} x {item.quantity}{item.sold_by === 'kg' ? ' kg' : ' pcs'}
                          </Text>
                        </View>
                        <View style={styles.orderDetailItemTotal}>
                          <Text style={styles.orderDetailItemTotalText}>
                            ₱{item.subtotal?.toFixed(2)}
                          </Text>
                          {selectedOrder.status === 'delivered' && (
                            <TouchableOpacity
                              style={styles.reviewItemButton}
                              onPress={() => handleWriteReview(item)}
                            >
                              <Ionicons
                                name="star-outline"
                                size={14}
                                color={COLORS.primary}
                              />
                              <Text style={styles.reviewItemButtonText}>Review</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Order Summary */}
                  <View style={styles.orderDetailSection}>
                    <Text style={styles.orderDetailSectionTitle}>Order Summary</Text>
                    <View style={styles.orderDetailRow}>
                      <Text style={styles.orderDetailLabel}>Subtotal</Text>
                      <Text style={styles.orderDetailValue}>
                        ₱{selectedOrder.total_amount?.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.orderDetailRow}>
                      <Text style={styles.orderDetailLabel}>Shipping</Text>
                      <Text style={styles.orderDetailValue}>Free</Text>
                    </View>
                    <View style={styles.orderDetailDivider} />
                    <View style={styles.orderDetailRow}>
                      <Text style={styles.orderDetailTotalLabel}>Total</Text>
                      <Text style={styles.orderDetailTotalValue}>
                        ₱{selectedOrder.total_amount?.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  {/* Shipping Info */}
                  <View style={styles.orderDetailSection}>
                    <Text style={styles.orderDetailSectionTitle}>
                      Shipping Address
                    </Text>
                    <Text style={styles.orderDetailAddress}>
                      {selectedOrder.shipping_address}
                    </Text>
                    <Text style={styles.orderDetailAddress}>
                      {selectedOrder.shipping_city}
                      {selectedOrder.shipping_province
                        ? `, ${selectedOrder.shipping_province}`
                        : ''}
                      {selectedOrder.shipping_postal_code
                        ? ` ${selectedOrder.shipping_postal_code}`
                        : ''}
                    </Text>
                    <Text style={styles.orderDetailPhone}>
                      📞 {selectedOrder.shipping_phone}
                    </Text>
                  </View>

                  {/* Order Notes */}
                  {selectedOrder.notes && (
                    <View style={styles.orderDetailSection}>
                      <Text style={styles.orderDetailSectionTitle}>Order Notes</Text>
                      <Text style={styles.orderDetailNotes}>
                        {selectedOrder.notes}
                      </Text>
                    </View>
                  )}

                  {/* Order Timeline */}
                  <View style={styles.orderDetailSection}>
                    <Text style={styles.orderDetailSectionTitle}>Order Timeline</Text>
                    <View style={styles.orderTimeline}>
                      <View style={styles.timelineItem}>
                        <View
                          style={[
                            styles.timelineDot,
                            { backgroundColor: COLORS.success },
                          ]}
                        />
                        <View style={styles.timelineContent}>
                          <Text style={styles.timelineTitle}>Order Placed</Text>
                          <Text style={styles.timelineDate}>
                            {formatPhilippineDateTime(selectedOrder.created_at)} PHT
                          </Text>
                        </View>
                      </View>
                      {selectedOrder.status !== 'pending' &&
                        selectedOrder.status !== 'cancelled' && (
                          <View style={styles.timelineItem}>
                            <View
                              style={[
                                styles.timelineDot,
                                { backgroundColor: COLORS.info },
                              ]}
                            />
                            <View style={styles.timelineContent}>
                              <Text style={styles.timelineTitle}>Processing</Text>
                            </View>
                          </View>
                        )}
                      {(selectedOrder.status === 'shipped' ||
                        selectedOrder.status === 'delivered') && (
                        <View style={styles.timelineItem}>
                          <View
                            style={[
                              styles.timelineDot,
                              { backgroundColor: '#9C27B0' },
                            ]}
                          />
                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineTitle}>Shipped</Text>
                          </View>
                        </View>
                      )}
                      {selectedOrder.status === 'delivered' && (
                        <View style={styles.timelineItem}>
                          <View
                            style={[
                              styles.timelineDot,
                              { backgroundColor: COLORS.success },
                            ]}
                          />
                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineTitle}>Delivered</Text>
                            {selectedOrder.updated_at && (
                              <Text style={styles.timelineDate}>
                                {formatPhilippineDateTime(selectedOrder.updated_at)} PHT
                              </Text>
                            )}
                          </View>
                        </View>
                      )}
                      {selectedOrder.status === 'cancelled' && (
                        <View style={styles.timelineItem}>
                          <View
                            style={[
                              styles.timelineDot,
                              { backgroundColor: COLORS.danger },
                            ]}
                          />
                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineTitle}>Cancelled</Text>
                            {selectedOrder.updated_at && (
                              <Text style={styles.timelineDate}>
                                {formatPhilippineDateTime(selectedOrder.updated_at)} PHT
                              </Text>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Cancellation Reason */}
                  {selectedOrder.status === 'cancelled' && selectedOrder.cancel_reason && (
                    <View style={styles.orderDetailSection}>
                      <Text style={styles.orderDetailSectionTitle}>Cancellation Reason</Text>
                      <View style={styles.cancelReasonBox}>
                        <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
                        <Text style={styles.cancelReasonText}>{selectedOrder.cancel_reason}</Text>
                      </View>
                    </View>
                  )}
                </ScrollView>

                {/* Action Buttons */}
                <View style={styles.orderDetailFooter}>
                  {/* PDF Receipt Button - Always visible */}
                  <TouchableOpacity
                    style={styles.receiptButton}
                    onPress={() => handleDownloadReceipt(selectedOrder._id, selectedOrder.order_number)}
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

                  {(selectedOrder.status === 'pending' || selectedOrder.status === 'processing') && (
                    <TouchableOpacity
                      style={styles.cancelOrderButton}
                      onPress={() =>
                        handleCancelOrder(selectedOrder._id, selectedOrder.status)
                      }
                    >
                      <Ionicons name="close-circle" size={20} color={COLORS.buttonText} />
                      <Text style={styles.cancelOrderButtonText}>Cancel Order</Text>
                    </TouchableOpacity>
                  )}
                  {selectedOrder.status === 'shipped' && (
                    <TouchableOpacity
                      style={[styles.reorderButton, { backgroundColor: COLORS.success }]}
                      onPress={() => handleConfirmDelivery(selectedOrder._id)}
                      disabled={isConfirmingDelivery}
                    >
                      {isConfirmingDelivery ? (
                        <ActivityIndicator size="small" color={COLORS.buttonText} />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color={COLORS.buttonText} />
                          <Text style={styles.reorderButtonText}>Received</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                  {selectedOrder.status === 'delivered' && (
                    <>
                      <TouchableOpacity
                        style={styles.reorderButton}
                        onPress={() => handleReorder(selectedOrder)}
                      >
                        <Ionicons name="refresh" size={20} color={COLORS.buttonText} />
                        <Text style={styles.reorderButtonText}>Order Again</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteOrderButton}
                        onPress={() => handleDeleteOrder(selectedOrder._id, selectedOrder.status)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? (
                          <ActivityIndicator size="small" color={COLORS.buttonText} />
                        ) : (
                          <>
                            <Ionicons name="trash" size={20} color={COLORS.buttonText} />
                            <Text style={styles.deleteOrderButtonText}>Delete</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                  {selectedOrder.status === 'cancelled' && (
                    <TouchableOpacity
                      style={styles.deleteOrderButton}
                      onPress={() => handleDeleteOrder(selectedOrder._id, selectedOrder.status)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={COLORS.buttonText} />
                      ) : (
                        <>
                          <Ionicons name="trash" size={20} color={COLORS.buttonText} />
                          <Text style={styles.deleteOrderButtonText}>Delete Order</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        </Modal>

        {/* Write Review Modal */}
        <Modal
          visible={showWriteReviewModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowWriteReviewModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.modalOverlay, modalResponsiveStyle.overlay]}
          >
            <View style={[styles.writeReviewModalContent, modalResponsiveStyle.content]}>
              <View style={styles.writeReviewHeader}>
                <Text style={styles.writeReviewTitle}>
                  {existingReviewId ? 'Edit Your Review' : 'Write a Review'}
                </Text>
                <TouchableOpacity onPress={() => setShowWriteReviewModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              {reviewingProduct && (
                <ScrollView style={styles.writeReviewBody}>
                  <View style={styles.reviewProductInfo}>
                    <View style={styles.reviewProductImage}>
                      {reviewingProduct.product_image ? (
                        <Image
                          source={{ uri: reviewingProduct.product_image }}
                          style={styles.reviewProductImg}
                        />
                      ) : (
                        <View style={styles.reviewProductPlaceholder}>
                          <Ionicons
                            name="leaf"
                            size={24}
                            color={COLORS.primaryLight}
                          />
                        </View>
                      )}
                    </View>
                    <Text style={styles.reviewProductName}>
                      {reviewingProduct.product_name}
                    </Text>
                  </View>

                  {isLoadingReview ? (
                    <View style={styles.loadingReviewContainer}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={styles.loadingReviewText}>Loading your review...</Text>
                    </View>
                  ) : (
                    <>
                      {existingReviewId && (
                        <View style={styles.editingBadge}>
                          <Ionicons name="create-outline" size={16} color={COLORS.warning} />
                          <Text style={styles.editingBadgeText}>Editing your existing review</Text>
                        </View>
                      )}
                      
                      <Text style={styles.ratingLabel}>Your Rating</Text>
                      <View style={styles.ratingStars}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <TouchableOpacity
                            key={star}
                            onPress={() => setReviewRating(star)}
                          >
                            <Ionicons
                              name={star <= reviewRating ? 'star' : 'star-outline'}
                              size={36}
                              color="#FFB800"
                            />
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={styles.reviewLabel}>Your Review</Text>
                      <TextInput
                        style={[styles.reviewTextInput, reviewTouched && reviewError && styles.reviewTextInputError]}
                        placeholder="Share your experience with this product..."
                        placeholderTextColor={COLORS.textLight}
                        value={reviewText}
                        onChangeText={(text) => {
                          setReviewText(text);
                          if (reviewTouched) setReviewError(validateField(text, requiredRule));
                        }}
                        onBlur={() => {
                          setReviewTouched(true);
                          setReviewError(validateField(reviewText, requiredRule));
                        }}
                        multiline
                        numberOfLines={5}
                        maxLength={500}
                      />
                      {reviewTouched && reviewError && (
                        <View style={styles.errorRow}>
                          <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                          <Text style={styles.errorText}>{reviewError}</Text>
                        </View>
                      )}
                      <Text style={styles.charCount}>{reviewText.length}/500</Text>
                    </>
                  )}
                </ScrollView>
              )}

              <View style={styles.writeReviewFooter}>
                <TouchableOpacity
                  style={[
                    styles.submitReviewBtn,
                    (isSubmittingReview || isLoadingReview) && styles.buttonDisabled,
                  ]}
                  onPress={handleSubmitOrderReview}
                  disabled={isSubmittingReview || isLoadingReview}
                >
                  {isSubmittingReview ? (
                    <ActivityIndicator color={COLORS.buttonText} size="small" />
                  ) : (
                    <>
                      <Ionicons name={existingReviewId ? "checkmark" : "send"} size={18} color={COLORS.buttonText} />
                      <Text style={styles.submitReviewBtnText}>
                        {existingReviewId ? 'Update Review' : 'Submit Review'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Cancel Reason Modal */}
        <Modal
          visible={showCancelReasonModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowCancelReasonModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.modalOverlay, modalResponsiveStyle.overlay]}
          >
            <View style={[styles.writeReviewModalContent, modalResponsiveStyle.content]}>
              <View style={styles.writeReviewHeader}>
                <Text style={styles.writeReviewTitle}>Cancel Order</Text>
                <TouchableOpacity onPress={() => setShowCancelReasonModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.writeReviewBody}>
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <Ionicons name="warning" size={48} color={COLORS.warning} />
                  <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 12, textAlign: 'center' }}>
                    Are you sure you want to cancel this order?
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 6, textAlign: 'center' }}>
                    Please provide a reason. The seller will be notified via email.
                  </Text>
                </View>

                <Text style={styles.reviewLabel}>Reason for Cancellation *</Text>

                <Text style={styles.commonReasonLabel}>Common reasons</Text>
                <View style={styles.commonReasonWrap}>
                  {COMMON_CANCEL_REASONS.map((reason) => {
                    const isSelected = selectedCancelReason === reason;
                    return (
                      <TouchableOpacity
                        key={reason}
                        style={[
                          styles.commonReasonChip,
                          isSelected && styles.commonReasonChipActive,
                        ]}
                        onPress={() => {
                          setSelectedCancelReason(reason);
                          if (reason === 'Other') {
                            setCancelReason('');
                          } else {
                            setCancelReason(reason);
                          }
                          if (cancelTouched) {
                            setCancelError(validateField((reason === 'Other' ? '' : reason), requiredRule));
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.commonReasonChipText,
                            isSelected && styles.commonReasonChipTextActive,
                          ]}
                        >
                          {reason}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  style={[styles.reviewTextInput, cancelTouched && cancelError && styles.reviewTextInputError]}
                  placeholder="Please explain why you want to cancel this order..."
                  placeholderTextColor={COLORS.textLight}
                  value={cancelReason}
                  onChangeText={(text) => {
                    setCancelReason(text);
                    if (cancelTouched) setCancelError(validateField(text, requiredRule));
                  }}
                  onBlur={() => {
                    setCancelTouched(true);
                    setCancelError(validateField(cancelReason, requiredRule));
                  }}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
                {cancelTouched && cancelError && (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                    <Text style={styles.errorText}>{cancelError}</Text>
                  </View>
                )}
                <Text style={styles.charCount}>{cancelReason.length}/500</Text>
              </ScrollView>

              <View style={styles.writeReviewFooter}>
                <TouchableOpacity
                  style={[styles.cancelModalBackButton, { flex: 1, marginRight: 8 }]}
                  onPress={() => {
                    setShowCancelReasonModal(false);
                    setCancelReason('');
                    setSelectedCancelReason('');
                    setCancelTouched(false);
                    setCancelError(null);
                  }}
                >
                  <Text style={styles.cancelModalBackButtonText}>Go Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitReviewBtn,
                    { backgroundColor: COLORS.danger, flex: 1 },
                    isCancelling && styles.buttonDisabled,
                  ]}
                  onPress={handleSubmitCancellation}
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <ActivityIndicator color={COLORS.buttonText} size="small" />
                  ) : (
                    <>
                      <Ionicons name="close-circle" size={18} color={COLORS.buttonText} />
                      <Text style={styles.submitReviewBtnText}>Cancel Order</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  orderHistoryModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    flex: 1,
  },
  orderHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  orderHistoryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  orderStatusTabs: {
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  orderStatusTabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  orderStatusTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceVariant,
    marginRight: 8,
    gap: 6,
    flexShrink: 0,
  },
  orderStatusTabActive: {
    backgroundColor: COLORS.primary,
  },
  orderStatusTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  orderStatusTabTextActive: {
    color: COLORS.textOnPrimary,
  },
  ordersLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  ordersLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  ordersList: {
    padding: 16,
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  orderStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  orderStatusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  orderCardBody: {
    marginBottom: 8,
  },
  orderItemsPreview: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 4,
  },
  orderTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  orderDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  emptyOrders: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyOrdersText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptyOrdersSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  // Order Detail Modal styles
  orderDetailModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '95%',
    flex: 1,
  },
  orderDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  orderDetailTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  orderDetailBody: {
    flex: 1,
  },
  orderDetailSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  orderDetailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  orderDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  orderDetailItemImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 12,
  },
  orderDetailItemImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  orderDetailItemPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderDetailItemInfo: {
    flex: 1,
  },
  orderDetailItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  orderDetailItemPrice: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  orderDetailItemTotal: {
    alignItems: 'flex-end',
  },
  orderDetailItemTotalText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 4,
  },
  reviewItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  reviewItemButtonText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.primary,
  },
  orderDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  orderDetailLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  orderDetailValue: {
    fontSize: 14,
    color: COLORS.text,
  },
  orderDetailDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 8,
  },
  orderDetailTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  orderDetailTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  orderDetailAddress: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
  },
  orderDetailPhone: {
    fontSize: 14,
    color: COLORS.text,
    marginTop: 8,
  },
  orderDetailNotes: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  orderTimeline: {
    paddingLeft: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  timelineDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  orderDetailFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    gap: 8,
  },
  cancelOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.warning,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 6,
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 46,
  },
  cancelOrderButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  reorderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    flexGrow: 1,
    flexBasis: '45%',
  },
  reorderButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
    minWidth: 90,
    flexGrow: 1,
    flexBasis: '45%',
  },
  receiptButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  deleteOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.danger,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    flexGrow: 1,
    flexBasis: '45%',
  },
  deleteOrderButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  // Selection mode styles
  selectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelSelectionButton: {
    padding: 4,
  },
  selectionCountText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  selectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectAllButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  bulkDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.danger,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  bulkDeleteButtonDisabled: {
    opacity: 0.5,
  },
  bulkDeleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  orderCardSelected: {
    backgroundColor: COLORS.primaryBg,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  orderCheckbox: {
    marginRight: 12,
    justifyContent: 'center',
  },
  orderCardContent: {
    flex: 1,
  },
  orderCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteIconButton: {
    padding: 4,
  },
  // Write Review Modal styles
  writeReviewModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  writeReviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  writeReviewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  writeReviewBody: {
    padding: 20,
  },
  reviewProductInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  reviewProductImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 16,
  },
  reviewProductImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  reviewProductPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewProductName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  reviewLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  reviewTextInput: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reviewTextInputError: {
    borderColor: COLORS.danger,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingLeft: 2,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  commonReasonLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  commonReasonWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  commonReasonChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: COLORS.surfaceVariant,
  },
  commonReasonChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  commonReasonChipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  commonReasonChipTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  loadingReviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 10,
  },
  loadingReviewText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  editingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '20',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  editingBadgeText: {
    fontSize: 13,
    color: COLORS.warning,
    fontWeight: '500',
  },
  writeReviewFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  submitReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  submitReviewBtnText: {
    color: COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelModalBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    minHeight: 46,
  },
  cancelModalBackButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
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
