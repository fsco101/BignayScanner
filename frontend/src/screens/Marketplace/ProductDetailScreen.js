// Product Detail Screen
// Full-page product details with image slideshow, seller info, reviews, and add to cart

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Animated,
  Platform,
  KeyboardAvoidingView,
  SafeAreaView,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useResponsive } from '../../hooks/useResponsive';
import ProductService from '../../services/ProductService';
import ReviewService from '../../services/ReviewService';
import ReviewSection from './ReviewSection';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';
import { useThemeColors } from '../../context/ThemeContext';
import ProductCarousel from '../../components/ProductCarousel';


export default function ProductDetailScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const navigation = useNavigation();
  const route = useRoute();
  const { product: routeProduct } = route.params || {};

  const { user, isAuthenticated, isAdmin } = useAuth();
  const { addToCart } = useCart();
  const { alertConfig, showSuccess, showError, showWarning, hideAlert } = useSweetAlert();

  const {
    width: screenWidth,
    isMobile,
    isTablet,
    isDesktop,
    sp,
    fp,
    responsive,
    maxContentWidth,
  } = useResponsive();

  // State
  const [product, setProduct] = useState(routeProduct || null);
  const [isLoading, setIsLoading] = useState(!routeProduct);
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [latestProducts, setLatestProducts] = useState([]);
  const [topRatedProducts, setTopRatedProducts] = useState([]);

  // Refs
  const imageScrollRef = useRef(null);
  const slideshowTimer = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Reset state when navigating to a different product
  useEffect(() => {
    if (routeProduct) {
      setProduct(routeProduct);
      setQuantity(1);
      setQuantityInput('1');
      setCurrentImageIndex(0);
      setShowAllReviews(false);
      setIsLoading(false);
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: false,
      }).start();
      if (imageScrollRef.current) {
        imageScrollRef.current.scrollTo({ x: 0, animated: false });
      }
    }
  }, [routeProduct?._id]);

  // Layout - use full available width on web
  const contentWidth = screenWidth;
  const imageHeight = responsive({ mobile: 320, tablet: 380, desktop: 440 });
  const desktopMaxWidth = isDesktop ? Math.min(1100, screenWidth - 96) : screenWidth;
  const imageSlideWidth = isDesktop ? desktopMaxWidth : screenWidth;

  // Auto slideshow
  useEffect(() => {
    if (product?.images?.length > 1) {
      slideshowTimer.current = setInterval(() => {
        setCurrentImageIndex(prev => {
          const next = (prev + 1) % product.images.length;
          if (imageScrollRef.current) {
            imageScrollRef.current.scrollTo({ x: next * imageSlideWidth, animated: true });
          }
          return next;
        });
      }, 4000);
    }
    return () => {
      if (slideshowTimer.current) clearInterval(slideshowTimer.current);
    };
  }, [product?.images?.length, imageSlideWidth]);

  // Entrance animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, []);

  // Refresh product data
  const refreshProduct = useCallback(async () => {
    if (!routeProduct?._id) return;
    try {
      const result = await ProductService.getProduct(routeProduct._id);
      if (result.ok && result.product) {
        setProduct(result.product);
      }
    } catch (e) {
      console.error('Error refreshing product:', e);
    }
  }, [routeProduct?._id]);

  // Fetch latest and top-rated products for carousels
  useEffect(() => {
    const fetchCarouselProducts = async () => {
      try {
        const [latestRes, ratedRes] = await Promise.all([
          ProductService.getProducts({ sort: 'created_at', order: 'desc', limit: 10 }),
          ProductService.getProducts({ sort: 'rating', order: 'desc', limit: 10 }),
        ]);
        if (latestRes.ok && latestRes.products) {
          setLatestProducts(latestRes.products.filter(p => p._id !== product?._id).slice(0, 8));
        }
        if (ratedRes.ok && ratedRes.products) {
          setTopRatedProducts(ratedRes.products.filter(p => p._id !== product?._id && (p.average_rating || 0) > 0).slice(0, 8));
        }
      } catch (e) {
        console.error('Error fetching carousel products:', e);
      }
    };
    if (product?._id) fetchCarouselProducts();
  }, [product?._id]);

  // Image scroll handler
  const handleImageScroll = (event) => {
    const slideIndex = Math.round(event.nativeEvent.contentOffset.x / imageSlideWidth);
    setCurrentImageIndex(slideIndex);
    // Reset auto slideshow timer when user manually scrolls
    if (slideshowTimer.current) {
      clearInterval(slideshowTimer.current);
      slideshowTimer.current = setInterval(() => {
        setCurrentImageIndex(prev => {
          const next = (prev + 1) % (product?.images?.length || 1);
          if (imageScrollRef.current) {
            imageScrollRef.current.scrollTo({ x: next * imageSlideWidth, animated: true });
          }
          return next;
        });
      }, 4000);
    }
  };

  const goToImage = (index) => {
    if (imageScrollRef.current) {
      imageScrollRef.current.scrollTo({ x: index * imageSlideWidth, animated: true });
      setCurrentImageIndex(index);
    }
  };

  // Quantity handlers
  const handleQuantityChange = (text) => {
    if (text === '') { setQuantityInput(''); return; }
    const numericValue = text.replace(/[^0-9]/g, '');
    if (numericValue === '') { setQuantityInput(''); return; }
    const num = parseInt(numericValue);
    if (num > product.stock) {
      showWarning(`Maximum available: ${product.stock}`);
      setQuantityInput(product.stock.toString());
      setQuantity(product.stock);
    } else if (num < 1) {
      setQuantityInput('1');
      setQuantity(1);
    } else {
      setQuantityInput(numericValue);
      setQuantity(num);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    const qty = parseInt(quantityInput) || 1;
    if (qty < 1) { showWarning('Please enter a valid quantity'); return; }
    if (qty > product.stock) { showWarning(`Only ${product.stock} items available`); return; }
    const success = addToCart(product, qty);
    if (success) {
      showSuccess(`${qty} x ${product.name} added to cart`);
    } else {
      showError('Not enough stock available');
    }
  };

  // Rating stars helper
  const renderStars = (rating, size = 16) => (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <Ionicons
          key={star}
          name={star <= Math.round(rating || 0) ? 'star' : 'star-outline'}
          size={size}
          color={COLORS.gold}
        />
      ))}
    </View>
  );

  if (isLoading || !product) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading product...</Text>
      </View>
    );
  }

  // Responsive layout values
  const scrollImageWidth = imageSlideWidth;

  return (
    <KeyboardAvoidingView
      style={styles.kavContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && { maxWidth: desktopMaxWidth, width: '100%', alignSelf: 'center' },
        ]}
        stickyHeaderIndices={[]}
      >
        {/* Back button overlay */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        {/* ==================== IMAGE SLIDESHOW ==================== */}
        <View style={[styles.imageSection, { height: imageHeight }]}>
          <ScrollView
            ref={imageScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleImageScroll}
            scrollEventThrottle={16}
            style={{ height: imageHeight }}
          >
            {product.images?.length > 0 ? (
              product.images.map((img, index) => (
                <View key={index} style={[styles.slideImageContainer, { width: scrollImageWidth, height: imageHeight }]}>
                  <Image
                    source={{ uri: img }}
                    style={[styles.slideImage, { width: scrollImageWidth, height: imageHeight }]}
                    resizeMode="contain"
                  />
                </View>
              ))
            ) : (
              <View style={[styles.imagePlaceholder, { width: scrollImageWidth, height: imageHeight }]}>
                <Ionicons name="leaf" size={80} color={COLORS.primaryLight} />
                <Text style={styles.placeholderText}>No Image Available</Text>
              </View>
            )}
          </ScrollView>

          {/* Navigation Arrows */}
          {product.images?.length > 1 && (
            <>
              <TouchableOpacity
                style={[styles.navArrow, styles.navArrowLeft]}
                onPress={() => goToImage(currentImageIndex > 0 ? currentImageIndex - 1 : product.images.length - 1)}
              >
                <Ionicons name="chevron-back" size={28} color={COLORS.buttonText} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navArrow, styles.navArrowRight]}
                onPress={() => goToImage((currentImageIndex + 1) % product.images.length)}
              >
                <Ionicons name="chevron-forward" size={28} color={COLORS.buttonText} />
              </TouchableOpacity>
            </>
          )}

          {/* Pagination Dots */}
          {product.images?.length > 1 && (
            <View style={styles.dotsContainer}>
              {product.images.map((_, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => goToImage(index)}
                  style={[
                    styles.dot,
                    currentImageIndex === index && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Image Counter Badge */}
          {product.images?.length > 1 && (
            <View style={styles.imageCounterBadge}>
              <Ionicons name="images-outline" size={14} color={COLORS.buttonText} />
              <Text style={styles.imageCounterText}>
                {currentImageIndex + 1} / {product.images.length}
              </Text>
            </View>
          )}
        </View>

        {/* ==================== PRODUCT INFO ==================== */}
        <View style={styles.productInfoSection}>
          {/* Category tag */}
          <View style={styles.categoryTag}>
            <Ionicons name="pricetag" size={14} color={COLORS.primary} />
            <Text style={styles.categoryTagText}>{product.category || 'Uncategorized'}</Text>
          </View>

          {/* Product name */}
          <Text style={[styles.productName, { fontSize: responsive({ mobile: fp(22), tablet: fp(24), desktop: fp(28) }) }]}>
            {product.name}
          </Text>

          {/* Rating summary */}
          <TouchableOpacity
            style={styles.ratingSummary}
            onPress={() => setShowAllReviews(true)}
          >
            {renderStars(product.average_rating, responsive({ mobile: 18, tablet: 20, desktop: 22 }))}
            <Text style={styles.ratingNumber}>
              {product.average_rating?.toFixed(1) || '0.0'}
            </Text>
            <Text style={styles.reviewCountText}>
              ({product.total_reviews || 0} {product.total_reviews === 1 ? 'review' : 'reviews'})
            </Text>
          </TouchableOpacity>

          {/* Price and stock */}
          <View style={styles.priceSection}>
            <View>
              <Text style={[styles.price, { fontSize: responsive({ mobile: fp(28), tablet: fp(30), desktop: fp(34) }) }]}>
                ₱{product.price?.toFixed(2)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name={product.sold_by === 'kg' ? 'scale-outline' : 'cube-outline'} size={14} color={COLORS.textLight} />
                <Text style={styles.unitText}>{product.unit || 'per item'}</Text>
              </View>
            </View>
            <View style={[
              styles.stockBadge,
              product.stock === 0 && styles.stockBadgeOut,
              product.stock > 0 && product.stock <= 5 && styles.stockBadgeLow,
            ]}>
              <Ionicons
                name={product.stock > 0 ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color={product.stock > 0 ? COLORS.success : COLORS.danger}
              />
              <Text style={[
                styles.stockText,
                product.stock === 0 && { color: COLORS.danger },
                product.stock > 0 && product.stock <= 5 && { color: COLORS.warning },
              ]}>
                {product.stock === 0 ? 'Out of Stock' : product.stock <= 5 ? `Only ${product.stock} left` : `${product.stock} in stock`}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* ==================== SELLER INFO ==================== */}
          <View style={styles.sellerCard}>
            <View style={styles.sellerLeft}>
              {product.seller_profile_image ? (
                <Image source={{ uri: product.seller_profile_image }} style={styles.sellerAvatar} />
              ) : (
                <View style={styles.sellerAvatarFallback}>
                  <Text style={styles.sellerAvatarText}>
                    {product.seller_name?.charAt(0).toUpperCase() || 'S'}
                  </Text>
                </View>
              )}
              <View style={styles.sellerInfo}>
                <Text style={styles.sellerLabel}>Seller</Text>
                <Text style={styles.sellerName}>{product.seller_name || 'Unknown Seller'}</Text>
              </View>
            </View>
            <View style={styles.sellerBadge}>
              <Ionicons name="storefront" size={16} color={COLORS.primary} />
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* ==================== DESCRIPTION ==================== */}
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>
              {product.description || 'No description available for this product.'}
            </Text>
          </View>

          {/* Product Details Chips */}
          <View style={styles.detailChips}>
            {product.category && (
              <View style={styles.detailChip}>
                <Ionicons name="nutrition" size={14} color={COLORS.primary} />
                <Text style={styles.detailChipText}>{product.category}</Text>
              </View>
            )}
            <View style={styles.detailChip}>
              <Ionicons name="cube-outline" size={14} color={COLORS.primary} />
              <Text style={styles.detailChipText}>{product.stock} available</Text>
            </View>
            {product.unit && (
              <View style={styles.detailChip}>
                <Ionicons name="scale-outline" size={14} color={COLORS.primary} />
                <Text style={styles.detailChipText}>{product.unit}</Text>
              </View>
            )}
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* ==================== ADD TO CART (INLINE) ==================== */}
          <View style={styles.inlineCartSection}>
            <View style={styles.inlineCartPriceRow}>
              <Text style={styles.inlineCartLabel}>Total</Text>
              <Text style={styles.inlineCartPrice}>₱{(product.price * quantity).toFixed(2)}</Text>
            </View>
            <View style={styles.inlineCartActions}>
              <View style={styles.qtyControl}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => {
                    const newQty = Math.max(1, quantity - 1);
                    setQuantity(newQty);
                    setQuantityInput(newQty.toString());
                  }}
                >
                  <Ionicons name="remove" size={18} color={COLORS.primary} />
                </TouchableOpacity>
                <TextInput
                  style={styles.qtyInput}
                  value={quantityInput}
                  onChangeText={(text) => handleQuantityChange(text)}
                  onBlur={() => {
                    if (!quantityInput || parseInt(quantityInput) < 1) {
                      setQuantityInput('1');
                      setQuantity(1);
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => {
                    if (quantity >= product.stock) {
                      showWarning(`Maximum available: ${product.stock}`);
                    } else {
                      const newQty = quantity + 1;
                      setQuantity(newQty);
                      setQuantityInput(newQty.toString());
                    }
                  }}
                >
                  <Ionicons name="add" size={18} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.addToCartBtn, product.stock === 0 && styles.disabledBtn]}
                onPress={handleAddToCart}
                disabled={product.stock === 0}
              >
                <Ionicons name="cart" size={20} color={COLORS.buttonText} />
                <Text style={styles.addToCartText}>
                  {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* ==================== REVIEWS SECTION ==================== */}
          <ReviewSection
            product={product}
            showAll={showAllReviews}
            onToggleShowAll={() => setShowAllReviews(!showAllReviews)}
            onReviewSubmitted={refreshProduct}
          />

          {/* ==================== LATEST PRODUCTS CAROUSEL ==================== */}
          {latestProducts.length > 0 && (
            <>
              <View style={styles.divider} />
              <ProductCarousel
                title="Latest Products"
                icon="🆕"
                products={latestProducts}
                excludeProductId={product?._id}
              />
            </>
          )}

          {/* ==================== MOST RATED PRODUCTS CAROUSEL ==================== */}
          {topRatedProducts.length > 0 && (
            <>
              <View style={styles.divider} />
              <ProductCarousel
                title="Most Rated Products"
                icon="⭐"
                products={topRatedProducts}
                excludeProductId={product?._id}
              />
            </>
          )}
        </View>
      </ScrollView>

      {/* SweetAlert */}
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
    </Animated.View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  kavContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textSecondary,
  },

  // Back button
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 44,
    left: 16,
    zIndex: 100,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },

  // Image slideshow
  imageSection: {
    position: 'relative',
    backgroundColor: COLORS.surfaceVariant,
    overflow: 'hidden',
  },
  slideImageContainer: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideImage: {
    resizeMode: 'contain',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textLight,
  },
  navArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  navArrowLeft: { left: 12 },
  navArrowRight: { right: 12 },
  dotsContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: {
    width: 28,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
  },
  imageCounterBadge: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 44,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  imageCounterText: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: '600',
  },

  // Product info
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  productInfoSection: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    minHeight: 400,
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 12,
  },
  categoryTagText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    textTransform: 'capitalize',
  },
  productName: {
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
    lineHeight: 34,
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  ratingNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  reviewCountText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  priceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  price: {
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  unitText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  stockBadgeOut: { backgroundColor: COLORS.errorLight },
  stockBadgeLow: { backgroundColor: COLORS.warningBg },
  stockText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.success,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 20,
  },

  // Seller card
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    padding: 16,
  },
  sellerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  sellerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
    overflow: 'hidden',
  },
  sellerAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerAvatarText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.textOnPrimary,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  sellerName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  sellerBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Description
  descriptionSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  descriptionText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 24,
  },
  detailChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  detailChipText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
  },

  // Bottom bar
  bottomBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 0 : (Platform.OS === 'web' ? 12 : 16),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    // Ensure it's always rendered above the keyboard / nav bar
    zIndex: 100,
  },
  bottomBarPrice: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bottomBarPriceLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  bottomBarPriceValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  bottomBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyInput: {
    width: 44,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingVertical: 4,
  },
  addToCartBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    elevation: 2,
  },
  addToCartText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.5,
  },

  // ── Inline Cart ──
  inlineCartSection: {
    marginBottom: 8,
  },
  inlineCartPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  inlineCartLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  inlineCartPrice: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  inlineCartActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  // ── Product Carousels ──
  carouselSection: {
    marginTop: 8,
    marginBottom: 8,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  carouselCard: {
    width: 150,
    marginRight: 12,
    backgroundColor: COLORS.surfaceVariant || COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  carouselImage: {
    width: '100%',
    height: 120,
  },
  carouselInfo: {
    padding: 10,
  },
  carouselProductName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  carouselPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  carouselRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  carouselRatingText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});
