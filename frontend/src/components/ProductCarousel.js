// ProductCarousel - Reusable auto-sliding product carousel
// Shows N items based on screen width, auto-slides every 3 seconds
// Used in MarketplaceScreen & ProductDetailScreen

import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Image,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useResponsive } from '../hooks/useResponsive';
import { useThemeColors } from '../context/ThemeContext';

const AUTO_SLIDE_INTERVAL = 3000; // 3 seconds
const USER_PAUSE_DURATION = 5000; // pause after user interaction

export default function ProductCarousel({ title, icon, products = [], excludeProductId }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const navigation = useNavigation();
  const scrollRef = useRef(null);
  const autoSlideTimer = useRef(null);
  const userPauseTimer = useRef(null);
  const currentPage = useRef(0);
  const isUserInteracting = useRef(false);

  const {
    width: screenWidth,
    isMobile,
    isTablet,
    isDesktop,
    responsive,
    sp,
    fp,
  } = useResponsive();

  // Filter out excluded product
  const displayProducts = useMemo(() => {
    const filtered = excludeProductId
      ? products.filter(p => p._id !== excludeProductId)
      : products;
    return filtered.slice(0, 20);
  }, [products, excludeProductId]);

  // Calculate layout dimensions
  const containerPadding = responsive({ mobile: 12, tablet: 16, desktop: 20 });
  const cardGap = responsive({ mobile: 10, tablet: 12, desktop: 14 });
  const sidebarWidth = isDesktop ? 280 : 0;
  const availableWidth = screenWidth - sidebarWidth;

  // Visible whole items per page
  const visibleWholeItems = useMemo(() => {
    if (isMobile) return 2;
    if (isTablet) return 3;
    if (screenWidth >= 1400) return 6;
    if (isDesktop) return 4;
    return 3;
  }, [isMobile, isTablet, isDesktop, screenWidth]);

  // Card width: fill the available area evenly
  const cardWidth = Math.floor(
    (availableWidth - containerPadding * 2 - cardGap * (visibleWholeItems - 1)) / visibleWholeItems
  );
  const imageHeight = responsive({ mobile: 120, tablet: 130, desktop: 150 });
  const pageWidth = visibleWholeItems * cardWidth + (visibleWholeItems - 1) * cardGap;

  // Total pages
  const totalPages = Math.max(1, Math.ceil(displayProducts.length / visibleWholeItems));

  // Auto-slide
  useEffect(() => {
    if (displayProducts.length <= visibleWholeItems) return;

    const slide = () => {
      autoSlideTimer.current = setInterval(() => {
        if (isUserInteracting.current) return;

        currentPage.current = (currentPage.current + 1) % totalPages;
        scrollRef.current?.scrollTo({
          x: currentPage.current * (pageWidth + cardGap),
          animated: true,
        });
      }, AUTO_SLIDE_INTERVAL);
    };

    slide();
    return () => clearInterval(autoSlideTimer.current);
  }, [displayProducts.length, visibleWholeItems, totalPages, pageWidth, cardGap]);

  const handleScrollBegin = useCallback(() => {
    isUserInteracting.current = true;
    clearTimeout(userPauseTimer.current);
  }, []);

  const handleScrollEnd = useCallback((e) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    currentPage.current = Math.round(offsetX / (pageWidth + cardGap));
    // Resume auto-slide after a pause
    clearTimeout(userPauseTimer.current);
    userPauseTimer.current = setTimeout(() => {
      isUserInteracting.current = false;
    }, USER_PAUSE_DURATION);
  }, [pageWidth, cardGap]);

  const navigateToProduct = useCallback((item) => {
    navigation.navigate('ProductDetail', { product: item });
  }, [navigation]);

  // Manual prev/next
  const scrollToPage = useCallback((page) => {
    const clamped = Math.max(0, Math.min(page, totalPages - 1));
    currentPage.current = clamped;
    scrollRef.current?.scrollTo({
      x: clamped * (pageWidth + cardGap),
      animated: true,
    });
    isUserInteracting.current = true;
    clearTimeout(userPauseTimer.current);
    userPauseTimer.current = setTimeout(() => {
      isUserInteracting.current = false;
    }, USER_PAUSE_DURATION);
  }, [totalPages, pageWidth, cardGap]);

  if (!displayProducts.length) return null;

  return (
    <View style={styles.container}>
      {/* Header row with title and arrows */}
      <View style={styles.header}>
        <Text style={styles.title}>{icon ? `${icon} ` : ''}{title}</Text>
        {totalPages > 1 && (
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navBtn, currentPage.current === 0 && styles.navBtnDisabled]}
              onPress={() => scrollToPage(currentPage.current - 1)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={18} color={currentPage.current === 0 ? COLORS.textLight : COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, currentPage.current >= totalPages - 1 && styles.navBtnDisabled]}
              onPress={() => scrollToPage(currentPage.current + 1)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={18} color={currentPage.current >= totalPages - 1 ? COLORS.textLight : COLORS.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Horizontal scroll */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={handleScrollBegin}
        onMomentumScrollEnd={handleScrollEnd}
        snapToInterval={pageWidth + cardGap}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: containerPadding }}
      >
        {displayProducts.map((item, index) => (
          <Pressable
            key={`${item._id}-${index}`}
            style={({ pressed }) => [
              styles.card,
              {
                width: cardWidth,
                marginRight: index < displayProducts.length - 1 ? cardGap : 0,
                opacity: pressed ? 0.85 : 1,
                cursor: 'pointer',
              },
            ]}
            onPress={() => navigateToProduct(item)}
          >
            <View style={[styles.imageContainer, { height: imageHeight }]}>
              {item.images?.[0] ? (
                <Image source={{ uri: item.images[0] }} style={styles.image} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="leaf" size={30} color={COLORS.primaryLight} />
                </View>
              )}
              {item.images?.length > 1 && (
                <View style={styles.imageCountBadge}>
                  <Ionicons name="images" size={9} color="#fff" />
                  <Text style={styles.imageCountText}>{item.images.length}</Text>
                </View>
              )}
            </View>
            <View style={styles.info}>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.price}>₱{item.price?.toFixed(2)}</Text>
              {item.seller_name && (
                <View style={styles.sellerRow}>
                  {item.seller_profile_image ? (
                    <Image source={{ uri: item.seller_profile_image }} style={styles.sellerAvatar} />
                  ) : (
                    <View style={styles.sellerAvatarPlaceholder}>
                      <Text style={styles.sellerAvatarText}>{item.seller_name?.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.sellerName} numberOfLines={1}>{item.seller_name}</Text>
                </View>
              )}
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={12} color="#FFB800" />
                <Text style={styles.ratingText}>{item.average_rating?.toFixed(1) || '0.0'}</Text>
                {item.total_reviews > 0 && (
                  <Text style={styles.reviewCount}>({item.total_reviews})</Text>
                )}
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {/* Page dots */}
      {totalPages > 1 && (
        <View style={styles.dotsRow}>
          {Array.from({ length: totalPages }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, currentPage.current === i && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  navRow: {
    flexDirection: 'row',
    gap: 6,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border || COLORS.divider,
  },
  imageContainer: {
    backgroundColor: COLORS.surfaceVariant || COLORS.background,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant || COLORS.background,
  },
  imageCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
  },
  imageCountText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  info: {
    padding: 12,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
    lineHeight: 18,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 6,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  sellerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  sellerAvatarPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerAvatarText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  sellerName: {
    fontSize: 11,
    color: COLORS.textSecondary,
    flex: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  reviewCount: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    backgroundColor: COLORS.primary,
    width: 20,
  },
});
