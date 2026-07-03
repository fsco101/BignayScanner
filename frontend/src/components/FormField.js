/**
 * FormField – reusable wrapper around TextInput with label, error text, and optional icon.
 *
 * Usage:
 *   <FormField
 *     label="Email"
 *     icon="mail-outline"
 *     error={errors.email}
 *     touched={touched.email}
 *     {...getFieldProps('email')}
 *     keyboardType="email-address"
 *     autoCapitalize="none"
 *   />
 */

import React, { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../context/ThemeContext';


export default function FormField({
  label,
  icon,
  error,
  touched,
  showErrorAlways = false, // show error even before touch (e.g. after submit)
  style,
  inputStyle,
  containerStyle,
  required = false,
  helperText,
  rightElement,
  multiline,
  ...textInputProps
}) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const showError = (showErrorAlways || touched) && !!error;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputWrapper,
          multiline && styles.inputWrapperMultiline,
          showError && styles.inputWrapperError,
          style,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={20}
            color={showError ? COLORS.danger : COLORS.textSecondary}
            style={styles.icon}
          />
        ) : null}

        <TextInput
          style={[
            styles.input,
            multiline && styles.inputMultiline,
            icon && styles.inputWithIcon,
            inputStyle,
          ]}
          placeholderTextColor="#9CA3AF"
          multiline={multiline}
          {...textInputProps}
        />

        {rightElement || null}
      </View>

      {showError ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  required: {
    color: COLORS.danger,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  inputWrapperMultiline: {
    alignItems: 'flex-start',
    paddingVertical: 10,
    minHeight: 100,
  },
  inputWrapperError: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerBg,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: 0,
  },
  inputMultiline: {
    textAlignVertical: 'top',
    minHeight: 80,
    paddingTop: 4,
  },
  inputWithIcon: {
    // extra left padding already handled by icon marginRight
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingLeft: 2,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: '500',
    flex: 1,
  },
  helperText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    paddingLeft: 2,
  },
});
