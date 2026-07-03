// useForum Hook
// Shared business logic for forum screens
// Works with both web and mobile platforms

import { useState, useEffect, useCallback, useRef } from 'react';
import ForumService from '../services/ForumService';
import { POSTS_PER_PAGE, getCategoryInfo } from '../shared/constants/forum';

/**
 * Custom hook for fetching and managing forum posts
 * Contains business logic that can be shared between web and mobile
 */
export function useForumPosts(options = {}) {
  const {
    category = null,
    featured = false,
    pinned = false,
    limit = POSTS_PER_PAGE,
    autoFetch = true,
  } = options;

  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalPosts, setTotalPosts] = useState(0);

  const isMounted = useRef(true);

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
        limit,
        category: category || undefined,
        featured: featured || undefined,
        pinned: pinned || undefined,
      };

      const result = await ForumService.getPosts(params);

      if (!isMounted.current) return;

      if (result.ok) {
        const newPosts = result.posts || [];

        if (refresh || pageNum === 1) {
          setPosts(newPosts);
        } else {
          setPosts(prev => [...prev, ...newPosts]);
        }

        setTotalPosts(result.total || 0);
        setHasMore(newPosts.length === limit);
        setPage(pageNum);
      } else {
        setError(result.error || 'Failed to load posts');
      }
    } catch (err) {
      if (isMounted.current) {
        setError('Failed to load posts');
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    }
  }, [category, featured, pinned, limit]);

  // Auto-fetch on mount
  useEffect(() => {
    isMounted.current = true;
    if (autoFetch) {
      fetchPosts(1);
    }
    return () => {
      isMounted.current = false;
    };
  }, [autoFetch, fetchPosts]);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    fetchPosts(1, true);
  }, [fetchPosts]);

  const loadMore = useCallback(() => {
    if (!isLoading && !isLoadingMore && hasMore) {
      fetchPosts(page + 1);
    }
  }, [fetchPosts, page, isLoading, isLoadingMore, hasMore]);

  return {
    posts,
    isLoading,
    isRefreshing,
    isLoadingMore,
    error,
    hasMore,
    totalPosts,
    page,
    refresh,
    loadMore,
    fetchPosts,
  };
}

/**
 * Custom hook for fetching a single forum post
 */
export function useForumPost(postId) {
  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLiked, setIsLiked] = useState(false);

  const isMounted = useRef(true);

  const fetchPost = useCallback(async () => {
    if (!postId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await ForumService.getPost(postId);

      if (!isMounted.current) return;

      if (result.ok) {
        setPost(result.post);
      } else {
        setError(result.error || 'Failed to load post');
      }
    } catch (err) {
      if (isMounted.current) {
        setError('Failed to load post');
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [postId]);

  useEffect(() => {
    isMounted.current = true;
    fetchPost();
    return () => {
      isMounted.current = false;
    };
  }, [fetchPost]);

  const likePost = useCallback(async () => {
    if (!postId || isLiked) return;

    try {
      const result = await ForumService.likePost(postId);
      if (result.ok) {
        setIsLiked(true);
        setPost(prev => prev ? { ...prev, likes: (prev.likes || 0) + 1 } : prev);
      }
    } catch (error) {
      console.error('Failed to like post:', error);
    }
  }, [postId, isLiked]);

  return {
    post,
    isLoading,
    error,
    isLiked,
    likePost,
    refresh: fetchPost,
  };
}

/**
 * Custom hook for forum categories
 */
export function useForumCategories() {
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const isMounted = useRef(true);

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await ForumService.getCategories();

      if (!isMounted.current) return;

      if (result.ok) {
        setCategories(result.categories || []);
      } else {
        setError(result.error || 'Failed to load categories');
      }
    } catch (err) {
      if (isMounted.current) {
        setError('Failed to load categories');
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchCategories();
    return () => {
      isMounted.current = false;
    };
  }, [fetchCategories]);

  return {
    categories,
    isLoading,
    error,
    getCategoryInfo,
    refresh: fetchCategories,
  };
}

/**
 * Custom hook for forum featured content (landing page)
 */
export function useForumFeatured() {
  const [featuredData, setFeaturedData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const isMounted = useRef(true);

  const fetchFeatured = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await ForumService.getFeaturedPosts(5);

      if (!isMounted.current) return;

      if (result.ok) {
        setFeaturedData(result);
      } else {
        setError(result.error || 'Failed to load featured content');
      }
    } catch (err) {
      if (isMounted.current) {
        setError('Failed to load featured content');
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchFeatured();
    return () => {
      isMounted.current = false;
    };
  }, [fetchFeatured]);

  return {
    featuredPosts: featuredData?.featured || [],
    pinnedPosts: featuredData?.pinned || [],
    postsByCategory: featuredData?.by_category || {},
    isLoading,
    error,
    refresh: fetchFeatured,
  };
}

/**
 * Custom hook for search with debounce
 */
export function useForumSearch(initialQuery = '') {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    debouncedQuery,
    clearSearch,
    hasQuery: searchQuery.length > 0,
  };
}
