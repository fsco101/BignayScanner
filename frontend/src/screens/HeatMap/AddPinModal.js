/**
 * AddPinModal
 * Modal form for creating / editing a harvest map pin.
 * Collects: place name, pin type, description, contact person, contact details.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { rules, validateField } from '../../utils/validation';
import { useThemeColors } from '../../context/ThemeContext';

const PIN_TYPES = [
  { id: 'farm', name: 'Farm', icon: 'leaf', color: '#4CAF50' },
  { id: 'blooming_area', name: 'Blooming Area', icon: 'flower', color: '#E91E63' },
  { id: 'market', name: 'Market', icon: 'storefront', color: '#FF9800' },
  { id: 'other', name: 'Other', icon: 'location', color: '#2196F3' },
];

export default function AddPinModal({
  visible,
  onClose,
  onSubmit,
  coordinate,       // { latitude, longitude }
  initialData,      // For editing existing pins
  defaultPlaceName, // Pre-fill place name from search
  loading = false,
}) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const [placeName, setPlaceName] = useState('');
  const [pinType, setPinType] = useState('farm');
  const [description, setDescription] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactDetails, setContactDetails] = useState('');

  // Validation state
  const [formErrors, setFormErrors] = useState({});
  const [formTouched, setFormTouched] = useState({});

  const pinFormRules = {
    placeName: [rules.required('Place name')],
  };

  const touchField = (field) => {
    setFormTouched(prev => ({ ...prev, [field]: true }));
    const valueMap = { placeName };
    const fieldErrors = validateField(valueMap[field], pinFormRules[field] || []);
    setFormErrors(prev => ({ ...prev, [field]: fieldErrors }));
  };

  const handleFieldChange = (field, value, setter) => {
    setter(value);
    if (formTouched[field]) {
      const fieldErrors = validateField(value, pinFormRules[field] || []);
      setFormErrors(prev => ({ ...prev, [field]: fieldErrors }));
    }
  };

  const validatePinForm = () => {
    const allErrors = {};
    const values = { placeName };
    let isValid = true;
    Object.keys(pinFormRules).forEach(field => {
      const errs = validateField(values[field], pinFormRules[field]);
      if (errs) { allErrors[field] = errs; isValid = false; }
    });
    setFormErrors(allErrors);
    setFormTouched(prev => {
      const t = { ...prev };
      Object.keys(pinFormRules).forEach(f => t[f] = true);
      return t;
    });
    return isValid;
  };

  // Reset or populate form when modal opens
  useEffect(() => {
    if (visible) {
      if (initialData) {
        setPlaceName(initialData.place_name || '');
        setPinType(initialData.pin_type || 'farm');
        setDescription(initialData.description || '');
        setContactPerson(initialData.contact_person || '');
        setContactDetails(initialData.contact_details || '');
      } else {
        setPlaceName(defaultPlaceName || '');
        setPinType('farm');
        setDescription('');
        setContactPerson('');
        setContactDetails('');
      }
      setFormErrors({});
      setFormTouched({});
    }
  }, [visible, initialData, defaultPlaceName]);

  const handleSubmit = () => {
    if (!coordinate) return;
    if (!validatePinForm()) return;

    const pinData = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      place_name: placeName.trim(),
      pin_type: pinType,
      description: description.trim(),
      contact_person: contactPerson.trim(),
      contact_details: contactDetails.trim(),
    };

    onSubmit(pinData);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContainer}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>
                {initialData ? 'Edit Pin' : 'Add Harvest Pin'}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Coordinate display */}
            {coordinate && (
              <View style={styles.coordBanner}>
                <Ionicons name="location" size={18} color={COLORS.primary} />
                <Text style={styles.coordText}>
                  {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}
                </Text>
              </View>
            )}

            {/* Pin Type Selection */}
            <Text style={styles.label}>Pin Type *</Text>
            <View style={styles.typeRow}>
              {PIN_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeButton,
                    pinType === type.id && { backgroundColor: type.color + '20', borderColor: type.color },
                  ]}
                  onPress={() => setPinType(type.id)}
                >
                  <Ionicons
                    name={type.icon}
                    size={20}
                    color={pinType === type.id ? type.color : COLORS.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeLabel,
                      pinType === type.id && { color: type.color, fontWeight: '600' },
                    ]}
                  >
                    {type.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Place Name */}
            <Text style={styles.label}>Place Name <Text style={{ color: '#D32F2F' }}>*</Text></Text>
            <TextInput
              style={[styles.input, formTouched.placeName && formErrors.placeName && styles.formInputError]}
              placeholder="e.g. Antipolo Bignay Farm"
              placeholderTextColor={COLORS.textLight}
              value={placeName}
              onChangeText={(v) => handleFieldChange('placeName', v, setPlaceName)}
              onBlur={() => touchField('placeName')}
              maxLength={200}
            />
            {formTouched.placeName && formErrors.placeName ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                <Text style={styles.errorText}>{formErrors.placeName}</Text>
              </View>
            ) : null}

            {/* Description */}
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe the location, harvest details, availability..."
              placeholderTextColor={COLORS.textLight}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={1000}
            />

            {/* Contact Person (Optional) */}
            <Text style={styles.label}>
              Contact Person <Text style={styles.optionalTag}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Name of contact person"
              placeholderTextColor={COLORS.textLight}
              value={contactPerson}
              onChangeText={setContactPerson}
              maxLength={100}
            />

            {/* Contact Details (Optional) */}
            <Text style={styles.label}>
              Contact Number <Text style={styles.optionalTag}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 09171234567"
              placeholderTextColor={COLORS.textLight}
              value={contactDetails}
              onChangeText={(text) => setContactDetails(text.replace(/[^0-9+\-() ]/g, ''))}
              keyboardType="phone-pad"
              maxLength={20}
            />

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.textOnPrimary} />
                  <Text style={styles.submitText}>
                    {initialData ? 'Update Pin' : 'Save Pin'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  closeButton: {
    padding: 4,
  },
  coordBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  coordText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 12,
  },
  optionalTag: {
    fontWeight: '400',
    color: COLORS.textLight,
    fontSize: 12,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: 6,
  },
  typeLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
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
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  cancelButton: {
    alignItems: 'center',
    padding: 14,
    marginTop: 6,
  },
  cancelText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
});
