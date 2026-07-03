// User Management Screen (Admin)
// Manage users: view info, suspend, change role, activate/deactivate

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import UserService from '../../../services/UserService';
import SweetAlert, { useSweetAlert } from '../../../components/SweetAlert';
import { rules, validateField } from '../../../utils/validation';
import { useThemeColors } from '../../../context/ThemeContext';


const SUSPENSION_REASONS = [
  'Violation of community guidelines',
  'Inappropriate product listings',
  'Fraudulent activity',
  'Harassment of other users',
  'Spam or misleading content',
  'Selling prohibited items',
  'Multiple complaints received',
  'Other (specify reason)',
];

export default function UserManagement({ visible, onClose }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { alertConfig, showSuccess, showError, showWarning, showDelete, hideAlert } = useSweetAlert();

  // State
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  
  // Suspension types
  const [suspensionTypes, setSuspensionTypes] = useState([]);
  
  // Selected user for actions
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserDetailModal, setShowUserDetailModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  
  // Suspension form
  const [selectedSuspensionType, setSelectedSuspensionType] = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isSuspending, setIsSuspending] = useState(false);

  // Validation for custom reason
  const [customReasonError, setCustomReasonError] = useState(null);
  const [customReasonTouched, setCustomReasonTouched] = useState(false);
  const customReasonRules = [rules.required('Custom reason')];

  // Fetch users
  const fetchUsers = useCallback(async (page = 1, reset = false) => {
    if (isLoading && !reset) return;
    
    setIsLoading(true);
    try {
      const role = roleFilter !== 'all' ? roleFilter : null;
      const result = await UserService.getUsers(page, 20, role, searchQuery);
      
      if (result.ok) {
        if (reset || page === 1) {
          setUsers(result.users || []);
        } else {
          setUsers(prev => [...prev, ...(result.users || [])]);
        }
        setPagination(result.pagination || { page: 1, pages: 1, total: 0 });
      } else {
        showError(result.error || 'Failed to load users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      showError('Failed to load users');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, roleFilter, isLoading]);

  // Fetch suspension types
  const fetchSuspensionTypes = useCallback(async () => {
    try {
      const result = await UserService.getSuspensionTypes();
      if (result.ok) {
        setSuspensionTypes(result.suspension_types || []);
      }
    } catch (error) {
      console.error('Error fetching suspension types:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (visible) {
      fetchUsers(1, true);
      fetchSuspensionTypes();
    }
  }, [visible]);

  // Auto-refresh to pick up expired suspensions (every 60 seconds)
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      // Silently refresh to reflect any auto-lifted suspensions
      fetchUsers(1, true);
    }, 60000);
    return () => clearInterval(interval);
  }, [visible]);

  // Refresh on search/filter change
  useEffect(() => {
    if (visible) {
      const debounce = setTimeout(() => {
        fetchUsers(1, true);
      }, 500);
      return () => clearTimeout(debounce);
    }
  }, [searchQuery, roleFilter]);

  // Refresh handler
  const handleRefresh = () => {
    setRefreshing(true);
    fetchUsers(1, true);
  };

  // Load more
  const handleLoadMore = () => {
    if (!isLoading && pagination.page < pagination.pages) {
      fetchUsers(pagination.page + 1);
    }
  };

  // View user details
  const handleViewUser = (user) => {
    setSelectedUser(user);
    setShowUserDetailModal(true);
  };

  // Open suspend modal
  const handleOpenSuspendModal = (user) => {
    setSelectedUser(user);
    setSelectedSuspensionType('');
    setSelectedReason('');
    setCustomReason('');
    setShowSuspendModal(true);
  };

  // Suspend user
  const handleSuspendUser = async () => {
    if (!selectedSuspensionType) {
      showWarning('Please select a suspension duration');
      return;
    }
    if (!selectedReason) {
      showWarning('Please select a reason');
      return;
    }
    
    const reason = selectedReason === 'Other (specify reason)' 
      ? customReason.trim() 
      : selectedReason;
    
    if (selectedReason === 'Other (specify reason)') {
      const err = validateField(customReason, customReasonRules);
      setCustomReasonError(err);
      setCustomReasonTouched(true);
      if (err) return;
    }

    setIsSuspending(true);
    try {
      const result = await UserService.suspendUser(
        selectedUser._id,
        selectedSuspensionType,
        reason
      );
      
      if (result.ok) {
        showSuccess(result.message || 'User suspended successfully');
        setShowSuspendModal(false);
        setShowUserDetailModal(false);
        fetchUsers(1, true);
      } else {
        showError(result.error || 'Failed to suspend user');
      }
    } catch (error) {
      showError('Failed to suspend user');
    } finally {
      setIsSuspending(false);
    }
  };

  // Unsuspend user
  const handleUnsuspendUser = (user) => {
    showDelete(
      'Lift Suspension',
      `Are you sure you want to lift the suspension for "${user.full_name}"? They will be able to log in again.`,
      async () => {
        try {
          const result = await UserService.unsuspendUser(user._id);
          if (result.ok) {
            showSuccess('Suspension lifted successfully');
            setShowUserDetailModal(false);
            fetchUsers(1, true);
          } else {
            showError(result.error || 'Failed to lift suspension');
          }
        } catch (error) {
          showError('Failed to lift suspension');
        }
      }
    );
  };

  // Change user role
  const handleChangeRole = (user, newRole) => {
    const action = newRole === 'admin' ? 'promote to Admin' : 'demote to User';
    showDelete(
      'Change Role',
      `Are you sure you want to ${action} "${user.full_name}"?`,
      async () => {
        try {
          const result = await UserService.updateUserRole(user._id, newRole);
          if (result.ok) {
            showSuccess(result.message || 'Role updated successfully');
            setShowUserDetailModal(false);
            fetchUsers(1, true);
          } else {
            showError(result.error || 'Failed to update role');
          }
        } catch (error) {
          showError('Failed to update role');
        }
      }
    );
  };

  // Toggle user status (active/inactive)
  const handleToggleStatus = (user) => {
    const action = user.is_active ? 'deactivate' : 'activate';
    showDelete(
      `${user.is_active ? 'Deactivate' : 'Activate'} User`,
      `Are you sure you want to ${action} "${user.full_name}"?`,
      async () => {
        try {
          const result = await UserService.updateUserStatus(user._id, !user.is_active);
          if (result.ok) {
            showSuccess(result.message || 'Status updated successfully');
            setShowUserDetailModal(false);
            fetchUsers(1, true);
          } else {
            showError(result.error || 'Failed to update status');
          }
        } catch (error) {
          showError('Failed to update status');
        }
      }
    );
  };

  // Format date with Philippine timezone
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila',
    });
  };

  // Get remaining suspension time
  const getSuspensionTimeRemaining = (endDateString) => {
    if (!endDateString) return 'Permanent';
    const now = new Date();
    const end = new Date(endDateString);
    const diff = end - now;
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  // Get status badge
  const getStatusBadge = (user) => {
    if (user.is_suspended) {
      return { label: 'Suspended', color: COLORS.suspended };
    }
    if (!user.is_active) {
      return { label: 'Inactive', color: COLORS.textLight };
    }
    return { label: 'Active', color: COLORS.success };
  };

  // Render user card
  const renderUserCard = ({ item }) => {
    const status = getStatusBadge(item);
    
    return (
      <TouchableOpacity 
        style={styles.userCard}
        onPress={() => handleViewUser(item)}
        activeOpacity={0.7}
      >
        <View style={styles.userAvatarContainer}>
          {item.profile_image ? (
            <Image source={{ uri: item.profile_image }} style={styles.userAvatar} />
          ) : (
            <View style={styles.userAvatarPlaceholder}>
              <Text style={styles.userAvatarText}>
                {item.first_name?.charAt(0) || 'U'}
              </Text>
            </View>
          )}
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
        </View>
        
        <View style={styles.userInfo}>
          <View style={styles.userNameRow}>
            <Text style={styles.userName} numberOfLines={1}>
              {item.full_name || `${item.first_name} ${item.last_name}`}
            </Text>
            {item.role === 'admin' && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            )}
          </View>
          <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>
          <View style={styles.userMeta}>
            <View style={[styles.statusBadge, { backgroundColor: status.color + '20' }]}>
              <Text style={[styles.statusText, { color: status.color }]}>
                {status.label}
              </Text>
            </View>
            <Text style={styles.joinDate}>
              Joined {formatDate(item.created_at)}
            </Text>
          </View>
        </View>
        
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>User Management</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={20} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name or email..."
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
          </View>

          {/* Role Filter */}
          <View style={styles.filterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[
                { value: 'all', label: 'All Users' },
                { value: 'user', label: 'Users' },
                { value: 'admin', label: 'Admins' },
              ].map((filter) => (
                <TouchableOpacity
                  key={filter.value}
                  style={[
                    styles.filterChip,
                    roleFilter === filter.value && styles.filterChipActive,
                  ]}
                  onPress={() => setRoleFilter(filter.value)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      roleFilter === filter.value && styles.filterChipTextActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.totalCount}>{pagination.total} users</Text>
          </View>

          {/* Users List */}
          <FlatList
            data={users}
            keyExtractor={(item) => item._id}
            renderItem={renderUserCard}
            contentContainerStyle={styles.usersList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[COLORS.primary]}
              />
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoading && pagination.page > 1 ? (
                <ActivityIndicator color={COLORS.primary} style={{ padding: 20 }} />
              ) : null
            }
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.emptyList}>
                  <Ionicons name="people-outline" size={64} color={COLORS.textLight} />
                  <Text style={styles.emptyText}>No users found</Text>
                  <Text style={styles.emptySubtext}>
                    {searchQuery ? 'Try a different search term' : 'No users in the system'}
                  </Text>
                </View>
              ) : null
            }
          />

          {/* Loading indicator for initial load */}
          {isLoading && pagination.page === 1 && users.length === 0 && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading users...</Text>
            </View>
          )}
        </View>

        {/* User Detail Modal */}
        <Modal
          visible={showUserDetailModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowUserDetailModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailModalContent}>
              <ScrollView>
                {/* Header */}
                <View style={styles.detailHeader}>
                  <TouchableOpacity onPress={() => setShowUserDetailModal(false)}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                  </TouchableOpacity>
                  <Text style={styles.detailTitle}>User Details</Text>
                  <View style={{ width: 24 }} />
                </View>

                {selectedUser && (
                  <>
                    {/* Profile Section */}
                    <View style={styles.profileSection}>
                      <View style={styles.profileAvatarContainer}>
                        {selectedUser.profile_image ? (
                          <Image 
                            source={{ uri: selectedUser.profile_image }} 
                            style={styles.profileAvatar} 
                          />
                        ) : (
                          <View style={styles.profileAvatarPlaceholder}>
                            <Text style={styles.profileAvatarText}>
                              {selectedUser.first_name?.charAt(0) || 'U'}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.profileName}>
                        {selectedUser.full_name || `${selectedUser.first_name} ${selectedUser.last_name}`}
                      </Text>
                      <Text style={styles.profileEmail}>{selectedUser.email}</Text>
                      
                      <View style={styles.profileBadges}>
                        {selectedUser.role === 'admin' && (
                          <View style={styles.roleBadge}>
                            <Ionicons name="shield-checkmark" size={14} color={COLORS.primary} />
                            <Text style={styles.roleBadgeText}>Admin</Text>
                          </View>
                        )}
                        <View style={[
                          styles.statusBadgeLarge,
                          { backgroundColor: getStatusBadge(selectedUser).color + '20' }
                        ]}>
                          <Text style={[
                            styles.statusBadgeLargeText,
                            { color: getStatusBadge(selectedUser).color }
                          ]}>
                            {getStatusBadge(selectedUser).label}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Suspension Info (if suspended) */}
                    {selectedUser.is_suspended && (
                      <View style={styles.suspensionInfoCard}>
                        <View style={styles.suspensionHeader}>
                          <Ionicons name="ban" size={20} color={COLORS.suspended} />
                          <Text style={styles.suspensionTitle}>Suspension Details</Text>
                        </View>
                        <View style={styles.suspensionDetails}>
                          <View style={styles.suspensionDetailRow}>
                            <View style={styles.suspensionDetailIcon}>
                              <Ionicons name="document-text-outline" size={16} color={COLORS.suspended} />
                            </View>
                            <View style={styles.suspensionDetailContent}>
                              <Text style={styles.suspensionDetailLabel}>Reason</Text>
                              <Text style={styles.suspensionDetailValue}>
                                {selectedUser.suspension_reason || 'No reason provided'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.suspensionDetailRow}>
                            <View style={styles.suspensionDetailIcon}>
                              <Ionicons name="time-outline" size={16} color={COLORS.suspended} />
                            </View>
                            <View style={styles.suspensionDetailContent}>
                              <Text style={styles.suspensionDetailLabel}>Duration Type</Text>
                              <Text style={styles.suspensionDetailValue}>
                                {suspensionTypes.find(t => t.value === selectedUser.suspension_type)?.label || selectedUser.suspension_type || 'N/A'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.suspensionDetailRow}>
                            <View style={styles.suspensionDetailIcon}>
                              <Ionicons name="calendar-outline" size={16} color={COLORS.suspended} />
                            </View>
                            <View style={styles.suspensionDetailContent}>
                              <Text style={styles.suspensionDetailLabel}>Suspended On (PHT)</Text>
                              <Text style={styles.suspensionDetailValue}>
                                {formatDate(selectedUser.suspension_start)}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.suspensionDetailRow}>
                            <View style={styles.suspensionDetailIcon}>
                              <Ionicons name="flag-outline" size={16} color={selectedUser.suspension_end ? COLORS.info : COLORS.danger} />
                            </View>
                            <View style={styles.suspensionDetailContent}>
                              <Text style={styles.suspensionDetailLabel}>Lifts On (PHT)</Text>
                              <Text style={[styles.suspensionDetailValue, !selectedUser.suspension_end && { color: COLORS.danger, fontWeight: '700' }]}>
                                {selectedUser.suspension_end 
                                  ? formatDate(selectedUser.suspension_end)
                                  : 'Permanent Suspension'}
                              </Text>
                            </View>
                          </View>
                          {selectedUser.suspension_end && (
                            <View style={styles.suspensionCountdown}>
                              <Ionicons name="hourglass-outline" size={14} color={COLORS.suspended} />
                              <Text style={styles.suspensionCountdownText}>
                                {getSuspensionTimeRemaining(selectedUser.suspension_end)}
                              </Text>
                            </View>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.liftSuspensionButton}
                          onPress={() => handleUnsuspendUser(selectedUser)}
                        >
                          <Ionicons name="checkmark-circle" size={18} color={COLORS.textOnPrimary} />
                          <Text style={styles.liftSuspensionText}>Lift Suspension</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* User Info */}
                    <View style={styles.infoSection}>
                      <Text style={styles.sectionTitle}>Account Information</Text>
                      
                      <View style={styles.infoRow}>
                        <Ionicons name="mail-outline" size={18} color={COLORS.textSecondary} />
                        <View style={styles.infoContent}>
                          <Text style={styles.infoLabel}>Email</Text>
                          <Text style={styles.infoValue}>{selectedUser.email}</Text>
                        </View>
                      </View>
                      
                      {selectedUser.phone && (
                        <View style={styles.infoRow}>
                          <Ionicons name="call-outline" size={18} color={COLORS.textSecondary} />
                          <View style={styles.infoContent}>
                            <Text style={styles.infoLabel}>Phone</Text>
                            <Text style={styles.infoValue}>{selectedUser.phone}</Text>
                          </View>
                        </View>
                      )}
                      
                      {(selectedUser.address || selectedUser.city || selectedUser.address_structured) && (
                        <View style={styles.infoRow}>
                          <Ionicons name="location-outline" size={18} color={COLORS.textSecondary} />
                          <View style={styles.infoContent}>
                            <Text style={styles.infoLabel}>Address</Text>
                            <Text style={styles.infoValue}>
                              {selectedUser.address_structured
                                ? [
                                    selectedUser.address_structured.houseNumber,
                                    selectedUser.address_structured.street,
                                    selectedUser.address_structured.barangay,
                                    selectedUser.address_structured.city,
                                    selectedUser.address_structured.province,
                                    selectedUser.address_structured.postalCode,
                                  ].filter(Boolean).join(', ')
                                : [selectedUser.address, selectedUser.city, selectedUser.province]
                                    .filter(Boolean).join(', ') || 'N/A'}
                            </Text>
                            {selectedUser.address_structured?.landmark && (
                              <Text style={[styles.infoValue, { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }]}>
                                Landmark: {selectedUser.address_structured.landmark}
                              </Text>
                            )}
                          </View>
                        </View>
                      )}
                      
                      <View style={styles.infoRow}>
                        <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} />
                        <View style={styles.infoContent}>
                          <Text style={styles.infoLabel}>Joined</Text>
                          <Text style={styles.infoValue}>{formatDate(selectedUser.created_at)}</Text>
                        </View>
                      </View>
                      
                      <View style={styles.infoRow}>
                        <Ionicons name="log-in-outline" size={18} color={COLORS.textSecondary} />
                        <View style={styles.infoContent}>
                          <Text style={styles.infoLabel}>Auth Provider</Text>
                          <Text style={styles.infoValue}>
                            {selectedUser.auth_provider === 'google' ? 'Google' : 'Email'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.actionsSection}>
                      <Text style={styles.sectionTitle}>Actions</Text>
                      
                      {/* Suspend/Unsuspend */}
                      {!selectedUser.is_suspended ? (
                        <TouchableOpacity
                          style={[styles.actionButton, styles.suspendButton]}
                          onPress={() => handleOpenSuspendModal(selectedUser)}
                        >
                          <Ionicons name="ban" size={20} color={COLORS.textOnPrimary} />
                          <Text style={styles.actionButtonText}>Suspend User</Text>
                        </TouchableOpacity>
                      ) : null}
                      
                      {/* Change Role */}
                      {selectedUser.role !== 'admin' ? (
                        <TouchableOpacity
                          style={[styles.actionButton, styles.promoteButton]}
                          onPress={() => handleChangeRole(selectedUser, 'admin')}
                        >
                          <Ionicons name="shield" size={20} color={COLORS.textOnPrimary} />
                          <Text style={styles.actionButtonText}>Promote to Admin</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.actionButton, styles.demoteButton]}
                          onPress={() => handleChangeRole(selectedUser, 'user')}
                        >
                          <Ionicons name="person" size={20} color={COLORS.textOnPrimary} />
                          <Text style={styles.actionButtonText}>Demote to User</Text>
                        </TouchableOpacity>
                      )}
                      
                      {/* Activate/Deactivate */}
                      <TouchableOpacity
                        style={[
                          styles.actionButton, 
                          selectedUser.is_active ? styles.deactivateButton : styles.activateButton
                        ]}
                        onPress={() => handleToggleStatus(selectedUser)}
                      >
                        <Ionicons 
                          name={selectedUser.is_active ? "close-circle" : "checkmark-circle"} 
                          size={20} 
                          color={COLORS.textOnPrimary} 
                        />
                        <Text style={styles.actionButtonText}>
                          {selectedUser.is_active ? 'Deactivate Account' : 'Activate Account'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Suspend Modal */}
        <Modal
          visible={showSuspendModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowSuspendModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.suspendModalContent}>
              <View style={styles.suspendModalHeader}>
                <Text style={styles.suspendModalTitle}>Suspend User</Text>
                <TouchableOpacity onPress={() => setShowSuspendModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.suspendModalBody}>
                {selectedUser && (
                  <View style={styles.suspendUserInfo}>
                    <Text style={styles.suspendUserName}>
                      {selectedUser.full_name}
                    </Text>
                    <Text style={styles.suspendUserEmail}>{selectedUser.email}</Text>
                  </View>
                )}

                {/* Duration Selection */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Suspension Duration *</Text>
                  <View style={styles.durationGrid}>
                    {suspensionTypes.map((type) => (
                      <TouchableOpacity
                        key={type.value}
                        style={[
                          styles.durationOption,
                          selectedSuspensionType === type.value && styles.durationOptionActive,
                          type.is_permanent && styles.durationOptionDanger,
                        ]}
                        onPress={() => setSelectedSuspensionType(type.value)}
                      >
                        <Text style={[
                          styles.durationText,
                          selectedSuspensionType === type.value && styles.durationTextActive,
                          type.is_permanent && selectedSuspensionType === type.value && styles.durationTextDanger,
                        ]}>
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Reason Selection */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Reason for Suspension *</Text>
                  <View style={styles.reasonGrid}>
                    {SUSPENSION_REASONS.map((reason) => (
                      <TouchableOpacity
                        key={reason}
                        style={[
                          styles.reasonChip,
                          selectedReason === reason && styles.reasonChipActive,
                        ]}
                        onPress={() => setSelectedReason(reason)}
                      >
                        {selectedReason === reason && (
                          <Ionicons name="checkmark-circle" size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
                        )}
                        <Text
                          style={[
                            styles.reasonChipText,
                            selectedReason === reason && styles.reasonChipTextActive,
                          ]}
                          numberOfLines={2}
                        >
                          {reason}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {selectedReason === 'Other (specify reason)' && (
                  <View style={styles.formSection}>
                    <Text style={styles.formLabel}>Custom Reason *</Text>
                    <TextInput
                      style={[styles.customReasonInput, customReasonTouched && customReasonError && styles.customReasonInputError]}
                      placeholder="Enter the specific reason..."
                      placeholderTextColor={COLORS.textLight}
                      value={customReason}
                      onChangeText={(t) => {
                        setCustomReason(t);
                        if (customReasonTouched) {
                          setCustomReasonError(validateField(t, customReasonRules));
                        }
                      }}
                      onBlur={() => {
                        setCustomReasonTouched(true);
                        setCustomReasonError(validateField(customReason, customReasonRules));
                      }}
                      multiline
                      numberOfLines={3}
                    />
                    {customReasonTouched && customReasonError ? (
                      <View style={styles.errorRow}>
                        <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                        <Text style={styles.errorText}>{customReasonError}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                {/* Warning */}
                <View style={styles.warningBox}>
                  <Ionicons name="warning" size={20} color={COLORS.warning} />
                  <Text style={styles.warningText}>
                    The user will be notified via email about their suspension and the reason.
                  </Text>
                </View>
              </ScrollView>

              {/* Footer */}
              <View style={styles.suspendModalFooter}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowSuspendModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmSuspendButton, isSuspending && styles.buttonDisabled]}
                  onPress={handleSuspendUser}
                  disabled={isSuspending}
                >
                  {isSuspending ? (
                    <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
                  ) : (
                    <>
                      <Ionicons name="ban" size={20} color={COLORS.textOnPrimary} />
                      <Text style={styles.confirmSuspendText}>Suspend User</Text>
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
        />
      </View>
    </Modal>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    minHeight: 48,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceVariant,
    marginRight: 8,
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: COLORS.textOnPrimary,
  },
  totalCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 'auto',
  },
  usersList: {
    padding: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  userAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  userAvatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  statusDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  adminBadge: {
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },
  userEmail: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  userMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  joinDate: {
    fontSize: 10,
    color: COLORS.textLight,
  },
  emptyList: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 200,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  // Detail Modal
  detailModalContent: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 30,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: COLORS.surface,
  },
  profileAvatarContainer: {
    marginBottom: 12,
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  profileAvatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  profileEmail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  profileBadges: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  statusBadgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusBadgeLargeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  suspensionInfoCard: {
    margin: 16,
    backgroundColor: COLORS.dangerBg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  suspensionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.suspended + '20',
  },
  suspensionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.suspended,
    letterSpacing: -0.2,
  },
  suspensionDetails: {
    gap: 0,
  },
  suspensionDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
    gap: 10,
  },
  suspensionDetailIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: COLORS.suspended + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  suspensionDetailContent: {
    flex: 1,
  },
  suspensionDetailLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  suspensionDetailValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
    lineHeight: 18,
  },
  suspensionCountdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.suspended + '15',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
  },
  suspensionCountdownText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.suspended,
  },
  detailRow: {
    flexDirection: 'row',
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    width: 60,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
  },
  liftSuspensionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 14,
    gap: 6,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  liftSuspensionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  infoSection: {
    margin: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: COLORS.text,
  },
  actionsSection: {
    margin: 16,
    marginTop: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 8,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 1,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  suspendButton: {
    backgroundColor: COLORS.suspended,
  },
  promoteButton: {
    backgroundColor: COLORS.primary,
  },
  demoteButton: {
    backgroundColor: COLORS.warning,
  },
  activateButton: {
    backgroundColor: COLORS.success,
  },
  deactivateButton: {
    backgroundColor: COLORS.textSecondary,
  },
  // Suspend Modal
  suspendModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  suspendModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  suspendModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  suspendModalBody: {
    padding: 20,
    maxHeight: 500,
  },
  suspendUserInfo: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  suspendUserName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  suspendUserEmail: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  formSection: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  durationOption: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceVariant,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  durationOptionActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  durationOptionDanger: {
    borderColor: COLORS.danger,
  },
  durationText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  durationTextActive: {
    color: COLORS.textOnPrimary,
  },
  durationTextDanger: {
    color: COLORS.textOnPrimary,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  reasonOptionActive: {},
  reasonText: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  reasonTextActive: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  // Side-by-side chip grid for reasons
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceVariant,
  },
  reasonChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  reasonChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.text,
    flex: 1,
    lineHeight: 16,
  },
  reasonChipTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  customReasonInput: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    textAlignVertical: 'top',
    minHeight: 80,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  customReasonInputError: {
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
  warningBox: {
    flexDirection: 'row',
    backgroundColor: COLORS.warning + '15',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  suspendModalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceVariant,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  confirmSuspendButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.suspended,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmSuspendText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
