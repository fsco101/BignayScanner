// Forum All Posts Screen
// Clean list view with category filter tabs and compact post cards

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useResponsive } from '../../hooks/useResponsive';
import ForumService, { FORUM_CATEGORIES } from '../../services/ForumService';
import { formatPhilippineDateTime } from '../../utils/dateTime';
import { useThemeColors } from '../../context/ThemeContext';


const TABS = [
  { id: 'all', name: 'All Posts', icon: 'apps' },
  ...FORUM_CATEGORIES,
];

export default function ForumAllPostsScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const navigation = useNavigation();
  const route = useRoute();
  const routeCategory = route.params?.category || 'all';
  
  const { width: screenWidth, isDesktop, isTablet, isMobile, sp, fp, responsive, maxContentWidth } = useResponsive();
  
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(routeCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalPosts, setTotalPosts] = useState(0);

  const tabScrollRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fetchPosts = useCallback(async (pageNum = 1, refresh = false) => {
    if (pageNum === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const params = {
        page: pageNum,
        limit: 20,
        category: activeTab !== 'all' ? activeTab : undefined,
        search: searchQuery || undefined,
      };

      const result = await ForumService.getPosts(params);
      
      if (result.ok) {
        const newPosts = result.posts || [];
        
        if (refresh || pageNum === 1) {
          setPosts(newPosts);
        } else {
          setPosts(prev => [...prev, ...newPosts]);
        }
        
        setTotalPosts(result.total || 0);
        setHasMore(newPosts.length === 20);
        setPage(pageNum);

        if (pageNum === 1) {
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 250,
            useNativeDriver: false,
          }).start();
        }
      } else {
        setError(result.error || 'Failed to load posts');
      }
    } catch (err) {
      setError('Failed to load posts');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [activeTab, searchQuery, fadeAnim]);

  useEffect(() => {
    fadeAnim.setValue(0);
    fetchPosts(1);
  }, [activeTab, fetchPosts]);

  useEffect(() => {
    if (!routeCategory) return;
    if (routeCategory !== activeTab) {
      setActiveTab(routeCategory);
      setPage(1);
      setSearchQuery('');
    }
  }, [routeCategory]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (searchQuery !== undefined) {
        fadeAnim.setValue(0);
        fetchPosts(1);
      }
    }, 500);

    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchPosts(1, true);
  }, [fetchPosts]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && !isLoading) {
      fetchPosts(page + 1);
    }
  }, [fetchPosts, page, isLoadingMore, hasMore, isLoading]);

  const handleTabChange = (tabId) => {
    if (tabId !== activeTab) {
      setActiveTab(tabId);
      setPage(1);
      setSearchQuery('');
    }
  };

  const navigateToPost = (post) => {
    navigation.navigate('ForumPostDetail', { postId: post._id, title: post.title });
  };

  const getCategoryInfo = (categoryId) => {
    return FORUM_CATEGORIES.find(c => c.id === categoryId) || 
      { name: categoryId, icon: 'document', color: COLORS.primary };
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return formatPhilippineDateTime(dateStr);
  };

  const renderTab = ({ item }) => {
    const isActive = item.id === activeTab;
    return (
      <TouchableOpacity
        style={[styles.tab, isActive && styles.tabActive]}
        onPress={() => handleTabChange(item.id)}
      >
        <Ionicons 
          name={item.icon} 
          size={16} 
          color={isActive ? COLORS.textOnPrimary : COLORS.textSecondary} 
        />
        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  // Compact horizontal post card (same style as ForumHomeScreen)
  const renderPostItem = ({ item }) => {
    const categoryInfo = getCategoryInfo(item.category);
    
    return (
      <Animated.View style={{ opacity: fadeAnim }}>
        <TouchableOpacity
          style={styles.postCard}
          onPress={() => navigateToPost(item)}
          activeOpacity={0.7}
        >
          {item.cover_image ? (
            <Image source={{ uri: item.cover_image }} style={styles.postThumb} />
          ) : (
            <View style={[styles.postThumbPlaceholder, { backgroundColor: categoryInfo.color + '15' }]}>
              <Ionicons name={categoryInfo.icon} size={20} color={categoryInfo.color} />
            </View>
          )}
          <View style={styles.postInfo}>
            <View style={styles.postTopRow}>
              <View style={[styles.categoryBadge, { backgroundColor: categoryInfo.color + '14' }]}>
                <Text style={[styles.categoryBadgeText, { color: categoryInfo.color }]}>
                  {categoryInfo.name}
                </Text>
              </View>
              {item.is_pinned && <Ionicons name="pin" size={12} color={COLORS.danger} />}
              {item.is_featured && <Ionicons name="star" size={12} color={COLORS.accent} />}
            </View>
            <Text style={styles.postTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.postExcerpt} numberOfLines={1}>{item.excerpt}</Text>
            <View style={styles.postMeta}>
              <Text style={styles.postDate}>{formatDate(item.published_at) || 'Draft'}</Text>
              {item.author_name ? (
                <Text style={styles.postAuthor}>by {item.author_name}</Text>
              ) : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderHeader = () => (
    <View style={styles.listHeader}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={COLORS.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search posts..."
          placeholderTextColor={COLORS.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {/* Featured Bignay Information - removed, now in ForumHomeScreen slideshow */}

      <View style={styles.resultsRow}>
        <Text style={styles.resultsText}>
          {totalPosts} {totalPosts === 1 ? 'post' : 'posts'}
        </Text>
        {searchQuery.length > 0 && (
          <Text style={styles.searchFor}> for "{searchQuery}"</Text>
        )}
      </View>
    </View>
  );

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.loadingMoreText}>Loading more...</Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-text-outline" size={48} color={COLORS.textLight} />
        <Text style={styles.emptyTitle}>No Posts Found</Text>
        <Text style={styles.emptyText}>
          {searchQuery
            ? 'Try adjusting your search'
            : 'No posts in this category yet'}
        </Text>
      </View>
    );
  };

  return (
    <View style={[
      styles.container,
      isDesktop && { alignItems: 'center' }
    ]}>
      {/* Tabs */}
      <View style={[
        styles.tabsContainer,
        isDesktop && { maxWidth: maxContentWidth, width: '100%' }
      ]}>
        <FlatList
          ref={tabScrollRef}
          data={TABS}
          renderItem={renderTab}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
          extraData={activeTab}
        />
      </View>

      {/* Posts List */}
      {isLoading && page === 1 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading posts...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={40} color={COLORS.textLight} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchPosts(1)}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPostItem}
          keyExtractor={(item, index) => item._id || `post-${index}`}
          contentContainerStyle={[
            styles.listContent,
            isDesktop && { maxWidth: maxContentWidth, width: '100%', alignSelf: 'center' }
          ]}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  
  // Tabs
  tabsContainer: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  tabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    justifyContent: 'center',
    flexGrow: 1,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceVariant,
    marginRight: 6,
    gap: 5,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.textOnPrimary,
  },

  // Loading & Error
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 32,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },

  // List Header
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  resultsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultsText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  searchFor: {
    fontSize: 12,
    color: COLORS.primary,
  },

  // List
  listContent: {
    paddingBottom: 20,
  },

  // Post Card - Compact horizontal (matches ForumHomeScreen)
  postCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
    minHeight: 88,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  postThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  postThumbPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 4,
  },
  postTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  postTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 18,
    marginBottom: 2,
  },
  postExcerpt: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
    marginBottom: 4,
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postDate: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  postAuthor: {
    fontSize: 11,
    color: COLORS.textLight,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 6,
    textAlign: 'center',
  },

  // Footer
  loadingMore: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
});
