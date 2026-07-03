// Review Modal Component
// Handles product reviews display, submission, editing, and deletion

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import ReviewService from '../../services/ReviewService';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';
import { rules, validateField } from '../../utils/validation';
import { useThemeColors } from '../../context/ThemeContext';


export default function ReviewModal({ 
  visible, 
  onClose, 
  product, 
  onReviewSubmitted 
}) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { user, isAuthenticated, isAdmin } = useAuth();
  const { alertConfig, showSuccess, showError, showWarning, showDelete, hideAlert } = useSweetAlert();

  // Responsive hook
  const { isDesktop, isTablet, sp, fp, responsive } = useResponsive();
  const modalResponsiveStyle = useMemo(() => ({
    overlay: isDesktop ? { justifyContent: 'center', alignItems: 'center' } : { justifyContent: 'flex-end' },
    content: isDesktop ? { maxWidth: 600, width: '90%', borderRadius: 20, maxHeight: '85%' } : {},
    titleSize: { fontSize: responsive({ mobile: fp(18), tablet: fp(19), desktop: fp(20) }) },
    bodyText: { fontSize: responsive({ mobile: fp(13), tablet: fp(14), desktop: fp(15) }) },
    padding: responsive({ mobile: sp(16), tablet: sp(18), desktop: sp(20) }),
  }), [isDesktop, sp, fp, responsive]);

  // State
  const [reviews, setReviews] = useState([]);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Edit mode state
  const [editingReview, setEditingReview] = useState(null);
  const [existingReviewId, setExistingReviewId] = useState(null);
  const [isDeletingReview, setIsDeletingReview] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [reviewTouched, setReviewTouched] = useState(false);

  const reviewTextRules = [rules.required('Review text')];

  // Load reviews
  const loadReviews = useCallback(async () => {
    if (!product?._id) return;

    setIsLoading(true);
    try {
      const [reviewsResult, canReviewResult] = await Promise.all([
        ReviewService.getProductReviews(product._id),
        isAuthenticated ? ReviewService.canReviewProduct(product._id) : { ok: false },
      ]);

      if (reviewsResult.ok) {
        setReviews(reviewsResult.reviews || []);
      }

      if (canReviewResult.ok) {
        setCanReview(canReviewResult.can_review);
        // Store the existing review ID if user already reviewed
        if (canReviewResult.reason === 'already_reviewed' && canReviewResult.existing_review_id) {
          setExistingReviewId(canReviewResult.existing_review_id);
        } else {
          setExistingReviewId(null);
        }
      }
    } catch (error) {
      console.error('Error loading reviews:', error);
    } finally {
      setIsLoading(false);
    }
  }, [product?._id, isAuthenticated]);

  useEffect(() => {
    if (visible && product) {
      loadReviews();
      // Reset edit mode when modal opens
      setEditingReview(null);
      setReviewText('');
      setReviewRating(5);
    }
  }, [visible, product, loadReviews]);

  // Check if user owns a specific review
  const isOwnReview = (review) => {
    return user && review.user_id === user._id;
  };

  // Get user's own review from the list
  const getUserReview = () => {
    if (!user) return null;
    return reviews.find(r => r.user_id === user._id);
  };

  // Start editing a review
  const handleEditReview = (review) => {
    setEditingReview(review);
    setReviewText(review.comment || '');
    setReviewRating(review.rating || 5);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingReview(null);
    setReviewText('');
    setReviewRating(5);
  };

  // Delete a review (admin can delete any, user can delete own)
  const handleDeleteReview = (review) => {
    const isOwn = isOwnReview(review);
    
    showDelete(
      'Delete Review',
      isOwn 
        ? 'Are you sure you want to delete your review? This action cannot be undone.'
        : `Are you sure you want to delete the review by ${review.user_name}? This action cannot be undone.`,
      async () => {
        setIsDeletingReview(true);
        try {
          const result = await ReviewService.deleteReview(review._id);
          
          if (result.ok) {
            showSuccess('Review deleted successfully!');
            loadReviews();
            onReviewSubmitted?.();
            // Reset form if editing the deleted review
            if (editingReview?._id === review._id) {
              handleCancelEdit();
            }
            // Clear existing review ID if it was the user's own review
            if (isOwn) {
              setExistingReviewId(null);
              setCanReview(true);
            }
          } else {
            showError(result.error || 'Failed to delete review');
          }
        } catch (error) {
          showError('An error occurred while deleting the review');
        } finally {
          setIsDeletingReview(false);
        }
      }
    );
  };

  // Submit review (create or update)
  const handleSubmitReview = async () => {
    setReviewTouched(true);
    const error = validateField(reviewText, reviewTextRules);
    setReviewError(error);
    if (error) return;

    if (!product?._id) {
      showError('Invalid product');
      return;
    }

    setIsSubmittingReview(true);
    try {
      let result;
      
      if (editingReview) {
        // Update existing review
        result = await ReviewService.updateReview(editingReview._id, {
          comment: reviewText,
          rating: reviewRating,
        });
        
        if (result.ok) {
          showSuccess('Review updated successfully!');
          setEditingReview(null);
          setReviewText('');
          setReviewRating(5);
          loadReviews();
          onReviewSubmitted?.();
        } else {
          showError(result.error || 'Failed to update review');
        }
      } else {
        // Create new review
        result = await ReviewService.createReview(product._id, {
          comment: reviewText,
          rating: reviewRating,
        });

        if (result.ok) {
          showSuccess('Review submitted successfully!');
          setReviewText('');
          setReviewRating(5);
          setCanReview(false);
          loadReviews();
          onReviewSubmitted?.();
        } else {
          showError(result.error || 'Failed to submit review');
        }
      }
    } catch (error) {
      showError('An error occurred while submitting the review');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Calculate average rating
  const averageRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0';

  // Check if showing edit form for user's own review
  const userReview = getUserReview();
  const showReviewForm = canReview || editingReview;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, modalResponsiveStyle.overlay]}>
        <View style={[styles.reviewsModalContent, modalResponsiveStyle.content]}>
          <View style={styles.reviewsModalHeader}>
            <View>
              <Text style={styles.reviewsModalTitle}>Reviews</Text>
              <View style={styles.reviewsSummary}>
                <View style={styles.ratingDisplay}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <Ionicons
                      key={star}
                      name={star <= Math.round(parseFloat(averageRating)) ? 'star' : 'star-outline'}
                      size={16}
                      color="#FFB800"
                    />
                  ))}
                </View>
                <Text style={styles.ratingText}>
                  {averageRating} ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Write/Edit Review Section */}
          {showReviewForm && (
            <View style={styles.writeReview}>
              <View style={styles.writeReviewHeader}>
                <Text style={styles.writeReviewTitle}>
                  {editingReview ? 'Edit Your Review' : 'Write a Review'}
                </Text>
                {editingReview && (
                  <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelEditButton}>
                    <Text style={styles.cancelEditText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.ratingSelector}>
                {[1, 2, 3, 4, 5].map(star => (
                  <TouchableOpacity key={star} onPress={() => setReviewRating(star)}>
                    <Ionicons
                      name={star <= reviewRating ? 'star' : 'star-outline'}
                      size={32}
                      color="#FFB800"
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.reviewInput, reviewTouched && reviewError && styles.reviewInputError]}
                placeholder="Share your experience with this product..."
                placeholderTextColor={COLORS.textLight}
                value={reviewText}
                onChangeText={(text) => {
                  setReviewText(text);
                  if (reviewTouched) setReviewError(validateField(text, reviewTextRules));
                }}
                onBlur={() => {
                  setReviewTouched(true);
                  setReviewError(validateField(reviewText, reviewTextRules));
                }}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
              {reviewTouched && reviewError && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                  <Text style={styles.errorText}>{reviewError}</Text>
                </View>
              )}
              <View style={styles.reviewInputFooter}>
                <Text style={styles.charCount}>{reviewText.length}/500</Text>
                <TouchableOpacity
                  style={[styles.submitReviewButton, isSubmittingReview && styles.buttonDisabled]}
                  onPress={handleSubmitReview}
                  disabled={isSubmittingReview}
                >
                  {isSubmittingReview ? (
                    <ActivityIndicator color={COLORS.buttonText} size="small" />
                  ) : (
                    <>
                      <Ionicons name={editingReview ? "save" : "send"} size={16} color={COLORS.textOnPrimary} />
                      <Text style={styles.submitReviewText}>{editingReview ? 'Update' : 'Submit'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Reviews List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading reviews...</Text>
            </View>
          ) : (
            <FlatList
              data={reviews}
              keyExtractor={item => item._id}
              renderItem={({ item }) => {
                const canEdit = isOwnReview(item);
                const canDelete = isAdmin || isOwnReview(item);
                
                return (
                  <View style={[
                    styles.reviewCard,
                    canEdit && styles.reviewCardOwn
                  ]}>
                    <View style={styles.reviewCardHeader}>
                      <View style={styles.reviewUserInfo}>
                        {item.user_profile_image ? (
                          <Image 
                            source={{ uri: item.user_profile_image }} 
                            style={styles.reviewAvatarImage}
                          />
                        ) : (
                          <View style={styles.reviewAvatar}>
                            <Text style={styles.reviewAvatarText}>
                              {item.user_name?.charAt(0).toUpperCase() || 'U'}
                            </Text>
                          </View>
                        )}
                        <View>
                          <View style={styles.reviewAuthorRow}>
                            <Text style={styles.reviewCardAuthor}>{item.user_name}</Text>
                            {canEdit && (
                              <View style={styles.ownReviewBadge}>
                                <Text style={styles.ownReviewText}>You</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.reviewCardDate}>
                            {new Date(item.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                            {item.updated_at && item.updated_at !== item.created_at && ' (edited)'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.reviewCardRating}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <Ionicons
                            key={star}
                            name={star <= item.rating ? 'star' : 'star-outline'}
                            size={14}
                            color="#FFB800"
                          />
                        ))}
                      </View>
                    </View>
                    <Text style={styles.reviewCardText}>{item.comment || item.content}</Text>
                    
                    <View style={styles.reviewCardFooter}>
                      {item.is_verified_purchase && (
                        <View style={styles.verifiedBadge}>
                          <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
                          <Text style={styles.verifiedText}>Verified Purchase</Text>
                        </View>
                      )}
                      
                      {/* Action buttons for edit/delete */}
                      {(canEdit || canDelete) && (
                        <View style={styles.reviewActions}>
                          {canEdit && editingReview?._id !== item._id && (
                            <TouchableOpacity 
                              style={styles.reviewActionButton}
                              onPress={() => handleEditReview(item)}
                            >
                              <Ionicons name="pencil" size={16} color={COLORS.info} />
                              <Text style={[styles.reviewActionText, { color: COLORS.info }]}>Edit</Text>
                            </TouchableOpacity>
                          )}
                          {canDelete && (
                            <TouchableOpacity 
                              style={styles.reviewActionButton}
                              onPress={() => handleDeleteReview(item)}
                              disabled={isDeletingReview}
                            >
                              <Ionicons name="trash" size={16} color={COLORS.danger} />
                              <Text style={[styles.reviewActionText, { color: COLORS.danger }]}>
                                {isAdmin && !isOwnReview(item) ? 'Remove' : 'Delete'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyReviews}>
                  <Ionicons name="chatbubble-outline" size={64} color={COLORS.textLight} />
                  <Text style={styles.emptyReviewsTitle}>No Reviews Yet</Text>
                  <Text style={styles.emptyReviewsText}>
                    Be the first to share your experience with this product!
                  </Text>
                </View>
              }
              contentContainerStyle={styles.reviewsList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

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
  reviewsModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    flex: 1,
  },
  reviewsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  reviewsModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  reviewsSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingDisplay: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  writeReview: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    backgroundColor: COLORS.surfaceVariant,
  },
  writeReviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  writeReviewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  cancelEditButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelEditText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  ratingSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  reviewInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  reviewInputError: {
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
  reviewInputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  charCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  submitReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  submitReviewText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  reviewsList: {
    padding: 16,
  },
  reviewCard: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  reviewCardOwn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceVariant,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reviewUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reviewAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownReviewBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  ownReviewText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.textOnPrimary,
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  reviewAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textOnPrimary,
  },
  reviewCardAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  reviewCardDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  reviewCardRating: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewCardText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
  },
  reviewCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '500',
  },
  reviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 'auto',
  },
  reviewActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reviewActionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyReviews: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyReviewsTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptyReviewsText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
