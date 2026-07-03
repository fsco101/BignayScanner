/**
 * Modern Form Validation Utility
 * Centralized validation rules, helpers, and React hook for all forms.
 *
 * Usage:
 *   import { useFormValidation, rules } from '../../utils/validation';
 *
 *   const { values, errors, touched, handleChange, handleBlur, validate, resetForm, isValid } =
 *     useFormValidation(
 *       { email: '', password: '' },
 *       { email: [rules.required('Email'), rules.email()], password: [rules.required('Password'), rules.minLength(8)] }
 *     );
 */

import { useState, useCallback, useRef } from 'react';

// ────────────────────────────────────────────
// Regex patterns
// ────────────────────────────────────────────
const PATTERNS = {
  // RFC-5322-ish
  email: /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/,
  // Philippine mobile → 09xxxxxxxxx | +639xxxxxxxxx
  phonePH: /^(09|\+639)\d{9}$/,
  // Basic URL
  url: /^https?:\/\/.+/,
  // At least one uppercase letter
  uppercase: /[A-Z]/,
  // At least one lowercase letter
  lowercase: /[a-z]/,
  // At least one digit
  digit: /\d/,
  // At least one special char
  specialChar: /[!@#$%^&*(),.?":{}|<>\-_+=[\]\\;'/`~]/,
  // Numeric only
  numeric: /^\d+$/,
  // Decimal number
  decimal: /^\d+(\.\d+)?$/,
  // Year (4 digits)
  year: /^\d{4}$/,
};

// ────────────────────────────────────────────
// Validation rule factory functions
// Each returns { message, test(value, allValues) }
// ────────────────────────────────────────────
export const rules = {
  /** Field is required (non-empty after trim). */
  required: (fieldLabel = 'This field') => ({
    message: `${fieldLabel} is required`,
    test: (v) => v !== null && v !== undefined && String(v).trim().length > 0,
  }),

  /** Minimum string length. */
  minLength: (min, fieldLabel) => ({
    message: `${fieldLabel || 'This field'} must be at least ${min} characters`,
    test: (v) => !v || String(v).trim().length >= min,
  }),

  /** Maximum string length. */
  maxLength: (max, fieldLabel) => ({
    message: `${fieldLabel || 'This field'} must be at most ${max} characters`,
    test: (v) => !v || String(v).trim().length <= max,
  }),

  /** Valid email address. */
  email: (msg) => ({
    message: msg || 'Please enter a valid email address',
    test: (v) => !v || PATTERNS.email.test(String(v).trim()),
  }),

  /** Valid Philippine phone number (optional — passes if empty). */
  phonePH: (msg) => ({
    message: msg || 'Please enter a valid Philippine mobile number (e.g., 09171234567)',
    test: (v) => {
      if (!v || !String(v).trim()) return true; // optional
      const cleaned = String(v).replace(/[\s\-]/g, '');
      return PATTERNS.phonePH.test(cleaned);
    },
  }),

  /** Phone required and valid PH format. */
  phonePHRequired: (msg) => ({
    message: msg || 'Please enter a valid Philippine mobile number (e.g., 09171234567)',
    test: (v) => {
      if (!v || !String(v).trim()) return false;
      const cleaned = String(v).replace(/[\s\-]/g, '');
      return PATTERNS.phonePH.test(cleaned);
    },
  }),

  /** Valid URL. */
  url: (msg) => ({
    message: msg || 'Please enter a valid URL (starting with http:// or https://)',
    test: (v) => !v || !String(v).trim() || PATTERNS.url.test(String(v).trim()),
  }),

  /** Must match another field value. */
  matches: (otherField, otherLabel) => ({
    message: `Does not match ${otherLabel || otherField}`,
    test: (v, allValues) => !v || v === allValues[otherField],
  }),

  /** Regex pattern match. */
  pattern: (regex, msg) => ({
    message: msg || 'Invalid format',
    test: (v) => !v || regex.test(String(v).trim()),
  }),

  /** Contains uppercase letter. */
  hasUppercase: (msg) => ({
    message: msg || 'Must contain at least one uppercase letter',
    test: (v) => !v || PATTERNS.uppercase.test(v),
  }),

  /** Contains lowercase letter. */
  hasLowercase: (msg) => ({
    message: msg || 'Must contain at least one lowercase letter',
    test: (v) => !v || PATTERNS.lowercase.test(v),
  }),

  /** Contains a digit. */
  hasDigit: (msg) => ({
    message: msg || 'Must contain at least one number',
    test: (v) => !v || PATTERNS.digit.test(v),
  }),

  /** Contains a special character. */
  hasSpecialChar: (msg) => ({
    message: msg || 'Must contain at least one special character',
    test: (v) => !v || PATTERNS.specialChar.test(v),
  }),

  /** Numeric value only (integer). */
  numeric: (msg) => ({
    message: msg || 'Must be a number',
    test: (v) => !v || PATTERNS.numeric.test(String(v).trim()),
  }),

  /** Decimal value. */
  decimal: (msg) => ({
    message: msg || 'Must be a valid number',
    test: (v) => !v || PATTERNS.decimal.test(String(v).trim()),
  }),

  /** Minimum numeric value. */
  min: (min, fieldLabel) => ({
    message: `${fieldLabel || 'Value'} must be at least ${min}`,
    test: (v) => !v || parseFloat(v) >= min,
  }),

  /** Maximum numeric value. */
  max: (max, fieldLabel) => ({
    message: `${fieldLabel || 'Value'} must be at most ${max}`,
    test: (v) => !v || parseFloat(v) <= max,
  }),

  /** Greater than a number (strict). */
  greaterThan: (n, fieldLabel) => ({
    message: `${fieldLabel || 'Value'} must be greater than ${n}`,
    test: (v) => !v || parseFloat(v) > n,
  }),

  /** 4-digit year. */
  year: (msg) => ({
    message: msg || 'Please enter a valid 4-digit year',
    test: (v) => {
      if (!v || !String(v).trim()) return true;
      return PATTERNS.year.test(String(v).trim());
    },
  }),

  /** Custom validation function. */
  custom: (testFn, msg) => ({
    message: msg || 'Invalid value',
    test: testFn,
  }),
};

// ────────────────────────────────────────────
// Run a list of rules against a single value
// Returns the first failing message or null
// ────────────────────────────────────────────
export function validateField(value, fieldRules = [], allValues = {}) {
  for (const rule of fieldRules) {
    if (!rule.test(value, allValues)) {
      return rule.message;
    }
  }
  return null;
}

// ────────────────────────────────────────────
// Run all rules for all fields
// Returns { fieldName: errorMsg | null }
// ────────────────────────────────────────────
export function validateAll(values, schema) {
  const errors = {};
  let hasError = false;
  for (const field of Object.keys(schema)) {
    const msg = validateField(values[field], schema[field], values);
    if (msg) {
      errors[field] = msg;
      hasError = true;
    }
  }
  return { errors, isValid: !hasError };
}

// ────────────────────────────────────────────
// Password strength calculator
// ────────────────────────────────────────────
export function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '#D1D5DB', percent: 0 };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (PATTERNS.uppercase.test(password)) score++;
  if (PATTERNS.lowercase.test(password)) score++;
  if (PATTERNS.digit.test(password)) score++;
  if (PATTERNS.specialChar.test(password)) score++;

  const levels = [
    { min: 0, label: 'Too Weak', color: '#EF4444', percent: 10 },
    { min: 1, label: 'Weak', color: '#F97316', percent: 25 },
    { min: 2, label: 'Fair', color: '#EAB308', percent: 40 },
    { min: 3, label: 'Fair', color: '#EAB308', percent: 55 },
    { min: 4, label: 'Good', color: '#22C55E', percent: 70 },
    { min: 5, label: 'Strong', color: '#16A34A', percent: 85 },
    { min: 6, label: 'Very Strong', color: '#15803D', percent: 100 },
  ];

  const level = [...levels].reverse().find((l) => score >= l.min) || levels[0];
  return { score, label: level.label, color: level.color, percent: level.percent };
}

// ────────────────────────────────────────────
// React hook: useFormValidation
// ────────────────────────────────────────────
/**
 * @param {object} initialValues  – e.g. { email: '', password: '' }
 * @param {object} validationSchema – e.g. { email: [rules.required('Email'), rules.email()] }
 *
 * Returns:
 *   values, errors, touched,
 *   handleChange(field, value),
 *   handleBlur(field),
 *   setFieldValue(field, value),
 *   setFieldError(field, msg),
 *   validate()  → boolean (true = valid),
 *   validateField(field) → errorMsg | null,
 *   resetForm(newValues?),
 *   isValid  → boolean (current errors state),
 *   getFieldProps(field) → { value, onChangeText, onBlur } (for TextInput shorthand)
 */
export function useFormValidation(initialValues = {}, validationSchema = {}) {
  const [values, setValues] = useState({ ...initialValues });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const schemaRef = useRef(validationSchema);
  schemaRef.current = validationSchema;

  // Set a single field value & clear its error
  const handleChange = useCallback((field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Live-clear error when user types
    setErrors((prev) => {
      if (!prev[field]) return prev;
      return { ...prev, [field]: null };
    });
  }, []);

  // Alias
  const setFieldValue = handleChange;

  // Mark field as touched & validate it
  const handleBlur = useCallback((field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setValues((curr) => {
      const fieldRules = schemaRef.current[field];
      if (fieldRules) {
        const msg = validateField(curr[field], fieldRules, curr);
        setErrors((prev) => ({ ...prev, [field]: msg }));
      }
      return curr;
    });
  }, []);

  // Set an arbitrary error on a field (e.g. server-side error)
  const setFieldError = useCallback((field, msg) => {
    setErrors((prev) => ({ ...prev, [field]: msg }));
  }, []);

  // Validate all fields & return true if valid
  const validate = useCallback(() => {
    // Mark everything touched
    const allTouched = {};
    for (const k of Object.keys(schemaRef.current)) allTouched[k] = true;
    setTouched((prev) => ({ ...prev, ...allTouched }));

    let currentValues;
    // Need synchronous read
    setValues((v) => {
      currentValues = v;
      return v;
    });

    const { errors: newErrors, isValid: valid } = validateAll(
      currentValues || values,
      schemaRef.current,
    );
    setErrors(newErrors);
    return valid;
  }, [values]);

  // Validate a single field and return the error
  const validateSingleField = useCallback(
    (field) => {
      const fieldRules = schemaRef.current[field];
      if (!fieldRules) return null;
      const msg = validateField(values[field], fieldRules, values);
      setErrors((prev) => ({ ...prev, [field]: msg }));
      return msg;
    },
    [values],
  );

  // Reset form to initial or custom values
  const resetForm = useCallback(
    (newValues) => {
      setValues(newValues || { ...initialValues });
      setErrors({});
      setTouched({});
    },
    [initialValues],
  );

  // Convenience: spread onto a TextInput
  const getFieldProps = useCallback(
    (field) => ({
      value: values[field] ?? '',
      onChangeText: (text) => handleChange(field, text),
      onBlur: () => handleBlur(field),
    }),
    [values, handleChange, handleBlur],
  );

  const isValid = Object.values(errors).every((e) => !e);

  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    setFieldValue,
    setFieldError,
    validate,
    validateField: validateSingleField,
    resetForm,
    isValid,
    getFieldProps,
    setValues,
    setErrors,
  };
}

// ────────────────────────────────────────────
// Inline-error helper component props
// ────────────────────────────────────────────
/**
 * Returns true when the field should show its error.
 * Typically: touched AND has error.
 */
export function shouldShowError(field, errors, touched) {
  return !!(touched[field] && errors[field]);
}

export default {
  rules,
  validateField,
  validateAll,
  getPasswordStrength,
  useFormValidation,
  shouldShowError,
};
