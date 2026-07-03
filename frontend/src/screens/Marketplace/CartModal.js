// Cart Modal Component
// Handles shopping cart display, quantity management, and checkout process

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Animated as RNAnimated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useResponsive } from '../../hooks/useResponsive';
import OrderService from '../../services/OrderService';
import PaymentService from '../../services/PaymentService';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';
import {
  composeFullAddress,
} from '../../data/philippineLocations';
import { useThemeColors } from '../../context/ThemeContext';

// Payment method constants
const PAYMENT_METHODS = {
  COD: 'cod',
  ONLINE: 'online',
};

const ONLINE_PAYMENT_TYPES = {
  GCASH: 'gcash',
  GRAB_PAY: 'grab_pay',
};


export default function CartModal({ visible, onClose, onOrderPlaced, navigation }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { isAuthenticated, user } = useAuth();
  const { cart, removeFromCart, updateQuantity, clearCart, getCartTotal, getCartCount } = useCart();
  const { alertConfig, showSuccess, showError, showWarning, showConfirm, hideAlert } = useSweetAlert();

  // Responsive hook
  const { isDesktop, isTablet, sp, fp, responsive } = useResponsive();
  const modalResponsiveStyle = useMemo(() => ({
    overlay: isDesktop ? { justifyContent: 'center', alignItems: 'center' } : { justifyContent: 'flex-end' },
    content: isDesktop ? { maxWidth: 600, width: '90%', borderRadius: 20, maxHeight: '85%' } : {},
    titleSize: { fontSize: responsive({ mobile: fp(18), tablet: fp(19), desktop: fp(20) }) },
    bodyText: { fontSize: responsive({ mobile: fp(13), tablet: fp(14), desktop: fp(15) }) },
    padding: responsive({ mobile: sp(16), tablet: sp(18), desktop: sp(20) }),
  }), [isDesktop, sp, fp, responsive]);

  // Checkout state
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [addressExpanded, setAddressExpanded] = useState(false);

  // Derived user address for display
  const userAddress = useMemo(() => {
    const addr = user?.address_structured || {};
    return {
      region: addr.region || '',
      province: addr.province || user?.province || '',
      city: addr.city || user?.city || '',
      barangay: addr.barangay || '',
      houseNumber: addr.house_number || '',
      street: addr.street || '',
      landmark: addr.landmark || '',
      postalCode: addr.postal_code || user?.postal_code || '',
      fullAddress: user?.address || '',
      phone: user?.phone || '',
    };
  }, [user]);

  const hasAddress = useMemo(() => {
    return !!(userAddress.province && userAddress.city);
  }, [userAddress]);

  const addressSummary = useMemo(() => {
    if (!hasAddress) return 'No address set';
    const parts = [userAddress.barangay, userAddress.city, userAddress.province].filter(Boolean);
    return parts.join(', ');
  }, [hasAddress, userAddress]);
  const validateCheckoutForm = () => {
    if (!hasAddress) {
      showWarning('Address Required', 'Please set your delivery address in your Profile before checking out.');
      return false;
    }
    if (!userAddress.phone) {
      showWarning('Phone Required', 'Please set your phone number in your Profile before checking out.');
      return false;
    }
    return true;
  };

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS.COD);
  const [onlinePaymentType, setOnlinePaymentType] = useState(ONLINE_PAYMENT_TYPES.GCASH);
  // Billing fields for online payment (test only)
  const [billingName, setBillingName] = useState(user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '');
  const [billingEmail, setBillingEmail] = useState(user?.email || '');
  const [billingPhone, setBillingPhone] = useState(userAddress.phone || '');
  const [billingAddress, setBillingAddress] = useState(userAddress.fullAddress || '');
  const [billingCity, setBillingCity] = useState(userAddress.city || '');
  const [billingProvince, setBillingProvince] = useState(userAddress.province || '');
  const [billingPostalCode, setBillingPostalCode] = useState(userAddress.postalCode || '');
  const [paymentConfig, setPaymentConfig] = useState({ enabled: false, loading: false, error: null });
  const [pendingOnlineOrderId, setPendingOnlineOrderId] = useState(null);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [verifyingMessage, setVerifyingMessage] = useState('Verifying payment...');
  const verifyProgressAnim = useRef(new RNAnimated.Value(0)).current;
  const paymentVerifyInFlightRef = useRef(false);
  const lastHandledPaymentUrlRef = useRef('');

  const parseQueryParamsFromUrl = useCallback((url) => {
    try {
      const queryString = url?.split('?')[1] || '';
      return new URLSearchParams(queryString);
    } catch (error) {
      return new URLSearchParams();
    }
  }, []);

  const handlePaymentCallback = useCallback(async (url) => {
    if (!url || !url.includes('payment-callback')) return;
    if (lastHandledPaymentUrlRef.current === url) return;

    lastHandledPaymentUrlRef.current = url;
    const queryParams = parseQueryParamsFromUrl(url);
    const callbackStatus = (queryParams.get('status') || '').toLowerCase();
    const callbackOrderId = queryParams.get('order_id') || pendingOnlineOrderId;

    if (!callbackOrderId) {
      showWarning('Payment callback received, but order ID is missing. Please verify payment from Order History.');
      return;
    }

    if (callbackStatus === 'cancelled' || callbackStatus === 'failed') {
      setPendingOnlineOrderId(null);
      setIsVerifyingPayment(false);
      showWarning('Payment cancelled. You can retry payment from Order History.');
      return;
    }

    if (paymentVerifyInFlightRef.current) return;
    paymentVerifyInFlightRef.current = true;
    setIsVerifyingPayment(true);
    setVerifyingMessage('Waiting for payment confirmation...');
    verifyProgressAnim.setValue(0);
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(verifyProgressAnim, { toValue: 1, duration: 1800, useNativeDriver: false }),
        RNAnimated.timing(verifyProgressAnim, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ])
    ).start();

    try {
      // ── Phase 1: Poll the lightweight DB status endpoint ──
      // The webhook from PayMongo is the source of truth.  We poll the
      // backend's DB-only endpoint every 2 s for up to ~30 s to see if
      // the webhook has already flipped payment_status to 'paid'.
      const POLL_INTERVAL_MS = 2000;
      const MAX_POLLS = 15; // 15 × 2 s = 30 s
      let confirmed = false;

      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        setVerifyingMessage(`Waiting for webhook confirmation... (${attempt + 1}/${MAX_POLLS})`);

        const statusResult = await PaymentService.checkPaymentStatus(callbackOrderId);
        if (statusResult?.ok && statusResult.payment_status === 'paid') {
          confirmed = true;
          break;
        }
        // If the order is marked failed/expired by webhook, stop polling.
        if (statusResult?.ok && ['failed', 'expired', 'refunded'].includes(statusResult.payment_status)) {
          setIsVerifyingPayment(false);
          verifyProgressAnim.stopAnimation();
          showWarning('Payment was not successful. Please try again from Order History.');
          return;
        }
      }

      // ── Phase 2: Fallback – ask backend to verify directly with PayMongo ──
      // If the webhook hasn't arrived after 30 s the backend verify
      // endpoint will call PayMongo, and if PayMongo confirms paid it
      // marks the order as paid as a safety-net.
      if (!confirmed) {
        setVerifyingMessage('Confirming with PayMongo...');
        const verifyResult = await PaymentService.verifyOrderPayment(callbackOrderId);
        if (verifyResult?.ok && verifyResult.status === 'paid') {
          confirmed = true;
        }
      }

      if (confirmed) {
        setVerifyingMessage('Payment confirmed!');
        verifyProgressAnim.stopAnimation();
        verifyProgressAnim.setValue(1);
        await new Promise((r) => setTimeout(r, 800));
        setPendingOnlineOrderId(null);
        setIsVerifyingPayment(false);
        onOrderPlaced?.();
        showSuccess('Payment Successful!', 'Your order payment has been confirmed.');
        return;
      }

      // Still not confirmed after polling + fallback
      setIsVerifyingPayment(false);
      showWarning('Payment is still processing. Please check Order History shortly.');
    } catch (error) {
      verifyProgressAnim.stopAnimation();
      setIsVerifyingPayment(false);
      showWarning('Unable to verify payment right now. Please check Order History.');
    } finally {
      paymentVerifyInFlightRef.current = false;
    }
  }, [onOrderPlaced, parseQueryParamsFromUrl, pendingOnlineOrderId, showSuccess, showWarning]);

  useEffect(() => {
    if (!visible || !showCheckoutModal) return;

    let mounted = true;
    const loadPaymentConfig = async () => {
      setPaymentConfig((prev) => ({ ...prev, loading: true, error: null }));
      const result = await PaymentService.getPaymentConfig();
      if (!mounted) return;

      if (result?.ok) {
        setPaymentConfig({
          enabled: Boolean(result.enabled),
          loading: false,
          error: null,
        });
        return;
      }

      setPaymentConfig({
        enabled: false,
        loading: false,
        error: result?.error || 'Unable to load payment configuration',
      });
    };

    loadPaymentConfig();
    return () => {
      mounted = false;
    };
  }, [visible, showCheckoutModal]);

  useEffect(() => {
    const handleIncomingUrl = ({ url }) => {
      handlePaymentCallback(url);
    };

    const subscription = Linking.addEventListener('url', handleIncomingUrl);

    Linking.getInitialURL()
      .then((url) => {
        if (url) handlePaymentCallback(url);
      })
      .catch(() => {});

    return () => {
      subscription.remove();
    };
  }, [handlePaymentCallback]);

  // Handle cart quantity input change
  const handleCartQuantityChange = (productId, text, maxStock) => {
    if (text === '') return;

    const numericValue = text.replace(/[^0-9]/g, '');
    if (numericValue === '') return;

    const num = parseInt(numericValue);
    if (num < 1) {
      showConfirm(
        'Remove Item',
        'Do you want to remove this item from cart?',
        () => removeFromCart(productId)
      );
      return;
    }

    if (num > maxStock) {
      showWarning(`Maximum available: ${maxStock}`);
      updateQuantity(productId, maxStock);
    } else {
      updateQuantity(productId, num);
    }
  };

  // Handle checkout
  const handleCheckout = async () => {
    if (cart.length === 0) {
      showWarning('Your cart is empty');
      return;
    }

    if (!validateCheckoutForm()) return;

    setIsCheckingOut(true);
    try {
      const items = cart.map(item => ({
        product_id: item._id,
        quantity: item.quantity,
      }));

      // Use address from user profile
      const fullAddress = userAddress.fullAddress || composeFullAddress({
        houseNumber: userAddress.houseNumber,
        street: userAddress.street,
        barangay: userAddress.barangay,
        city: userAddress.city,
        province: userAddress.province,
        region: userAddress.region,
        postalCode: userAddress.postalCode,
      });

      // First create the order
      const orderResult = await OrderService.checkout({
        items,
        shipping_address: fullAddress,
        shipping_city: userAddress.city,
        shipping_province: userAddress.province,
        shipping_postal_code: userAddress.postalCode,
        shipping_phone: userAddress.phone,
        // billing fields (optional) - included to make online payment look real
        billing_name: billingName,
        billing_email: billingEmail,
        billing_phone: billingPhone,
        billing_address: billingAddress,
        billing_city: billingCity,
        billing_province: billingProvince,
        billing_postal_code: billingPostalCode,
        notes: checkoutNotes,
        payment_method: paymentMethod,
      });

      if (!orderResult.ok) {
        showError(orderResult.error || 'Failed to place order');
        return;
      }

      const orderId = orderResult.order?._id;
      const orderNumber = orderResult.order?.order_number || 'N/A';

      // Handle payment based on method
      if (paymentMethod === PAYMENT_METHODS.COD) {
        // Cash on delivery - order is already created
        showSuccess('Order Placed Successfully! \u2705', `Order #${orderNumber} has been placed.\nPayment: Cash on Delivery\n\nThank you for your purchase!`, {
          autoClose: 0,
          onConfirm: () => { hideAlert(); handleOrderSuccess(); },
          confirmText: 'OK',
        });
      } else if (paymentMethod === PAYMENT_METHODS.ONLINE) {
        if (!paymentConfig.enabled) {
          showWarning('Online payment is not configured yet. Please use Cash on Delivery for now.');
          return;
        }

        if (!billingName || !billingEmail || !billingPhone) {
          showWarning('Billing details required', 'Please fill in your name, email, and mobile number to proceed.');
          return;
        }

        // Initiate online payment directly (no separate payment screen)
        const paymentType = onlinePaymentType === ONLINE_PAYMENT_TYPES.GCASH ? 'gcash' : 'grab_pay';
        const paymentLabel = paymentType === 'gcash' ? 'GCash' : 'GrabPay';

        try {
          const redirectUri = ExpoLinking.createURL('payment-callback');
          const payResult = await PaymentService.payOnline(orderId, paymentType, {
            billing_name: billingName.trim(),
            billing_email: billingEmail.trim(),
            billing_phone: billingPhone.trim(),
          }, redirectUri);

          if (!payResult.ok || !payResult.checkout_url) {
            showError(payResult.error || 'Failed to create payment session.');
            return;
          }

          // Open PayMongo checkout URL
          if (Platform.OS === 'web') {
            // On web, redirect in the same tab to avoid popup blockers
            // (window.open after async calls is blocked by most browsers).
            // The PayMongo success/cancel URL will redirect back to the app.
            if (typeof window !== 'undefined') {
              // Clear cart before navigating away since we'll lose state on page reload
              clearCart();
              window.location.href = payResult.checkout_url;
              return; // Page will navigate away
            }
          } else {
            // On mobile, use expo-web-browser's in-app auth session
            let browserResult;
            try {
              browserResult = await WebBrowser.openAuthSessionAsync(
                payResult.checkout_url,
                redirectUri,
              );
            } catch (browserErr) {
              // Fallback to Linking.openURL if in-app browser fails
              console.warn('WebBrowser.openAuthSessionAsync failed, falling back to Linking.openURL:', browserErr);
              await Linking.openURL(payResult.checkout_url);
              // When using Linking.openURL, the deep-link callback handler will
              // take over verification. Close the checkout modal to await
              // the callback.
              setPendingOnlineOrderId(orderId);
              setShowCheckoutModal(false);
              return;
            }

            if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
              // User dismissed the payment browser — order still exists,
              // they can pay later from Order History.
              // DON'T clear cart so they can retry easily.
              showWarning('Payment Cancelled', 'Your order is saved. You can pay anytime from Order History.');
              setShowCheckoutModal(false);
              return;
            }
          }

          // Verify payment with polling (mobile only — web redirected away)
          setIsCheckingOut(true);
          const POLL_MS = 2000;
          const MAX_POLLS = 15;
          let confirmed = false;

          for (let i = 0; i < MAX_POLLS; i++) {
            await new Promise(r => setTimeout(r, POLL_MS));
            const statusRes = await PaymentService.checkPaymentStatus(orderId);
            if (statusRes?.ok && statusRes.payment_status === 'paid') {
              confirmed = true;
              break;
            }
            if (statusRes?.ok && ['failed', 'expired', 'refunded'].includes(statusRes.payment_status)) {
              break;
            }
          }

          // Fallback verify
          if (!confirmed) {
            for (let r = 0; r < 3 && !confirmed; r++) {
              const res = await PaymentService.verifyOrderPayment(orderId);
              if (res?.ok && (res.status === 'paid' || res.status === 'pending_webhook')) {
                confirmed = true;
                break;
              }
              if (r < 2) await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }

          if (confirmed) {
            showSuccess('Payment Successful! \u2705', `Your ${paymentLabel} payment has been confirmed.\n\nThank you for your purchase!`, {
              autoClose: 0,
              onConfirm: () => { hideAlert(); handleOrderSuccess(); },
              confirmText: 'OK',
            });
          } else {
            showWarning('Payment Processing', `We couldn't verify your ${paymentLabel} payment yet. Please check Order History for the latest status.`);
            // Clear cart since order was created, but keep checkout modal closed
            clearCart();
            setShowCheckoutModal(false);
            onOrderPlaced?.();
          }
        } catch (payErr) {
          console.error('Online payment error:', payErr);
          showError('An error occurred during payment. Your order is saved — you can retry from Order History.');
        }
      }
    } catch (error) {
      console.error('Checkout error:', error);
      showError('An error occurred during checkout');
    } finally {
      setIsCheckingOut(false);
    }
  };

  // Handle successful order
  const handleOrderSuccess = () => {
    clearCart();
    setShowCheckoutModal(false);
    setCheckoutNotes('');
    setPaymentMethod(PAYMENT_METHODS.COD);
    setOnlinePaymentType(ONLINE_PAYMENT_TYPES.GCASH);
    setAddressExpanded(false);
    onClose?.();
    onOrderPlaced?.();
  };

  // Cart item component
  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemImage}>
        {item.images?.[0] ? (
          <Image source={{ uri: item.images[0] }} style={styles.cartItemImg} />
        ) : (
          <View style={styles.cartItemPlaceholder}>
            <Ionicons name="leaf" size={24} color={COLORS.primaryLight} />
          </View>
        )}
      </View>
      <View style={styles.cartItemInfo}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cartItemPrice}>₱{item.price?.toFixed(2)} {item.unit}</Text>
        <Text style={styles.cartItemSubtotal}>Subtotal: ₱{(item.price * item.quantity).toFixed(2)}</Text>
      </View>
      <View style={styles.cartItemQuantity}>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => updateQuantity(item._id, item.quantity - 1)}
        >
          <Ionicons name="remove" size={18} color={COLORS.primary} />
        </TouchableOpacity>
        <TextInput
          style={styles.quantityInput}
          value={item.quantity.toString()}
          onChangeText={(text) => handleCartQuantityChange(item._id, text, item.stock)}
          keyboardType="number-pad"
          maxLength={3}
          selectTextOnFocus
        />
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => {
            if (item.quantity >= item.stock) {
              showWarning(`Maximum available: ${item.stock}`);
            } else {
              updateQuantity(item._id, item.quantity + 1);
            }
          }}
        >
          <Ionicons name="add" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => removeFromCart(item._id)}
      >
        <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
      </TouchableOpacity>
    </View>
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, modalResponsiveStyle.overlay]}>
        <View style={[styles.cartModalContent, modalResponsiveStyle.content]}>
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>Shopping Cart ({getCartCount()})</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {cart.length > 0 ? (
            <>
              <FlatList
                data={cart}
                renderItem={renderCartItem}
                keyExtractor={item => item._id}
                contentContainerStyle={styles.cartList}
                showsVerticalScrollIndicator={false}
              />

              <View style={styles.cartFooter}>
                <View style={styles.cartTotalRow}>
                  <Text style={styles.cartTotalLabel}>Total ({getCartCount()} items):</Text>
                  <Text style={styles.cartTotalValue}>₱{getCartTotal().toFixed(2)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.checkoutButton}
                  onPress={() => {
                    if (!isAuthenticated) {
                      showWarning('Login Required', 'Please login to checkout');
                      return;
                    }
                    if (!hasAddress || !userAddress.phone) {
                      showWarning('Profile Incomplete', 'Please set your delivery address and phone number in your Profile first.');
                      return;
                    }
                    setAddressExpanded(false);
                    setShowCheckoutModal(true);
                  }}
                >
                  <Ionicons name="card" size={20} color={COLORS.textOnPrimary} />
                  <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.clearCartButton} onPress={clearCart}>
                  <Text style={styles.clearCartText}>Clear Cart</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.emptyCart}>
              <Ionicons name="cart-outline" size={64} color={COLORS.textLight} />
              <Text style={styles.emptyCartText}>Your cart is empty</Text>
              <TouchableOpacity
                style={styles.continueShoppingButton}
                onPress={onClose}
              >
                <Text style={styles.continueShoppingText}>Continue Shopping</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Checkout Modal */}
        <Modal
          visible={showCheckoutModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowCheckoutModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.modalOverlay, modalResponsiveStyle.overlay]}
          >
            <View style={[styles.checkoutModalContent, modalResponsiveStyle.content]}>
              <View style={styles.checkoutHeader}>
                <Text style={styles.checkoutTitle}>Checkout</Text>
                <TouchableOpacity onPress={() => setShowCheckoutModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.checkoutSection}>
                  <Text style={styles.checkoutSectionTitle}>Order Summary</Text>
                  {cart.map(item => (
                    <View key={item._id} style={styles.checkoutItem}>
                      <Text style={styles.checkoutItemName}>{item.quantity}x {item.name}</Text>
                      <Text style={styles.checkoutItemPrice}>₱{(item.price * item.quantity).toFixed(2)}</Text>
                    </View>
                  ))}
                  <View style={styles.checkoutDivider} />
                  <View style={styles.checkoutItem}>
                    <Text style={styles.checkoutTotalLabel}>Total</Text>
                    <Text style={styles.checkoutTotalValue}>₱{getCartTotal().toFixed(2)}</Text>
                  </View>
                </View>

                <View style={styles.checkoutSection}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="location" size={16} color={COLORS.primary} />
                    <Text style={[styles.checkoutSectionTitle, { marginBottom: 0, marginLeft: 6, flex: 1 }]}>Delivery Address</Text>
                    <TouchableOpacity onPress={() => setAddressExpanded(!addressExpanded)} style={{ padding: 4 }}>
                      <Ionicons name={addressExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Minimized address summary */}
                  <View style={styles.addressReadOnly}>
                    <Text style={styles.addressReadOnlyText} numberOfLines={addressExpanded ? undefined : 1}>
                      {addressSummary}
                    </Text>
                  </View>

                  {/* Expanded address details */}
                  {addressExpanded && (
                    <View style={styles.addressExpandedContainer}>
                      {userAddress.region ? (
                        <View style={styles.addressDetailRow}>
                          <Text style={styles.addressDetailLabel}>Region:</Text>
                          <Text style={styles.addressDetailValue}>{userAddress.region}</Text>
                        </View>
                      ) : null}
                      <View style={styles.addressDetailRow}>
                        <Text style={styles.addressDetailLabel}>Province:</Text>
                        <Text style={styles.addressDetailValue}>{userAddress.province || '-'}</Text>
                      </View>
                      <View style={styles.addressDetailRow}>
                        <Text style={styles.addressDetailLabel}>City:</Text>
                        <Text style={styles.addressDetailValue}>{userAddress.city || '-'}</Text>
                      </View>
                      {userAddress.barangay ? (
                        <View style={styles.addressDetailRow}>
                          <Text style={styles.addressDetailLabel}>Barangay:</Text>
                          <Text style={styles.addressDetailValue}>{userAddress.barangay}</Text>
                        </View>
                      ) : null}
                      {userAddress.houseNumber || userAddress.street ? (
                        <View style={styles.addressDetailRow}>
                          <Text style={styles.addressDetailLabel}>Street:</Text>
                          <Text style={styles.addressDetailValue}>
                            {[userAddress.houseNumber, userAddress.street].filter(Boolean).join(', ')}
                          </Text>
                        </View>
                      ) : null}
                      {userAddress.landmark ? (
                        <View style={styles.addressDetailRow}>
                          <Text style={styles.addressDetailLabel}>Landmark:</Text>
                          <Text style={styles.addressDetailValue}>{userAddress.landmark}</Text>
                        </View>
                      ) : null}
                      {userAddress.postalCode ? (
                        <View style={styles.addressDetailRow}>
                          <Text style={styles.addressDetailLabel}>Postal Code:</Text>
                          <Text style={styles.addressDetailValue}>{userAddress.postalCode}</Text>
                        </View>
                      ) : null}
                      <View style={styles.addressDetailRow}>
                        <Text style={styles.addressDetailLabel}>Phone:</Text>
                        <Text style={styles.addressDetailValue}>{userAddress.phone || '-'}</Text>
                      </View>
                    </View>
                  )}

                  {/* Change Address Button */}
                  <TouchableOpacity
                    style={styles.changeAddressBtn}
                    onPress={() => {
                      setShowCheckoutModal(false);
                      onClose?.();
                      setTimeout(() => {
                        navigation?.navigate('Profile');
                      }, 300);
                    }}
                  >
                    <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.changeAddressBtnText}>Change Address</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.checkoutSection}>
                  <Text style={styles.checkoutSectionTitle}>Order Notes (Optional)</Text>
                  <TextInput
                    style={styles.checkoutInput}
                    placeholder="Any special instructions?"
                    placeholderTextColor={COLORS.textLight}
                    value={checkoutNotes}
                    onChangeText={setCheckoutNotes}
                    multiline
                    numberOfLines={2}
                  />
                </View>

                {/* Payment Method Selection */}
                <View style={styles.checkoutSection}>
                  <Text style={styles.checkoutSectionTitle}>Payment Method *</Text>
                  
                  {/* Cash on Delivery Option */}
                  <TouchableOpacity
                    style={[
                      styles.paymentOption,
                      paymentMethod === PAYMENT_METHODS.COD && styles.paymentOptionSelected,
                    ]}
                    onPress={() => setPaymentMethod(PAYMENT_METHODS.COD)}
                  >
                    <View style={styles.paymentOptionRadio}>
                      <Ionicons
                        name={paymentMethod === PAYMENT_METHODS.COD ? 'radio-button-on' : 'radio-button-off'}
                        size={24}
                        color={paymentMethod === PAYMENT_METHODS.COD ? COLORS.primary : COLORS.textSecondary}
                      />
                    </View>
                    <View style={styles.paymentOptionContent}>
                      <View style={styles.paymentOptionIcon}>
                        <Ionicons name="cash-outline" size={24} color={COLORS.primary} />
                      </View>
                      <View style={styles.paymentOptionText}>
                        <Text style={styles.paymentOptionTitle}>Cash on Delivery</Text>
                        <Text style={styles.paymentOptionDesc}>Pay when you receive your order</Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Online Payment Option */}
                  <TouchableOpacity
                    style={[
                      styles.paymentOption,
                      !paymentConfig.enabled && styles.paymentOptionDisabled,
                      paymentMethod === PAYMENT_METHODS.ONLINE && styles.paymentOptionSelected,
                    ]}
                    onPress={() => {
                      if (!paymentConfig.enabled) {
                        showWarning('Online payment is not configured yet. Please use Cash on Delivery for now.');
                        return;
                      }
                      setPaymentMethod(PAYMENT_METHODS.ONLINE);
                    }}
                  >
                    <View style={styles.paymentOptionRadio}>
                      <Ionicons
                        name={paymentMethod === PAYMENT_METHODS.ONLINE ? 'radio-button-on' : 'radio-button-off'}
                        size={24}
                        color={paymentMethod === PAYMENT_METHODS.ONLINE ? COLORS.primary : COLORS.textSecondary}
                      />
                    </View>
                    <View style={styles.paymentOptionContent}>
                      <View style={styles.paymentOptionIcon}>
                        <Ionicons name="card-outline" size={24} color={COLORS.info} />
                      </View>
                      <View style={styles.paymentOptionText}>
                        <View style={styles.paymentTitleRow}>
                          <Text style={styles.paymentOptionTitle}>Online Payment</Text>
                          {paymentConfig.loading && (
                            <ActivityIndicator size="small" color={COLORS.info} style={{ marginLeft: 8 }} />
                          )}
                        </View>
                        <Text style={[styles.paymentOptionDesc, !paymentConfig.enabled && !paymentConfig.loading && styles.paymentOptionDescDisabled]}>
                          {paymentConfig.loading
                            ? 'Checking payment availability...'
                            : paymentConfig.enabled
                              ? 'Pay via GCash or GrabPay (Test Mode)'
                              : 'Unavailable: configure PayMongo keys on backend'}
                        </Text>
                        {paymentConfig.enabled && !paymentConfig.loading && (
                          <>
                            <View style={styles.paymentBadgeRow}>
                              <View style={[styles.paymentBadge, styles.paymentBadgePrimary]}>
                                <Text style={styles.paymentBadgeText}>GCash</Text>
                              </View>
                              <View style={[styles.paymentBadge, styles.paymentBadgeInfo]}>
                                <Text style={styles.paymentBadgeText}>GrabPay</Text>
                              </View>
                            </View>

                            {paymentMethod === PAYMENT_METHODS.ONLINE && (
                              <View style={styles.paymentTypeSelectRow}>
                                <TouchableOpacity
                                  style={[
                                    styles.paymentTypeSelectBtn,
                                    onlinePaymentType === ONLINE_PAYMENT_TYPES.GCASH && styles.paymentTypeSelectBtnActive,
                                  ]}
                                  onPress={() => setOnlinePaymentType(ONLINE_PAYMENT_TYPES.GCASH)}
                                >
                                  <Text style={styles.paymentTypeSelectText}>GCash</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[
                                    styles.paymentTypeSelectBtn,
                                    onlinePaymentType === ONLINE_PAYMENT_TYPES.GRAB_PAY && styles.paymentTypeSelectBtnActive,
                                  ]}
                                  onPress={() => setOnlinePaymentType(ONLINE_PAYMENT_TYPES.GRAB_PAY)}
                                >
                                  <Text style={styles.paymentTypeSelectText}>GrabPay</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>

                  {!paymentConfig.loading && !paymentConfig.enabled && (
                    <Text style={styles.paymentConfigHint}>
                      Set PAYMONGO_SECRET_KEY and PAYMONGO_PUBLIC_KEY in backend environment, then restart backend.
                    </Text>
                  )}

                  {/* Billing details — used to pre-fill GCash/GrabPay payment form */}
                  {paymentMethod === PAYMENT_METHODS.ONLINE && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={styles.checkoutSectionTitle}>Billing Details *</Text>
                      <Text style={[styles.paymentOptionDesc, { marginBottom: 10, fontSize: 12 }]}>
                        These details are sent to GCash / GrabPay to pre-fill your payment form.
                      </Text>
                      <TextInput
                        style={styles.checkoutInput}
                        placeholder="Full name (as shown on GCash/GrabPay) *"
                        placeholderTextColor={COLORS.textLight}
                        value={billingName}
                        onChangeText={setBillingName}
                        autoComplete="name"
                      />
                      <TextInput
                        style={[styles.checkoutInput, { marginTop: 10 }]}
                        placeholder="Email address *"
                        placeholderTextColor={COLORS.textLight}
                        value={billingEmail}
                        onChangeText={setBillingEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                      />
                      <TextInput
                        style={[styles.checkoutInput, { marginTop: 10 }]}
                        placeholder="Mobile number (e.g. +639XXXXXXXXX) *"
                        placeholderTextColor={COLORS.textLight}
                        value={billingPhone}
                        onChangeText={setBillingPhone}
                        keyboardType="phone-pad"
                        autoComplete="tel"
                      />
                      <TextInput
                        style={[styles.checkoutInput, { marginTop: 10 }]}
                        placeholder="Street / House no. / Barangay"
                        placeholderTextColor={COLORS.textLight}
                        value={billingAddress}
                        onChangeText={setBillingAddress}
                      />
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <TextInput
                          style={[styles.checkoutInput, { flex: 1 }]}
                          placeholder="City / Municipality"
                          placeholderTextColor={COLORS.textLight}
                          value={billingCity}
                          onChangeText={setBillingCity}
                        />
                        <TextInput
                          style={[styles.checkoutInput, { flex: 1 }]}
                          placeholder="Province / Region"
                          placeholderTextColor={COLORS.textLight}
                          value={billingProvince}
                          onChangeText={setBillingProvince}
                        />
                      </View>
                      <TextInput
                        style={[styles.checkoutInput, { marginTop: 10 }]}
                        placeholder="Postal / ZIP code"
                        placeholderTextColor={COLORS.textLight}
                        value={billingPostalCode}
                        onChangeText={setBillingPostalCode}
                        keyboardType="number-pad"
                      />
                    </View>
                  )}

                </View>
              </ScrollView>

              <View style={styles.checkoutFooter}>
                <TouchableOpacity
                  style={[styles.placeOrderButton, isCheckingOut && styles.buttonDisabled]}
                  onPress={handleCheckout}
                  disabled={isCheckingOut}
                >
                  {isCheckingOut ? (
                    <View style={styles.checkoutLoadingRow}>
                      <ActivityIndicator color={COLORS.buttonText} size="small" />
                      <Text style={styles.placeOrderText}>
                        {paymentMethod === PAYMENT_METHODS.ONLINE
                          ? 'Creating payment session...'
                          : 'Placing order...'}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Ionicons 
                        name={
                          paymentMethod === PAYMENT_METHODS.COD ? 'cash' : 'card'
                        } 
                        size={20} 
                        color={COLORS.textOnPrimary} 
                      />
                      <Text style={styles.placeOrderText}>
                        {paymentMethod === PAYMENT_METHODS.COD 
                          ? 'Place Order (COD)' 
                          : `Pay Online ₱${getCartTotal().toFixed(2)}`}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Payment Verification Overlay */}
        <Modal
          visible={isVerifyingPayment}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {}}
        >
          <View style={styles.verifyOverlay}>
            <View style={styles.verifyCard}>
              <View style={styles.verifyIconContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
              <Text style={styles.verifyTitle}>Processing Payment</Text>
              <Text style={styles.verifyMessage}>{verifyingMessage}</Text>
              <View style={styles.verifyProgressBar}>
                <RNAnimated.View style={[
                  styles.verifyProgressFill,
                  {
                    width: verifyProgressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['15%', '100%'],
                    }),
                  },
                ]} />
              </View>
              <Text style={styles.verifyHint}>Please wait, do not close the app...</Text>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  cartModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    flex: 1,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  cartTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cartList: {
    padding: 16,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  cartItemImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 12,
  },
  cartItemImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cartItemPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  cartItemPrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  cartItemSubtotal: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 4,
  },
  cartItemQuantity: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  quantityButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityInput: {
    width: 40,
    height: 32,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.divider,
  },
  removeButton: {
    padding: 8,
  },
  cartFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    backgroundColor: COLORS.surface,
  },
  cartTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cartTotalLabel: {
    fontSize: 16,
    color: COLORS.text,
  },
  cartTotalValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
  },
  checkoutButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  clearCartButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  clearCartText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyCart: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyCartText: {
    marginTop: 16,
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  continueShoppingButton: {
    marginTop: 24,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  continueShoppingText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  // Checkout Modal styles
  checkoutModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    flex: 1,
  },
  checkoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  checkoutTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  checkoutSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  checkoutSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  checkoutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  checkoutItemName: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  checkoutItemPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  checkoutDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 8,
  },
  checkoutTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  checkoutTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  checkoutInput: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  checkoutInputError: {
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
  checkoutFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  placeOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  placeOrderText: {
    color: COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  checkoutLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Payment method styles
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryBg,
  },
  paymentOptionDisabled: {
    opacity: 0.65,
  },
  paymentOptionRadio: {
    marginRight: 12,
  },
  paymentOptionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  paymentOptionText: {
    flex: 1,
  },
  paymentOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  paymentOptionDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  paymentOptionDescDisabled: {
    color: COLORS.danger,
  },
  paymentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  paymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  paymentBadgePrimary: {
    backgroundColor: COLORS.primary,
  },
  paymentBadgeInfo: {
    backgroundColor: COLORS.info,
  },
  paymentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.surface,
    letterSpacing: 0.3,
  },
  paymentTypeSelectRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  paymentTypeSelectBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  paymentTypeSelectBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryBg,
  },
  paymentTypeSelectText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  paymentConfigHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: 4,
  },
  // Payment verification overlay styles
  verifyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  verifyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  verifyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  verifyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  verifyMessage: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  verifyProgressBar: {
    width: '100%',
    height: 4,
    backgroundColor: COLORS.divider,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  verifyProgressFill: {
    width: '60%',
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  verifyHint: {
    fontSize: 12,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  // Checkout dropdown styles
  checkoutFieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  // Read-only address styles
  addressReadOnly: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addressReadOnlyText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  addressExpandedContainer: {
    marginTop: 10,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addressDetailRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  addressDetailLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    width: 90,
    fontWeight: '500',
  },
  addressDetailValue: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
  changeAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '08',
    gap: 6,
  },
  changeAddressBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  checkoutDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  checkoutDropdownDisabled: {
    opacity: 0.5,
  },
  checkoutDropdownText: {
    fontSize: 15,
    color: COLORS.text,
  },
  checkoutDropdownPlaceholder: {
    fontSize: 15,
    color: COLORS.textLight,
  },
  checkoutCountryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  // Picker modal styles
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerModal: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    maxHeight: 420,
    width: '100%',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pickerItemActive: {
    backgroundColor: COLORS.primary + '15',
    borderRadius: 8,
  },
  pickerItemFlag: {
    fontSize: 20,
    marginRight: 10,
  },
  pickerItemLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  pickerItemCode: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginRight: 8,
  },
});
