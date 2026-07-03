// Marketplace Screen
// Core marketplace with product browsing, carousels, cart, and checkout
// Order history and admin CRUD are in separate files

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useResponsive } from '../../hooks/useResponsive';
import ProductService from '../../services/ProductService';
import ProductCarousel from '../../components/ProductCarousel';

// Interactive animated card wrapper for press effects
const AnimatedCard = ({ children, onPress, style, ...props }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const elevationAnim = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 0.97, friction: 8, tension: 100, useNativeDriver: false }),
      Animated.timing(elevationAnim, { toValue: 1, duration: 100, useNativeDriver: false }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 40, useNativeDriver: false }),
      Animated.timing(elevationAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();
  };

  const animatedShadow = Platform.OS === 'ios'
    ? {
        shadowOpacity: elevationAnim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.2] }),
        shadowRadius: elevationAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 10] }),
      }
    : {
        elevation: elevationAnim.interpolate({ inputRange: [0, 1], outputRange: [2, 8] }),
      };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      {...props}
    >
      <Animated.View
        style={[
          style,
          { transform: [{ scale: scaleAnim }] },
          animatedShadow,
        ]}
      >
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

// We need useRef available in AnimatedCard
const AnimatedCardRef = React.memo(AnimatedCard);

// Import separated components
import OrderHistoryScreen from './OrderHistoryScreen';
import OrderManagement from './admin/OrderManagement';
import CartModal from './CartModal';
import UserProductManagement from './user/UserProductManagement';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';
import { useThemeColors } from '../../context/ThemeContext';


const CATEGORIES = [
  { id: 'all', name: 'All Products', icon: 'apps' },
  { id: 'Fresh Bignay', name: 'Fresh Bignay', icon: 'nutrition' },
  { id: 'Dried Bignay', name: 'Dried Bignay', icon: 'sunny' },
  { id: 'Bignay Wine', name: 'Bignay Wine', icon: 'wine' },
  { id: 'Bignay Juice', name: 'Bignay Juice', icon: 'cafe' },
  { id: 'Bignay Jam', name: 'Bignay Jam', icon: 'color-fill' },
  { id: 'Bignay Vinegar', name: 'Bignay Vinegar', icon: 'flask' },
  { id: 'Bignay Seedlings', name: 'Bignay Seedlings', icon: 'leaf' },
  { id: 'Other', name: 'Other', icon: 'ellipsis-horizontal' },
];

export default function MarketplaceScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const navigation = useNavigation();
  const route = useRoute();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { getCartCount, addToCart } = useCart();
  const { alertConfig, showSuccess, showWarning, hideAlert } = useSweetAlert();
  
  // Quantity tracking for direct add-to-cart
  const [quantities, setQuantities] = useState({});
  
  const getQuantity = (productId) => quantities[productId] || 1;
  const setQuantity = (productId, qty) => setQuantities(prev => ({ ...prev, [productId]: qty }));
  
  // Use responsive hook for dynamic sizing
  const {
    width: screenWidth,
    height: screenHeight,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    sp,
    fp,
    wp,
    hp,
    widthPercent,
    responsive,
    contentPadding,
    spacing,
    fontSize: fontSizes,
    radius,
    iconSize,
    maxContentWidth,
    getCardWidth,
  } = useResponsive();
  
  // Dynamic responsive values
  const contentMaxWidth = maxContentWidth;
  const productGridColumns = responsive({ mobile: 2, tablet: 3, desktop: 4, wide: 5 });
  const carouselItemWidth = responsive({ mobile: 155, tablet: 170, desktop: 190, wide: 210 });
  const productImageHeight = responsive({ mobile: 130, tablet: 140, desktop: 150, wide: 160 });
  const carouselImageHeight = responsive({ mobile: 100, tablet: 108, desktop: 118, wide: 128 });

  // Dynamic responsive styles (consistent with HistoryScreen/ChatbotScreen pattern)
  const dynamicStyles = useMemo(() => ({
    headerTitle: { fontSize: responsive({ mobile: fp(24), tablet: fp(26), desktop: fp(28) }) },
    headerSubtitle: { fontSize: responsive({ mobile: fp(13), tablet: fp(13), desktop: fp(14) }) },
    statValue: { fontSize: responsive({ mobile: fp(18), tablet: fp(19), desktop: fp(20) }) },
    statLabel: { fontSize: responsive({ mobile: fp(11), tablet: fp(11), desktop: fp(12) }) },
    searchHeight: responsive({ mobile: 44, tablet: 46, desktop: 48 }),
    searchFontSize: responsive({ mobile: fp(14), tablet: fp(14), desktop: fp(15) }),
    sectionTitle: { fontSize: responsive({ mobile: fp(18), tablet: fp(19), desktop: fp(20) }) },
    carouselTitle: { fontSize: responsive({ mobile: fp(17), tablet: fp(18), desktop: fp(19) }) },
    categoryText: { fontSize: responsive({ mobile: fp(12), tablet: fp(13), desktop: fp(13) }) },
    productName: { fontSize: responsive({ mobile: fp(13), tablet: fp(14), desktop: fp(14) }) },
    productPrice: { fontSize: responsive({ mobile: fp(14), tablet: fp(15), desktop: fp(16) }) },
    productInfoPadding: responsive({ mobile: sp(10), tablet: sp(12), desktop: sp(14) }),
    productCardRadius: responsive({ mobile: sp(14), tablet: sp(16), desktop: sp(18) }),
    carouselCardPadding: responsive({ mobile: sp(10), tablet: sp(12), desktop: sp(14) }),
    carouselNameSize: { fontSize: responsive({ mobile: fp(12), tablet: fp(13), desktop: fp(14) }) },
    carouselPriceSize: { fontSize: responsive({ mobile: fp(15), tablet: fp(16), desktop: fp(17) }) },
    contentPadding: responsive({ mobile: sp(12), tablet: sp(14), desktop: sp(16) }),
    cartFabSize: responsive({ mobile: 52, tablet: 56, desktop: 60 }),
    cartFabBottom: responsive({ mobile: 84, tablet: 88, desktop: 92 }),
  }), [responsive, sp, fp]);
  
  // State
  const [products, setProducts] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState({
    recently_added: [],
    most_popular: [],
    top_rated: [],
    trending: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState(''); // what user types; searchQuery set on Enter
  // Price filter state
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  // Rating filter state
  const [minRating, setMinRating] = useState(0);
  // Sidebar filter toggle (mobile)
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  // Sort state
  const [sortBy, setSortBy] = useState('newest');
  // Pagination state for infinite scroll
  const [productPage, setProductPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalProducts, setTotalProducts] = useState(0);
  const PRODUCTS_PER_PAGE = 20;
  const loopCursorRef = useRef(0);
  const lastLoadMoreAtRef = useRef(0);
  
  // Sidebar collapsed state (desktop)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);


  
  // Modals (removed admin modals - now in sidebar)
  const [showCartModal, setShowCartModal] = useState(false);
  const [showOrderHistoryModal, setShowOrderHistoryModal] = useState(false);
  const [showOrderManagementModal, setShowOrderManagementModal] = useState(false);
  const [showUserProductsModal, setShowUserProductsModal] = useState(false);

  // Auto-open modals when navigated from notification or sidebar
  useEffect(() => {
    if (route.params?.openOrderHistory) {
      setShowOrderHistoryModal(true);
      navigation.setParams({ openOrderHistory: undefined });
    }
    if (route.params?.openOrderManagement) {
      setShowOrderManagementModal(true);
      navigation.setParams({ openOrderManagement: undefined });
    }
    if (route.params?.openUserProducts) {
      setShowUserProductsModal(true);
      navigation.setParams({ openUserProducts: undefined });
    }
    if (route.params?.openCart) {
      setShowCartModal(true);
      navigation.setParams({ openCart: undefined });
    }
  }, [route.params?.openOrderHistory, route.params?.openOrderManagement, route.params?.openUserProducts, route.params?.openCart]);
  
  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Order status constants
  const ORDER_STATUSES = [
    { id: 'all', label: 'All', icon: 'list' },
    { id: 'pending', label: 'Pending', icon: 'time', color: '#FFA000' },
    { id: 'processing', label: 'Processing', icon: 'refresh', color: '#2196F3' },
    { id: 'shipped', label: 'Shipped', icon: 'airplane', color: '#9C27B0' },
    { id: 'delivered', label: 'Delivered', icon: 'checkmark-circle', color: '#4CAF50' },
    { id: 'cancelled', label: 'Cancelled', icon: 'close-circle', color: '#D32F2F' },
  ];

  // Load data with pagination
  const loadProducts = useCallback(async (pageNum = 1, append = false) => {
    if (pageNum > 1) {
      setIsLoadingMore(true);
    }
    try {
      const requests = [
        ProductService.getProducts({
          category: selectedCategory === 'all' ? null : selectedCategory,
          page: pageNum,
          limit: PRODUCTS_PER_PAGE,
        }),
      ];
      // Only fetch featured on first page load
      if (pageNum === 1) {
        requests.push(ProductService.getFeaturedProducts());
      }

      const results = await Promise.all(requests);
      const productsResult = results[0];
      const featuredResult = results[1];
      
      if (productsResult.ok) {
        const newProducts = productsResult.products || [];
        if (append && pageNum > 1) {
          setProducts(prev => [...prev, ...newProducts]);
        } else {
          setProducts(newProducts);
        }
        const pagination = productsResult.pagination;
        if (pagination) {
          setTotalProducts(pagination.total || 0);
          setHasMoreProducts(pageNum < pagination.pages);
        } else {
          setHasMoreProducts(newProducts.length === PRODUCTS_PER_PAGE);
        }
        setProductPage(pageNum);
      }
      
      if (featuredResult && featuredResult.ok) {
        setFeaturedProducts(featuredResult.featured || {
          recently_added: [],
          most_popular: [],
          top_rated: [],
          trending: [],
        });
      }
      
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [selectedCategory, fadeAnim]);

  useEffect(() => {
    setProductPage(1);
    setHasMoreProducts(true);
    loopCursorRef.current = 0;
    loadProducts(1, false);
  }, [loadProducts]);

  const onRefresh = () => {
    setIsRefreshing(true);
    setProductPage(1);
    setHasMoreProducts(true);
    loopCursorRef.current = 0;
    loadProducts(1, false);
  };

  const loadMoreProducts = useCallback(() => {
    if (isLoadingMore || isLoading) return;

    if (hasMoreProducts) {
      loadProducts(productPage + 1, true);
      return;
    }

    const canLoopAllProducts =
      selectedCategory === 'all' &&
      !searchQuery &&
      minPrice === '' &&
      maxPrice === '' &&
      products.length > 0;

    if (!canLoopAllProducts) return;

    const baseProducts = totalProducts > 0 ? products.slice(0, totalProducts) : products;
    if (!baseProducts.length) return;

    const chunkSize = Math.min(PRODUCTS_PER_PAGE, baseProducts.length);
    const startIndex = loopCursorRef.current % baseProducts.length;

    const loopChunk = Array.from({ length: chunkSize }, (_, offset) => {
      const sourceItem = baseProducts[(startIndex + offset) % baseProducts.length];
      return {
        ...sourceItem,
        _loopKey: `${sourceItem._id || 'product'}-loop-${startIndex + offset}-${Date.now()}`,
      };
    });

    loopCursorRef.current = (startIndex + chunkSize) % baseProducts.length;
    setProducts((prev) => [...prev, ...loopChunk]);
  }, [
    isLoadingMore,
    hasMoreProducts,
    isLoading,
    loadProducts,
    productPage,
    selectedCategory,
    searchQuery,
    minPrice,
    maxPrice,
    products,
    totalProducts,
  ]);

  const handleEndReached = useCallback(() => {
    const now = Date.now();
    if (now - lastLoadMoreAtRef.current < 500) return;
    lastLoadMoreAtRef.current = now;
    loadMoreProducts();
  }, [loadMoreProducts]);

  // Filtered products with price range and rating
  const filteredProducts = useMemo(() => {
    let filtered = products.filter(product => {
      const matchesSearch = 
        product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Price range filter
      const min = parseFloat(minPrice) || 0;
      const max = parseFloat(maxPrice) || Infinity;
      const matchesPrice = product.price >= min && product.price <= max;

      // Rating filter
      const matchesRating = minRating === 0 || (product.average_rating || 0) >= minRating;
      
      return matchesSearch && matchesPrice && matchesRating;
    });

    // Sort
    if (sortBy === 'price_low') filtered.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price_high') filtered.sort((a, b) => b.price - a.price);
    else if (sortBy === 'rating') filtered.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
    else if (sortBy === 'popular') filtered.sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0));
    // 'newest' is default order from API

    return filtered;
  }, [products, searchQuery, minPrice, maxPrice, minRating, sortBy]);

  // Clear price filter
  const clearPriceFilter = () => {
    setMinPrice('');
    setMaxPrice('');
  };

  // Clear all filters
  const clearAllFilters = () => {
    setMinPrice('');
    setMaxPrice('');
    setMinRating(0);
    setSortBy('newest');
    setSelectedCategory('all');
    setSearchQuery('');
    setSearchInput('');
  };

  const hasActiveFilters = minPrice || maxPrice || minRating > 0 || sortBy !== 'newest' || selectedCategory !== 'all';

  // Navigate to product detail
  const navigateToProduct = (item) => {
    navigation.navigate('ProductDetail', { product: item });
  };

  // Render product card
  const renderProduct = ({ item }) => (
    <AnimatedCardRef
      style={[styles.productCard, { borderRadius: dynamicStyles.productCardRadius }]}
      onPress={() => navigateToProduct(item)}
    >
      <View style={[styles.productImageContainer, { height: productImageHeight }]}>
        {item.images?.[0] ? (
          <Image source={{ uri: item.images[0] }} style={styles.productImage} />
        ) : (
          <View style={styles.productPlaceholder}>
            <Ionicons name="leaf" size={48} color={COLORS.primaryLight} />
          </View>
        )}
        {/* Multiple images indicator */}
        {item.images?.length > 1 && (
          <View style={styles.productImageCount}>
            <Ionicons name="images" size={12} color={COLORS.buttonText} />
            <Text style={styles.productImageCountText}>{item.images.length}</Text>
          </View>
        )}
        {item.stock <= 5 && item.stock > 0 && (
          <View style={styles.lowStockBadge}>
            <Text style={styles.lowStockText}>Low Stock</Text>
          </View>
        )}
        {item.stock === 0 && (
          <View style={[styles.lowStockBadge, { backgroundColor: COLORS.danger }]}>
            <Text style={styles.lowStockText}>Out of Stock</Text>
          </View>
        )}
      </View>
      <View style={[styles.productInfo, { padding: dynamicStyles.productInfoPadding }]}>
        <Text style={[styles.productName, dynamicStyles.productName]} numberOfLines={2}>{item.name}</Text>
        {/* Seller Info with Profile Picture */}
        {item.seller_name && (
          <View style={styles.sellerInfoRow}>
            {item.seller_profile_image ? (
              <Image 
                source={{ uri: item.seller_profile_image }} 
                style={styles.sellerAvatar}
              />
            ) : (
              <View style={styles.sellerAvatarPlaceholder}>
                <Text style={styles.sellerAvatarText}>
                  {item.seller_name?.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.sellerName} numberOfLines={1}>{item.seller_name}</Text>
          </View>
        )}
        <View style={styles.productMeta}>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={14} color="#FFB800" />
            <Text style={styles.ratingText}>{item.average_rating?.toFixed(1) || '0.0'}</Text>
          </View>
          <Text style={styles.reviewCount}>({item.total_reviews || 0})</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={[styles.productPrice, dynamicStyles.productPrice]}>₱{item.price?.toFixed(2)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name={item.sold_by === 'kg' ? 'scale-outline' : 'cube-outline'} size={12} color={COLORS.textLight} />
            <Text style={styles.productUnit}>{item.unit || 'per item'}</Text>
          </View>
        </View>
        <Text style={styles.stockText}>{item.stock} in stock</Text>
        {/* Product Description Summary */}
        {item.description ? (
          <Text style={styles.productDescription} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        {/* Direct Add to Cart */}
        {item.stock > 0 && isAuthenticated && (
          <View style={styles.addToCartSection}>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  const current = getQuantity(item._id);
                  if (current > 1) setQuantity(item._id, current - 1);
                }}
              >
                <Ionicons name="remove" size={14} color={COLORS.primary} />
              </TouchableOpacity>
              <TextInput
                style={styles.qtyInput}
                value={String(getQuantity(item._id))}
                onChangeText={(text) => {
                  const num = parseInt(text) || 1;
                  setQuantity(item._id, Math.max(1, Math.min(num, item.stock)));
                }}
                keyboardType="numeric"
                maxLength={4}
              />
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  const current = getQuantity(item._id);
                  if (current < item.stock) setQuantity(item._id, current + 1);
                }}
              >
                <Ionicons name="add" size={14} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.addToCartBtn}
              onPress={(e) => {
                e?.stopPropagation?.();
                const qty = getQuantity(item._id);
                if (qty > item.stock) {
                  showWarning(`Only ${item.stock} available in stock`);
                  return;
                }
                addToCart(item, qty);
                showSuccess(`${qty}x ${item.name} added to cart!`);
                setQuantity(item._id, 1);
              }}
            >
              <Ionicons name="cart" size={14} color={COLORS.buttonText} />
              <Text style={styles.addToCartBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Mini Review Preview */}
        {item.latest_review && (
          <View style={styles.miniReviewPreview}>
            <View style={styles.miniReviewRating}>
              {[1, 2, 3, 4, 5].map(star => (
                <Ionicons
                  key={star}
                  name={star <= item.latest_review.rating ? 'star' : 'star-outline'}
                  size={10}
                  color="#FFB800"
                />
              ))}
            </View>
            <Text style={styles.miniReviewText} numberOfLines={2}>
              "{item.latest_review.comment_filtered || item.latest_review.comment}"
            </Text>
            <Text style={styles.miniReviewAuthor}>- {item.latest_review.user_name}</Text>
          </View>
        )}
      </View>
    </AnimatedCardRef>
  );

  const renderProductGridItem = ({ item, index }) => (
    <View
      style={[
        styles.productCardWrapper,
        { width: `${100 / productGridColumns}%` },
      ]}
    >
      {renderProduct({ item })}
    </View>
  );

  // ── Filter Sidebar (desktop: always visible, mobile: toggle panel) ──
  const SORT_OPTIONS = [
    { id: 'newest', label: 'Newest First', icon: 'time-outline' },
    { id: 'price_low', label: 'Price: Low → High', icon: 'arrow-up-outline' },
    { id: 'price_high', label: 'Price: High → Low', icon: 'arrow-down-outline' },
    { id: 'rating', label: 'Highest Rated', icon: 'star-outline' },
    { id: 'popular', label: 'Most Popular', icon: 'flame-outline' },
  ];

  const renderFilterContent = () => (
    <View style={styles.filterSidebarContent}>
      {/* Sort By */}
      <View style={styles.filterGroup}>
        <Text style={styles.filterGroupTitle}>Sort By</Text>
        {SORT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.filterSortOption, sortBy === opt.id && styles.filterSortOptionActive]}
            onPress={() => setSortBy(opt.id)}
          >
            <Ionicons
              name={opt.icon}
              size={16}
              color={sortBy === opt.id ? COLORS.textOnPrimary : COLORS.text}
            />
            <Text style={[styles.filterSortText, sortBy === opt.id && styles.filterSortTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category */}
      <View style={styles.filterGroup}>
        <Text style={styles.filterGroupTitle}>Category</Text>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.filterCategoryOption, selectedCategory === cat.id && styles.filterCategoryActive]}
            onPress={() => setSelectedCategory(cat.id)}
          >
            <Ionicons
              name={cat.icon}
              size={16}
              color={selectedCategory === cat.id ? COLORS.primary : COLORS.textSecondary}
            />
            <Text style={[styles.filterCategoryText, selectedCategory === cat.id && styles.filterCategoryTextActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Rating */}
      <View style={styles.filterGroup}>
        <Text style={styles.filterGroupTitle}>Minimum Rating</Text>
        {[0, 1, 2, 3, 4, 5].map(rating => (
          <TouchableOpacity
            key={rating}
            style={[styles.filterRatingOption, minRating === rating && styles.filterRatingActive]}
            onPress={() => setMinRating(rating)}
          >
            <View style={styles.filterStars}>
              {rating === 0 ? (
                <Text style={[styles.filterRatingLabel, minRating === 0 && styles.filterRatingLabelActive]}>All Ratings</Text>
              ) : (
                <>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Ionicons
                      key={i}
                      name={i < rating ? 'star' : 'star-outline'}
                      size={14}
                      color={i < rating ? '#FFB800' : COLORS.textLight}
                    />
                  ))}
                  <Text style={styles.filterRatingLabel}> & up</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Price Range */}
      <View style={styles.filterGroup}>
        <Text style={styles.filterGroupTitle}>Price Range</Text>
        <View style={styles.filterPriceRow}>
          <View style={styles.filterPriceInputWrapper}>
            <Text style={styles.filterPricePrefix}>₱</Text>
            <TextInput
              style={styles.filterPriceInput}
              placeholder="Min"
              placeholderTextColor={COLORS.textLight}
              value={minPrice}
              onChangeText={setMinPrice}
              keyboardType="numeric"
            />
          </View>
          <Text style={styles.filterPriceDash}>–</Text>
          <View style={styles.filterPriceInputWrapper}>
            <Text style={styles.filterPricePrefix}>₱</Text>
            <TextInput
              style={styles.filterPriceInput}
              placeholder="Max"
              placeholderTextColor={COLORS.textLight}
              value={maxPrice}
              onChangeText={setMaxPrice}
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>

      {/* Clear All */}
      {hasActiveFilters && (
        <TouchableOpacity style={styles.filterClearAllBtn} onPress={clearAllFilters}>
          <Ionicons name="refresh-outline" size={16} color={COLORS.danger} />
          <Text style={styles.filterClearAllText}>Clear All Filters</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderProductsHeader = () => (
    <>
      {/* Header with Stats */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.headerTitle, dynamicStyles.headerTitle]}>Marketplace</Text>
            <Text style={[styles.headerSubtitle, dynamicStyles.headerSubtitle]}>Fresh Bignay Products</Text>
          </View>
          <View style={styles.headerButtons} />
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, dynamicStyles.statValue]}>{totalProducts || products.length}</Text>
            <Text style={[styles.statLabel, dynamicStyles.statLabel]}>Products</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, dynamicStyles.statValue]}>{CATEGORIES.length - 1}</Text>
            <Text style={[styles.statLabel, dynamicStyles.statLabel]}>Categories</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, dynamicStyles.statValue]}>{products.filter(p => p.stock > 0).length}</Text>
            <Text style={[styles.statLabel, dynamicStyles.statLabel]}>Available</Text>
          </View>
        </View>
      </View>

      {/* Mobile Filter Panel (slide-down) */}
      {!isDesktop && showFilterPanel && (
        <View style={styles.mobileFilterPanel}>
          {renderFilterContent()}
        </View>
      )}

      {/* Price Range Filter (legacy inline - only when sidebar not shown) */}
      {showPriceFilter && !showFilterPanel && !isDesktop && (
        <View style={styles.priceFilterContainer}>
          <Text style={styles.priceFilterLabel}>Price Range</Text>
          <View style={styles.priceFilterRow}>
            <View style={styles.priceInputWrapper}>
              <Text style={styles.priceInputPrefix}>₱</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="Min"
                placeholderTextColor={COLORS.textLight}
                value={minPrice}
                onChangeText={setMinPrice}
                keyboardType="numeric"
              />
            </View>
            <Text style={styles.priceDash}>—</Text>
            <View style={styles.priceInputWrapper}>
              <Text style={styles.priceInputPrefix}>₱</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="Max"
                placeholderTextColor={COLORS.textLight}
                value={maxPrice}
                onChangeText={setMaxPrice}
                keyboardType="numeric"
              />
            </View>
            {(minPrice || maxPrice) && (
              <TouchableOpacity style={styles.clearFilterButton} onPress={clearPriceFilter}>
                <Ionicons name="close-circle" size={20} color={COLORS.danger} />
              </TouchableOpacity>
            )}
          </View>
          {(minPrice || maxPrice) && (
            <Text style={styles.filterActiveText}>
              Showing products {minPrice ? `from ₱${minPrice}` : ''} {maxPrice ? `up to ₱${maxPrice}` : ''}
            </Text>
          )}
        </View>
      )}

      {/* Featured Carousels - hidden when any filter is active */}
      {!hasActiveFilters && !searchQuery && (
        <>
          <ProductCarousel
            title="Recently Added"
            icon="🆕"
            products={featuredProducts.recently_added}
          />
          <ProductCarousel
            title="Most Popular"
            icon="🔥"
            products={featuredProducts.most_popular}
          />
          <ProductCarousel
            title="Top Rated"
            icon="⭐"
            products={featuredProducts.top_rated}
          />
        </>
      )}

      {/* Categories Filter */}
      <View style={styles.categoriesSection}>
        <Text style={styles.categoriesSectionTitle}>Browse by Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesContainer}>
          {CATEGORIES.map(category => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryButton,
                selectedCategory === category.id && styles.categoryButtonActive,
              ]}
              onPress={() => setSelectedCategory(category.id)}
            >
              <Ionicons
                name={category.icon}
                size={20}
                color={selectedCategory === category.id ? COLORS.textOnPrimary : COLORS.primary}
              />
              <Text
                style={[
                  styles.categoryText,
                  dynamicStyles.categoryText,
                  selectedCategory === category.id && styles.categoryTextActive,
                ]}
              >
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* All Products Title */}
      <View style={[styles.allProductsSection, { padding: dynamicStyles.contentPadding, paddingBottom: 8 }]}> 
        <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>
          {searchQuery
            ? `Search Results (${filteredProducts.length})`
            : `All Products${totalProducts ? ` (${totalProducts})` : ''}`}
        </Text>
      </View>
    </>
  );

  const renderProductsFooter = () => (
    <View style={[styles.allProductsSection, { padding: dynamicStyles.contentPadding, paddingTop: 0 }]}> 
      {isLoadingMore && (
        <View style={styles.loadingMoreContainer}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingMoreText}>Loading more products...</Text>
        </View>
      )}
      {!hasMoreProducts && products.length > 0 && !searchQuery && selectedCategory !== 'all' && (
        <Text style={styles.endOfListText}>All products loaded</Text>
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading marketplace...</Text>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={isDesktop ? styles.desktopLayout : { flex: 1 }}>
        {/* Desktop Sidebar Filter - collapsible */}
        {isDesktop && (
          <View style={[styles.filterSidebar, isSidebarCollapsed && styles.filterSidebarCollapsed]}>
            <View style={styles.filterSidebarHeader}>
              {!isSidebarCollapsed && <Text style={styles.filterSidebarTitle}>Filters</Text>}
              <TouchableOpacity
                style={styles.filterSidebarToggle}
                onPress={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              >
                <Ionicons
                  name={isSidebarCollapsed ? 'chevron-forward' : 'chevron-back'}
                  size={18}
                  color={COLORS.textSecondary}
                />
              </TouchableOpacity>
            </View>
            {!isSidebarCollapsed && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {renderFilterContent()}
              </ScrollView>
            )}
          </View>
        )}

        {/* Main Content */}
        <View style={{ flex: 1 }}>
      {/* Search Bar - outside FlatList to prevent re-render on typing */}
      <View style={[styles.searchContainer, { height: dynamicStyles.searchHeight }]}>
        <Ionicons name="search" size={20} color={COLORS.textSecondary} />
        <TextInput
          style={[styles.searchInput, { fontSize: dynamicStyles.searchFontSize }]}
          placeholder="Search products... (press Enter)"
          placeholderTextColor={COLORS.textLight}
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={() => setSearchQuery(searchInput.trim())}
          returnKeyType="search"
        />
        {searchInput ? (
          <TouchableOpacity onPress={() => { setSearchInput(''); setSearchQuery(''); }}>
            <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        ) : null}
        {/* Filter toggle button (mobile/tablet only) */}
        {!isDesktop && (
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilterPanel(prev => !prev)}
          >
            <Ionicons
              name={showFilterPanel ? 'close-circle' : 'options-outline'}
              size={22}
              color={showFilterPanel ? COLORS.danger : COLORS.primary}
            />
            {hasActiveFilters && !showFilterPanel && (
              <View style={styles.filterActiveDot} />
            )}
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredProducts}
        renderItem={renderProductGridItem}
        keyExtractor={(item, index) => item._loopKey || `${item._id || 'product'}-${index}`}
        numColumns={productGridColumns}
        key={`products-${productGridColumns}`}
        ListHeaderComponent={renderProductsHeader}
        ListFooterComponent={renderProductsFooter}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No products found</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.25}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
        contentContainerStyle={[
          { paddingBottom: 12 },
        ]}
      />
        </View>
      </View>

      {/* Cart Modal (using separate component) */}
      <CartModal
        visible={showCartModal}
        onClose={() => setShowCartModal(false)}
        navigation={navigation}
      />

      {/* Order History (using separate component) */}
      <OrderHistoryScreen
        visible={showOrderHistoryModal}
        onClose={() => setShowOrderHistoryModal(false)}
        onProductsRefresh={loadProducts}
      />

      {/* Admin Order Management (opened via notification redirect) */}
      <OrderManagement
        visible={showOrderManagementModal}
        onClose={() => setShowOrderManagementModal(false)}
      />

      {/* User Product Management */}
      <UserProductManagement
        visible={showUserProductsModal}
        onClose={() => setShowUserProductsModal(false)}
        onProductsRefresh={loadProducts}
      />

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
    </Animated.View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
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
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.textOnPrimary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  adminButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 12,
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textOnPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    height: 48,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: COLORS.text,
  },
  filterButton: {
    padding: 8,
    marginLeft: 8,
  },
  // Price Filter Styles
  priceFilterContainer: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  priceFilterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  priceFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  priceInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  priceInputPrefix: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  priceDash: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  clearFilterButton: {
    padding: 4,
  },
  filterActiveText: {
    fontSize: 12,
    color: COLORS.primary,
    fontStyle: 'italic',
    marginTop: 8,
  },
  categoriesSection: {
    marginTop: 16,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  categoriesSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  categoryButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  categoryTextActive: {
    color: COLORS.textOnPrimary,
  },
  carouselSection: {
    marginTop: 20,
  },
  carouselHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  carouselTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.text,
  },
  carouselControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  carouselArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seeAllText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  carouselList: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  carouselCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginRight: 10,
    padding: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  carouselImageContainer: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  },
  carouselImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  carouselPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselImageCount: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  carouselImageCountText: {
    color: COLORS.surface,
    fontSize: 10,
    fontWeight: '600',
  },
  carouselName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
    minHeight: 30,
    lineHeight: 15,
  },
  carouselPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  carouselRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  carouselRatingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  // Carousel seller info styles with avatar
  carouselSellerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  carouselSellerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  carouselSellerAvatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselSellerAvatarText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.textOnPrimary,
  },
  carouselSellerName: {
    fontSize: 11,
    color: COLORS.textSecondary,
    flex: 1,
  },
  allProductsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  productCardWrapper: {
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  productCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  productImageContainer: {
    backgroundColor: COLORS.surfaceVariant,
  },
  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  productPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productImageCount: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  productImageCountText: {
    color: COLORS.surface,
    fontSize: 11,
    fontWeight: '600',
  },
  lowStockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.warning,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lowStockText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.surface,
  },
  productInfo: {
    padding: 10,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
    minHeight: 32,
    lineHeight: 16,
  },
  // Product card seller info styles with avatar
  sellerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  sellerAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  sellerAvatarPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerAvatarText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.textOnPrimary,
  },
  sellerName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },
  productMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.text,
  },
  reviewCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  productUnit: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  stockText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  productDescription: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
    marginTop: 4,
    marginBottom: 2,
  },
  addToCartSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
  },
  qtyInput: {
    width: 32,
    height: 26,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    paddingVertical: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
  },
  addToCartBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addToCartBtnText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '600',
  },
  // Mini Review Preview Styles
  miniReviewPreview: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  miniReviewRating: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  miniReviewText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    lineHeight: 14,
  },
  miniReviewAuthor: {
    fontSize: 9,
    color: COLORS.textLight,
    marginTop: 2,
  },
  emptyContainer: {
    width: '100%',
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadingMoreText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  endOfListText: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textLight,
    paddingVertical: 16,
  },
  cartFab: {
    position: 'absolute',
    bottom: 84,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    zIndex: 998,
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.danger,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: {
    color: COLORS.textOnPrimary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productModalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 800,
    ...(Platform.OS === 'web' ? { 
      maxWidth: 800,
      alignSelf: 'center',
    } : {}),
  },
  modalClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  slideshowContainer: {
    position: 'relative',
    height: 280,
  },
  imageCarousel: {
    height: 280,
  },
  modalImage: {
    height: 280,
    resizeMode: 'cover',
  },
  modalImagePlaceholder: {
    height: 280,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  slideArrowLeft: {
    left: 12,
  },
  slideArrowRight: {
    right: 12,
  },
  paginationDots: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  paginationDotActive: {
    width: 24,
    backgroundColor: COLORS.surface,
  },
  imageCounter: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  imageCounterText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '600',
  },
  modalBody: {
    padding: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  // Seller section styles in modal
  sellerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 14,
  },
  sellerAvatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  sellerAvatarLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerAvatarLargeText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.textOnPrimary,
  },
  sellerDetails: {
    flex: 1,
  },
  sellerLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  sellerNameLarge: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 2,
  },
  modalRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
  },
  modalRatingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  modalDescription: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 16,
  },
  modalInfoRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  modalInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalInfoText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  // Inline Reviews Section Styles
  inlineReviewsSection: {
    marginBottom: 16,
  },
  inlineReviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  inlineReviewsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  seeAllReviews: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  inlineReviewsList: {
    gap: 12,
  },
  inlineReviewCard: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 14,
  },
  inlineReviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  inlineReviewUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  inlineReviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  inlineReviewAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineReviewAvatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textOnPrimary,
  },
  inlineReviewName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  inlineReviewDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  inlineReviewRating: {
    flexDirection: 'row',
    gap: 2,
  },
  inlineReviewText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  verifiedPurchase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  verifiedPurchaseText: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '500',
  },
  viewMoreReviewsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  viewMoreReviewsText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  noReviewsContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
  },
  noReviewsSubtext: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 4,
  },
  writeReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 6,
  },
  writeReviewButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  reviewsPreview: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  reviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  reviewItem: {
    marginTop: 8,
  },
  reviewRating: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  reviewText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  reviewAuthor: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  noReviewsText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  modalPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  modalUnit: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 4,
  },
  quantityBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    paddingHorizontal: 12,
  },
  addToCartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  addToCartText: {
    color: COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Reviews Modal
  reviewsModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    padding: 20,
  },
  reviewsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  reviewsModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  writeReview: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  writeReviewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  ratingSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  reviewInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  submitReviewButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitReviewText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  reviewCard: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewCardAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  reviewCardRating: {
    flexDirection: 'row',
  },
  reviewCardText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  reviewCardDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  emptyReviews: {
    alignItems: 'center',
    padding: 40,
  },
  emptyReviewsText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  // Cart Modal
  cartModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
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
    borderRadius: 8,
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
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  cartItemQuantity: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    paddingHorizontal: 8,
  },
  removeButton: {
    padding: 8,
  },
  cartFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  cartTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cartTotalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  cartTotalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
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
    paddingVertical: 12,
  },
  clearCartText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyCart: {
    alignItems: 'center',
    padding: 60,
  },
  emptyCartText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 24,
  },
  continueShoppingButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  continueShoppingText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  // Checkout Modal
  checkoutModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  checkoutSectionTitle: {
    fontSize: 16,
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
  },
  checkoutItemPrice: {
    fontSize: 14,
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
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlignVertical: 'top',
  },
  checkoutFooter: {
    padding: 20,
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
  // Admin Modal
  adminModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: 20,
  },
  adminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  adminTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  adminAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 20,
  },
  adminActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  adminSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  adminProductItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  adminProductInfo: {
    flex: 1,
  },
  adminProductName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  adminProductMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  adminProductActions: {
    flexDirection: 'row',
    gap: 8,
  },
  adminEditButton: {
    padding: 8,
  },
  adminDeleteButton: {
    padding: 8,
  },
  noProductsText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    padding: 20,
  },
  // Product Form Modal
  productFormModal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  productFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  productFormTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  productFormContent: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formTextarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 10,
    marginRight: 12,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
  },
  addImageButton: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceVariant,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceVariant,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryChipText: {
    fontSize: 13,
    color: COLORS.text,
  },
  categoryChipTextActive: {
    color: COLORS.textOnPrimary,
  },
  productFormFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    gap: 12,
  },
  cancelFormButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelFormText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  saveFormButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveFormText: {
    color: COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  // Header buttons
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  historyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  myProductsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  salesButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Quantity input styles
  quantityInput: {
    width: 40,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  quantityInputLarge: {
    width: 50,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    paddingHorizontal: 4,
    paddingVertical: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 6,
  },
  cartItemSubtotal: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  // Order History Modal styles
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
    maxHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  orderStatusTabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
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
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  cancelOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.danger,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  cancelOrderButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 16,
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
  },
  reorderButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
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
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 8,
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

  // ── Desktop Layout ──
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
  },

  // ── Filter Sidebar (desktop) ──
  filterSidebar: {
    width: 260,
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  filterSidebarCollapsed: {
    width: 48,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  filterSidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterSidebarToggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterSidebarTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
    paddingBottom: 0,
  },
  filterSidebarContent: {
    paddingBottom: 24,
  },

  // ── Mobile Filter Panel ──
  mobileFilterPanel: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },

  // ── Filter Groups ──
  filterGroup: {
    marginBottom: 20,
  },
  filterGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // Sort options
  filterSortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 2,
  },
  filterSortOptionActive: {
    backgroundColor: COLORS.primary,
  },
  filterSortText: {
    fontSize: 13,
    color: COLORS.text,
  },
  filterSortTextActive: {
    color: COLORS.textOnPrimary,
    fontWeight: '600',
  },

  // Category options
  filterCategoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 2,
  },
  filterCategoryActive: {
    backgroundColor: COLORS.primaryLight || `${COLORS.primary}15`,
  },
  filterCategoryText: {
    fontSize: 13,
    color: COLORS.text,
  },
  filterCategoryTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Rating options
  filterRatingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 2,
  },
  filterRatingActive: {
    backgroundColor: COLORS.primaryLight || `${COLORS.primary}15`,
  },
  filterStars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  filterRatingLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  filterRatingLabelActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Price inputs
  filterPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterPriceInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    height: 36,
  },
  filterPricePrefix: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginRight: 2,
  },
  filterPriceInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    padding: 0,
  },
  filterPriceDash: {
    fontSize: 14,
    color: COLORS.textLight,
  },

  // Clear all button
  filterClearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.danger,
    marginTop: 4,
  },
  filterClearAllText: {
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: '600',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
});
