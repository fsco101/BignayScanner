// Forum Management Screen (Admin)
// Full CRUD operations for managing forum posts

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../../context/AuthContext';
import { useResponsive } from '../../../hooks/useResponsive';
import ForumService, { FORUM_CATEGORIES } from '../../../services/ForumService';
import { rules, validateField } from '../../../utils/validation';
import { formatPhilippineDateTime } from '../../../utils/dateTime';
import SweetAlert, { useSweetAlert } from '../../../components/SweetAlert';
import { useThemeColors } from '../../../context/ThemeContext';


const initialFormState = {
  title: '',
  content: '',
  excerpt: '',
  category: 'news',
  tags: '',
  cover_image: null,
  images: [],
  is_published: false,
  is_featured: false,
  is_pinned: false,
};

export default function ForumManagement({ visible, onClose }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { user } = useAuth();
  const { alertConfig, showSuccess, showError, showWarning, showDelete, hideAlert } = useSweetAlert();
  
  // Responsive dimensions
  const { width: screenWidth, height: screenHeight, isDesktop, isTablet, sp, fp, responsive, maxContentWidth } = useResponsive();
  const modalResponsiveStyle = useMemo(() => ({
    overlay: isDesktop ? { justifyContent: 'center', alignItems: 'center' } : { justifyContent: 'flex-end' },
    content: isDesktop ? { maxWidth: 700, width: '90%', borderRadius: 20, maxHeight: '90%' } : {},
  }), [isDesktop]);

  // State
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all'); // all, published, draft
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalPosts, setTotalPosts] = useState(0);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPostId, setEditingPostId] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Validation state
  const [postFormErrors, setPostFormErrors] = useState({});
  const [postFormTouched, setPostFormTouched] = useState({});

  const postFormRules = {
    title: [rules.required('Title')],
    content: [rules.required('Content')],
  };

  const touchPostField = (field) => {
    setPostFormTouched(prev => ({ ...prev, [field]: true }));
    const fieldErrors = validateField(formData[field], postFormRules[field] || []);
    setPostFormErrors(prev => ({ ...prev, [field]: fieldErrors }));
  };

  const validatePostForm = () => {
    const allErrors = {};
    let isValid = true;
    Object.keys(postFormRules).forEach(field => {
      const errs = validateField(formData[field], postFormRules[field]);
      if (errs) { allErrors[field] = errs; isValid = false; }
    });
    setPostFormErrors(allErrors);
    setPostFormTouched(prev => {
      const t = { ...prev };
      Object.keys(postFormRules).forEach(f => t[f] = true);
      return t;
    });
    return isValid;
  };

  // Fetch posts
  const fetchPosts = useCallback(async (pageNum = 1, refresh = false) => {
    if (pageNum === 1) {
      setIsLoading(true);
    }

    try {
      const params = {
        page: pageNum,
        limit: 20,
        category: filterCategory !== 'all' ? filterCategory : undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        search: searchQuery || undefined,
      };

      const result = await ForumService.getAdminPosts(params);
      
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
      } else {
        showError('Error', result.error || 'Failed to load posts');
      }
    } catch (error) {
      showError('Error', 'Failed to load posts');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filterCategory, filterStatus, searchQuery]);

  useEffect(() => {
    if (visible) {
      fetchPosts(1);
    }
  }, [filterCategory, filterStatus, visible]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (searchQuery !== undefined && visible) {
        fetchPosts(1);
      }
    }, 500);
    return () => clearTimeout(debounce);
  }, [searchQuery, visible]);

  // Handlers
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchPosts(1, true);
  }, [fetchPosts]);

  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchPosts(page + 1);
    }
  }, [fetchPosts, page, isLoading, hasMore]);

  const openCreateModal = () => {
    setFormData(initialFormState);
    setIsEditing(false);
    setEditingPostId(null);
    setModalVisible(true);
  };

  const openEditModal = (post) => {
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
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setFormData(initialFormState);
    setIsEditing(false);
    setEditingPostId(null);
    setPostFormErrors({});
    setPostFormTouched({});
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (postFormTouched[field]) {
      const fieldErrors = validateField(value, postFormRules[field] || []);
      setPostFormErrors(prev => ({ ...prev, [field]: fieldErrors }));
    }
  };

  // Convert blob URL to base64 (for web compatibility)
  const convertToBase64 = async (uri) => {
    if (uri.startsWith('data:')) {
      return uri; // Already a data URL
    }
    
    if (Platform.OS === 'web') {
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result); // Returns full data URL
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.error('[ForumManagement] Error converting to base64:', error);
        return null;
      }
    }
    
    return null;
  };

  const pickCoverImage = async () => {
    try {
      // Request permissions on native platforms
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showWarning('Permission needed', 'Please allow access to your photos');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        base64: Platform.OS !== 'web', // Get base64 on native platforms
      });

      if (!result.canceled && result.assets[0]) {
        setIsUploadingImage(true);
        
        try {
          const asset = result.assets[0];
          let imageData;
          
          console.log('[ForumManagement] Cover image asset:', {
            hasBase64: !!asset.base64,
            uri: asset.uri?.substring(0, 50),
            mimeType: asset.mimeType,
          });
          
          // Get base64 data URL - backend will upload to Cloudinary
          if (asset.base64) {
            const mimeType = asset.mimeType || 'image/jpeg';
            imageData = `data:${mimeType};base64,${asset.base64}`;
          } else {
            // Convert from URI (for web)
            imageData = await convertToBase64(asset.uri);
          }
          
          if (!imageData) {
            showError('Error', 'Failed to process image');
            setIsUploadingImage(false);
            return;
          }
          
          console.log('[ForumManagement] Cover image ready, length:', imageData.length);
          setFormData(prev => ({ ...prev, cover_image: imageData }));
        } catch (processError) {
          console.error('[ForumManagement] Process error:', processError);
          showError('Error', 'Failed to process image');
        }
        
        setIsUploadingImage(false);
      }
    } catch (error) {
      console.error('[ForumManagement] Pick image error:', error);
      setIsUploadingImage(false);
      showError('Error', 'Failed to pick image');
    }
  };

  const pickAdditionalImages = async () => {
    try {
      // Request permissions on native platforms
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showWarning('Permission needed', 'Please allow access to your photos');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: Platform.OS !== 'web', // Get base64 on native platforms
      });

      if (!result.canceled && result.assets.length > 0) {
        setIsUploadingImage(true);
        
        console.log(`[ForumManagement] Processing ${result.assets.length} additional images...`);
        const processedImages = [];
        
        for (const asset of result.assets) {
          try {
            let imageData;
            
            // Get base64 data URL - backend will upload to Cloudinary
            if (asset.base64) {
              const mimeType = asset.mimeType || 'image/jpeg';
              imageData = `data:${mimeType};base64,${asset.base64}`;
            } else {
              imageData = await convertToBase64(asset.uri);
            }
            
            if (imageData) {
              processedImages.push(imageData);
              console.log(`[ForumManagement] Processed image ${processedImages.length}`);
            }
          } catch (processError) {
            console.error('[ForumManagement] Error processing image:', processError);
          }
        }
        
        console.log(`[ForumManagement] ${processedImages.length}/${result.assets.length} images processed`);
        
        if (processedImages.length > 0) {
          setFormData(prev => ({ 
            ...prev, 
            images: [...prev.images, ...processedImages].slice(0, 10) 
          }));
        }
        setIsUploadingImage(false);
      }
    } catch (error) {
      setIsUploadingImage(false);
      showError('Error', 'Failed to process images');
    }
  };

  const removeImage = (index) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    // Validation
    if (!validatePostForm()) return;

    setIsSaving(true);

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
      if (isEditing) {
        result = await ForumService.updatePost(editingPostId, postData);
      } else {
        result = await ForumService.createPost(postData);
      }

      if (result.ok) {
        showSuccess(isEditing ? 'Post updated successfully' : 'Post created successfully');
        closeModal();
        fetchPosts(1, true);
      } else {
        showError('Error', result.error || 'Failed to save post');
      }
    } catch (error) {
      showError('Error', 'Failed to save post');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (post) => {
    showDelete(
      'Delete Post',
      `Are you sure you want to delete "${post.title}"?`,
      async () => {
        try {
          const result = await ForumService.deletePost(post._id);
          if (result.ok) {
            showSuccess('Success', 'Post deleted successfully');
            fetchPosts(1, true);
          } else {
            showError('Error', result.error || 'Failed to delete post');
          }
        } catch (error) {
          showError('Error', 'Failed to delete post');
        }
      }
    );
  };

  const handleTogglePublish = async (post) => {
    try {
      const result = await ForumService.togglePublish(post._id);
      if (result.ok) {
        setPosts(prev => prev.map(p => 
          p._id === post._id ? { ...p, is_published: !p.is_published } : p
        ));
      } else {
        showError('Error', result.error || 'Failed to update post');
      }
    } catch (error) {
      showError('Error', 'Failed to update post');
    }
  };

  const handleToggleFeature = async (post) => {
    try {
      const result = await ForumService.toggleFeature(post._id);
      if (result.ok) {
        setPosts(prev => prev.map(p => 
          p._id === post._id ? { ...p, is_featured: !p.is_featured } : p
        ));
      }
    } catch (error) {
      showError('Error', 'Failed to update post');
    }
  };

  const handleTogglePin = async (post) => {
    try {
      const result = await ForumService.togglePin(post._id);
      if (result.ok) {
        setPosts(prev => prev.map(p => 
          p._id === post._id ? { ...p, is_pinned: !p.is_pinned } : p
        ));
      }
    } catch (error) {
      showError('Error', 'Failed to update post');
    }
  };

  const getCategoryInfo = (categoryId) => {
    return FORUM_CATEGORIES.find(c => c.id === categoryId) || 
      { name: categoryId, icon: 'document', color: COLORS.primary };
  };

  // Render functions
  const renderFilterChips = () => (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      style={styles.filterContainer}
      contentContainerStyle={styles.filterContent}
    >
      {/* Category Filter */}
      {[{ id: 'all', name: 'All Categories' }, ...FORUM_CATEGORIES].map(cat => (
        <TouchableOpacity
          key={cat.id}
          style={[
            styles.filterChip,
            filterCategory === cat.id && styles.filterChipActive,
          ]}
          onPress={() => setFilterCategory(cat.id)}
        >
          <Text style={[
            styles.filterChipText,
            filterCategory === cat.id && styles.filterChipTextActive,
          ]}>
            {cat.name}
          </Text>
        </TouchableOpacity>
      ))}
      
      <View style={styles.filterDivider} />
      
      {/* Status Filter */}
      {[
        { id: 'all', name: 'All Status' },
        { id: 'published', name: 'Published' },
        { id: 'draft', name: 'Drafts' },
      ].map(status => (
        <TouchableOpacity
          key={status.id}
          style={[
            styles.filterChip,
            filterStatus === status.id && styles.filterChipActive,
            filterStatus === status.id && { backgroundColor: COLORS.info },
          ]}
          onPress={() => setFilterStatus(status.id)}
        >
          <Text style={[
            styles.filterChipText,
            filterStatus === status.id && styles.filterChipTextActive,
          ]}>
            {status.name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderPostItem = ({ item }) => {
    const categoryInfo = getCategoryInfo(item.category);
    
    return (
      <View style={styles.postCard}>
        <View style={styles.postRow}>
          {item.cover_image ? (
            <Image source={{ uri: item.cover_image }} style={styles.postThumb} />
          ) : (
            <View style={[styles.noThumb, { backgroundColor: categoryInfo.color + '30' }]}>
              <Ionicons name={categoryInfo.icon} size={24} color={categoryInfo.color} />
            </View>
          )}
          
          <View style={styles.postInfo}>
            <View style={styles.postBadges}>
              <View style={[styles.categoryBadge, { backgroundColor: categoryInfo.color + '20' }]}>
                <Text style={[styles.categoryText, { color: categoryInfo.color }]}>
                  {categoryInfo.name}
                </Text>
              </View>
              {!item.is_published && (
                <View style={styles.draftBadge}>
                  <Text style={styles.draftText}>Draft</Text>
                </View>
              )}
              {item.is_featured && (
                <Ionicons name="star" size={14} color={COLORS.warning} />
              )}
              {item.is_pinned && (
                <Ionicons name="pin" size={14} color={COLORS.danger} />
              )}
            </View>
            
            <Text style={styles.postTitle} numberOfLines={2}>{item.title}</Text>

            <View style={styles.authorRow}>
              {item.author_avatar || item.author?.avatar ? (
                <Image
                  source={{ uri: item.author_avatar || item.author?.avatar }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, { justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="person-circle-outline" size={14} color={COLORS.buttonText} />
                </View>
              )}
              <Text style={styles.authorName}>{item.author_name}</Text>
            </View>

            <View style={styles.postMeta}>
              <Text style={styles.postDate}>
                {formatPhilippineDateTime(item.created_at)}
              </Text>
              <View style={styles.postStats}>
                <View style={styles.statItem}>
                  <Ionicons name="eye-outline" size={12} color={COLORS.textLight} />
                  <Text style={styles.statText}>{item.views || 0}</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="heart-outline" size={12} color={COLORS.textLight} />
                  <Text style={styles.statText}>{item.likes || 0}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
        
        <View style={styles.postActions}>
          <TouchableOpacity
            style={[styles.actionBtn, item.is_published && styles.actionBtnActive]}
            onPress={() => handleTogglePublish(item)}
          >
            <Ionicons 
              name={item.is_published ? "eye" : "eye-off"} 
              size={18} 
              color={item.is_published ? COLORS.success : COLORS.textSecondary} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, item.is_featured && styles.actionBtnActive]}
            onPress={() => handleToggleFeature(item)}
          >
            <Ionicons 
              name={item.is_featured ? "star" : "star-outline"} 
              size={18} 
              color={item.is_featured ? COLORS.warning : COLORS.textSecondary} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, item.is_pinned && styles.actionBtnActive]}
            onPress={() => handleTogglePin(item)}
          >
            <Ionicons 
              name={item.is_pinned ? "pin" : "pin-outline"} 
              size={18} 
              color={item.is_pinned ? COLORS.danger : COLORS.textSecondary} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => openEditModal(item)}
          >
            <Ionicons name="create-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };


  const renderModal = () => (
    <Modal
      visible={modalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeModal}
    >
      <KeyboardAvoidingView 
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Modal Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={closeModal} style={styles.modalCloseBtn}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>
            {isEditing ? 'Edit Post' : 'Create Post'}
          </Text>
          <TouchableOpacity 
            onPress={handleSave} 
            style={styles.modalSaveBtn}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.modalSaveText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={[styles.input, postFormTouched.title && postFormErrors.title && styles.formInputError]}
              value={formData.title}
              onChangeText={(text) => handleFormChange('title', text)}
              onBlur={() => touchPostField('title')}
              placeholder="Enter post title"
              placeholderTextColor={COLORS.textLight}
            />
            {postFormTouched.title && postFormErrors.title ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                <Text style={styles.errorText}>{postFormErrors.title}</Text>
              </View>
            ) : null}
          </View>

          {/* Category */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryGrid}>
              {FORUM_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryOption,
                    formData.category === cat.id && { backgroundColor: cat.color + '20', borderColor: cat.color },
                  ]}
                  onPress={() => handleFormChange('category', cat.id)}
                >
                  <Ionicons 
                    name={cat.icon} 
                    size={18} 
                    color={formData.category === cat.id ? cat.color : COLORS.textSecondary} 
                  />
                  <Text style={[
                    styles.categoryOptionText,
                    formData.category === cat.id && { color: cat.color },
                  ]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Content */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Content *</Text>
            <TextInput
              style={[styles.input, styles.textArea, postFormTouched.content && postFormErrors.content && styles.formInputError]}
              value={formData.content}
              onChangeText={(text) => handleFormChange('content', text)}
              onBlur={() => touchPostField('content')}
              placeholder="Enter post content"
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
            />
            {postFormTouched.content && postFormErrors.content ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                <Text style={styles.errorText}>{postFormErrors.content}</Text>
              </View>
            ) : null}
          </View>

          {/* Excerpt */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Excerpt (Summary)</Text>
            <TextInput
              style={[styles.input, styles.textAreaSmall]}
              value={formData.excerpt}
              onChangeText={(text) => handleFormChange('excerpt', text)}
              placeholder="Brief summary of the post (auto-generated if empty)"
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Tags */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Tags (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={formData.tags}
              onChangeText={(text) => handleFormChange('tags', text)}
              placeholder="e.g., bignay, health, recipe"
              placeholderTextColor={COLORS.textLight}
            />
          </View>

          {/* Cover Image */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Cover Image</Text>
            <TouchableOpacity 
              style={styles.imagePicker} 
              onPress={pickCoverImage}
              disabled={isUploadingImage}
            >
              {isUploadingImage ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : formData.cover_image ? (
                <View style={styles.coverPreview}>
                  <Image source={{ uri: formData.cover_image }} style={styles.coverImage} />
                  <TouchableOpacity 
                    style={styles.removeImageBtn}
                    onPress={() => handleFormChange('cover_image', null)}
                  >
                    <Ionicons name="close-circle" size={24} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.imagePickerContent}>
                  <Ionicons name="image-outline" size={32} color={COLORS.textSecondary} />
                  <Text style={styles.imagePickerText}>Tap to upload cover image</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Additional Images */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Additional Images ({formData.images.length}/10)</Text>
            <View style={styles.imagesGrid}>
              {formData.images.map((img, index) => (
                <View key={index} style={styles.imageThumb}>
                  <Image source={{ uri: img }} style={styles.thumbImage} />
                  <TouchableOpacity 
                    style={styles.removeThumbBtn}
                    onPress={() => removeImage(index)}
                  >
                    <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              {formData.images.length < 10 && (
                <TouchableOpacity 
                  style={styles.addImageBtn}
                  onPress={pickAdditionalImages}
                  disabled={isUploadingImage}
                >
                  <Ionicons name="add" size={24} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Settings */}
          <View style={styles.settingsGroup}>
            <Text style={styles.settingsTitle}>Post Settings</Text>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="eye" size={20} color={COLORS.success} />
                <Text style={styles.settingLabel}>Published</Text>
              </View>
              <Switch
                value={formData.is_published}
                onValueChange={(val) => handleFormChange('is_published', val)}
                trackColor={{ false: COLORS.border, true: COLORS.success + '50' }}
                thumbColor={formData.is_published ? COLORS.success : COLORS.textLight}
              />
            </View>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="star" size={20} color={COLORS.warning} />
                <Text style={styles.settingLabel}>Featured</Text>
              </View>
              <Switch
                value={formData.is_featured}
                onValueChange={(val) => handleFormChange('is_featured', val)}
                trackColor={{ false: COLORS.border, true: COLORS.warning + '50' }}
                thumbColor={formData.is_featured ? COLORS.warning : COLORS.textLight}
              />
            </View>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="pin" size={20} color={COLORS.danger} />
                <Text style={styles.settingLabel}>Pinned</Text>
              </View>
              <Switch
                value={formData.is_pinned}
                onValueChange={(val) => handleFormChange('is_pinned', val)}
                trackColor={{ false: COLORS.border, true: COLORS.danger + '50' }}
                thumbColor={formData.is_pinned ? COLORS.danger : COLORS.textLight}
              />
            </View>
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Forum Management</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Removed Manage Studies button, now handled in dedicated screen */}
            <TouchableOpacity style={styles.createBtn} onPress={openCreateModal}>
              <Ionicons name="add" size={20} color={COLORS.textOnPrimary} />
              <Text style={styles.createBtnText}>New Post</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search posts..."
              placeholderTextColor={COLORS.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={COLORS.textLight} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filters */}
        {renderFilterChips()}

        {/* Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            {totalPosts} {totalPosts === 1 ? 'post' : 'posts'} found
          </Text>
        </View>

        {/* Posts List */}
        {(isLoading && page === 1) ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={posts}
            renderItem={renderPostItem}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={48} color={COLORS.textLight} />
                <Text style={styles.emptyText}>No posts found</Text>
              </View>
            }
          />
        )}

        {/* Create/Edit Modal */}
        {renderModal()}

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
          confirmColor={alertConfig.confirmColor}
          autoClose={alertConfig.autoClose}
          closeOnOverlayPress={alertConfig.closeOnOverlayPress}
        />
      </View>
    </Modal>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  // Container
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    elevation: 2,
  },
  headerBtn: {
    padding: 6,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },

  // Search
  searchContainer: {
    padding: 12,
    backgroundColor: COLORS.surface,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },

  // Filters
  filterContainer: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    minHeight: 44,
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    marginRight: 8,
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: COLORS.textOnPrimary,
  },
  filterDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
  },

  // Stats
  statsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.surfaceVariant,
  },
  statsText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // List
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 12,
    paddingBottom: 30,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 12,
  },

  // Post Card
  postCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  postRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  postThumb: {
    width: 70,
    height: 70,
    borderRadius: 8,
  },
  noThumb: {
    width: 70,
    height: 70,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postInfo: {
    flex: 1,
    marginLeft: 12,
  },
  postBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
  },
  draftBadge: {
    backgroundColor: COLORS.textLight + '30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  draftText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  postTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 20,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.border,
  },
  authorName: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  postDate: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  postStats: {
    flexDirection: 'row',
    gap: 10,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingTop: 10,
    gap: 4,
  },
  actionBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceVariant,
  },
  actionBtnActive: {
    backgroundColor: COLORS.surface,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },

  // Form
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  formInputError: {
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
  },
  textArea: {
    minHeight: 160,
  },
  textAreaSmall: {
    minHeight: 80,
  },

  // Category Grid
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  categoryOptionText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // Image Picker
  imagePicker: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    borderStyle: 'dashed',
    overflow: 'hidden',
    maxWidth: 400,
  },
  imagePickerContent: {
    padding: 24,
    alignItems: 'center',
  },
  imagePickerText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  coverPreview: {
    position: 'relative',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 220,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    zIndex: 1,
  },

  // Images Grid
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageThumb: {
    width: 70,
    height: 70,
    borderRadius: 8,
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removeThumbBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
  },
  addImageBtn: {
    width: 70,
    height: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Settings
  settingsGroup: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  settingsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingLabel: {
    fontSize: 14,
    color: COLORS.text,
  },

  bottomPadding: {
    height: 40,
  },
});
