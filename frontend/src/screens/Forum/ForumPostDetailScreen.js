// Forum Post Detail Screen
// Displays full post content with images

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Share,
  Animated,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useResponsive } from '../../hooks/useResponsive';
import ForumService, { FORUM_CATEGORIES } from '../../services/ForumService';
import { formatPhilippineDateTime } from '../../utils/dateTime';
import { useThemeColors } from '../../context/ThemeContext';


export default function ForumPostDetailScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const navigation = useNavigation();
  const route = useRoute();
  const { postId, title } = route.params || {};
  
  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  
  const scrollY = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Responsive dimensions
  const { width: screenWidth, isDesktop, isTablet, isMobile, sp, fp, responsive, maxContentWidth } = useResponsive();
  const contentWidth = isDesktop ? Math.min(maxContentWidth, 800) : isTablet ? screenWidth * 0.9 : screenWidth;
  const imageHeight = responsive({ mobile: 250, tablet: 300, desktop: 350 });
  const dynamicStyles = useMemo(() => ({
    titleSize: { fontSize: responsive({ mobile: fp(20), tablet: fp(22), desktop: fp(24) }) },
    bodyText: { fontSize: responsive({ mobile: fp(14), tablet: fp(15), desktop: fp(16) }) },
    metaText: { fontSize: responsive({ mobile: fp(12), tablet: fp(13), desktop: fp(14) }) },
    padding: responsive({ mobile: sp(16), tablet: sp(20), desktop: sp(24) }),
  }), [screenWidth, isDesktop, sp, fp, responsive]);
  const fontSize = {
    title: isDesktop ? 28 : isTablet ? 26 : 24,
    content: isDesktop ? 17 : 16,
    meta: isDesktop ? 15 : 14,
  };

  const fetchPost = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await ForumService.getPost(postId);
      
      if (result.ok) {
        setPost(result.post);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }).start();
      } else {
        setError(result.error || 'Failed to load post');
      }
    } catch (err) {
      setError('Failed to load post');
    } finally {
      setIsLoading(false);
    }
  }, [postId, fadeAnim]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  useEffect(() => {
    if (title) {
      navigation.setOptions({ title });
    }
  }, [navigation, title]);

  const handleShare = async () => {
    try {
      await Share.share({
        title: post.title,
        message: `${post.title}\n\n${post.excerpt}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const categoryInfo = post 
    ? FORUM_CATEGORIES.find(c => c.id === post.category) || { name: post.category, icon: 'document', color: COLORS.primary }
    : null;

  const allImages = post ? [post.cover_image, ...(post.images || [])].filter(Boolean) : [];

  // Simple HTML tag stripper for content display
  const stripHtmlTags = (html) => {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading post...</Text>
      </View>
    );
  }

  if (error || !post) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={COLORS.textLight} />
        <Text style={styles.errorTitle}>Oops!</Text>
        <Text style={styles.errorText}>{error || 'Post not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchPost}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          (isDesktop || isTablet) && {
            maxWidth: Math.min(maxContentWidth, 800),
            width: '100%',
            alignSelf: 'center',
            paddingHorizontal: isDesktop ? 0 : 16,
          }
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Cover Image */}
          {allImages.length > 0 ? (
            <View style={[styles.imageSection, (isDesktop || isTablet) && styles.imageSectionDesktop]}>
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={() => {
                  setViewerIndex(selectedImageIndex);
                  setViewerVisible(true);
                }}
              >
                <Image
                  source={{ uri: allImages[selectedImageIndex] }}
                  style={[styles.coverImage, { height: imageHeight }]}
                  resizeMode="contain"
                />
              </TouchableOpacity>
              {allImages.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.thumbnailScroll}
                  contentContainerStyle={styles.thumbnailContainer}
                >
                  {allImages.map((img, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => {
                        setSelectedImageIndex(index);
                        setViewerIndex(index);
                        setViewerVisible(true);
                      }}
                      style={[
                        styles.thumbnail,
                        selectedImageIndex === index && styles.thumbnailActive,
                        isDesktop && styles.thumbnailDesktop,
                      ]}
                    >
                      <Image source={{ uri: img }} style={styles.thumbnailImage} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : (
            <View style={[styles.noImageBanner, { backgroundColor: categoryInfo.color }, (isDesktop || isTablet) && styles.noImageBannerDesktop]}>
              <Ionicons name={categoryInfo.icon} size={isDesktop ? 64 : 48} color={COLORS.buttonText} />
            </View>
          )}

          {/* Post Header */}
          <View style={[styles.postHeader, (isDesktop || isTablet) && styles.postHeaderDesktop]}>
            {/* Category & Badges */}
            <View style={styles.badgesRow}>
              <TouchableOpacity
                style={[styles.categoryBadge, { backgroundColor: categoryInfo.color + '20' }]}
                onPress={() => navigation.navigate('ForumAllPosts', { category: post.category, title: categoryInfo.name })}
              >
                <Ionicons name={categoryInfo.icon} size={14} color={categoryInfo.color} />
                <Text style={[styles.categoryText, { color: categoryInfo.color }]}>{categoryInfo.name}</Text>
              </TouchableOpacity>
              {post.is_pinned && (
                <View style={styles.pinnedBadge}>
                  <Ionicons name="pin" size={12} color={COLORS.buttonText} />
                  <Text style={styles.pinnedText}>Pinned</Text>
                </View>
              )}
              {post.is_featured && (
                <View style={styles.featuredBadge}>
                  <Ionicons name="star" size={12} color="#FFD700" />
                  <Text style={styles.featuredText}>Featured</Text>
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={[styles.postTitle, { fontSize: fontSize.title }]}>{post.title}</Text>

            {/* Author & Date */}
            <View style={[styles.metaRow, isDesktop && styles.metaRowDesktop]}>
              <View style={styles.authorInfo}>
                  {post.author_avatar || post.author?.avatar ? (
                    <Image
                      source={{ uri: post.author_avatar || post.author?.avatar }}
                      style={[styles.avatar, isDesktop ? styles.avatarDesktop : null]}
                    />
                  ) : (
                    <View style={[styles.avatar, isDesktop ? styles.avatarDesktop : null, { justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="person-circle" size={isDesktop ? 24 : 20} color={COLORS.buttonText} />
                    </View>
                  )}
                  <Text style={[styles.authorName, { fontSize: fontSize.meta }]}>{post.author_name}</Text>
                </View>
              <View style={styles.dateInfo}>
                <Ionicons name="calendar-outline" size={isDesktop ? 18 : 16} color={COLORS.textSecondary} />
                <Text style={[styles.dateText, { fontSize: fontSize.meta - 1 }]}>
                  {post.published_at 
                    ? formatPhilippineDateTime(post.published_at)
                    : 'Draft'}
                </Text>
              </View>
            </View>
          </View>

          {/* Post Content */}
          <View style={[styles.contentSection, (isDesktop || isTablet) && styles.contentSectionDesktop]}>
            <Text style={[styles.contentText, { fontSize: fontSize.content, lineHeight: fontSize.content * 1.7 }]}>
              {stripHtmlTags(post.content)}
            </Text>
          </View>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.tagsLabel}>Tags:</Text>
              <View style={styles.tagsContainer}>
                {post.tags.map((tag, index) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Updated Info */}
          {post.updated_at && post.updated_at !== post.created_at && (
            <View style={styles.updatedInfo}>
              <Ionicons name="time-outline" size={14} color={COLORS.textLight} />
              <Text style={styles.updatedText}>
                Last updated: {formatPhilippineDateTime(post.updated_at)}
              </Text>
            </View>
          )}
        </Animated.View>
      </Animated.ScrollView>
      {/* Image Viewer Modal */}
      <Modal
        visible={viewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerVisible(false)}
      >
        <View style={styles.modalBackground}>
          <Pressable style={styles.modalCloseArea} onPress={() => setViewerVisible(false)} />
          <View style={styles.modalContent}>
            <Image
              source={{ uri: allImages[viewerIndex] }}
              style={styles.modalImage}
              resizeMode="contain"
            />

            {allImages.length > 1 && (
              <>
                <TouchableOpacity
                  style={styles.navButtonLeft}
                  onPress={() => {
                    const next = (viewerIndex - 1 + allImages.length) % allImages.length;
                    setViewerIndex(next);
                    setSelectedImageIndex(next);
                  }}
                >
                  <Ionicons name="chevron-back" size={36} color={COLORS.buttonText} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.navButtonRight}
                  onPress={() => {
                    const next = (viewerIndex + 1) % allImages.length;
                    setViewerIndex(next);
                    setSelectedImageIndex(next);
                  }}
                >
                  <Ionicons name="chevron-forward" size={36} color={COLORS.buttonText} />
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setViewerVisible(false)}>
              <Ionicons name="close" size={28} color={COLORS.buttonText} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bottom Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          <Text style={styles.actionText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={24} color={COLORS.text} />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: 80,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },

  // Image Section
  imageSection: {
    backgroundColor: COLORS.surface,
  },
  imageSectionDesktop: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 16,
  },
  coverImage: {
    width: '100%',
    height: 250,
  },
  thumbnailScroll: {
    backgroundColor: COLORS.surfaceVariant,
  },
  thumbnailContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailActive: {
    borderColor: COLORS.primary,
  },
  thumbnailDesktop: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  noImageBanner: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noImageBannerDesktop: {
    height: 200,
    borderRadius: 12,
    marginTop: 16,
  },

  // Post Header
  postHeader: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  postHeaderDesktop: {
    padding: 28,
    borderRadius: 12,
    marginTop: 16,
    borderBottomWidth: 0,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.danger,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  pinnedText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.surface,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA000',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  featuredText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.surface,
  },
  postTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    lineHeight: 32,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  metaRowDesktop: {
    justifyContent: 'flex-start',
    gap: 32,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
  },
  dateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // Content Section
  contentSection: {
    backgroundColor: COLORS.surface,
    padding: 20,
    marginTop: 8,
  },
  contentSectionDesktop: {
    padding: 28,
    borderRadius: 12,
    marginTop: 16,
  },
  contentText: {
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 26,
  },

  // Tags Section
  tagsSection: {
    backgroundColor: COLORS.surface,
    padding: 20,
    paddingTop: 0,
  },
  tagsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 13,
    color: COLORS.primary,
  },

  // Updated Info
  updatedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  updatedText: {
    fontSize: 12,
    color: COLORS.textLight,
  },

  // Modal / Viewer
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseArea: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalContent: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  modalImage: {
    width: '100%',
    height: '80%',
  },
  navButtonLeft: {
    position: 'absolute',
    left: 12,
    top: '50%',
    transform: [{ translateY: -36 }],
    padding: 8,
  },
  navButtonRight: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: [{ translateY: -36 }],
    padding: 8,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    padding: 8,
  },

  // Action Bar
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingVertical: 12,
    paddingHorizontal: 20,
    justifyContent: 'space-around',
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});
