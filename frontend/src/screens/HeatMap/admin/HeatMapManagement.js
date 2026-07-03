/**
 * HeatMap Management Screen (Admin)
 * Admin panel for managing all harvest map pins.
 * Admins can view, search, filter, edit, and delete any pin.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../context/AuthContext';
import { useResponsive } from '../../../hooks/useResponsive';
import { HeatMapService } from '../../../services/HeatMapService';
import SweetAlert, { useSweetAlert } from '../../../components/SweetAlert';
import { rules, validateField } from '../../../utils/validation';
import { formatPhilippineDateTime } from '../../../utils/dateTime';
import { useThemeColors } from '../../../context/ThemeContext';


const PIN_TYPES = [
  { id: 'farm', name: 'Farm', icon: 'leaf', color: '#4CAF50' },
  { id: 'blooming_area', name: 'Blooming Area', icon: 'flower', color: '#E91E63' },
  { id: 'market', name: 'Market', icon: 'storefront', color: '#FF9800' },
  { id: 'other', name: 'Other', icon: 'location', color: '#2196F3' },
];

const PIN_TYPE_MAP = Object.fromEntries(PIN_TYPES.map((t) => [t.id, t]));

export default function HeatMapManagement({ visible, onClose }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { user } = useAuth();
  const { alertConfig, showSuccess, showError, showDelete, hideAlert } = useSweetAlert();

  // Responsive
  const { isDesktop, isTablet, isMobile } = useResponsive();
  const { width: screenWidth } = useWindowDimensions();

  // Grid columns based on screen width
  const numColumns = useMemo(() => {
    if (isDesktop) return 3;
    if (isTablet) return 2;
    return 1;
  }, [isDesktop, isTablet]);

  const cardGap = 12;
  const listPadding = isDesktop ? 24 : isTablet ? 18 : 14;
  const cardWidth = useMemo(() => {
    const totalGap = cardGap * (numColumns - 1) + listPadding * 2;
    return (screenWidth - totalGap) / numColumns;
  }, [numColumns, screenWidth, listPadding]);

  const modalResponsiveStyle = useMemo(() => ({
    overlay: isDesktop || isTablet
      ? { justifyContent: 'center', alignItems: 'center' }
      : { justifyContent: 'flex-end' },
    content: isDesktop
      ? { maxWidth: 800, width: '90%', borderRadius: 20, maxHeight: '90%' }
      : isTablet
        ? { maxWidth: 600, width: '85%', borderRadius: 20, maxHeight: '90%' }
        : {},
  }), [isDesktop, isTablet]);

  // State
  const [pins, setPins] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPin, setEditingPin] = useState(null);
  const [editForm, setEditForm] = useState({
    place_name: '',
    pin_type: 'farm',
    description: '',
    contact_person: '',
    contact_details: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  // Edit form validation
  const [editFormErrors, setEditFormErrors] = useState({});
  const [editFormTouched, setEditFormTouched] = useState({});

  const editFormRules = {
    place_name: [rules.required('Place name')],
  };

  const touchEditField = (field) => {
    setEditFormTouched(prev => ({ ...prev, [field]: true }));
    const fieldErrors = validateField(editForm[field], editFormRules[field] || []);
    setEditFormErrors(prev => ({ ...prev, [field]: fieldErrors }));
  };

  const handleEditFieldChange = (field, value) => {
    setEditForm(f => ({ ...f, [field]: value }));
    if (editFormTouched[field]) {
      const fieldErrors = validateField(value, editFormRules[field] || []);
      setEditFormErrors(prev => ({ ...prev, [field]: fieldErrors }));
    }
  };

  const validateEditForm = () => {
    const allErrors = {};
    let isValid = true;
    Object.keys(editFormRules).forEach(field => {
      const errs = validateField(editForm[field], editFormRules[field]);
      if (errs) { allErrors[field] = errs; isValid = false; }
    });
    setEditFormErrors(allErrors);
    setEditFormTouched(prev => {
      const t = { ...prev };
      Object.keys(editFormRules).forEach(f => t[f] = true);
      return t;
    });
    return isValid;
  };

  // Detail modal
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPin, setSelectedPin] = useState(null);

  // ==================== DATA ====================

  const fetchPins = useCallback(async () => {
    try {
      const params = {};
      if (filterType !== 'all') {
        params.pin_type = filterType;
      }
      params.limit = 500; // Admin sees more pins
      const result = await HeatMapService.getPins(params);
      if (result.ok) {
        setPins(result.pins || []);
      } else {
        console.warn('[HeatMapAdmin] Failed to load pins:', result.error);
      }
    } catch (error) {
      console.error('[HeatMapAdmin] Error loading pins:', error);
    }
  }, [filterType]);

  const fetchStats = useCallback(async () => {
    try {
      const result = await HeatMapService.getStats();
      if (result.ok) {
        setStats(result.stats);
      }
    } catch (error) {
      console.warn('[HeatMapAdmin] Error loading stats:', error);
    }
  }, []);

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    await Promise.all([fetchPins(), fetchStats()]);
    setIsLoading(false);
  }, [fetchPins, fetchStats]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  useEffect(() => {
    if (visible) fetchPins();
  }, [filterType]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData(false);
    setIsRefreshing(false);
  }, [loadData]);

  // ==================== FILTERING ====================

  const filteredPins = useMemo(() => {
    if (!searchQuery.trim()) return pins;
    const q = searchQuery.toLowerCase();
    return pins.filter(
      (pin) =>
        (pin.place_name || '').toLowerCase().includes(q) ||
        (pin.description || '').toLowerCase().includes(q) ||
        (pin.contact_person || '').toLowerCase().includes(q) ||
        (pin.created_by_name || '').toLowerCase().includes(q)
    );
  }, [pins, searchQuery]);

  // ==================== ACTIONS ====================

  const handleEditPress = (pin) => {
    setEditingPin(pin);
    setEditForm({
      place_name: pin.place_name || '',
      pin_type: pin.pin_type || 'farm',
      description: pin.description || '',
      contact_person: pin.contact_person || '',
      contact_details: pin.contact_details || '',
    });
    setEditFormErrors({});
    setEditFormTouched({});
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingPin?._id) return;
    if (!validateEditForm()) return;
    setIsSaving(true);
    try {
      const result = await HeatMapService.updatePin(editingPin._id, editForm);
      if (result.ok) {
        setShowEditModal(false);
        setEditingPin(null);
        showSuccess('Updated', 'Pin has been updated successfully.');
        await fetchPins();
      } else {
        showError('Error', result.error || 'Failed to update pin.');
      }
    } catch (error) {
      showError('Error', 'An unexpected error occurred.');
    }
    setIsSaving(false);
  };

  const handleDeletePress = (pin) => {
    showDelete(
      'Delete Pin',
      `Are you sure you want to delete "${pin.place_name || 'this pin'}"?\n\nCreated by: ${pin.created_by_name || 'Unknown'}`,
      async () => {
        try {
          const result = await HeatMapService.deletePin(pin._id);
          if (result.ok) {
            showSuccess('Deleted', 'Pin has been removed.');
            await Promise.all([fetchPins(), fetchStats()]);
          } else {
            showError('Error', result.error || 'Failed to delete pin.');
          }
        } catch (error) {
          showError('Error', 'An unexpected error occurred.');
        }
      }
    );
  };

  const handleViewDetail = (pin) => {
    setSelectedPin(pin);
    setShowDetailModal(true);
  };

  const formatDate = (dateStr) => {
    return formatPhilippineDateTime(dateStr);
  };

  // ==================== RENDER HELPERS ====================

  const renderStatsBar = () => (
    <View style={[styles.statsRow, { paddingHorizontal: listPadding }]}>
      <View style={[styles.statCard, { backgroundColor: COLORS.primary }]}>  
        <Text style={styles.statNumber}>{stats?.total_pins || pins.length}</Text>
        <Text style={styles.statLabel}>Total</Text>
      </View>
      {PIN_TYPES.map((type) => (
        <View key={type.id} style={[styles.statCard, { backgroundColor: type.color }]}>
          <Text style={styles.statNumber}>{stats?.by_type?.[type.id] || 0}</Text>
          <Text style={styles.statLabel}>{type.name}</Text>
        </View>
      ))}
    </View>
  );

  const renderAvatar = (uri, size = 28) => {
    if (uri) {
      return (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.border }}
        />
      );
    }
    return (
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: COLORS.textLight, alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name="person" size={size * 0.55} color={COLORS.buttonText} />
      </View>
    );
  };

  const renderPinCard = ({ item: pin, index }) => {
    const meta = PIN_TYPE_MAP[pin.pin_type] || PIN_TYPE_MAP.other;
    // Calculate margin for grid layout
    const isLastInRow = (index + 1) % numColumns === 0;
    const marginRight = numColumns > 1 && !isLastInRow ? cardGap : 0;

    return (
      <View style={[
        styles.pinCard,
        numColumns > 1 && { width: cardWidth, marginRight },
      ]}>
        <View style={styles.pinCardHeader}>
          <View style={[styles.pinTypeBadge, { backgroundColor: meta.color + '15' }]}>
            <Ionicons name={meta.icon} size={16} color={meta.color} />
            <Text style={[styles.pinTypeText, { color: meta.color }]}>{meta.name}</Text>
          </View>
          <View style={styles.pinCardActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleViewDetail(pin)}
            >
              <Ionicons name="eye-outline" size={18} color={COLORS.info} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleEditPress(pin)}
            >
              <Ionicons name="pencil-outline" size={18} color={COLORS.warning} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleDeletePress(pin)}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.pinName} numberOfLines={1}>
          {pin.place_name || 'Unnamed Location'}
        </Text>

        {pin.description ? (
          <Text style={styles.pinDesc} numberOfLines={2}>{pin.description}</Text>
        ) : null}

        {/* Uploader avatar + name */}
        <View style={styles.uploaderRow}>
          {renderAvatar(pin.created_by_avatar, 24)}
          <Text style={styles.uploaderName} numberOfLines={1}>
            {pin.created_by_name || 'Unknown'}
          </Text>
        </View>

        <View style={styles.pinMeta}>
          <View style={styles.pinMetaItem}>
            <Ionicons name="location-outline" size={13} color={COLORS.primary} />
            <Text style={[styles.pinMetaText, { color: COLORS.primary, fontWeight: '600' }]} numberOfLines={1}>
              {pin.place_name || 'Unnamed Location'}
            </Text>
          </View>
          <View style={styles.pinMetaItem}>
            <Ionicons name="navigate-outline" size={13} color={COLORS.textLight} />
            <Text style={styles.pinMetaText}>
              {pin.latitude?.toFixed(4)}, {pin.longitude?.toFixed(4)}
            </Text>
          </View>
          <View style={styles.pinMetaItem}>
            <Ionicons name="time-outline" size={13} color={COLORS.textLight} />
            <Text style={styles.pinMetaText}>{formatDate(pin.created_at)}</Text>
          </View>
        </View>

        {(pin.contact_person || pin.contact_details) && (
          <View style={styles.contactRow}>
            <Ionicons name="call-outline" size={13} color={COLORS.primary} />
            <Text style={styles.contactText} numberOfLines={1}>
              {[pin.contact_person, pin.contact_details].filter(Boolean).join(' \u2022 ')}
            </Text>
          </View>
        )}
      </View>
    );
  };

  // ==================== MAIN RENDER ====================

  if (!visible) return null;

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
            <Text style={styles.headerTitle}>Harvest Map Management</Text>
            <Text style={styles.headerSubtitle}>
              {filteredPins.length} pin{filteredPins.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={onRefresh} style={styles.headerBtn}>
            <Ionicons name="refresh" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Stats */}
        {stats && renderStatsBar()}

        {/* Search & Filter */}
        <View style={[styles.searchSection, { paddingHorizontal: listPadding }]}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={COLORS.textLight} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search pins by name, creator..."
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

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <TouchableOpacity
              style={[
                styles.filterChip,
                filterType === 'all' && styles.filterChipActive,
              ]}
              onPress={() => setFilterType('all')}
            >
              <Text style={[
                styles.filterChipText,
                filterType === 'all' && styles.filterChipTextActive,
              ]}>All</Text>
            </TouchableOpacity>
            {PIN_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.filterChip,
                  filterType === type.id && { backgroundColor: type.color + '20', borderColor: type.color },
                ]}
                onPress={() => setFilterType(type.id)}
              >
                <Ionicons
                  name={type.icon}
                  size={14}
                  color={filterType === type.id ? type.color : COLORS.textSecondary}
                />
                <Text style={[
                  styles.filterChipText,
                  filterType === type.id && { color: type.color },
                ]}>{type.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Pin List */}
        {isLoading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading pins...</Text>
          </View>
        ) : (
          <FlatList
            key={`grid-${numColumns}`}
            data={filteredPins}
            numColumns={numColumns}
            keyExtractor={(item) => item._id || String(Math.random())}
            renderItem={renderPinCard}
            contentContainerStyle={[styles.listContent, { paddingHorizontal: listPadding }]}
            columnWrapperStyle={numColumns > 1 ? { marginBottom: 0 } : undefined}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="map-outline" size={48} color={COLORS.textLight} />
                <Text style={styles.emptyTitle}>No pins found</Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery ? 'Try a different search term' : 'No harvest pins have been created yet'}
                </Text>
              </View>
            }
          />
        )}

        {/* ==================== EDIT MODAL ==================== */}
        <Modal
          visible={showEditModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowEditModal(false)}
        >
          <View style={[styles.modalOverlay, modalResponsiveStyle.overlay]}>
            <View style={[styles.modalContent, modalResponsiveStyle.content]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Pin</Text>
                  <TouchableOpacity onPress={() => setShowEditModal(false)}>
                    <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                {editingPin && (
                  <View style={styles.coordBanner}>
                    <Ionicons name="location" size={16} color={COLORS.primary} />
                    <Text style={styles.coordText}>
                      {editingPin.latitude?.toFixed(5)}, {editingPin.longitude?.toFixed(5)}
                    </Text>
                  </View>
                )}

                {/* Pin Type */}
                <Text style={styles.formLabel}>Pin Type</Text>
                <View style={styles.typeRow}>
                  {PIN_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.id}
                      style={[
                        styles.typeBtn,
                        editForm.pin_type === type.id && { backgroundColor: type.color + '20', borderColor: type.color },
                      ]}
                      onPress={() => setEditForm((f) => ({ ...f, pin_type: type.id }))}
                    >
                      <Ionicons
                        name={type.icon}
                        size={18}
                        color={editForm.pin_type === type.id ? type.color : COLORS.textSecondary}
                      />
                      <Text style={[
                        styles.typeBtnText,
                        editForm.pin_type === type.id && { color: type.color, fontWeight: '600' },
                      ]}>{type.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Place Name */}
                <Text style={styles.formLabel}>Place Name <Text style={{ color: COLORS.danger }}>*</Text></Text>
                <TextInput
                  style={[styles.formInput, editFormTouched.place_name && editFormErrors.place_name && styles.formInputError]}
                  value={editForm.place_name}
                  onChangeText={(t) => handleEditFieldChange('place_name', t)}
                  onBlur={() => touchEditField('place_name')}
                  placeholder="Location name"
                  placeholderTextColor={COLORS.textLight}
                />
                {editFormTouched.place_name && editFormErrors.place_name ? (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                    <Text style={styles.errorText}>{editFormErrors.place_name}</Text>
                  </View>
                ) : null}

                {/* Description */}
                <Text style={styles.formLabel}>Description</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  value={editForm.description}
                  onChangeText={(t) => setEditForm((f) => ({ ...f, description: t }))}
                  placeholder="Description"
                  placeholderTextColor={COLORS.textLight}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                {/* Contact Person */}
                <Text style={styles.formLabel}>Contact Person</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.contact_person}
                  onChangeText={(t) => setEditForm((f) => ({ ...f, contact_person: t }))}
                  placeholder="Contact person name"
                  placeholderTextColor={COLORS.textLight}
                />

                {/* Contact Number */}
                <Text style={styles.formLabel}>Contact Number</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.contact_details}
                  onChangeText={(t) => setEditForm((f) => ({ ...f, contact_details: t.replace(/[^0-9+\-() ]/g, '') }))}
                  placeholder="e.g. 09171234567"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="phone-pad"
                  maxLength={20}
                />

                {/* Save */}
                <TouchableOpacity
                  style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
                  onPress={handleSaveEdit}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color={COLORS.buttonText} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.buttonText} />
                      <Text style={styles.saveBtnText}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ==================== DETAIL MODAL ==================== */}
        <Modal
          visible={showDetailModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowDetailModal(false)}
        >
          <View style={[styles.modalOverlay, modalResponsiveStyle.overlay]}>
            <View style={[styles.modalContent, modalResponsiveStyle.content]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Pin Details</Text>
                  <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                    <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                {selectedPin && (() => {
                  const meta = PIN_TYPE_MAP[selectedPin.pin_type] || PIN_TYPE_MAP.other;
                  return (
                    <>
                      <View style={[styles.detailTypeBadge, { backgroundColor: meta.color + '15' }]}>
                        <Ionicons name={meta.icon} size={20} color={meta.color} />
                        <Text style={[styles.detailTypeText, { color: meta.color }]}>{meta.name}</Text>
                      </View>

                      <Text style={styles.detailTitle}>
                        {selectedPin.place_name || 'Unnamed Location'}
                      </Text>

                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>Coordinates</Text>
                        <Text style={styles.detailValue}>
                          {selectedPin.latitude?.toFixed(6)}, {selectedPin.longitude?.toFixed(6)}
                        </Text>
                      </View>

                      {selectedPin.description ? (
                        <View style={styles.detailSection}>
                          <Text style={styles.detailSectionTitle}>Description</Text>
                          <Text style={styles.detailValue}>{selectedPin.description}</Text>
                        </View>
                      ) : null}

                      {selectedPin.contact_person ? (
                        <View style={styles.detailSection}>
                          <Text style={styles.detailSectionTitle}>Contact Person</Text>
                          <Text style={styles.detailValue}>{selectedPin.contact_person}</Text>
                        </View>
                      ) : null}

                      {selectedPin.contact_details ? (
                        <View style={styles.detailSection}>
                          <Text style={styles.detailSectionTitle}>Contact Details</Text>
                          <Text style={styles.detailValue}>{selectedPin.contact_details}</Text>
                        </View>
                      ) : null}

                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>Created By</Text>
                        <View style={styles.detailAuthorRow}>
                          {renderAvatar(selectedPin.created_by_avatar, 36)}
                          <Text style={styles.detailAuthorName}>
                            {selectedPin.created_by_name || 'Unknown'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>Created At</Text>
                        <Text style={styles.detailValue}>{formatDate(selectedPin.created_at)}</Text>
                      </View>

                      {selectedPin.updated_at && (
                        <View style={styles.detailSection}>
                          <Text style={styles.detailSectionTitle}>Last Updated</Text>
                          <Text style={styles.detailValue}>{formatDate(selectedPin.updated_at)}</Text>
                        </View>
                      )}

                      {/* Admin Actions */}
                      <View style={styles.detailActions}>
                        <TouchableOpacity
                          style={[styles.detailActionBtn, { backgroundColor: COLORS.warning }]}
                          onPress={() => {
                            setShowDetailModal(false);
                            setTimeout(() => handleEditPress(selectedPin), 300);
                          }}
                        >
                          <Ionicons name="pencil" size={18} color={COLORS.buttonText} />
                          <Text style={styles.detailActionText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.detailActionBtn, { backgroundColor: COLORS.danger }]}
                          onPress={() => {
                            setShowDetailModal(false);
                            setTimeout(() => handleDeletePress(selectedPin), 300);
                          }}
                        >
                          <Ionicons name="trash" size={18} color={COLORS.buttonText} />
                          <Text style={styles.detailActionText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  );
                })()}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* SweetAlert */}
        <SweetAlert
          visible={alertConfig.visible}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
          onConfirm={alertConfig.onConfirm || hideAlert}
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
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 10,
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
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 50,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },

  // Search & Filter
  searchSection: {
    paddingBottom: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: 5,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary + '15',
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Pin Cards
  listContent: {
    paddingTop: 4,
    paddingBottom: 14,
  },
  pinCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  pinCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pinTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  pinTypeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pinCardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  pinName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  pinDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  uploaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  uploaderName: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
    flex: 1,
  },
  pinMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 4,
  },
  pinMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pinMetaText: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  contactText: {
    fontSize: 12,
    color: COLORS.primary,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 4,
  },

  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },

  // Edit form
  coordBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 14,
    gap: 8,
  },
  coordText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
    marginTop: 10,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 5,
  },
  typeBtnText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  formInput: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 4,
  },
  formInputError: {
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    marginTop: 2,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
  },
  formTextArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
    gap: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.surface,
  },
  cancelBtn: {
    alignItems: 'center',
    padding: 12,
    marginTop: 4,
  },
  cancelBtnText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // Detail modal
  detailTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
    marginBottom: 10,
  },
  detailTypeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  detailSection: {
    marginBottom: 14,
  },
  detailSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  detailAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  detailAuthorName: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  detailActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    marginBottom: 10,
  },
  detailActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  detailActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.surface,
  },
});
