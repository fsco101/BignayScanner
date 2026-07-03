// Login Screen
// Modern login interface with validation

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
  Image,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import FirebaseAuthService from '../../services/FirebaseAuthService';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';
import { useFormValidation, rules } from '../../utils/validation';
import slideshowImages from '../../../slideshow';
import { useThemeColors } from '../../context/ThemeContext';

const SLIDE_INFO = [
  { title: 'The Bignay Berry', subtitle: 'A Philippine superfruit rich in antioxidants, Vitamin C, and anthocyanins — used in traditional medicine for centuries' },
  { title: 'Unripe to Ripe', subtitle: 'Green berries make tangy juice & tea · Red berries are perfect for fresh eating & jam · Dark purple yields premium wine & vinegar' },
  { title: 'Bignay Leaf Benefits', subtitle: 'Dried leaves brew into herbal tea that supports digestion, kidney health, and cholesterol management' },
  { title: 'Products & Livelihood', subtitle: 'Wine, jam, jelly, vinegar, dried tea leaves — Bignay transforms into valuable products at every ripeness stage' },
  { title: 'Why Bignay Matters', subtitle: 'Boosts local farming income, promotes biodiversity, and provides natural health remedies to Filipino communities' },
];


const LoginScreen = ({ navigation }) => {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { login, loginWithGoogle } = useAuth();
  const { alertConfig, showSuccess, showError, showWarning, hideAlert } = useSweetAlert();
  
  // Use responsive hook for dynamic sizing
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
  
  // Dynamic responsive styles
  const dynamicStyles = useMemo(() => ({
    scrollContent: {
      flexGrow: 1,
      padding: responsive({ mobile: sp(20), tablet: sp(32), desktop: sp(40) }),
      justifyContent: 'center',
      alignItems: isDesktop ? 'center' : 'stretch',
    },
    formContainer: {
      width: isDesktop ? Math.min(wp(400), maxContentWidth * 0.4) : '100%',
      maxWidth: 480,
    },
    header: {
      marginBottom: responsive({ mobile: sp(32), tablet: sp(40), desktop: sp(48) }),
    },
    logoContainer: {
      width: responsive({ mobile: sp(80), tablet: sp(100), desktop: sp(110) }),
      height: responsive({ mobile: sp(80), tablet: sp(100), desktop: sp(110) }),
      borderRadius: responsive({ mobile: sp(40), tablet: sp(50), desktop: sp(55) }),
    },
    title: {
      fontSize: responsive({ mobile: fp(26), tablet: fp(30), desktop: fp(32) }),
    },
    subtitle: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(16), desktop: fp(17) }),
    },
    form: {
      padding: responsive({ mobile: sp(20), tablet: sp(28), desktop: sp(32) }),
      borderRadius: responsive({ mobile: sp(14), tablet: sp(18), desktop: sp(20) }),
    },
    label: {
      fontSize: responsive({ mobile: fp(13), tablet: fp(14), desktop: fp(15) }),
    },
    input: {
      fontSize: responsive({ mobile: fp(15), tablet: fp(16), desktop: fp(17) }),
      paddingVertical: responsive({ mobile: sp(12), tablet: sp(14), desktop: sp(16) }),
    },
    buttonText: {
      fontSize: responsive({ mobile: fp(15), tablet: fp(16), desktop: fp(17) }),
    },
    button: {
      paddingVertical: responsive({ mobile: sp(14), tablet: sp(16), desktop: sp(18) }),
      borderRadius: responsive({ mobile: sp(10), tablet: sp(12), desktop: sp(14) }),
    },
    footerText: {
      fontSize: responsive({ mobile: fp(11), tablet: fp(12), desktop: fp(13) }),
    },
  }), [screenWidth, isMobile, isTablet, isDesktop, sp, fp, wp, responsive, maxContentWidth]);

  // Slideshow state
  const [currentSlide, setCurrentSlide] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideTimer = useRef(null);

  useEffect(() => {
    if (isMobile) return;
    slideTimer.current = setInterval(() => {
      // Fade out
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: false }).start(() => {
        setCurrentSlide(prev => (prev + 1) % slideshowImages.length);
        // Fade in
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
      });
    }, 5000);
    return () => { if (slideTimer.current) clearInterval(slideTimer.current); };
  }, [isMobile, fadeAnim]);
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const { values, errors, touched, handleChange, handleBlur, validate, resetForm } = useFormValidation(
    { email: '', password: '' },
    {
      email: [rules.required('Email'), rules.email()],
      password: [rules.required('Password')],
    }
  );

  // Format suspension end date for display
  const formatSuspensionEnd = (endDate) => {
    if (!endDate) return 'Permanent';
    const date = new Date(endDate);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleLogin = async () => {
    if (!validate()) return;
    
    setIsLoading(true);
    try {
      const result = await login(values.email.trim().toLowerCase(), values.password);
      
      if (result.ok) {
        showSuccess('Welcome Back!', `Hello, ${result.user?.first_name || 'User'}! You have successfully logged in.`, {
          autoClose: 1500,
          onConfirm: () => {
            // Navigate to main screen instead of goBack to avoid navigation error
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              });
            }
          },
        });
        // Also navigate after autoClose
        setTimeout(() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main' }],
            });
          }
        }, 1600);
      } else {
        // Check if this is a suspension error (backend returns suspension object)
        if (result.suspension) {
          const suspensionEnd = result.suspension.end 
            ? formatSuspensionEnd(result.suspension.end)
            : 'Permanent Ban';
          
          showWarning(
            '⚠️ Account Suspended',
            `Your account has been suspended.\n\n Account: ${values.email.trim().toLowerCase()}\n\n Reason: ${result.suspension.reason || 'Violation of community guidelines'}\n\n Suspension ends: ${suspensionEnd}\n\nIf you believe this is a mistake, please contact support.`,
            { 
              confirmText: 'I Understand',
              closeOnOverlayPress: false,
            }
          );
        } else if (result.errors) {
          showError('Login Failed', result.errors.join('\n'));
        } else {
          showError('Login Failed', result.error || 'Invalid credentials. Please try again.');
        }
      }
    } catch (error) {
      showError('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!FirebaseAuthService.isConfigured()) {
      showWarning(
        'Google Sign-In Not Configured',
        'Please configure Firebase and Google OAuth credentials to use this feature.'
      );
      return;
    }

    setIsGoogleLoading(true);
    try {
      const result = await FirebaseAuthService.signInWithGoogle();
      
      if (result.ok) {
        // Store token and user in AuthContext
        await loginWithGoogle(result.token, result.user);
        
        showSuccess('Welcome Back!', `Hello, ${result.user?.first_name || 'User'}! You have successfully logged in with Google.`, {
          autoClose: 1500,
        });
        // Navigate back to main app after successful login
        setTimeout(() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main' }],
            });
          }
        }, 1600);
      } else {
        // Check if user needs to register first
        if (result.needsRegistration) {
          const googleData = result.googleData || {};
          showWarning(
            'Account Not Found',
            'No account is registered with this Google email. You will be redirected to complete registration.',
            {
              confirmText: 'Go to Registration',
              onConfirm: () => {
                hideAlert();
                navigation.navigate('Register', {
                  googleData: {
                    email: googleData.email || '',
                    firstName: googleData.firstName || '',
                    lastName: googleData.lastName || '',
                    profileImage: googleData.profileImage || '',
                    firebaseUid: googleData.firebaseUid || '',
                    googleId: googleData.googleId || '',
                    provider: googleData.provider || 'google',
                  },
                });
              },
            }
          );
        // Check if this is a suspension error (backend returns suspension object)
        } else if (result.suspension) {
          const suspensionEnd = result.suspension.end 
            ? formatSuspensionEnd(result.suspension.end)
            : 'Permanent Ban';
          
          showWarning(
            '⚠️ Account Suspended',
            `Your account has been suspended.\n\n📋 Reason: ${result.suspension.reason || 'Violation of community guidelines'}\n\n⏰ Suspension ends: ${suspensionEnd}\n\nIf you believe this is a mistake, please contact support.`,
            { 
              confirmText: 'I Understand',
              closeOnOverlayPress: false,
            }
          );
        } else {
          showError('Google Sign-In Failed', result.error || 'Could not sign in with Google');
        }
      }
    } catch (error) {
      console.error('Google login error:', error);
      showError('Error', 'An unexpected error occurred during Google sign-in.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.splitLayout, !isMobile && styles.splitLayoutRow]}>
        {/* Left - Slideshow Panel (desktop/tablet only) */}
        {!isMobile && (
          <View style={styles.slideshowPanel}>
            <Animated.Image
              source={slideshowImages[currentSlide]}
              style={[styles.slideshowImage, { opacity: fadeAnim }]}
              resizeMode="cover"
            />
            <View style={styles.slideshowOverlay}>
              <View style={styles.slideshowContent}>
                {/* <Text style={styles.slideshowBrand}>🍇 Bignay</Text> */}
                <Animated.View style={{ opacity: fadeAnim }}>
                  <Text style={styles.slideshowTitle}>{SLIDE_INFO[currentSlide].title}</Text>
                  <Text style={styles.slideshowSubtitle}>{SLIDE_INFO[currentSlide].subtitle}</Text>
                </Animated.View>
                <View style={styles.slideDots}>
                  {slideshowImages.map((_, idx) => (
                    <View
                      key={idx}
                      style={[styles.slideDot, idx === currentSlide && styles.slideDotActive]}
                    />
                  ))}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Right - Form */}
        <KeyboardAvoidingView
          style={styles.formPanel}
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
                if (navigation?.canGoBack && navigation.canGoBack()) navigation.goBack();
                else navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
              }}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={responsive({ mobile: sp(18), tablet: sp(20), desktop: sp(22) })} color={COLORS.primary} />
            </TouchableOpacity>
            <View style={[styles.logoContainer, dynamicStyles.logoContainer]}>
              <Image
                source={require('../../../assets/bignay-logo.png')}
                style={{
                  width: responsive({ mobile: sp(70), tablet: sp(90), desktop: sp(100) }),
                  height: responsive({ mobile: sp(70), tablet: sp(90), desktop: sp(100) }),
                  borderRadius: responsive({ mobile: sp(35), tablet: sp(45), desktop: sp(50) }),
                }}
                resizeMode="cover"
              />
            </View>
            <Text style={[styles.title, dynamicStyles.title]}>Welcome Back</Text>
            <Text style={[styles.subtitle, dynamicStyles.subtitle]}>Sign in to continue to Bignay</Text>
          </View>

          {/* Form */}
          <View style={[styles.form, dynamicStyles.form]}>
            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, dynamicStyles.label]}>Email</Text>
              <View style={[styles.inputWrapper, touched.email && errors.email && styles.inputError]}>
                <Ionicons name="mail-outline" size={sp(20)} color={touched.email && errors.email ? COLORS.error : COLORS.textSecondary} />
                <TextInput
                  style={[styles.input, dynamicStyles.input]}
                  placeholder="Enter your email"
                  placeholderTextColor={COLORS.textSecondary}
                  value={values.email}
                  onChangeText={(text) => handleChange('email', text)}
                  onBlur={() => handleBlur('email')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {touched.email && errors.email && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                  <Text style={styles.errorText}>{errors.email}</Text>
                </View>
              )}
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, dynamicStyles.label]}>Password</Text>
              <View style={[styles.inputWrapper, touched.password && errors.password && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={sp(20)} color={touched.password && errors.password ? COLORS.error : COLORS.textSecondary} />
                <TextInput
                  style={[styles.input, dynamicStyles.input]}
                  placeholder="Enter your password"
                  placeholderTextColor={COLORS.textSecondary}
                  value={values.password}
                  onChangeText={(text) => handleChange('password', text)}
                  onBlur={() => handleBlur('password')}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={sp(20)}
                    color={COLORS.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {touched.password && errors.password && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                  <Text style={styles.errorText}>{errors.password}</Text>
                </View>
              )}
            </View>

            {/* Forgot Password Link */}
            <TouchableOpacity
              style={styles.forgotPasswordContainer}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Ionicons name="key-outline" size={14} color={COLORS.primary} />
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, dynamicStyles.button, isLoading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoading || isGoogleLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.buttonText} />
              ) : (
                <Text style={[styles.loginButtonText, dynamicStyles.buttonText]}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            {/* Google Sign-In Button */}
            <TouchableOpacity
              style={[styles.googleButton, dynamicStyles.button, isGoogleLoading && styles.loginButtonDisabled]}
              onPress={handleGoogleLogin}
              disabled={isLoading || isGoogleLoading}
            >
              {isGoogleLoading ? (
                <ActivityIndicator color={COLORS.buttonText} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={sp(20)} color={COLORS.buttonText} style={styles.googleIcon} />
                  <Text style={[styles.googleButtonText, dynamicStyles.buttonText]}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Register Link */}
            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.registerLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, dynamicStyles.footerText]}>By signing in, you agree to our</Text>
            <View style={styles.footerLinks}>
              <TouchableOpacity onPress={() => navigation.navigate('TermsAndConditions')}>
                <Text style={[styles.footerLink, dynamicStyles.footerText]}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={[styles.footerText, dynamicStyles.footerText]}> and </Text>
              <TouchableOpacity onPress={() => navigation.navigate('TermsAndConditions')}>
                <Text style={[styles.footerLink, dynamicStyles.footerText]}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* SweetAlert Component */}
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
  );
};

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  splitLayout: {
    flex: 1,
  },
  splitLayoutRow: {
    flexDirection: 'row',
  },
  slideshowPanel: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
    overflow: 'hidden',
    position: 'relative',
  },
  slideshowImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  slideshowOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(27, 94, 32, 0.65)',
    justifyContent: 'flex-end',
    padding: 40,
  },
  slideshowContent: {
    maxWidth: 420,
  },
  slideshowBrand: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.surface,
    marginBottom: 16,
    letterSpacing: 1,
  },
  slideshowTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.surface,
    marginBottom: 12,
    lineHeight: 40,
  },
  slideshowSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 24,
    marginBottom: 24,
  },
  slideDots: {
    flexDirection: 'row',
    gap: 8,
  },
  slideDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  slideDotActive: {
    backgroundColor: COLORS.surface,
    width: 24,
  },
  formPanel: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    left: 12,
    top: Platform.OS === 'web' ? 12 : 8,
    zIndex: 20,
    padding: 6,
    borderRadius: 8,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
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
    marginBottom: 20,
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
  loginButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  googleButton: {
    backgroundColor: COLORS.google,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  registerText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  registerLink: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  forgotPasswordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
    marginTop: -8,
    gap: 6,
  },
  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 40,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  footerLinks: {
    flexDirection: 'row',
    marginTop: 4,
  },
  footerLink: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '500',
  },
});

export default LoginScreen;
