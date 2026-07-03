/**
 * PinDetailModal
 * Displays detailed information about a selected harvest pin.
 * Shows place name, type, description, contact info, and coordinates.
 * Provides edit / delete actions for the pin owner.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatPhilippineDateTime } from '../../utils/dateTime';
import { useThemeColors } from '../../context/ThemeContext';

const PIN_TYPE_META = {
  farm: { name: 'Farm', icon: 'leaf', color: '#4CAF50' },
  blooming_area: { name: 'Blooming Area', icon: 'flower', color: '#E91E63' },
  market: { name: 'Market', icon: 'storefront', color: '#FF9800' },
  other: { name: 'Other', icon: 'location', color: '#2196F3' },
};

export default function PinDetailModal({
  visible,
  onClose,
  pin,
  currentUserId,
  onEdit,
  onDelete,
  onNavigate,
}) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  if (!pin) return null;

  const meta = PIN_TYPE_META[pin.pin_type] || PIN_TYPE_META.other;
  const isOwner = currentUserId && pin.created_by === currentUserId;

  const handleCall = () => {
    if (pin.contact_details) {
      const phone = pin.contact_details.replace(/[^0-9+]/g, '');
      if (phone.length >= 7) {
        Linking.openURL(`tel:${phone}`).catch(() => {});
      }
    }
  };

  // Only treat contact_details as valid if it contains only digits, +, -, spaces, or parens
  const isValidPhone = (value) => {
    if (!value) return false;
    return /^[0-9+\-()\s]+$/.test(value.trim()) && value.replace(/[^0-9]/g, '').length >= 7;
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Pin',
      'Are you sure you want to delete this pin? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete?.(pin._id),
        },
      ]
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return formatPhilippineDateTime(dateStr);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={[styles.typeBadge, { backgroundColor: meta.color + '20' }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                  <Text style={[styles.typeText, { color: meta.color }]}>{meta.name}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Title */}
            <Text style={styles.title}>
              {pin.place_name || 'Harvest Pin'}
            </Text>

            {/* Created by */}
            {pin.created_by_name ? (
              <View style={styles.authorRow}>
                {pin.created_by_avatar ? (
                  <Image
                    source={{ uri: pin.created_by_avatar }}
                    style={styles.authorAvatar}
                  />
                ) : (
                  <View style={styles.authorAvatarFallback}>
                    <Ionicons name="person" size={16} color={COLORS.buttonText} />
                  </View>
                )}
                <Text style={styles.authorText}>
                  Added by {pin.created_by_name}
                  {pin.created_at ? ` • ${formatDate(pin.created_at)}` : ''}
                </Text>
              </View>
            ) : null}

            {/* Description */}
            {pin.description ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Description</Text>
                <Text style={styles.descriptionText}>{pin.description}</Text>
              </View>
            ) : null}

            {/* Contact Info */}
            {(pin.contact_person || isValidPhone(pin.contact_details)) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Contact Information</Text>
                {pin.contact_person ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="person" size={18} color={COLORS.primary} />
                    <Text style={styles.infoText}>{pin.contact_person}</Text>
                  </View>
                ) : null}
                {isValidPhone(pin.contact_details) ? (
                  <TouchableOpacity style={styles.infoRow} onPress={handleCall}>
                    <Ionicons name="call" size={18} color={COLORS.primary} />
                    <Text style={[styles.infoText, { color: COLORS.primary }]}>
                      {pin.contact_details}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {/* Coordinates */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Location</Text>
              <View style={styles.coordBox}>
                <Ionicons name="navigate" size={18} color={COLORS.textSecondary} />
                <Text style={styles.coordText}>
                  {pin.latitude?.toFixed(5)}, {pin.longitude?.toFixed(5)}
                </Text>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
              {/* Navigate within app */}
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.info }]}
                onPress={() => {
                  onNavigate?.(pin);
                  onClose?.();
                }}
              >
                <Ionicons name="navigate" size={18} color={COLORS.buttonText} />
                <Text style={styles.actionText}>Navigate</Text>
              </TouchableOpacity>

              {/* Edit (owner only) */}
              {isOwner && onEdit && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: COLORS.warning }]}
                  onPress={() => onEdit(pin)}
                >
                  <Ionicons name="pencil" size={18} color={COLORS.buttonText} />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
              )}

              {/* Delete (owner only) */}
              {isOwner && onDelete && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: COLORS.danger }]}
                  onPress={handleDelete}
                >
                  <Ionicons name="trash" size={18} color={COLORS.buttonText} />
                  <Text style={styles.actionText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '75%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  headerLeft: {
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 6,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  authorAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
  },
  authorAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.textLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorText: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 15,
    color: COLORS.text,
  },
  coordBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 10,
  },
  coordText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.surface,
  },
});
