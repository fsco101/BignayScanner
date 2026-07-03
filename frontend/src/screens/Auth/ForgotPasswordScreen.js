// Forgot Password Screen
// Modern multi-step password reset with email verification

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../hooks/useResponsive';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';
import { useFormValidation, rules, getPasswordStrength as calcPasswordStrength } from '../../utils/validation';
import AuthService from '../../services/AuthService';
import { useThemeColors } from '../../context/ThemeContext';


const ForgotPasswordScreen = ({ navigation }) => {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { alertConfig, showSuccess, showError, hideAlert } = useSweetAlert();

  const {
    width: screenWidth,
    isMobile,
    isTablet,
    isDesktop,
    sp,
    fp,
    wp,
    responsive,
    maxContentWidth,
  } = useResponsive();

  const dynamicStyles = useMemo(() => ({
    scrollContent: {
      flexGrow: 1,
      padding: responsive({ mobile: sp(20), tablet: sp(32), desktop: sp(40) }),
      justifyContent: 'center',
      alignItems: isDesktop ? 'center' : 'stretch',
    },
    formContainer: {
      width: isDesktop ? Math.min(wp(450), maxContentWidth * 0.45) : '100%',
      maxWidth: 520,
    },
    header: {
      marginBottom: responsive({ mobile: sp(24), tablet: sp(32), desktop: sp(40) }),
    },
    logoContainer: {
      width: responsive({ mobile: sp(80), tablet: sp(100), desktop: sp(110) }),
      height: responsive({ mobile: sp(80), tablet: sp(100), desktop: sp(110) }),
      borderRadius: responsive({ mobile: sp(40), tablet: sp(50), desktop: sp(55) }),
    },
    title: {
      fontSize: responsive({ mobile: fp(24), tablet: fp(28), desktop: fp(30) }),
    },
    subtitle: {
      fontSize: responsive({ mobile: fp(13), tablet: fp(15), desktop: fp(16) }),
    },
    form: {
      padding: responsive({ mobile: sp(20), tablet: sp(28), desktop: sp(32) }),
      borderRadius: responsive({ mobile: sp(14), tablet: sp(18), desktop: sp(20) }),
    },
    label: {
      fontSize: responsive({ mobile: fp(12), tablet: fp(14), desktop: fp(15) }),
    },
    input: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(16), desktop: fp(17) }),
      paddingVertical: responsive({ mobile: sp(12), tablet: sp(14), desktop: sp(16) }),
    },
    buttonText: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(16), desktop: fp(17) }),
    },
    button: {
      paddingVertical: responsive({ mobile: sp(14), tablet: sp(16), desktop: sp(18) }),
      borderRadius: responsive({ mobile: sp(10), tablet: sp(12), desktop: sp(14) }),
    },
    iconSize: responsive({ mobile: sp(18), tablet: sp(20), desktop: sp(22) }),
  }), [screenWidth, isMobile, isTablet, isDesktop, sp, fp, wp, responsive, maxContentWidth]);

  // Step 1: Email, Step 2: Verification Code, Step 3: New Password
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Verification code
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(0);
  const codeInputRefs = useRef([]);

  // New password form
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const {
    values: pwValues,
    errors: pwErrors,
    touched: pwTouched,
    handleChange: pwHandleChange,
    handleBlur: pwHandleBlur,
    validateField: pwValidateField,
  } = useFormValidation(
    { password: '', confirmPassword: '' },
    {
      password: [
        rules.required('Password'),
        rules.minLength(8, 'Password'),
        rules.hasUppercase(),
        rules.hasLowercase(),
        rules.hasDigit(),
        rules.hasSpecialChar(),
      ],
      confirmPassword: [
        rules.required('Confirm password'),
        rules.matches('password', 'Password'),
      ],
    }
  );

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: false }).start();
  }, [step]);

  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => setResendTimer((p) => p - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  useEffect(() => {
    if (step === 2) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [step]);

  const passwordStrength = calcPasswordStrength(pwValues.password);

  // Handlers
  const handleSendCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setEmailError('Email is required');
      return;
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    setIsLoading(true);
    try {
      const result = await AuthService.forgotPassword(trimmedEmail);
      if (result.ok) {
        setStep(2);
        setResendTimer(60);
        setVerificationCode(['', '', '', '', '', '']);
      } else {
        showError('Error', result.error || 'Failed to send reset code');
      }
    } catch (error) {
      showError('Error', 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (text, index) => {
    const newCode = [...verificationCode];
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, 6).split('');
      digits.forEach((digit, i) => { if (i < 6) newCode[i] = digit; });
      setVerificationCode(newCode);
      codeInputRefs.current[Math.min(digits.length, 5)]?.focus();
      return;
    }
    newCode[index] = text.replace(/\D/g, '');
    setVerificationCode(newCode);
    if (text && index < 5) codeInputRefs.current[index + 1]?.focus();
  };

  const handleCodeKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
      const newCode = [...verificationCode];
      newCode[index - 1] = '';
      setVerificationCode(newCode);
    }
  };

  const handleVerifyCode = async () => {
    const code = verificationCode.join('');
    if (code.length !== 6) {
      showError('Invalid Code', 'Please enter the complete 6-digit code.');
      return;
    }
    setIsLoading(true);
    try {
      const result = await AuthService.verifyResetCode(email.trim().toLowerCase(), code);
      if (result.ok) {
        setStep(3);
      } else {
        showError('Invalid Code', result.error || 'The code is invalid or expired.');
      }
    } catch (error) {
      showError('Error', 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    // Validate
    let valid = true;
    ['password', 'confirmPassword'].forEach((f) => {
      pwHandleBlur(f);
      if (pwValidateField(f)) valid = false;
    });
    if (!valid) return;

    setIsLoading(true);
    try {
      const code = verificationCode.join('');
      const result = await AuthService.resetPassword(
        email.trim().toLowerCase(),
        code,
        pwValues.password
      );
      if (result.ok) {
        showSuccess(
          'Password Reset!',
          'Your password has been reset successfully. You can now log in with your new password.',
          {
            autoClose: 2500,
            onConfirm: () => navigation.navigate('Login'),
          }
        );
        setTimeout(() => navigation.navigate('Login'), 2600);
      } else {
        if (result.errors) {
          showError('Reset Failed', Array.isArray(result.errors) ? result.errors.join('\n') : result.errors);
        } else {
          showError('Reset Failed', result.error || 'Failed to reset password.');
        }
      }
    } catch (error) {
      showError('Error', 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0) return;
    setIsLoading(true);
    try {
      const result = await AuthService.forgotPassword(email.trim().toLowerCase());
      if (result.ok) {
        setResendTimer(60);
        setVerificationCode(['', '', '', '', '', '']);
        showSuccess('Code Sent', 'A new reset code has been sent to your email.');
      } else {
        showError('Failed', result.error || 'Could not resend code.');
      }
    } catch (error) {
      showError('Error', 'Failed to resend code.');
    } finally {
      setIsLoading(false);
    }
  };

  const stepTitles = ['Enter Email', 'Verify Code', 'New Password'];
  const stepIcons = ['mail-outline', 'shield-checkmark-outline', 'lock-closed-outline'];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={dynamicStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={dynamicStyles.formContainer}>
          {/* Header */}
          <View style={[styles.header, dynamicStyles.header]}>
            <TouchableOpacity
              onPress={() => {
                if (step > 1) {
                  setStep(step - 1);
                } else {
                  navigation.goBack();
                }
              }}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={dynamicStyles.iconSize} color={COLORS.primary} />
            </TouchableOpacity>
            <View style={[styles.logoContainer, dynamicStyles.logoContainer]}>
              <Image
                source={require('../../../assets/bignay-logo.png')}
                style={{
                  width: responsive({ mobile: sp(60), tablet: sp(80), desktop: sp(90) }),
                  height: responsive({ mobile: sp(60), tablet: sp(80), desktop: sp(90) }),
                  borderRadius: responsive({ mobile: sp(30), tablet: sp(40), desktop: sp(45) }),
                }}
                resizeMode="cover"
              />
            </View>
            <Text style={[styles.title, dynamicStyles.title]}>Reset Password</Text>
            <Text style={[styles.subtitle, dynamicStyles.subtitle]}>
              {step === 1 ? 'Enter your email to receive a reset code' :
               step === 2 ? 'Enter the verification code' :
               'Create your new password'}
            </Text>
          </View>

          {/* Progress Steps */}
          <View style={styles.progressContainer}>
            {[1, 2, 3].map((s, i) => (
              <React.Fragment key={s}>
                <View style={[styles.progressStep, step >= s && styles.progressStepActive]}>
                  {step > s ? (
                    <Ionicons name="checkmark" size={14} color={COLORS.buttonText} />
                  ) : (
                    <Text style={[styles.progressStepText, step >= s && styles.progressStepTextActive]}>{s}</Text>
                  )}
                </View>
                {i < 2 && <View style={[styles.progressLine, step > s && styles.progressLineActive]} />}
              </React.Fragment>
            ))}
          </View>

          {/* Form */}
          <View style={[styles.form, dynamicStyles.form]}>
            
            {/* Step 1: Email Input */}
            {step === 1 && (
              <>
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, dynamicStyles.label]}>Email Address</Text>
                  <View style={[styles.inputWrapper, emailError ? styles.inputError : {}]}>
                    <Ionicons name="mail-outline" size={dynamicStyles.iconSize} color={emailError ? COLORS.error : COLORS.textSecondary} />
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                      placeholder="Enter your registered email"
                      placeholderTextColor={COLORS.textSecondary}
                      value={email}
                      onChangeText={(text) => { setEmail(text); setEmailError(''); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                    />
                  </View>
                  {emailError ? (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                      <Text style={styles.errorText}>{emailError}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.infoBox}>
                  <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.infoText}>
                    We'll send a 6-digit verification code to your email address to verify your identity.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, dynamicStyles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleSendCode}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.buttonText} />
                  ) : (
                    <>
                      <Ionicons name="send-outline" size={dynamicStyles.iconSize} color={COLORS.buttonText} style={{ marginRight: 8 }} />
                      <Text style={[styles.primaryButtonText, dynamicStyles.buttonText, { marginRight: 0 }]}>Send Reset Code</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Step 2: Verification Code */}
            {step === 2 && (
              <>
                <View style={styles.verificationIconContainer}>
                  <Animated.View style={[styles.verificationIconCircle, { transform: [{ scale: pulseAnim }] }]}>
                    <Ionicons name="mail-unread-outline" size={dynamicStyles.iconSize * 2} color={COLORS.primary} />
                  </Animated.View>
                </View>

                <Text style={styles.verificationSubtitle}>
                  Enter the code sent to
                </Text>
                <Text style={styles.verificationEmail}>{email.trim().toLowerCase()}</Text>

                <View style={styles.codeContainer}>
                  {verificationCode.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => (codeInputRefs.current[index] = ref)}
                      style={[
                        styles.codeInput,
                        digit ? styles.codeInputFilled : {},
                        {
                          fontSize: dynamicStyles.input.fontSize,
                          width: responsive({ mobile: sp(44), tablet: sp(50), desktop: sp(54) }),
                          height: responsive({ mobile: sp(52), tablet: sp(58), desktop: sp(62) }),
                        }
                      ]}
                      value={digit}
                      onChangeText={(text) => handleCodeChange(text, index)}
                      onKeyPress={(e) => handleCodeKeyPress(e, index)}
                      keyboardType="number-pad"
                      maxLength={index === 0 ? 6 : 1}
                      selectTextOnFocus
                      autoFocus={index === 0}
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, dynamicStyles.button, (isLoading || verificationCode.join('').length !== 6) && styles.buttonDisabled]}
                  onPress={handleVerifyCode}
                  disabled={isLoading || verificationCode.join('').length !== 6}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.buttonText} />
                  ) : (
                    <>
                      <Ionicons name="shield-checkmark-outline" size={dynamicStyles.iconSize} color={COLORS.buttonText} style={{ marginRight: 8 }} />
                      <Text style={[styles.primaryButtonText, dynamicStyles.buttonText, { marginRight: 0 }]}>Verify Code</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.resendContainer}>
                  <Text style={styles.resendText}>Didn't receive the code? </Text>
                  {resendTimer > 0 ? (
                    <Text style={styles.resendTimer}>Resend in {resendTimer}s</Text>
                  ) : (
                    <TouchableOpacity onPress={handleResendCode} disabled={isLoading}>
                      <Text style={styles.resendLink}>{isLoading ? 'Sending...' : 'Resend Code'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            {/* Step 3: New Password */}
            {step === 3 && (
              <>
                <View style={styles.successBadge}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={styles.successBadgeText}>Email verified successfully</Text>
                </View>

                {/* New Password */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, dynamicStyles.label]}>New Password *</Text>
                  <View style={[styles.inputWrapper, pwTouched.password && pwErrors.password && styles.inputError]}>
                    <Ionicons name="lock-closed-outline" size={dynamicStyles.iconSize} color={pwTouched.password && pwErrors.password ? COLORS.error : COLORS.textSecondary} />
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                      placeholder="Create a new password"
                      placeholderTextColor={COLORS.textSecondary}
                      value={pwValues.password}
                      onChangeText={(text) => pwHandleChange('password', text)}
                      onBlur={() => pwHandleBlur('password')}
                      secureTextEntry={!showPassword}
                      autoFocus
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={dynamicStyles.iconSize}
                        color={COLORS.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                  {pwTouched.password && pwErrors.password && (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                      <Text style={styles.errorText}>{pwErrors.password}</Text>
                    </View>
                  )}

                  {/* Password Strength */}
                  {pwValues.password.length > 0 && (
                    <View style={styles.strengthContainer}>
                      <View style={styles.strengthBar}>
                        <View
                          style={[
                            styles.strengthFill,
                            { width: `${passwordStrength.percentage}%`, backgroundColor: passwordStrength.color }
                          ]}
                        />
                      </View>
                      <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                        {passwordStrength.label}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Confirm New Password */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, dynamicStyles.label]}>Confirm New Password *</Text>
                  <View style={[styles.inputWrapper, pwTouched.confirmPassword && pwErrors.confirmPassword && styles.inputError]}>
                    <Ionicons name="lock-closed-outline" size={dynamicStyles.iconSize} color={pwTouched.confirmPassword && pwErrors.confirmPassword ? COLORS.error : COLORS.textSecondary} />
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                      placeholder="Confirm your new password"
                      placeholderTextColor={COLORS.textSecondary}
                      value={pwValues.confirmPassword}
                      onChangeText={(text) => pwHandleChange('confirmPassword', text)}
                      onBlur={() => pwHandleBlur('confirmPassword')}
                      secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                      <Ionicons
                        name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={dynamicStyles.iconSize}
                        color={COLORS.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                  {pwTouched.confirmPassword && pwErrors.confirmPassword && (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                      <Text style={styles.errorText}>{pwErrors.confirmPassword}</Text>
                    </View>
                  )}
                </View>

                {/* Password Requirements */}
                <View style={styles.requirements}>
                  <Text style={styles.requirementsTitle}>Password must contain:</Text>
                  <RequirementItem text="At least 8 characters" met={pwValues.password.length >= 8} />
                  <RequirementItem text="One uppercase letter" met={/[A-Z]/.test(pwValues.password)} />
                  <RequirementItem text="One lowercase letter" met={/[a-z]/.test(pwValues.password)} />
                  <RequirementItem text="One number" met={/\d/.test(pwValues.password)} />
                  <RequirementItem text="One special character" met={/[!@#$%^&*(),.?":{}|<>]/.test(pwValues.password)} />
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, dynamicStyles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleResetPassword}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.buttonText} />
                  ) : (
                    <>
                      <Ionicons name="key-outline" size={dynamicStyles.iconSize} color={COLORS.buttonText} style={{ marginRight: 8 }} />
                      <Text style={[styles.primaryButtonText, dynamicStyles.buttonText, { marginRight: 0 }]}>Reset Password</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Back to Login */}
            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>Remember your password? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

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
    </KeyboardAvoidingView>
  );
};

const RequirementItem = ({ text, met }) => (
  <View style={styles.requirementItem}>
    <Ionicons
      name={met ? 'checkmark-circle' : 'ellipse-outline'}
      size={16}
      color={met ? COLORS.success : COLORS.textSecondary}
    />
    <Text style={[styles.requirementText, met && styles.requirementMet]}>{text}</Text>
  </View>
);

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backButton: {
    position: 'absolute',
    left: 12,
    top: Platform.OS === 'web' ? 12 : 8,
    zIndex: 20,
    padding: 6,
    borderRadius: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 20,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  // Progress Steps
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  progressStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressStepActive: {
    backgroundColor: COLORS.primary,
  },
  progressStepText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  progressStepTextActive: {
    color: COLORS.surface,
  },
  progressLine: {
    width: 50,
    height: 2,
    backgroundColor: COLORS.border,
    marginHorizontal: 6,
  },
  progressLineActive: {
    backgroundColor: COLORS.primary,
  },
  // Form
  form: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    marginLeft: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingLeft: 2,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight + '12',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 10,
  },
  primaryButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  // Verification
  verificationIconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  verificationIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  verificationEmail: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 24,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  codeInput: {
    width: 46,
    height: 54,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  codeInputFilled: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight + '10',
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  resendText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  resendTimer: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  resendLink: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  // Success badge
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  successBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.success,
  },
  // Password strength
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    marginRight: 8,
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Requirements
  requirements: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  requirementsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  requirementText: {
    marginLeft: 8,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  requirementMet: {
    color: COLORS.success,
  },
  // Login link
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  loginLink: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ForgotPasswordScreen;
