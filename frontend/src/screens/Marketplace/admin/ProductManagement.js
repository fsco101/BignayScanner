// Product Management Screen (Admin)
// Create, Update, Delete products functionality

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ProductService from '../../../services/ProductService';
import SweetAlert, { useSweetAlert } from '../../../components/SweetAlert';
import { rules, validateField } from '../../../utils/validation';
import { formatPhilippineDateTime } from '../../../utils/dateTime';
import { useThemeColors } from '../../../context/ThemeContext';


const CATEGORIES = [
  'Fresh Bignay',
  'Dried Bignay',
  'Bignay Wine',
  'Bignay Juice',
  'Bignay Jam',
  'Bignay Vinegar',
  'Bignay Seedlings',
  'Other',
];

const DELETE_REASONS = [
  'Prohibited or illegal item',
  'Counterfeit / fake product',
  'Duplicate listing',
  'Misleading or false description',
  'Inappropriate or offensive content',
  'Expired or unsafe product',
  'Price manipulation / gouging',
  'Violates marketplace guidelines',
  'Other (specify reason)',
];

export default function ProductManagement({ 
  visible, 
  onClose, 
  products: externalProducts, 
  onProductsRefresh,
  isAdmin = false 
}) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { alertConfig, showSuccess, showError, showWarning, showDelete, hideAlert } = useSweetAlert();
  
  // Products state - fetch internally for admin
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Product form state
  const [editingProduct, setEditingProduct] = useState(null);
  const [showProductFormModal, setShowProductFormModal] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    cost_price: '',
    stock: '',
    category: CATEGORIES[0],
    sold_by: 'piece',
    images: [], // Support multiple images
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isPickingImages, setIsPickingImages] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [formTouched, setFormTouched] = useState({});

  const productFormRules = {
    name: [rules.required('Product name')],
    price: [rules.required('Price'), rules.decimal('Price'), rules.min(0.01, 'Price')],
    stock: [rules.required('Stock'), rules.numeric('Stock'), rules.min(0, 'Stock')],
  };

  const touchField = (field) => {
    setFormTouched((prev) => ({ ...prev, [field]: true }));
    const value = productForm[field];
    if (productFormRules[field]) {
      const error = validateField(value, productFormRules[field]);
      setFormErrors((prev) => ({ ...prev, [field]: error }));
    }
  };

  const handleFieldChange = (field, value) => {
    setProductForm((prev) => ({ ...prev, [field]: value }));
    if (formTouched[field] && productFormRules[field]) {
      const error = validateField(value, productFormRules[field]);
      setFormErrors((prev) => ({ ...prev, [field]: error }));
    }
  };

  const validateProductForm = () => {
    const newErrors = {};
    const allTouched = {};
    Object.keys(productFormRules).forEach((field) => {
      allTouched[field] = true;
      const error = validateField(productForm[field], productFormRules[field]);
      if (error) newErrors[field] = error;
    });
    setFormErrors(newErrors);
    setFormTouched(allTouched);
    return Object.keys(newErrors).length === 0;
  };

  // Product Details Modal state
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductDetailsModal, setShowProductDetailsModal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [selectedDeleteReason, setSelectedDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Search/Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sellerSearch, setSellerSearch] = useState('');

  // Fetch all products for admin when modal becomes visible
  const fetchProducts = useCallback(async (showLoadingIndicator = true) => {
    if (showLoadingIndicator) {
      setIsLoading(true);
    }
    try {
      // Use admin endpoint to get ALL products (including inactive)
      const result = await ProductService.getAdminProducts({ limit: 1000 });
      if (result.ok) {
        setProducts(result.products || []);
      } else {
        // Fallback to regular products endpoint if admin endpoint fails
        const fallbackResult = await ProductService.getProducts({ limit: 1000 });
        if (fallbackResult.ok) {
          setProducts(fallbackResult.products || []);
        } else {
          showError(result.error || 'Failed to load products');
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      showError('An error occurred while loading products');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setHasFetched(true);
    }
  }, [showError]);

  // Load products when modal becomes visible - only fetch once per open
  useEffect(() => {
    if (visible && !hasFetched) {
      // If external products are provided, use them; otherwise fetch
      if (externalProducts && externalProducts.length > 0) {
        setProducts(externalProducts);
        setHasFetched(true);
      } else {
        fetchProducts();
      }
    }
    // Reset hasFetched when modal closes
    if (!visible) {
      setHasFetched(false);
    }
  }, [visible]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchProducts(false);
    if (onProductsRefresh) {
      onProductsRefresh();
    }
  }, [fetchProducts, onProductsRefresh]);

  // Reset product form
  const resetProductForm = () => {
    setProductForm({
      name: '',
      description: '',
      price: '',
      cost_price: '',
      stock: '',
      category: CATEGORIES[0],
      sold_by: 'piece',
      images: [],
    });
    setEditingProduct(null);
    setFormErrors({});
    setFormTouched({});
  };

  // Open form to create new product
  const handleAddProduct = () => {
    resetProductForm();
    setShowProductFormModal(true);
  };

  // Open form to edit existing product
  const handleEditProduct = (product) => {
    setEditingProduct(product);
    
    // Handle both single image (legacy) and multiple images
    let existingImages = [];
    if (product.images && Array.isArray(product.images)) {
      existingImages = product.images;
    } else if (product.image) {
      existingImages = [product.image];
    }

    setProductForm({
      name: product.name || '',
      description: product.description || '',
      price: product.price?.toString() || '',
      cost_price: product.cost_price?.toString() || '',
      stock: product.stock?.toString() || '',
      category: product.category || CATEGORIES[0],
      sold_by: product.sold_by || 'piece',
      images: existingImages,
    });
    setShowProductFormModal(true);
  };

  // Convert blob URL or file to base64 (for web compatibility)
  const convertToBase64 = async (uri) => {
    // If already a data URI, return as-is
    if (uri.startsWith('data:')) {
      console.log('[ProductManagement] Image already in data URL format');
      return uri;
    }
    
    // For web, convert blob URL to base64
    if (Platform.OS === 'web') {
      try {
        console.log('[ProductManagement] Converting blob URL to base64...');
        const response = await fetch(uri);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            console.log('[ProductManagement] Base64 conversion successful, length:', reader.result?.length);
            resolve(reader.result);
          };
          reader.onerror = (err) => {
            console.error('[ProductManagement] FileReader error:', err);
            reject(err);
          };
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.error('[ProductManagement] Error converting to base64:', error);
        // Return null instead of the original URI since backend can't process blob URLs
        return null;
      }
    }
    
    // For native platforms, return the URI (should have base64 from ImagePicker)
    console.log('[ProductManagement] Non-web platform, returning URI:', uri?.substring(0, 50));
    return uri;
  };

  // Pick product images (multiple)
  const pickProductImages = async () => {
    try {
      // Skip permission check on web
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showWarning('Permission to access media library is required');
          return;
        }
      }

      setIsPickingImages(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true, // Enable multiple selection
        selectionLimit: 5, // Max 5 images
        quality: 0.8,
        base64: Platform.OS !== 'web', // base64 not reliable on web
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImages = [];
        console.log(`[ProductManagement] Processing ${result.assets.length} selected images`);

        for (const selectedAsset of result.assets) {
          try {
            let imageData;
            
            console.log('[ProductManagement] Asset info:', {
              hasBase64: !!selectedAsset.base64,
              uri: selectedAsset.uri?.substring(0, 50),
              mimeType: selectedAsset.mimeType,
            });
            
            // Use base64 from ImagePicker if available (native platforms)
            if (selectedAsset.base64) {
              // Determine MIME type from asset or file extension
              let mimeType = selectedAsset.mimeType || 'image/jpeg';
              if (!mimeType.startsWith('image/')) {
                const fileExtension = selectedAsset.uri?.split('.').pop()?.toLowerCase() || 'jpg';
                if (fileExtension === 'png') {
                  mimeType = 'image/png';
                } else if (fileExtension === 'gif') {
                  mimeType = 'image/gif';
                } else if (fileExtension === 'webp') {
                  mimeType = 'image/webp';
                } else {
                  mimeType = 'image/jpeg';
                }
              }
              imageData = `data:${mimeType};base64,${selectedAsset.base64}`;
              console.log(`[ProductManagement] Created data URL with ${mimeType}, length: ${imageData.length}`);
            } else {
              // Convert URI to base64 (needed for web and when base64 not available)
              console.log('[ProductManagement] No base64 in asset, converting from URI...');
              imageData = await convertToBase64(selectedAsset.uri);
            }
            
            if (imageData && imageData.startsWith('data:')) {
              newImages.push(imageData);
              console.log('[ProductManagement] Added image to list, total:', newImages.length);
            } else {
              console.warn('[ProductManagement] Invalid image data, skipping');
            }
          } catch (readError) {
            console.error('[ProductManagement] Error processing image:', readError);
          }
        }

        if (newImages.length > 0) {
          // Combine with existing images, limit to 5 total
          setProductForm((prev) => {
            const combinedImages = [...prev.images, ...newImages].slice(0, 5);
            return {
              ...prev,
              images: combinedImages,
            };
          });
          showSuccess(`${newImages.length} image(s) added successfully`);
        }
      }
    } catch (error) {
      console.error('Error picking images:', error);
      showError('Failed to select images');
    } finally {
      setIsPickingImages(false);
    }
  };

  // Remove image from list
  const removeImage = (index) => {
    setProductForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  // Save product (create or update)
  const handleSaveProduct = async () => {
    const { name, description, price, cost_price, stock, category, sold_by, images } = productForm;

    // Validation
    if (!validateProductForm()) return;
    if (!category) {
      showWarning('Please select a category');
      return;
    }

    setIsSaving(true);
    try {
      const productData = {
        name: name.trim(),
        description: description.trim(),
        price: parseFloat(price),
        cost_price: cost_price ? parseFloat(cost_price) : 0,
        stock: parseInt(stock),
        category: category,
        sold_by: sold_by || 'piece',
        unit: sold_by === 'kg' ? 'per kg' : 'per piece',
        // Send first image as 'image' for backward compatibility
        // and all images as 'images' array
        ...(images.length > 0 && { 
          image: images[0], 
          images: images 
        }),
      };

      let result;
      if (editingProduct) {
        result = await ProductService.updateProduct(editingProduct._id, productData);
      } else {
        result = await ProductService.createProduct(productData);
      }

      if (result.ok) {
        showSuccess(editingProduct ? 'Product updated successfully!' : 'Product created successfully!');
        setShowProductFormModal(false);
        resetProductForm();
        // Refresh the products list
        fetchProducts(false);
        if (onProductsRefresh) {
          onProductsRefresh();
        }
      } else {
        showError(result.error || 'Failed to save product');
      }
    } catch (error) {
      console.error('Error saving product:', error);
      showError('An error occurred while saving the product');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete product — open modal with reason input
  const handleDeleteProduct = (product) => {
    setDeletingProduct(product);
    setDeleteReason('');
    setSelectedDeleteReason('');
    setShowDeleteModal(true);
  };

  // Confirm delete product (with reason, from delete modal)
  const confirmDeleteProduct = async () => {
    if (!deletingProduct) return;
    // Compose final reason: preset + optional custom text
    const finalReason = selectedDeleteReason === 'Other (specify reason)'
      ? (deleteReason.trim() || 'Other')
      : selectedDeleteReason
        ? (deleteReason.trim() ? `${selectedDeleteReason} — ${deleteReason.trim()}` : selectedDeleteReason)
        : deleteReason.trim();
    if (!finalReason) {
      showWarning('Please select or enter a reason for deletion.');
      return;
    }
    setIsDeleting(true);
    try {
      const result = await ProductService.deleteProduct(deletingProduct._id, finalReason);
      if (result.ok) {
        showSuccess('Product deleted successfully');
        setShowDeleteModal(false);
        setDeletingProduct(null);
        setDeleteReason('');
        setSelectedDeleteReason('');
        fetchProducts(false);
        if (onProductsRefresh) {
          onProductsRefresh();
        }
      } else {
        showError(result.error || 'Failed to delete product');
      }
    } catch (error) {
      showError('An error occurred while deleting the product');
    } finally {
      setIsDeleting(false);
    }
  };

  // Restore product (admin)
  const handleRestoreProduct = async (product) => {
    try {
      const result = await ProductService.restoreProduct(product._id);
      if (result.ok) {
        showSuccess('Product restored successfully');
        // Refresh the products list
        fetchProducts(false);
        if (onProductsRefresh) {
          onProductsRefresh();
        }
      } else {
        showError(result.error || 'Failed to restore product');
      }
    } catch (error) {
      showError('An error occurred while restoring the product');
    }
  };

  // Filter products
  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    const matchesSeller = !sellerSearch.trim() || 
      (product.seller_name?.toLowerCase().includes(sellerSearch.toLowerCase()) ||
       product.seller_email?.toLowerCase().includes(sellerSearch.toLowerCase()));
    return matchesSearch && matchesCategory && matchesSeller;
  });

  // Open product details modal
  const handleViewProductDetails = (product) => {
    setSelectedProduct(product);
    setSelectedImageIndex(0);
    setShowProductDetailsModal(true);
  };

  // Render product card
  const renderProductCard = ({ item }) => {
    // Get display image (first from images array or legacy image field)
    const displayImage = (item.images && item.images.length > 0) ? item.images[0] : item.image;
    const imageCount = (item.images && item.images.length > 0) ? item.images.length : (item.image ? 1 : 0);

    return (
      <TouchableOpacity 
        style={styles.productCard} 
        onPress={() => handleViewProductDetails(item)}
        activeOpacity={0.7}
      >
        <View style={styles.productImageContainer}>
          {displayImage ? (
            <>
              <Image source={{ uri: displayImage }} style={styles.productImage} />
              {imageCount > 1 && (
                <View style={styles.imageCountBadge}>
                  <Text style={styles.imageCountText}>{imageCount}</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.productImagePlaceholder}>
              <Ionicons name="leaf" size={32} color={COLORS.primaryLight} />
            </View>
          )}
          {item.is_active === false && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          )}
        </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.productCategory}>{item.category}</Text>
        
        {/* Seller/Owner Info */}
        <View style={styles.sellerInfoRow}>
          {item.seller_profile_image ? (
            <Image
              source={{ uri: item.seller_profile_image }}
              style={styles.sellerAvatar}
            />
          ) : (
            <Ionicons name="person-circle-outline" size={18} color={COLORS.textSecondary} />
          )}
          <Text style={styles.sellerText} numberOfLines={1}>
            {item.seller_name || 'Admin'}
          </Text>
        </View>
        
        <View style={styles.productMeta}>
          <Text style={styles.productPrice}>₱{item.price?.toFixed(2)}</Text>
          <Text style={styles.productStock}>Stock: {item.stock}</Text>
        </View>
      </View>
      <View style={styles.productActions}>
        {item.is_active === false ? (
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={(e) => {
              e.stopPropagation();
              handleRestoreProduct(item);
            }}
          >
            <Ionicons name="refresh" size={18} color={COLORS.success} />
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.editButton}
              onPress={(e) => {
                e.stopPropagation();
                handleEditProduct(item);
              }}
            >
              <Ionicons name="pencil" size={18} color={COLORS.info} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteProduct(item);
              }}
            >
              <Ionicons name="trash" size={18} color={COLORS.danger} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </TouchableOpacity>
    );
  };

  // Render product details modal
  const renderProductDetailsModal = () => {
    if (!selectedProduct) return null;

    const productImages = (selectedProduct.images && selectedProduct.images.length > 0) 
      ? selectedProduct.images 
      : (selectedProduct.image ? [selectedProduct.image] : []);

    return (
      <Modal
        visible={showProductDetailsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProductDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.productDetailsModalContent}>
            {/* Header */}
            <View style={styles.productDetailsHeader}>
              <Text style={styles.productDetailsTitle}>Product Details</Text>
              <TouchableOpacity onPress={() => setShowProductDetailsModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.productDetailsBody} showsVerticalScrollIndicator={false}>
              {/* Product Images */}
              {productImages.length > 0 ? (
                <View style={styles.detailsImageSection}>
                  <Image
                    source={{ uri: productImages[selectedImageIndex] }}
                    style={styles.detailsMainImage}
                    resizeMode="contain"
                  />
                  {productImages.length > 1 && (
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false}
                      style={styles.detailsImageThumbnails}
                      contentContainerStyle={styles.detailsImageThumbnailsContent}
                    >
                      {productImages.map((img, index) => (
                        <TouchableOpacity
                          key={index}
                          onPress={() => setSelectedImageIndex(index)}
                          style={[
                            styles.detailsThumbnail,
                            selectedImageIndex === index && styles.detailsThumbnailActive
                          ]}
                        >
                          <Image source={{ uri: img }} style={styles.detailsThumbnailImage} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              ) : (
                <View style={styles.detailsImagePlaceholder}>
                  <Ionicons name="leaf" size={64} color={COLORS.primaryLight} />
                  <Text style={styles.noImageText}>No images available</Text>
                </View>
              )}

              {/* Product Info */}
              <View style={styles.detailsInfoSection}>
                <View style={styles.detailsNameRow}>
                  <Text style={styles.detailsProductName}>{selectedProduct.name}</Text>
                  <View style={styles.detailsCategoryBadge}>
                    <Text style={styles.detailsCategoryText}>{selectedProduct.category}</Text>
                  </View>
                </View>

                <Text style={styles.detailsPrice}>₱{selectedProduct.price?.toFixed(2)}</Text>
                
                <View style={styles.detailsStockRow}>
                  <Ionicons name="cube-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={styles.detailsStockText}>
                    {selectedProduct.stock} items in stock
                  </Text>
                </View>

                {selectedProduct.description ? (
                  <View style={styles.detailsDescriptionSection}>
                    <Text style={styles.detailsSectionLabel}>Description</Text>
                    <Text style={styles.detailsDescription}>{selectedProduct.description}</Text>
                  </View>
                ) : null}
              </View>

              {/* Seller Info Section */}
              <View style={styles.detailsSellerSection}>
                <Text style={styles.detailsSectionLabel}>Seller Information</Text>
                <View style={styles.sellerCard}>
                  <View style={styles.sellerAvatarContainer}>
                    {selectedProduct.seller_profile_image ? (
                      <Image 
                        source={{ uri: selectedProduct.seller_profile_image }} 
                        style={styles.sellerAvatar}
                      />
                    ) : (
                      <View style={styles.sellerAvatarPlaceholder}>
                        <Ionicons name="person" size={28} color={COLORS.primary} />
                      </View>
                    )}
                  </View>
                  <View style={styles.sellerDetails}>
                    <Text style={styles.sellerName}>
                      {selectedProduct.seller_name || 'Admin'}
                    </Text>
                    {selectedProduct.seller_email && (
                      <View style={styles.sellerContactRow}>
                        <Ionicons name="mail-outline" size={14} color={COLORS.textSecondary} />
                        <Text style={styles.sellerContactText}>{selectedProduct.seller_email}</Text>
                      </View>
                    )}
                    {selectedProduct.seller_id && (
                      <View style={styles.sellerContactRow}>
                        <Ionicons name="finger-print-outline" size={14} color={COLORS.textSecondary} />
                        <Text style={styles.sellerContactText} numberOfLines={1}>
                          ID: {selectedProduct.seller_id}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {/* Date Info */}
              <View style={styles.detailsDateSection}>
                {selectedProduct.created_at && (
                  <View style={styles.dateRow}>
                    <Ionicons name="calendar-outline" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.dateText}>
                      Created: {formatPhilippineDateTime(selectedProduct.created_at)} PHT
                    </Text>
                  </View>
                )}
                {selectedProduct.updated_at && (
                  <View style={styles.dateRow}>
                    <Ionicons name="time-outline" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.dateText}>
                      Updated: {formatPhilippineDateTime(selectedProduct.updated_at)} PHT
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.productDetailsFooter}>
              {selectedProduct.is_active === false ? (
                <TouchableOpacity
                  style={styles.detailsRestoreButton}
                  onPress={() => {
                    setShowProductDetailsModal(false);
                    handleRestoreProduct(selectedProduct);
                  }}
                >
                  <Ionicons name="refresh" size={20} color={COLORS.success} />
                  <Text style={styles.detailsRestoreButtonText}>Restore Product</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.detailsEditButton}
                    onPress={() => {
                      setShowProductDetailsModal(false);
                      handleEditProduct(selectedProduct);
                    }}
                  >
                    <Ionicons name="pencil" size={20} color={COLORS.info} />
                    <Text style={styles.detailsEditButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.detailsDeleteButton}
                    onPress={() => {
                      setShowProductDetailsModal(false);
                      handleDeleteProduct(selectedProduct);
                    }}
                  >
                    <Ionicons name="trash" size={20} color={COLORS.danger} />
                    <Text style={styles.detailsDeleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="arrow-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Product Management</Text>
            </View>
            <TouchableOpacity onPress={handleRefresh} style={styles.headerBtn}>
              <Ionicons name="refresh" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {/* Search & Filter */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={20} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search products..."
                placeholderTextColor={COLORS.textLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            
            {/* Seller Search */}
            <View style={[styles.searchInputWrapper, { marginTop: 10 }]}>
              <Ionicons name="person-outline" size={20} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by seller name or email..."
                placeholderTextColor={COLORS.textLight}
                value={sellerSearch}
                onChangeText={setSellerSearch}
              />
              {sellerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setSellerSearch('')}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Category Filter */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryFilter}
            contentContainerStyle={styles.categoryFilterContent}
          >
            <TouchableOpacity
              style={[
                styles.categoryChip,
                selectedCategory === 'all' && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory('all')}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === 'all' && styles.categoryChipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  selectedCategory === cat && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategory === cat && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Loading State */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading products...</Text>
            </View>
          ) : (
            /* Products List */
            <FlatList
              data={filteredProducts}
              keyExtractor={(item) => item._id}
              renderItem={renderProductCard}
              contentContainerStyle={styles.productsList}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  colors={[COLORS.primary]}
                  tintColor={COLORS.primary}
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyList}>
                  <Ionicons name="cube-outline" size={64} color={COLORS.textLight} />
                  <Text style={styles.emptyText}>No products found</Text>
                  <Text style={styles.emptySubtext}>
                    {searchQuery ? 'Try a different search term' : 'Add your first product'}
                  </Text>
                </View>
              }
              ListHeaderComponent={
                <Text style={styles.productCount}>
                  {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
                </Text>
              }
            />
          )}

          {/* Add Product FAB */}
          <TouchableOpacity style={styles.fab} onPress={handleAddProduct}>
            <Ionicons name="add" size={28} color={COLORS.textOnPrimary} />
          </TouchableOpacity>

        {/* Product Form Modal */}
        <Modal
          visible={showProductFormModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowProductFormModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.productFormModalContent}>
              <View style={styles.productFormHeader}>
                <Text style={styles.productFormTitle}>
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </Text>
                <TouchableOpacity onPress={() => setShowProductFormModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.productFormBody}>
                {/* Product Images */}
                <View style={styles.formSection}>
                  <View style={styles.formLabelRow}>
                    <Text style={styles.formLabel}>Product Images</Text>
                    <Text style={styles.formLabelHint}>{productForm.images.length}/5</Text>
                  </View>
                  
                  {/* Image Gallery */}
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.imageGallery}
                    contentContainerStyle={styles.imageGalleryContent}
                  >
                    {productForm.images.map((imageUri, index) => (
                      <View key={index} style={styles.imagePreviewContainer}>
                        <Image
                          source={{ uri: imageUri }}
                          style={styles.imagePreview}
                        />
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => removeImage(index)}
                        >
                          <Ionicons name="close-circle" size={24} color={COLORS.danger} />
                        </TouchableOpacity>
                        {index === 0 && (
                          <View style={styles.primaryImageBadge}>
                            <Text style={styles.primaryImageText}>Main</Text>
                          </View>
                        )}
                      </View>
                    ))}
                    
                    {/* Add Image Button */}
                    {productForm.images.length < 5 && (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={pickProductImages}
                        disabled={isPickingImages}
                      >
                        {isPickingImages ? (
                          <ActivityIndicator color={COLORS.primary} size="small" />
                        ) : (
                          <>
                            <Ionicons name="add-circle" size={40} color={COLORS.primary} />
                            <Text style={styles.addImageText}>Add Images</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                  
                  <Text style={styles.imageHelperText}>
                    First image will be used as the main product image
                  </Text>
                </View>

                {/* Product Name */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Product Name *</Text>
                  <TextInput
                    style={[styles.formInput, formTouched.name && formErrors.name && styles.formInputError]}
                    placeholder="Enter product name"
                    placeholderTextColor={COLORS.textLight}
                    value={productForm.name}
                    onChangeText={(text) => handleFieldChange('name', text)}
                    onBlur={() => touchField('name')}
                  />
                  {formTouched.name && formErrors.name && (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                      <Text style={styles.errorText}>{formErrors.name}</Text>
                    </View>
                  )}
                </View>

                {/* Description */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Description</Text>
                  <TextInput
                    style={[styles.formInput, styles.formTextArea]}
                    placeholder="Enter product description"
                    placeholderTextColor={COLORS.textLight}
                    value={productForm.description}
                    onChangeText={(text) => handleFieldChange('description', text)}
                    multiline
                    numberOfLines={4}
                  />
                </View>

                {/* Price & Stock Row */}
                <View style={styles.formRow}>
                  <View style={[styles.formSection, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.formLabel}>Price (₱) *</Text>
                    <TextInput
                      style={[styles.formInput, formTouched.price && formErrors.price && styles.formInputError]}
                      placeholder="0.00"
                      placeholderTextColor={COLORS.textLight}
                      value={productForm.price}
                      onChangeText={(text) => handleFieldChange('price', text)}
                      onBlur={() => touchField('price')}
                      keyboardType="decimal-pad"
                    />
                    {formTouched.price && formErrors.price && (
                      <View style={styles.errorRow}>
                        <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                        <Text style={styles.errorText}>{formErrors.price}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.formSection, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.formLabel}>Stock *</Text>
                    <TextInput
                      style={[styles.formInput, formTouched.stock && formErrors.stock && styles.formInputError]}
                      placeholder="0"
                      placeholderTextColor={COLORS.textLight}
                      value={productForm.stock}
                      onChangeText={(text) => handleFieldChange('stock', text)}
                      onBlur={() => touchField('stock')}
                      keyboardType="number-pad"
                    />
                    {formTouched.stock && formErrors.stock && (
                      <View style={styles.errorRow}>
                        <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                        <Text style={styles.errorText}>{formErrors.stock}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Cost Price & Sold By Row */}
                <View style={styles.formRow}>
                  <View style={[styles.formSection, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.formLabel}>Cost Price (₱)</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="0.00"
                      placeholderTextColor={COLORS.textLight}
                      value={productForm.cost_price}
                      onChangeText={(text) => handleFieldChange('cost_price', text)}
                      keyboardType="decimal-pad"
                    />
                    <Text style={{ fontSize: 11, color: COLORS.textLight, marginTop: 2 }}>
                      COGS per unit for profit tracking
                    </Text>
                  </View>
                  <View style={[styles.formSection, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.formLabel}>Sold By</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <TouchableOpacity
                        style={[
                          styles.categoryOption,
                          productForm.sold_by === 'piece' && styles.categoryOptionActive,
                          { flex: 1, alignItems: 'center' },
                        ]}
                        onPress={() => setProductForm((prev) => ({ ...prev, sold_by: 'piece' }))}
                      >
                        <Ionicons name="cube-outline" size={16} color={productForm.sold_by === 'piece' ? '#fff' : COLORS.text} />
                        <Text style={[styles.categoryOptionText, productForm.sold_by === 'piece' && styles.categoryOptionTextActive]}>
                          Per Piece
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.categoryOption,
                          productForm.sold_by === 'kg' && styles.categoryOptionActive,
                          { flex: 1, alignItems: 'center' },
                        ]}
                        onPress={() => setProductForm((prev) => ({ ...prev, sold_by: 'kg' }))}
                      >
                        <Ionicons name="scale-outline" size={16} color={productForm.sold_by === 'kg' ? '#fff' : COLORS.text} />
                        <Text style={[styles.categoryOptionText, productForm.sold_by === 'kg' && styles.categoryOptionTextActive]}>
                          Per Kilo
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Category */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Category *</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.categoryPicker}
                  >
                    {CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.categoryOption,
                          productForm.category === cat && styles.categoryOptionActive,
                        ]}
                        onPress={() =>
                          setProductForm((prev) => ({ ...prev, category: cat }))
                        }
                      >
                        <Text
                          style={[
                            styles.categoryOptionText,
                            productForm.category === cat &&
                              styles.categoryOptionTextActive,
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </ScrollView>

              {/* Form Footer */}
              <View style={styles.productFormFooter}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowProductFormModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, isSaving && styles.buttonDisabled]}
                  onPress={handleSaveProduct}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name={editingProduct ? 'save' : 'add-circle'}
                        size={20}
                        color={COLORS.textOnPrimary}
                      />
                      <Text style={styles.saveButtonText}>
                        {editingProduct ? 'Update' : 'Create'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Product Details Modal */}
        {renderProductDetailsModal()}

        {/* Delete Confirmation Modal with Reason */}
        <Modal
          visible={showDeleteModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => { setShowDeleteModal(false); setDeletingProduct(null); setSelectedDeleteReason(''); }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.productFormModalContent, { maxHeight: 580 }]}>
              <View style={styles.productFormHeader}>
                <Text style={styles.productFormTitle}>Delete Product</Text>
                <TouchableOpacity onPress={() => { setShowDeleteModal(false); setDeletingProduct(null); setSelectedDeleteReason(''); }}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ padding: 20 }}>
                <Text style={{ fontSize: 15, color: COLORS.text, marginBottom: 2 }}>
                  Are you sure you want to delete{' '}
                  <Text style={{ fontWeight: 'bold' }}>"{deletingProduct?.name}"</Text>?
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 14 }}>
                  The product owner will be notified with your reason.
                </Text>

                {/* Pre-defined reason chips */}
                <Text style={[styles.formLabel, { marginBottom: 10 }]}>Reason for Deletion *</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {DELETE_REASONS.map((reason) => (
                    <TouchableOpacity
                      key={reason}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 8,
                        borderWidth: 1.5,
                        borderColor: selectedDeleteReason === reason ? COLORS.danger : COLORS.border,
                        backgroundColor: selectedDeleteReason === reason ? COLORS.danger + '18' : COLORS.surfaceVariant,
                      }}
                      onPress={() => setSelectedDeleteReason(reason)}
                    >
                      <Text style={{
                        fontSize: 12,
                        fontWeight: selectedDeleteReason === reason ? '700' : '500',
                        color: selectedDeleteReason === reason ? COLORS.danger : COLORS.text,
                      }}>
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Custom text — required only when 'Other' selected, otherwise optional */}
                <Text style={[styles.formLabel, { marginBottom: 6 }]}>
                  {selectedDeleteReason === 'Other (specify reason)' ? 'Specify Reason *' : 'Additional Notes (optional)'}
                </Text>
                <TextInput
                  style={[styles.formInput, styles.formTextArea, { minHeight: 70 }]}
                  placeholder={
                    selectedDeleteReason === 'Other (specify reason)'
                      ? 'Describe the specific reason...'
                      : 'Add extra context (optional)...'
                  }
                  placeholderTextColor={COLORS.textLight}
                  value={deleteReason}
                  onChangeText={setDeleteReason}
                  multiline
                  textAlignVertical="top"
                />
              </ScrollView>
              <View style={styles.productFormFooter}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => { setShowDeleteModal(false); setDeletingProduct(null); setSelectedDeleteReason(''); }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: COLORS.danger }, isDeleting && styles.buttonDisabled]}
                  onPress={confirmDeleteProduct}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
                  ) : (
                    <>
                      <Ionicons name="trash" size={20} color={COLORS.textOnPrimary} />
                      <Text style={styles.saveButtonText}>Delete</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
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
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    marginLeft: 8,
  },
  categoryFilter: {
    minHeight: 44,
    maxHeight: 52,
  },
  categoryFilterContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceVariant,
    marginRight: 8,
    flexShrink: 0,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  categoryChipTextActive: {
    color: COLORS.textOnPrimary,
  },
  productsList: {
    padding: 16,
    paddingBottom: 80,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  productImageContainer: {
    width: 70,
    height: 70,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 12,
  },
  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageCountBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  imageCountText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  productImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  productCategory: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  sellerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  sellerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.surfaceVariant,
  },
  sellerText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    flex: 1,
  },
  productMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  productStock: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  productActions: {
    flexDirection: 'column',
    gap: 8,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.info,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  restoreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  inactiveBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: COLORS.danger,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  inactiveBadgeText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  productCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
    fontWeight: '500',
  },
  emptyList: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  // Product Form Modal styles
  productFormModalContent: {
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
  productFormBody: {
    padding: 20,
    maxHeight: 400,
  },
  formSection: {
    marginBottom: 20,
  },
  formRow: {
    flexDirection: 'row',
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  formLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  formLabelHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  imageGallery: {
    marginBottom: 8,
  },
  imageGalleryContent: {
    paddingRight: 8,
  },
  imagePreviewContainer: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginRight: 12,
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  },
  primaryImageBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  primaryImageText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.textOnPrimary,
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageText: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 4,
    fontWeight: '500',
  },
  imageHelperText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  formInput: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formInputError: {
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
  formTextArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceVariant,
    position: 'relative',
  },
  productFormImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryPicker: {
    flexDirection: 'row',
  },
  categoryOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceVariant,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryOptionActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  categoryOptionTextActive: {
    color: COLORS.textOnPrimary,
  },
  productFormFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Product Details Modal styles
  productDetailsModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    flex: 1,
  },
  productDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  productDetailsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  productDetailsBody: {
    flex: 1,
  },
  detailsImageSection: {
    backgroundColor: COLORS.surfaceVariant,
  },
  detailsMainImage: {
    width: '100%',
    height: 280,
    backgroundColor: COLORS.surfaceVariant,
  },
  detailsImageThumbnails: {
    paddingVertical: 12,
  },
  detailsImageThumbnailsContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  detailsThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    marginRight: 10,
  },
  detailsThumbnailActive: {
    borderColor: COLORS.primary,
  },
  detailsThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  detailsImagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noImageText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  detailsInfoSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  detailsNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  detailsProductName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
    marginRight: 12,
  },
  detailsCategoryBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  detailsCategoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  detailsPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 12,
  },
  detailsStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  detailsStockText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  detailsDescriptionSection: {
    marginTop: 8,
  },
  detailsSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  detailsDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  detailsSellerSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  sellerCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  sellerAvatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    marginRight: 16,
  },
  sellerAvatar: {
    width: '100%',
    height: '100%',
  },
  sellerAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerDetails: {
    flex: 1,
  },
  sellerName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  sellerContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  sellerContactText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  detailsDateSection: {
    padding: 20,
    gap: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  productDetailsFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    gap: 12,
  },
  detailsEditButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.info,
  },
  detailsEditButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.info,
  },
  detailsDeleteButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  detailsDeleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.danger,
  },
  detailsRestoreButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  detailsRestoreButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.success,
  },
});
