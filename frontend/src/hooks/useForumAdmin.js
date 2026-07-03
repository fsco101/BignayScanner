// useForumAdmin Hook
// Admin-specific business logic for forum management
// Works with both web and mobile platforms

import { useState, useEffect, useCallback, useRef } from 'react';
import ForumService from '../services/ForumService';
import { ADMIN_POSTS_PER_PAGE, INITIAL_POST_FORM } from '../shared/constants/forum';

/**
 * Custom hook for admin forum post management
 * Contains business logic for CRUD operations
 */
export function useForumAdmin(options = {}) {
  const {
    autoFetch = true,
    limit = ADMIN_POSTS_PER_PAGE,
  } = options;

  // Posts state
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalPosts, setTotalPosts] = useState(0);

  // Filters
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [formData, setFormData] = useState(INITIAL_POST_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPostId, setEditingPostId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const isMounted = useRef(true);

  // Fetch posts
  const fetchPosts = useCallback(async (pageNum = 1, refresh = false) => {
    if (pageNum === 1) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const params = {
        page: pageNum,
        limit,
        category: filterCategory !== 'all' ? filterCategory : undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        search: searchQuery || undefined,
      };

      const result = await ForumService.getAdminPosts(params);

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
      }
    }
  }, [filterCategory, filterStatus, searchQuery, limit]);

  // Auto-fetch on filter changes
  useEffect(() => {
    isMounted.current = true;
    if (autoFetch) {
      fetchPosts(1);
    }
    return () => {
      isMounted.current = false;
    };
  }, [autoFetch, filterCategory, filterStatus]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (autoFetch) {
        fetchPosts(1);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Refresh
  const refresh = useCallback(() => {
    setIsRefreshing(true);
    fetchPosts(1, true);
  }, [fetchPosts]);

  // Load more
  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchPosts(page + 1);
    }
  }, [fetchPosts, page, isLoading, hasMore]);

  // Reset form
  const resetForm = useCallback(() => {
    setFormData(INITIAL_POST_FORM);
    setIsEditing(false);
    setEditingPostId(null);
    setSaveError(null);
  }, []);

  // Open create form
  const openCreateForm = useCallback(() => {
    resetForm();
  }, [resetForm]);

  // Open edit form
  const openEditForm = useCallback((post) => {
    setFormData({
      title: post.title || '',
      content: post.content || '',
      excerpt: post.excerpt || '',
      category: post.category || 'news',
      tags: (post.tags || []).join(', '),
      cover_image: post.cover_image || null,
      images: post.images || [],
      is_published: post.is_published || false,
      is_featured: post.is_featured || false,
      is_pinned: post.is_pinned || false,
    });
    setIsEditing(true);
    setEditingPostId(post._id);
    setSaveError(null);
  }, []);

  // Update form field
  const updateFormField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Validate form
  const validateForm = useCallback(() => {
    if (!formData.title.trim()) {
      return { valid: false, error: 'Please enter a title' };
    }
    if (!formData.content.trim()) {
      return { valid: false, error: 'Please enter content' };
    }
    return { valid: true, error: null };
  }, [formData]);

  // Save post (create or update)
  const savePost = useCallback(async () => {
    const validation = validateForm();
    if (!validation.valid) {
      setSaveError(validation.error);
      return { ok: false, error: validation.error };
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const postData = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        excerpt: formData.excerpt.trim() || formData.content.substring(0, 150).trim(),
        category: formData.category,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        cover_image: formData.cover_image,
        images: formData.images,
        is_published: formData.is_published,
        is_featured: formData.is_featured,
        is_pinned: formData.is_pinned,
      };

      let result;
      if (isEditing && editingPostId) {
        result = await ForumService.updatePost(editingPostId, postData);
      } else {
        result = await ForumService.createPost(postData);
      }

      if (result.ok) {
        resetForm();
        fetchPosts(1, true);
        return { ok: true };
      } else {
        setSaveError(result.error || 'Failed to save post');
        return { ok: false, error: result.error };
      }
    } catch (err) {
      const error = 'Failed to save post';
      setSaveError(error);
      return { ok: false, error };
    } finally {
      setIsSaving(false);
    }
  }, [formData, isEditing, editingPostId, validateForm, resetForm, fetchPosts]);

  // Delete post
  const deletePost = useCallback(async (postId) => {
    try {
      const result = await ForumService.deletePost(postId);
      if (result.ok) {
        fetchPosts(1, true);
        return { ok: true };
      }
      return { ok: false, error: result.error };
    } catch (err) {
      return { ok: false, error: 'Failed to delete post' };
    }
  }, [fetchPosts]);

  // Toggle publish
  const togglePublish = useCallback(async (post) => {
    try {
      const result = await ForumService.togglePublish(post._id);
      if (result.ok) {
        setPosts(prev => prev.map(p =>
          p._id === post._id ? { ...p, is_published: !p.is_published } : p
        ));
        return { ok: true };
      }
      return { ok: false, error: result.error };
    } catch (err) {
      return { ok: false, error: 'Failed to update post' };
    }
  }, []);

  // Toggle featured
  const toggleFeature = useCallback(async (post) => {
    try {
      const result = await ForumService.toggleFeature(post._id);
      if (result.ok) {
        setPosts(prev => prev.map(p =>
          p._id === post._id ? { ...p, is_featured: !p.is_featured } : p
        ));
        return { ok: true };
      }
      return { ok: false, error: result.error };
    } catch (err) {
      return { ok: false, error: 'Failed to update post' };
    }
  }, []);

  // Toggle pinned
  const togglePin = useCallback(async (post) => {
    try {
      const result = await ForumService.togglePin(post._id);
      if (result.ok) {
        setPosts(prev => prev.map(p =>
          p._id === post._id ? { ...p, is_pinned: !p.is_pinned } : p
        ));
        return { ok: true };
      }
      return { ok: false, error: result.error };
    } catch (err) {
      return { ok: false, error: 'Failed to update post' };
    }
  }, []);

  // Add image to form
  const addImage = useCallback((imageUrl) => {
    setFormData(prev => ({
      ...prev,
      images: [...prev.images, imageUrl].slice(0, 10),
    }));
  }, []);

  // Remove image from form
  const removeImage = useCallback((index) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  }, []);

  // Set cover image
  const setCoverImage = useCallback((imageUrl) => {
    setFormData(prev => ({ ...prev, cover_image: imageUrl }));
  }, []);

  return {
    // Posts data
    posts,
    isLoading,
    isRefreshing,
    error,
    hasMore,
    totalPosts,
    page,

    // Filters
    filterCategory,
    setFilterCategory,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,

    // Form data
    formData,
    isEditing,
    editingPostId,
    isSaving,
    saveError,

    // Actions
    refresh,
    loadMore,
    fetchPosts,
    openCreateForm,
    openEditForm,
    updateFormField,
    resetForm,
    savePost,
    deletePost,
    togglePublish,
    toggleFeature,
    togglePin,
    addImage,
    removeImage,
    setCoverImage,
    validateForm,
  };
}
