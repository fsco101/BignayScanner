// Review Section Component
// Inline reviews display with submission, editing, and deletion (no modal)

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import ReviewService from '../../services/ReviewService';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';
import { rules, validateField } from '../../utils/validation';
import { useThemeColors } from '../../context/ThemeContext';


const PREVIEW_COUNT = 3;

export default function ReviewSection({
  product,
  showAll = false,
  onToggleShowAll,
  onReviewSubmitted,
}) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { user, isAuthenticated, isAdmin } = useAuth();
  const { alertConfig, showSuccess, showError, showWarning, showDelete, hideAlert } = useSweetAlert();
  const { isDesktop, sp, fp, responsive } = useResponsive();

  // State
  const [reviews, setReviews] = useState([]);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingReview, setEditingReview] = useState(null);
  const [existingReviewId, setExistingReviewId] = useState(null);
  const [ratingFilter, setRatingFilter] = useState(0);
  const [reviewError, setReviewError] = useState(null);
  const [reviewTouched, setReviewTouched] = useState(false);

  const reviewTextRules = [rules.required('Review text')]; // 0 = all

  // Load reviews
  const loadReviews = useCallback(async () => {
    if (!product?._id) return;
    setIsLoading(true);
    try {
      const [reviewsResult, canReviewResult] = await Promise.all([
        ReviewService.getProductReviews(product._id),
        isAuthenticated ? ReviewService.canReviewProduct(product._id) : { ok: false },
      ]);

      if (reviewsResult.ok) setReviews(reviewsResult.reviews || []);
      if (canReviewResult.ok) {
        setCanReview(canReviewResult.can_review);
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
    if (product?._id) {
      loadReviews();
    }
  }, [product?._id, loadReviews]);

  // Helpers
  const isOwnReview = (review) => user && review.user_id === user._id;
  const getUserReview = () => user ? reviews.find(r => r.user_id === user._id) : null;

  // Rating distribution
  const ratingDistribution = useMemo(() => {
    const dist = [0, 0, 0, 0, 0];
    reviews.forEach(r => { if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1]++; });
    return dist;
  }, [reviews]);

  // Average
  const averageRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0';

  // Filtered reviews
  const filteredReviews = useMemo(() => {
    if (ratingFilter === 0) return reviews;
    return reviews.filter(r => r.rating === ratingFilter);
  }, [reviews, ratingFilter]);

  const displayedReviews = showAll ? filteredReviews : filteredReviews.slice(0, PREVIEW_COUNT);

  // Edit handlers
  const handleEditReview = (review) => {
    setEditingReview(review);
    setReviewText(review.comment || '');
    setReviewRating(review.rating || 5);
  };

  const handleCancelEdit = () => {
    setEditingReview(null);
    setReviewText('');
    setReviewRating(5);
  };

  // Submit
  const handleSubmitReview = async () => {
    setReviewTouched(true);
    const error = validateField(reviewText, reviewTextRules);
    setReviewError(error);
    if (error) return;
    if (!product?._id) { showError('Invalid product'); return; }

    setIsSubmitting(true);
    try {
      let result;
      if (editingReview) {
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
      setIsSubmitting(false);
    }
  };

  const showReviewForm = canReview || editingReview;

  // Render star rating
  const renderStars = (rating, size = 14) => (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <Ionicons
          key={star}
          name={star <= Math.round(rating) ? 'star' : 'star-outline'}
          size={size}
          color={COLORS.gold}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Customer Reviews</Text>
        {reviews.length > PREVIEW_COUNT && (
          <TouchableOpacity onPress={onToggleShowAll}>
            <Text style={styles.toggleText}>
              {showAll ? 'Show Less' : `See All (${reviews.length})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingBoxText}>Loading reviews...</Text>
        </View>
      ) : (
        <>
          {/* Rating Summary Card */}
          {reviews.length > 0 && (
            <View style={styles.ratingSummaryCard}>
              <View style={styles.ratingBig}>
                <Text style={styles.ratingBigNumber}>{averageRating}</Text>
                {renderStars(parseFloat(averageRating), 20)}
                <Text style={styles.ratingBigCount}>
                  {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
                </Text>
              </View>
              <View style={styles.ratingBars}>
                {[5, 4, 3, 2, 1].map(star => {
                  const count = ratingDistribution[star - 1];
                  const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                  return (
                    <TouchableOpacity
                      key={star}
                      style={styles.ratingBarRow}
                      onPress={() => {
                        if (showAll) setRatingFilter(ratingFilter === star ? 0 : star);
                      }}
                      activeOpacity={showAll ? 0.6 : 1}
                    >
                      <Text style={[
                        styles.ratingBarLabel,
                        ratingFilter === star && showAll && { color: COLORS.primary, fontWeight: '700' },
                      ]}>{star}</Text>
                      <Ionicons name="star" size={12} color={COLORS.gold} />
                      <View style={styles.ratingBarTrack}>
                        <View style={[styles.ratingBarFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={styles.ratingBarCount}>{count}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Rating filter chips (when showing all) */}
          {showAll && reviews.length > 0 && (
            <View style={styles.filterChips}>
              <TouchableOpacity
                style={[styles.filterChip, ratingFilter === 0 && styles.filterChipActive]}
                onPress={() => setRatingFilter(0)}
              >
                <Text style={[styles.filterChipText, ratingFilter === 0 && styles.filterChipTextActive]}>
                  All ({reviews.length})
                </Text>
              </TouchableOpacity>
              {[5, 4, 3, 2, 1].map(star => {
                const count = ratingDistribution[star - 1];
                if (count === 0) return null;
                return (
                  <TouchableOpacity
                    key={star}
                    style={[styles.filterChip, ratingFilter === star && styles.filterChipActive]}
                    onPress={() => setRatingFilter(ratingFilter === star ? 0 : star)}
                  >
                    <Ionicons name="star" size={12} color={ratingFilter === star ? '#FFFFFF' : COLORS.gold} />
                    <Text style={[styles.filterChipText, ratingFilter === star && styles.filterChipTextActive]}>
                      {star} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Write/Edit Review Form */}
          {showReviewForm && (
            <View style={styles.reviewForm}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>
                  {editingReview ? 'Edit Your Review' : 'Write a Review'}
                </Text>
                {editingReview && (
                  <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelBtn}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.starSelector}>
                {[1, 2, 3, 4, 5].map(star => (
                  <TouchableOpacity key={star} onPress={() => setReviewRating(star)}>
                    <Ionicons
                      name={star <= reviewRating ? 'star' : 'star-outline'}
                      size={32}
                      color={COLORS.gold}
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
              <View style={styles.formFooter}>
                <Text style={styles.charCount}>{reviewText.length}/500</Text>
                <TouchableOpacity
                  style={[styles.submitBtn, isSubmitting && styles.disabledBtn]}
                  onPress={handleSubmitReview}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={COLORS.buttonText} size="small" />
                  ) : (
                    <>
                      <Ionicons name={editingReview ? 'save' : 'send'} size={16} color={COLORS.buttonText} />
                      <Text style={styles.submitBtnText}>{editingReview ? 'Update' : 'Submit'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Reviews List */}
          {displayedReviews.length > 0 ? (
            <View style={styles.reviewsList}>
              {displayedReviews.map((item, index) => {
                const canEdit = isOwnReview(item);

                return (
                  <View
                    key={item._id || index}
                    style={[styles.reviewCard, canEdit && styles.reviewCardOwn]}
                  >
                    <View style={styles.reviewCardHeader}>
                      <View style={styles.reviewUserInfo}>
                        {item.user_profile_image ? (
                          <Image source={{ uri: item.user_profile_image }} style={styles.reviewAvatar} />
                        ) : (
                          <View style={styles.reviewAvatarFallback}>
                            <Text style={styles.reviewAvatarText}>
                              {item.user_name?.charAt(0).toUpperCase() || 'U'}
                            </Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={styles.authorRow}>
                            <Text style={styles.reviewAuthor}>{item.user_name}</Text>
                            {canEdit && (
                              <View style={styles.youBadge}>
                                <Text style={styles.youBadgeText}>You</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.reviewDate}>
                            {new Date(item.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                            {item.updated_at && item.updated_at !== item.created_at && ' (edited)'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.reviewRatingBadge}>
                        <Ionicons name="star" size={13} color={COLORS.gold} />
                        <Text style={styles.reviewRatingText}>{item.rating}</Text>
                      </View>
                    </View>

                    {/* Stars row */}
                    <View style={{ marginBottom: 8 }}>
                      {renderStars(item.rating, 14)}
                    </View>

                    <Text style={styles.reviewComment}>{item.comment || item.content}</Text>

                    <View style={styles.reviewCardFooter}>
                      {item.is_verified_purchase && (
                        <View style={styles.verifiedBadge}>
                          <Ionicons name="checkmark-circle" size={13} color={COLORS.success} />
                          <Text style={styles.verifiedText}>Verified Purchase</Text>
                        </View>
                      )}

                      {canEdit && (
                        <View style={styles.reviewActions}>
                          {canEdit && editingReview?._id !== item._id && (
                            <TouchableOpacity
                              style={styles.actionBtn}
                              onPress={() => handleEditReview(item)}
                            >
                              <Ionicons name="pencil" size={15} color={COLORS.info} />
                              <Text style={[styles.actionText, { color: COLORS.info }]}>Edit</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyTitle}>No Reviews Yet</Text>
              <Text style={styles.emptySubtext}>
                Be the first to share your experience with this product!
              </Text>
            </View>
          )}

          {/* Show more / Show less at bottom */}
          {filteredReviews.length > PREVIEW_COUNT && (
            <TouchableOpacity style={styles.showMoreBtn} onPress={onToggleShowAll}>
              <Text style={styles.showMoreText}>
                {showAll ? 'Show Less Reviews' : `View All ${filteredReviews.length} Reviews`}
              </Text>
              <Ionicons
                name={showAll ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.primary}
              />
            </TouchableOpacity>
          )}
        </>
      )}

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
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    marginBottom: 8,
  },

  // Header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  toggleText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Loading
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  loadingBoxText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // Rating Summary Card
  ratingSummaryCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    gap: 20,
  },
  ratingBig: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  ratingBigNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  ratingBigCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  ratingBars: {
    flex: 1,
    gap: 6,
  },
  ratingBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingBarLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    width: 14,
    textAlign: 'center',
  },
  ratingBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 4,
  },
  ratingBarCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    width: 24,
    textAlign: 'right',
  },

  // Filter Chips
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  filterChipTextActive: {
    color: COLORS.surface,
  },

  // Review Form
  reviewForm: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  starSelector: {
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
  formFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  charCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  submitBtnText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  disabledBtn: {
    opacity: 0.6,
  },

  // Reviews List
  reviewsList: {
    gap: 12,
  },
  reviewCard: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 14,
    padding: 16,
  },
  reviewCardOwn: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  reviewUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  reviewAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: COLORS.divider,
    overflow: 'hidden',
  },
  reviewAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewAvatarText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.textOnPrimary,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reviewAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  youBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  youBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  reviewDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  reviewRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  reviewRatingText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  reviewComment: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 10,
  },
  reviewCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '500',
  },
  reviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginLeft: 'auto',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptySubtext: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // Show more
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 12,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    gap: 6,
  },
  showMoreText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
