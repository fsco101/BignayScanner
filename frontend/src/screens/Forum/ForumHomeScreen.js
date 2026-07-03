// Forum Home Screen (Landing Page)
// Modern, clean design with essential details

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  Animated,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import ForumService, { FORUM_CATEGORIES } from '../../services/ForumService';
import SLIDES from '../../../slideshow';
import { useFocusEffect } from '@react-navigation/native';
import { buildApiUrl } from '../../config/api';
import { StudyDetailModal } from './RelatedStudyCard';
import { formatPhilippineDateTime } from '../../utils/dateTime';
import { useThemeColors } from '../../context/ThemeContext';

const BIGNAY_FACTS = [
  {
    title: 'Green / Unripe',
    text: 'Sour and tangy — ideal for refreshing juice, herbal tea blends, and traditional souring agents (pampaasim).',
    color: '#388E3C',
    tag: 'Ripeness Guide',
    tagIcon: 'leaf',
  },
  {
    title: 'Red / Ripe',
    text: 'Sweet-tart flavor perfect for fresh eating, jam, jelly, and fruit punch. Harvest when clusters are mostly red.',
    color: '#D32F2F',
    tag: 'Harvest Ready',
    tagIcon: 'checkmark-circle',
  },
  {
    title: 'Dark Purple / Fully Ripe',
    text: 'Maximum sweetness — the premium stage for wine, vinegar, and concentrated syrups with deep color.',
    color: '#4A148C',
    tag: 'Premium Stage',
    tagIcon: 'star',
  },
  {
    title: 'Bignay Leaves',
    text: 'Dried leaves make herbal tea that supports digestion, kidney health, blood sugar regulation, and cholesterol management.',
    color: '#2E7D32',
    tag: 'Health Benefits',
    tagIcon: 'heart',
  },
  {
    title: 'Bignay Products',
    text: 'Wine, jam, jelly, vinegar, dried tea, and juice — each ripeness stage unlocks different high-value products.',
    color: '#C62828',
    tag: 'Value-Added',
    tagIcon: 'pricetag',
  },
];


export default function ForumHomeScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const navigation = useNavigation();
  const { isAuthenticated, user } = useAuth();
  
  const {
    width: screenWidth,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    sp,
    fp,
    wp,
    hp,
    responsive,
    contentPadding,
    spacing,
    fontSize: fontSizes,
    radius,
    iconSize,
    maxContentWidth,
  } = useResponsive();
  
  const contentWidth = isDesktop ? Math.min(screenWidth, maxContentWidth) : screenWidth;
  const horizontalPadding = responsive({ mobile: sp(16), tablet: sp(24), desktop: sp(32), wide: sp(40) });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [featuredData, setFeaturedData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [relatedStudies, setRelatedStudies] = useState([]);
  const [studiesLoading, setStudiesLoading] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const slideOpacity = useRef(new Animated.Value(1)).current;
  const slideProgress = useRef(new Animated.Value(0)).current;
  const [selectedStudy, setSelectedStudy] = useState(null);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    
    try {
      const [featuredRes, categoriesRes] = await Promise.all([
        ForumService.getFeaturedPosts(5),
        ForumService.getCategories(),
      ]);

      if (featuredRes.ok) {
        setFeaturedData(featuredRes);
      }
      if (categoriesRes.ok) {
        setCategories(categoriesRes.categories || []);
      }
      
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } catch (err) {
      setError('Failed to load content');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [fadeAnim]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (BIGNAY_FACTS.length <= 1) return;
    let mounted = true;
    const SLIDE_DURATION = 5000;
    
    const runSlide = () => {
      slideProgress.setValue(0);
      Animated.timing(slideProgress, {
        toValue: 1,
        duration: SLIDE_DURATION,
        useNativeDriver: false,
        easing: (t) => t,
      }).start(({ finished }) => {
        if (!mounted || !finished) return;
        Animated.timing(slideOpacity, { toValue: 0, duration: 250, useNativeDriver: false }).start(() => {
          if (!mounted) return;
          setSlideIndex(s => (s + 1) % BIGNAY_FACTS.length);
          slideOpacity.setValue(0);
          Animated.timing(slideOpacity, { toValue: 1, duration: 350, useNativeDriver: false }).start(() => {
            if (mounted) runSlide();
          });
        });
      });
    };
    
    runSlide();
    return () => { mounted = false; slideProgress.stopAnimation(); slideOpacity.stopAnimation(); };
  }, [slideOpacity, slideProgress]);

  useEffect(() => {
    fetchRelatedStudies();
  }, []);

  const fetchRelatedStudies = useCallback(async () => {
    setStudiesLoading(true);
    try {
      const res = await fetch(buildApiUrl('/api/related-studies?limit=3'));
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRelatedStudies(data.studies ? data.studies.slice(0, 3) : (data.slice ? data.slice(0, 3) : []));
    } catch (e) {
      setRelatedStudies([]);
    } finally {
      setStudiesLoading(false);
    }
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData(false);
  };

  const navigateToPost = (post) => {
    navigation.navigate('ForumPostDetail', { postId: post._id, title: post.title });
  };

  const navigateToCategory = (category) => {
    navigation.navigate('ForumAllPosts', { category: category.id, title: category.name });
  };

  const navigateToAllPosts = () => {
    navigation.navigate('ForumAllPosts');
  };

  const navigateToRelatedStudies = () => {
    navigation.navigate('RelatedStudies');
  };

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return formatPhilippineDateTime(dateStr);
  };

  // Hero Section — Bignay Facts Slideshow + Featured Post
  const renderHeroSection = () => {
    const featuredPosts = featuredData?.featured || [];
    const heroPost = featuredPosts[0];
    const currentSlide = SLIDES && SLIDES.length > 0 ? SLIDES[slideIndex % SLIDES.length] : null;
    const currentFact = BIGNAY_FACTS[slideIndex % BIGNAY_FACTS.length];

    if (!heroPost) {
      return (
        <View style={[styles.heroContainer, isDesktop && styles.heroContainerDesktop, isTablet && styles.heroContainerTablet]}>
          {currentSlide && (
            <Animated.Image
              source={currentSlide}
              style={[styles.heroImage, { opacity: slideOpacity }]}
              resizeMode="cover"
            />
          )}
          {/* Dark gradient anchored at bottom */}
          <View style={styles.heroGradientBottom} pointerEvents="none" />

          {/* Slide counter top-right */}
          <View style={styles.slideCounter}>
            <Text style={styles.slideCounterText}>
              {(slideIndex % BIGNAY_FACTS.length) + 1} / {BIGNAY_FACTS.length}
            </Text>
          </View>

          {/* Bottom content card */}
          <Animated.View style={[styles.heroBottomCard, isDesktop && styles.heroBottomCardDesktop, isTablet && styles.heroBottomCardTablet, { opacity: slideOpacity }]}>
            <View style={[styles.heroTagPill, { backgroundColor: currentFact.color + '30' }]}>
              <Ionicons name={currentFact.tagIcon || 'information-circle'} size={12} color={currentFact.color} />
              <Text style={[styles.heroTagPillText, { color: currentFact.color }]}>{currentFact.tag}</Text>
            </View>
            <Text style={[styles.heroTitleModern, isDesktop && styles.heroTitleDesktop, isTablet && styles.heroTitleTablet]}>{currentFact.title}</Text>
            <Text style={[styles.heroSubtitleModern, isDesktop && styles.heroSubtitleDesktop, isTablet && styles.heroSubtitleTablet]}>{currentFact.text}</Text>
          </Animated.View>

          {/* Progress bars at very bottom */}
          {BIGNAY_FACTS.length > 1 && (
            <View style={styles.progressDotsContainer} pointerEvents="none">
              {BIGNAY_FACTS.map((_, i) => (
                <View key={i} style={styles.progressBarTrack}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      { backgroundColor: currentFact.color || '#FFFFFF' },
                      i < slideIndex
                        ? { width: '100%' }
                        : i === slideIndex
                        ? {
                            width: slideProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0%', '100%'],
                            }),
                          }
                        : { width: '0%' },
                    ]}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      );
    }

    return (
      <TouchableOpacity 
        style={[styles.heroContainer, isDesktop && styles.heroContainerDesktop, isTablet && styles.heroContainerTablet]}
        onPress={() => navigateToPost(heroPost)}
        activeOpacity={0.9}
      >
        {heroPost.cover_image ? (
          <Image source={{ uri: heroPost.cover_image }} style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, { backgroundColor: COLORS.primaryDark }]} />
        )}
        <View style={styles.heroGradientBottom} pointerEvents="none" />
        <View style={[styles.heroBottomCard, isDesktop && styles.heroBottomCardDesktop, isTablet && styles.heroBottomCardTablet]}>
          <View style={[styles.heroTagPill, { backgroundColor: 'rgba(255,215,0,0.2)' }]}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={[styles.heroTagPillText, { color: '#FFD700' }]}>Featured</Text>
          </View>
          <Text style={[styles.heroTitleModern, isDesktop && styles.heroTitleDesktop, isTablet && styles.heroTitleTablet]} numberOfLines={2}>{heroPost.title}</Text>
          <Text style={[styles.heroSubtitleModern, isDesktop && styles.heroSubtitleDesktop, isTablet && styles.heroSubtitleTablet]} numberOfLines={2}>{heroPost.excerpt}</Text>
          <Text style={styles.heroDate}>{formatDate(heroPost.published_at) || 'Recently'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Quick Links
  const renderQuickLinks = () => {
    const links = [
      { icon: 'camera', label: 'Scanner', color: COLORS.primary, route: 'Scanner' },
      { icon: 'cart', label: 'Marketplace', color: COLORS.info, route: 'Marketplace' },
      { icon: 'map', label: 'Harvest Map', color: COLORS.warning, route: 'HeatMap' },
      { icon: 'chatbubbles', label: 'AI Chat', color: '#8B5CF6', route: 'Chatbot' },
    ];

    return (
      <View style={[styles.section, isDesktop && styles.sectionDesktop, isTablet && styles.sectionTablet]}>
        <View style={styles.quickLinksRow}>
          {links.map((link) => (
            <TouchableOpacity
              key={link.route}
              style={styles.quickLinkItem}
              onPress={() => navigation.navigate(link.route)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickLinkIcon, isDesktop && { width: 56, height: 56, borderRadius: 16 }, { backgroundColor: link.color + '14' }]}>
                <Ionicons name={link.icon} size={isDesktop ? 26 : 22} color={link.color} />
              </View>
              <Text style={[styles.quickLinkLabel, isDesktop && { fontSize: 13 }]}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // Categories section
  const renderCategoriesSection = () => {
    if (!categories || categories.length === 0) return null;

    return (
      <View style={[styles.section, isDesktop && styles.sectionDesktop, isTablet && styles.sectionTablet]}>
        <Text style={[styles.sectionTitle, isDesktop && styles.sectionTitleDesktop, isTablet && styles.sectionTitleTablet]}>Categories</Text>
        <View style={styles.categoriesRow}>
          {categories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={styles.categoryChip}
              onPress={() => navigateToCategory(category)}
              activeOpacity={0.7}
            >
              <Ionicons name={category.icon} size={16} color={category.color || COLORS.primary} />
              <Text style={styles.categoryChipText}>{category.name}</Text>
              <Text style={styles.categoryCount}>{category.post_count || 0}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // Post Card (compact horizontal)
  const renderPostCard = (post, category) => {
    const categoryInfo = category || FORUM_CATEGORIES.find(c => c.id === post.category) || {};
    
    return (
      <TouchableOpacity
        key={post._id}
        style={[styles.postCard, isDesktop && styles.postCardDesktop, isTablet && styles.postCardTablet]}
        onPress={() => navigateToPost(post)}
        activeOpacity={0.7}
      >
        {post.cover_image ? (
          <Image source={{ uri: post.cover_image }} style={[styles.postThumb, isDesktop && styles.postThumbDesktop, isTablet && styles.postThumbTablet]} />
        ) : (
          <View style={[styles.postThumbPlaceholder, isDesktop && styles.postThumbPlaceholderDesktop, isTablet && styles.postThumbPlaceholderTablet, { backgroundColor: (categoryInfo.color || COLORS.primary) + '15' }]}>
            <Ionicons name={categoryInfo.icon || 'document'} size={isDesktop ? 28 : 20} color={categoryInfo.color || COLORS.primary} />
          </View>
        )}
        <View style={styles.postInfo}>
          <Text style={[styles.postTitle, isDesktop && styles.postTitleDesktop, isTablet && styles.postTitleTablet]} numberOfLines={2}>{post.title}</Text>
          <Text style={[styles.postExcerpt, isDesktop && styles.postExcerptDesktop]} numberOfLines={1}>{post.excerpt}</Text>
          <View style={styles.postMeta}>
            <Text style={[styles.postDate, isDesktop && styles.postDateDesktop]}>{formatDate(post.published_at) || 'Recently'}</Text>
            {post.is_pinned && <Ionicons name="pin" size={12} color={COLORS.danger} style={{ marginLeft: 8 }} />}
            {post.is_featured && <Ionicons name="star" size={12} color={COLORS.accent} style={{ marginLeft: 4 }} />}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={isDesktop ? 22 : 18} color={COLORS.textLight} />
      </TouchableOpacity>
    );
  };

  // Pinned Posts
  const renderPinnedPosts = () => {
    const pinnedPosts = featuredData?.pinned || [];
    if (pinnedPosts.length === 0) return null;

    return (
      <View style={[styles.section, isDesktop && styles.sectionDesktop, isTablet && styles.sectionTablet]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="pin" size={16} color={COLORS.danger} />
            <Text style={[styles.sectionTitle, isDesktop && styles.sectionTitleDesktop, isTablet && styles.sectionTitleTablet]}>Pinned</Text>
          </View>
        </View>
        {pinnedPosts.map((post) => renderPostCard(post))}
      </View>
    );
  };

  // Posts by category
  const renderCategoryPosts = (categoryId, categoryName, posts) => {
    if (!posts || posts.length === 0) return null;
    const category = FORUM_CATEGORIES.find(c => c.id === categoryId);

    return (
      <View style={[styles.section, isDesktop && styles.sectionDesktop, isTablet && styles.sectionTablet]} key={categoryId}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name={category?.icon || 'document'} size={isDesktop ? 20 : 16} color={category?.color || COLORS.primary} />
            <Text style={[styles.sectionTitle, isDesktop && styles.sectionTitleDesktop, isTablet && styles.sectionTitleTablet]}>{categoryName}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('ForumAllPosts', { category: categoryId })}>
            <Text style={[styles.seeAllText, isDesktop && styles.seeAllTextDesktop]}>See All</Text>
          </TouchableOpacity>
        </View>
        {posts.map((post) => renderPostCard(post, category))}
      </View>
    );
  };

  // Related Studies
  const renderRelatedStudiesSection = () => (
    <View style={[styles.section, isDesktop && styles.sectionDesktop, isTablet && styles.sectionTablet]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="book" size={isDesktop ? 20 : 16} color={COLORS.primary} />
          <Text style={[styles.sectionTitle, isDesktop && styles.sectionTitleDesktop, isTablet && styles.sectionTitleTablet]}>Related Studies</Text>
        </View>
        <TouchableOpacity onPress={navigateToRelatedStudies}>
          <Text style={[styles.seeAllText, isDesktop && styles.seeAllTextDesktop]}>See All</Text>
        </TouchableOpacity>
      </View>
      {studiesLoading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 16 }} />
      ) : relatedStudies.length === 0 ? (
        <Text style={styles.emptyText}>No studies available.</Text>
      ) : (
        relatedStudies.map((study) => (
          <TouchableOpacity
            key={study._id || study.id || study.title}
            style={styles.studyCard}
            onPress={() => setSelectedStudy(study)}
            activeOpacity={0.7}
          >
            <View style={styles.studyIcon}>
              <Ionicons name="document-text" size={18} color={COLORS.primary} />
            </View>
            <View style={styles.studyInfo}>
              <Text style={styles.studyTitle} numberOfLines={2}>{study.title}</Text>
              <Text style={styles.studyAuthors} numberOfLines={1}>
                {Array.isArray(study.authors) ? study.authors.join(', ') : study.authors}
              </Text>
            </View>
            {study.year ? <Text style={styles.studyYear}>{study.year}</Text> : null}
            <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && {
            maxWidth: maxContentWidth,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Hero */}
          {renderHeroSection()}

          {/* Quick Links */}
          {renderQuickLinks()}

          {/* Categories */}
          {renderCategoriesSection()}

          {/* Pinned Posts */}
          {renderPinnedPosts()}

          {/* Related Studies */}
          {renderRelatedStudiesSection()}

          {/* Posts by Category */}
          {featuredData?.by_category && (
            <>
              {renderCategoryPosts('news', 'Latest News', featuredData.by_category.news)}
              {renderCategoryPosts('events', 'Upcoming Events', featuredData.by_category.events)}
              {renderCategoryPosts('about_bignay', 'About Bignay', featuredData.by_category.about_bignay)}
              {renderCategoryPosts('about_us', 'About Us', featuredData.by_category.about_us)}
            </>
          )}

          {/* View All */}
          <TouchableOpacity
            style={styles.viewAllButton}
            onPress={navigateToAllPosts}
            activeOpacity={0.7}
          >
            <Text style={styles.viewAllButtonText}>View All Posts</Text>
            <Ionicons name="arrow-forward" size={16} color={COLORS.textOnPrimary} />
          </TouchableOpacity>

          {/* Footer */}
          <View style={styles.footer}>
            <Image
              source={require('../../../assets/bignay-logo.png')}
              style={{ width: 40, height: 40, borderRadius: 20 }}
              resizeMode="cover"
            />
            <Text style={styles.footerText}>Bignay App</Text>
            <Text style={styles.footerSubtext}>Smart Fruit Analysis & Marketplace</Text>
          </View>
        </Animated.View>
      </Animated.ScrollView>

      <StudyDetailModal
        visible={!!selectedStudy}
        study={selectedStudy}
        onClose={() => setSelectedStudy(null)}
      />
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // Hero
  heroContainer: {
    height: 420,
    backgroundColor: '#0A0A0A',
    overflow: 'hidden',
    position: 'relative',
  },
  heroContainerDesktop: {
    height: 520,
  },
  heroContainerTablet: {
    height: 460,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    position: 'absolute',
    top: 0,
    left: 0,
  },

  heroGradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 260,
    backgroundColor: 'rgba(0,0,0,0)',
    // layered opacity simulation: darker toward bottom
    ...(Platform.OS === 'web'
      ? { background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)' }
      : { backgroundColor: 'rgba(0,0,0,0.45)' }),
  },
  heroBottomCard: {
    position: 'absolute',
    bottom: 28,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 16,
    padding: 18,
    paddingBottom: 22,
    backdropFilter: 'blur(12px)',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } : {}),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroBottomCardDesktop: {
    left: 40,
    right: 40,
    bottom: 40,
    padding: 28,
    paddingBottom: 32,
    maxWidth: 600,
  },
  heroBottomCardTablet: {
    left: 24,
    right: 24,
    bottom: 32,
    padding: 22,
    paddingBottom: 26,
  },
  heroTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
    gap: 5,
  },
  heroTagPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  heroTitleModern: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  heroTitleDesktop: {
    fontSize: 32,
    lineHeight: 40,
    marginBottom: 10,
  },
  heroTitleTablet: {
    fontSize: 26,
    lineHeight: 34,
    marginBottom: 8,
  },
  heroSubtitleModern: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 19,
  },
  heroSubtitleDesktop: {
    fontSize: 16,
    lineHeight: 24,
  },
  heroSubtitleTablet: {
    fontSize: 15,
    lineHeight: 22,
  },
  heroDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
  },
  progressDotsContainer: {
    position: 'absolute',
    bottom: 10,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 4,
  },
  progressBarTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: COLORS.surface,
  },
  slideCounter: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 24,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  slideCounterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Quick Links
  quickLinksRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  quickLinkItem: {
    alignItems: 'center',
    gap: 6,
  },
  quickLinkIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickLinkLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // Section
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionDesktop: {
    marginTop: 28,
    paddingHorizontal: 32,
  },
  sectionTablet: {
    marginTop: 20,
    paddingHorizontal: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  sectionTitleDesktop: {
    fontSize: 22,
  },
  sectionTitleTablet: {
    fontSize: 19,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  seeAllTextDesktop: {
    fontSize: 15,
  },

  // Categories
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  categoryCount: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textLight,
    backgroundColor: COLORS.divider,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },

  // Post Card (horizontal compact)
  postCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    minHeight: 106,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  postCardDesktop: {
    padding: 20,
    minHeight: 120,
    marginBottom: 12,
    borderRadius: 16,
  },
  postCardTablet: {
    padding: 18,
    minHeight: 112,
    marginBottom: 10,
  },
  postThumb: {
    width: 84,
    height: 84,
    borderRadius: 10,
  },
  postThumbDesktop: {
    width: 110,
    height: 110,
    borderRadius: 14,
  },
  postThumbTablet: {
    width: 96,
    height: 96,
    borderRadius: 12,
  },
  postThumbPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postThumbPlaceholderDesktop: {
    width: 110,
    height: 110,
    borderRadius: 14,
  },
  postThumbPlaceholderTablet: {
    width: 96,
    height: 96,
    borderRadius: 12,
  },
  postInfo: {
    flex: 1,
    marginLeft: 16,
    marginRight: 4,
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 21,
    marginBottom: 4,
  },
  postTitleDesktop: {
    fontSize: 19,
    lineHeight: 26,
    marginBottom: 6,
  },
  postTitleTablet: {
    fontSize: 17,
    lineHeight: 23,
  },
  postExcerpt: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: 6,
  },
  postExcerptDesktop: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  postDate: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  postDateDesktop: {
    fontSize: 14,
  },

  // Studies
  studyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  studyIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  studyInfo: {
    flex: 1,
  },
  studyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 18,
    marginBottom: 2,
  },
  studyAuthors: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  studyYear: {
    fontSize: 11,
    color: COLORS.textLight,
    fontWeight: '600',
    marginLeft: 8,
  },

  // Empty text
  emptyText: {
    fontSize: 13,
    color: COLORS.textLight,
    paddingVertical: 8,
  },

  // View All
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
  },
  viewAllButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 28,
    marginTop: 8,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  footerSubtext: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
  },
});
