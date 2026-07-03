// Registration Screen
// Modern registration with field validation and email verification

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
  Modal,
  Image,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';
import { useFormValidation, rules, getPasswordStrength as calcPasswordStrength } from '../../utils/validation';
import AuthService from '../../services/AuthService';
import slideshowImages from '../../../slideshow';
import { useThemeColors } from '../../context/ThemeContext';
import * as Location from 'expo-location';
import {
  getRegions,
  getProvinces,
  getCities,
  getBarangays,
  findRegionByName,
  findProvinceByName,
  findCityByName,
  findBarangayByName,
  composeFullAddress,
} from '../../data/philippineLocations';

const SLIDE_INFO = [
  { title: 'The Bignay Berry', subtitle: 'A Philippine superfruit rich in antioxidants, Vitamin C, and anthocyanins — used in traditional medicine for centuries' },
  { title: 'Unripe to Ripe', subtitle: 'Green berries make tangy juice & tea · Red berries are perfect for fresh eating & jam · Dark purple yields premium wine & vinegar' },
  { title: 'Bignay Leaf Benefits', subtitle: 'Dried leaves brew into herbal tea that supports digestion, kidney health, and cholesterol management' },
  { title: 'Products & Livelihood', subtitle: 'Wine, jam, jelly, vinegar, dried tea leaves — Bignay transforms into valuable products at every ripeness stage' },
  { title: 'Why Bignay Matters', subtitle: 'Boosts local farming income, promotes biodiversity, and provides natural health remedies to Filipino communities' },
];


const RegisterScreen = ({ navigation, route }) => {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { register } = useAuth();
  const { alertConfig, showSuccess, showError, hideAlert } = useSweetAlert();
  
  // Google pre-fill data from navigation params
  const googleData = route?.params?.googleData || null;
  const isGoogleRegistration = !!googleData;
  
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
      width: isDesktop ? Math.min(wp(450), maxContentWidth * 0.45) : '100%',
      maxWidth: 520,
    },
    header: {
      marginBottom: responsive({ mobile: sp(24), tablet: sp(32), desktop: sp(40) }),
    },
    logoContainer: {
      width: responsive({ mobile: sp(70), tablet: sp(90), desktop: sp(100) }),
      height: responsive({ mobile: sp(70), tablet: sp(90), desktop: sp(100) }),
      borderRadius: responsive({ mobile: sp(35), tablet: sp(45), desktop: sp(50) }),
    },
    title: {
      fontSize: responsive({ mobile: fp(24), tablet: fp(28), desktop: fp(30) }),
    },
    subtitle: {
      fontSize: responsive({ mobile: fp(13), tablet: fp(15), desktop: fp(16) }),
    },
    form: {
      padding: responsive({ mobile: sp(18), tablet: sp(24), desktop: sp(28) }),
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

  // Slideshow state
  const [currentSlide, setCurrentSlide] = useState(0);
  const slideFadeAnim = useRef(new Animated.Value(1)).current;
  const slideTimerRef = useRef(null);

  useEffect(() => {
    if (isMobile) return;
    slideTimerRef.current = setInterval(() => {
      Animated.timing(slideFadeAnim, { toValue: 0, duration: 400, useNativeDriver: false }).start(() => {
        setCurrentSlide(prev => (prev + 1) % slideshowImages.length);
        Animated.timing(slideFadeAnim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
      });
    }, 5000);
    return () => { if (slideTimerRef.current) clearInterval(slideTimerRef.current); };
  }, [isMobile, slideFadeAnim]);
  
  const {
    values, errors, touched, handleChange, handleBlur,
    validateField: validateSingleField, resetForm,
  } = useFormValidation(
    {
      firstName: googleData?.firstName || '',
      lastName: googleData?.lastName || '',
      email: googleData?.email || '',
      phone: '',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      password: '',
      confirmPassword: '',
    },
    {
      firstName: [rules.required('First name'), rules.minLength(2, 'First name')],
      lastName: [rules.required('Last name'), rules.minLength(2, 'Last name')],
      email: [rules.required('Email'), rules.email()],
      phone: [rules.phonePH()],
      address: [],
      city: [],
      province: [],
      postalCode: [],
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

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  // Structured address state (cascading dropdowns like ProfileScreen)
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedProvince, setSelectedProvince] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedBarangay, setSelectedBarangay] = useState(null);
  const [houseNumber, setHouseNumber] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [landmark, setLandmark] = useState('');

  // Picker modals
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showProvincePicker, setShowProvincePicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showBarangayPicker, setShowBarangayPicker] = useState(false);

  // Derived location lists
  const regionsList = useMemo(() => getRegions(), []);
  const provincesList = useMemo(() => selectedRegion ? getProvinces(selectedRegion.reg_code) : [], [selectedRegion]);
  const citiesList = useMemo(() => selectedProvince ? getCities(selectedProvince.prov_code) : [], [selectedProvince]);
  const barangaysList = useMemo(() => selectedCity ? getBarangays(selectedCity.mun_code) : [], [selectedCity]);
  
  // Email verification state
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const codeInputRefs = useRef([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Resend timer
  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Pulse animation for verification icon
  useEffect(() => {
    if (step === 3) {
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

  // Auto-detect location and fill address fields
  const handleDetectLocation = async () => {
    setIsDetectingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showError('Permission Denied', 'Location permission is required to auto-detect your address. Please enable it in your device settings.');
        setIsDetectingLocation(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geocode] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      if (geocode) {
        // Fill street/house from geocode
        const streetPart = [geocode.streetNumber, geocode.street].filter(Boolean).join(' ');
        if (streetPart) setStreetAddress(streetPart);
        if (geocode.name && geocode.name !== streetPart) setHouseNumber(geocode.name);
        if (geocode.postalCode) handleChange('postalCode', geocode.postalCode);

        // Try to match region from geocode.region (often province name in PH)
        let matchedRegion = null;
        let matchedProvince = null;
        let matchedCity = null;

        // geocode.region in PH is usually the province
        if (geocode.region) {
          const foundProv = findProvinceByName(geocode.region);
          if (foundProv) {
            matchedProvince = { name: geocode.region, prov_code: foundProv.prov_code };
            // Find its parent region
            const reg = regionsList.find(r => r.reg_code === foundProv.reg_code);
            if (reg) {
              matchedRegion = reg;
              setSelectedRegion(reg);
            }
            setSelectedProvince(matchedProvince);
          }
        }

        // Try to match city from geocode.city or geocode.subregion
        const cityName = geocode.city || geocode.subregion;
        if (cityName && matchedProvince) {
          const foundCity = findCityByName(cityName, matchedProvince.prov_code);
          if (foundCity) {
            matchedCity = { name: cityName, mun_code: foundCity.mun_code };
            setSelectedCity(matchedCity);

            // Try to match barangay from geocode.district
            if (geocode.district) {
              const foundBrgy = findBarangayByName(geocode.district, foundCity.mun_code);
              if (foundBrgy) {
                setSelectedBarangay({ name: geocode.district });
              }
            }
          }
        }

        showSuccess('Location Detected', 'Your address has been auto-filled. Please review and adjust if needed.');
      } else {
        showError('Location Error', 'Could not determine your address from location. Please enter it manually.');
      }
    } catch (err) {
      console.error('Location detection error:', err);
      showError('Location Error', 'Failed to detect location. Please enter your address manually.');
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleCodeChange = (text, index) => {
    const newCode = [...verificationCode];
    // Handle paste of full code
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, 6).split('');
      digits.forEach((digit, i) => {
        if (i < 6) newCode[i] = digit;
      });
      setVerificationCode(newCode);
      const lastIndex = Math.min(digits.length, 5);
      codeInputRefs.current[lastIndex]?.focus();
      return;
    }
    newCode[index] = text.replace(/\D/g, '');
    setVerificationCode(newCode);
    if (text && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
      const newCode = [...verificationCode];
      newCode[index - 1] = '';
      setVerificationCode(newCode);
    }
  };

  const validateStep = (fieldNames) => {
    let isStepValid = true;
    fieldNames.forEach(field => {
      handleBlur(field);
      const error = validateSingleField(field);
      if (error) isStepValid = false;
    });
    return isStepValid;
  };

  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const handleNext = async () => {
    if (!validateStep(['firstName', 'lastName', 'email'])) return;

    // Check if email is already registered
    setIsCheckingEmail(true);
    try {
      const result = await AuthService.checkEmailExists(values.email.trim().toLowerCase());
      if (result.exists) {
        showError('Email Already Registered', 'An account with this email already exists. Please use a different email or sign in.');
        return;
      }
      if (!result.ok) {
        showError('Error', result.error || 'Unable to verify email. Please try again.');
        return;
      }
      setStep(2);
    } catch (error) {
      showError('Error', 'Unable to verify email availability. Please try again.');
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleRegister = async () => {
    if (!validateStep(['password', 'confirmPassword'])) return;
    
    setIsSendingCode(true);
    try {
      // Compose structured address from PH location selections
      const fullAddress = composeFullAddress({
        houseNumber,
        street: streetAddress,
        barangay: selectedBarangay?.name,
        city: selectedCity?.name,
        province: selectedProvince?.name,
        region: selectedRegion?.name,
        postalCode: values.postalCode.trim(),
      });

      const addressStructured = {
        region: selectedRegion?.name || '',
        region_code: selectedRegion?.reg_code || '',
        province: selectedProvince?.name || '',
        province_code: selectedProvince?.prov_code || '',
        city: selectedCity?.name || '',
        city_code: selectedCity?.mun_code || '',
        barangay: selectedBarangay?.name || '',
        house_number: houseNumber.trim(),
        street: streetAddress.trim(),
        landmark: landmark.trim(),
        postal_code: values.postalCode.trim(),
      };

      const registrationData = {
        email: values.email.trim().toLowerCase(),
        password: values.password,
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        phone: values.phone.trim() || undefined,
        address: fullAddress || undefined,
        city: selectedCity?.name || undefined,
        province: selectedProvince?.name || undefined,
        postal_code: values.postalCode.trim() || undefined,
        address_structured: (selectedRegion || houseNumber || streetAddress) ? addressStructured : undefined,
      };

      // Include Google/Firebase linking data if coming from Google login redirect
      if (isGoogleRegistration) {
        if (googleData.googleId) registrationData.google_id = googleData.googleId;
        if (googleData.firebaseUid) registrationData.firebase_uid = googleData.firebaseUid;
        if (googleData.provider) registrationData.auth_provider = googleData.provider === 'google' ? 'google' : `firebase:${googleData.provider}`;
        if (googleData.profileImage) registrationData.profile_image = googleData.profileImage;
      }

      // Send verification code instead of directly registering
      const result = await AuthService.sendVerificationCode(registrationData);
      
      if (result.ok) {
        setStep(3); // Move to verification step
        setResendTimer(60);
        setVerificationCode(['', '', '', '', '', '']);
      } else {
        if (result.errors) {
          showError('Verification Failed', Array.isArray(result.errors) ? result.errors.join('\n') : result.errors);
        } else {
          showError('Verification Failed', result.error || 'Please try again');
        }
      }
    } catch (error) {
      showError('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    const code = verificationCode.join('');
    if (code.length !== 6) {
      showError('Invalid Code', 'Please enter the complete 6-digit verification code.');
      return;
    }

    setIsVerifying(true);
    try {
      const result = await AuthService.verifyCodeAndRegister(
        values.email.trim().toLowerCase(),
        code
      );

      if (result.ok) {
        // Store token and user
        if (result.token) await AuthService.setToken(result.token);
        if (result.user) await AuthService.setUser(result.user);
        
        showSuccess(
          '🎉 Welcome to Bignay!',
          `Congratulations ${values.firstName}! Your email has been verified and account created successfully.`,
          {
            autoClose: 2000,
            onConfirm: () => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Main' }],
                });
              }
            },
          }
        );
        setTimeout(() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main' }],
            });
          }
        }, 2100);
      } else {
        showError('Verification Failed', result.error || 'Invalid verification code');
      }
    } catch (error) {
      showError('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0) return;
    
    setIsSendingCode(true);
    try {
      const result = await AuthService.sendVerificationCode({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        phone: values.phone.trim() || undefined,
        address: values.address.trim() || undefined,
        city: values.city.trim() || undefined,
        province: values.province.trim() || undefined,
        postal_code: values.postalCode.trim() || undefined,
      });
      
      if (result.ok) {
        setResendTimer(60);
        setVerificationCode(['', '', '', '', '', '']);
        showSuccess('Code Sent', 'A new verification code has been sent to your email.');
      } else {
        showError('Failed', result.error || 'Could not resend code. Please try again.');
      }
    } catch (error) {
      showError('Error', 'Failed to resend code.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const passwordStrength = calcPasswordStrength(values.password);

  return (
    <View style={styles.container}>
      <View style={[styles.splitLayout, !isMobile && styles.splitLayoutRow]}>
        {/* Left - Slideshow Panel (desktop/tablet only) */}
        {!isMobile && (
          <View style={styles.slideshowPanel}>
            <Animated.Image
              source={slideshowImages[currentSlide]}
              style={[styles.slideshowImage, { opacity: slideFadeAnim }]}
              resizeMode="cover"
            />
            <View style={styles.slideshowOverlay}>
              <View style={styles.slideshowContent}>
                <Animated.View style={{ opacity: slideFadeAnim }}>
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
            <Text style={[styles.title, dynamicStyles.title]}>Create Account</Text>
            <Text style={[styles.subtitle, dynamicStyles.subtitle]}>
              {step === 1 ? 'Enter your personal information' : step === 2 ? 'Set up your password' : 'Verify your email address'}
            </Text>
          </View>

          {/* Progress Indicator */}
          <View style={styles.progressContainer}>
          <View style={[styles.progressDot, step >= 1 && styles.progressDotActive]} />
          <View style={[styles.progressLine, step >= 2 && styles.progressLineActive]} />
          <View style={[styles.progressDot, step >= 2 && styles.progressDotActive]} />
          <View style={[styles.progressLine, step >= 3 && styles.progressLineActive]} />
          <View style={[styles.progressDot, step >= 3 && styles.progressDotActive]} />
        </View>

          {/* Form */}
          <View style={[styles.form, dynamicStyles.form]}>
            {step === 1 ? (
              <>
                {/* Google Registration Banner */}
                {isGoogleRegistration && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary + '15', padding: 12, borderRadius: 10, marginBottom: 16, gap: 10 }}>
                    <Ionicons name="logo-google" size={20} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.primary }}>Google Account Detected</Text>
                      <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>Complete registration to create your account. Set a password for alternative login.</Text>
                    </View>
                  </View>
                )}
                {/* First Name */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, dynamicStyles.label]}>First Name *</Text>
                  <View style={[styles.inputWrapper, touched.firstName && errors.firstName && styles.inputError]}>
                    <Ionicons name="person-outline" size={dynamicStyles.iconSize} color={touched.firstName && errors.firstName ? COLORS.error : COLORS.textSecondary} />
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                      placeholder="Enter your first name"
                      placeholderTextColor={COLORS.textSecondary}
                      value={values.firstName}
                      onChangeText={(text) => handleChange('firstName', text)}
                      onBlur={() => handleBlur('firstName')}
                      autoCapitalize="words"
                    />
                  </View>
                  {touched.firstName && errors.firstName && (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                      <Text style={styles.errorText}>{errors.firstName}</Text>
                    </View>
                  )}
                </View>

                {/* Last Name */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, dynamicStyles.label]}>Last Name *</Text>
                  <View style={[styles.inputWrapper, touched.lastName && errors.lastName && styles.inputError]}>
                    <Ionicons name="person-outline" size={dynamicStyles.iconSize} color={touched.lastName && errors.lastName ? COLORS.error : COLORS.textSecondary} />
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                      placeholder="Enter your last name"
                      placeholderTextColor={COLORS.textSecondary}
                      value={values.lastName}
                      onChangeText={(text) => handleChange('lastName', text)}
                      onBlur={() => handleBlur('lastName')}
                      autoCapitalize="words"
                    />
                  </View>
                  {touched.lastName && errors.lastName && (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                      <Text style={styles.errorText}>{errors.lastName}</Text>
                    </View>
                  )}
                </View>

                {/* Email */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, dynamicStyles.label]}>Email *</Text>
                  <View style={[styles.inputWrapper, touched.email && errors.email && styles.inputError, isGoogleRegistration && { opacity: 0.7, backgroundColor: COLORS.surfaceVariant }]}>
                    <Ionicons name="mail-outline" size={dynamicStyles.iconSize} color={touched.email && errors.email ? COLORS.error : COLORS.textSecondary} />
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
                      editable={!isGoogleRegistration}
                    />
                    {isGoogleRegistration && (
                      <Ionicons name="lock-closed" size={16} color={COLORS.textSecondary} />
                    )}
                  </View>
                  {isGoogleRegistration && (
                    <Text style={{ fontSize: 11, color: COLORS.primary, marginTop: 4 }}>
                      Email verified via Google
                    </Text>
                  )}
                  {touched.email && errors.email && (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                      <Text style={styles.errorText}>{errors.email}</Text>
                    </View>
                  )}
                </View>

                {/* Phone (Optional) */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, dynamicStyles.label]}>Phone Number (Optional)</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="call-outline" size={dynamicStyles.iconSize} color={touched.phone && errors.phone ? COLORS.error : COLORS.textSecondary} />
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                    placeholder="e.g., 09171234567"
                    placeholderTextColor={COLORS.textSecondary}
                    value={values.phone}
                    onChangeText={(text) => handleChange('phone', text)}
                    onBlur={() => handleBlur('phone')}
                    keyboardType="phone-pad"
                  />
                </View>
                {touched.phone && errors.phone && (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                    <Text style={styles.errorText}>{errors.phone}</Text>
                  </View>
                )}
              </View>

              {/* Address Section */}
              <View style={styles.addressSectionHeader}>
                <Text style={[styles.label, dynamicStyles.label, { marginBottom: 0 }]}>Address (Optional)</Text>
                <TouchableOpacity
                  style={styles.detectLocationBtn}
                  onPress={handleDetectLocation}
                  disabled={isDetectingLocation}
                >
                  {isDetectingLocation ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <>
                      <Ionicons name="locate-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.detectLocationText}>Use My Location</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Region Dropdown */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, dynamicStyles.label]}>Region</Text>
                <TouchableOpacity
                  style={styles.dropdownBtn}
                  onPress={() => setShowRegionPicker(true)}
                >
                  <Text style={selectedRegion ? styles.dropdownText : styles.dropdownPlaceholder}>
                    {selectedRegion?.name || 'Select region'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Province Dropdown */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, dynamicStyles.label]}>Province</Text>
                <TouchableOpacity
                  style={[styles.dropdownBtn, !selectedRegion && styles.dropdownDisabled]}
                  onPress={() => selectedRegion && setShowProvincePicker(true)}
                  disabled={!selectedRegion}
                >
                  <Text style={selectedProvince ? styles.dropdownText : styles.dropdownPlaceholder}>
                    {selectedProvince?.name || 'Select province'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* City / Municipality Dropdown */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, dynamicStyles.label]}>City / Municipality</Text>
                <TouchableOpacity
                  style={[styles.dropdownBtn, !selectedProvince && styles.dropdownDisabled]}
                  onPress={() => selectedProvince && setShowCityPicker(true)}
                  disabled={!selectedProvince}
                >
                  <Text style={selectedCity ? styles.dropdownText : styles.dropdownPlaceholder}>
                    {selectedCity?.name || 'Select city'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Barangay Dropdown */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, dynamicStyles.label]}>Barangay</Text>
                <TouchableOpacity
                  style={[styles.dropdownBtn, !selectedCity && styles.dropdownDisabled]}
                  onPress={() => selectedCity && setShowBarangayPicker(true)}
                  disabled={!selectedCity}
                >
                  <Text style={selectedBarangay ? styles.dropdownText : styles.dropdownPlaceholder}>
                    {selectedBarangay?.name || 'Select barangay'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* House/Unit & Street */}
              <View style={styles.addressRow}>
                <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                  <Text style={[styles.label, dynamicStyles.label]}>House/Unit No.</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="home-outline" size={dynamicStyles.iconSize} color={COLORS.textSecondary} />
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                      placeholder="e.g., 123"
                      placeholderTextColor={COLORS.textSecondary}
                      value={houseNumber}
                      onChangeText={setHouseNumber}
                    />
                  </View>
                </View>
                <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                  <Text style={[styles.label, dynamicStyles.label]}>Street</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="navigate-outline" size={dynamicStyles.iconSize} color={COLORS.textSecondary} />
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                      placeholder="e.g., Rizal St."
                      placeholderTextColor={COLORS.textSecondary}
                      value={streetAddress}
                      onChangeText={setStreetAddress}
                    />
                  </View>
                </View>
              </View>

              {/* Landmark & Postal Code */}
              <View style={styles.addressRow}>
                <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                  <Text style={[styles.label, dynamicStyles.label]}>Landmark</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="flag-outline" size={dynamicStyles.iconSize} color={COLORS.textSecondary} />
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                      placeholder="Near..."
                      placeholderTextColor={COLORS.textSecondary}
                      value={landmark}
                      onChangeText={setLandmark}
                    />
                  </View>
                </View>
                <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                  <Text style={[styles.label, dynamicStyles.label]}>Postal Code</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="mail-open-outline" size={dynamicStyles.iconSize} color={COLORS.textSecondary} />
                    <TextInput
                      style={[styles.input, dynamicStyles.input]}
                      placeholder="e.g., 4217"
                      placeholderTextColor={COLORS.textSecondary}
                      value={values.postalCode}
                      onChangeText={(text) => handleChange('postalCode', text)}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  </View>
                </View>
              </View>

              {/* Next Button */}
              <TouchableOpacity
                style={[styles.primaryButton, dynamicStyles.button, isCheckingEmail && styles.buttonDisabled]}
                onPress={handleNext}
                disabled={isCheckingEmail}
              >
                {isCheckingEmail ? (
                  <ActivityIndicator color={COLORS.buttonText} />
                ) : (
                  <>
                    <Text style={[styles.primaryButtonText, dynamicStyles.buttonText]}>Next</Text>
                    <Ionicons name="arrow-forward" size={dynamicStyles.iconSize} color={COLORS.buttonText} />
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : step === 2 ? (
            <>
              {/* Password */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, dynamicStyles.label]}>Password *</Text>
                <View style={[styles.inputWrapper, touched.password && errors.password && styles.inputError]}>
                  <Ionicons name="lock-closed-outline" size={dynamicStyles.iconSize} color={touched.password && errors.password ? COLORS.error : COLORS.textSecondary} />
                  <TextInput
                    style={[styles.input, dynamicStyles.input]}
                    placeholder="Create a password"
                    placeholderTextColor={COLORS.textSecondary}
                    value={values.password}
                    onChangeText={(text) => handleChange('password', text)}
                    onBlur={() => handleBlur('password')}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={dynamicStyles.iconSize}
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
                
                {/* Password Strength Indicator */}
                {values.password.length > 0 && (
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

              {/* Confirm Password */}
              <View style={styles.inputContainer}>
                <Text style={[styles.label, dynamicStyles.label]}>Confirm Password *</Text>
                <View style={[styles.inputWrapper, touched.confirmPassword && errors.confirmPassword && styles.inputError]}>
                  <Ionicons name="lock-closed-outline" size={dynamicStyles.iconSize} color={touched.confirmPassword && errors.confirmPassword ? COLORS.error : COLORS.textSecondary} />
                  <TextInput
                    style={[styles.input, dynamicStyles.input]}
                    placeholder="Confirm your password"
                    placeholderTextColor={COLORS.textSecondary}
                    value={values.confirmPassword}
                    onChangeText={(text) => handleChange('confirmPassword', text)}
                    onBlur={() => handleBlur('confirmPassword')}
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
                {touched.confirmPassword && errors.confirmPassword && (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                    <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                  </View>
                )}
              </View>

              {/* Password Requirements */}
              <View style={styles.requirements}>
                <Text style={styles.requirementsTitle}>Password must contain:</Text>
                <RequirementItem text="At least 8 characters" met={values.password.length >= 8} colors={COLORS} itemStyles={styles} />
                <RequirementItem text="One uppercase letter" met={/[A-Z]/.test(values.password)} colors={COLORS} itemStyles={styles} />
                <RequirementItem text="One lowercase letter" met={/[a-z]/.test(values.password)} colors={COLORS} itemStyles={styles} />
                <RequirementItem text="One number" met={/\d/.test(values.password)} colors={COLORS} itemStyles={styles} />
                <RequirementItem text="One special character" met={/[!@#$%^&*(),.?":{}|<>]/.test(values.password)} colors={COLORS} itemStyles={styles} />
              </View>

              {/* Terms and Conditions Agreement */}
              <TouchableOpacity
                style={styles.termsContainer}
                onPress={() => setAgreedToTerms(!agreedToTerms)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={agreedToTerms ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={agreedToTerms ? COLORS.primary : COLORS.textSecondary}
                />
                <Text style={styles.termsText}>
                  I have read and agree to the{' '}
                  <Text
                    style={styles.termsLink}
                    onPress={(e) => {
                      e.stopPropagation();
                      navigation.navigate('TermsAndConditions');
                    }}
                  >
                    Terms and Conditions
                  </Text>
                </Text>
              </TouchableOpacity>

              {/* Buttons */}
              <View style={styles.buttonRow}>
                <TouchableOpacity style={[styles.secondaryButton, dynamicStyles.button]} onPress={handleBack}>
                  <Ionicons name="arrow-back" size={dynamicStyles.iconSize} color={COLORS.primary} />
                  <Text style={[styles.secondaryButtonText, dynamicStyles.buttonText]}>Back</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.primaryButton, dynamicStyles.button, styles.flexButton, (isSendingCode || !agreedToTerms) && styles.buttonDisabled]}
                  onPress={handleRegister}
                  disabled={isSendingCode || !agreedToTerms}
                >
                  {isSendingCode ? (
                    <ActivityIndicator color={COLORS.buttonText} />
                  ) : (
                    <>
                      <Text style={[styles.primaryButtonText, dynamicStyles.buttonText]}>Verify Email</Text>
                      <Ionicons name="mail-outline" size={dynamicStyles.iconSize} color={COLORS.buttonText} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {/* Login Link */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>

        </View>
      </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <Modal
        visible={step === 3}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setStep(2);
          setVerificationCode(['', '', '', '', '', '']);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, dynamicStyles.form]}>
            {/* Verification Icon */}
            <View style={styles.verificationIconContainer}>
              <Animated.View style={[styles.verificationIconCircle, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="mail-unread-outline" size={dynamicStyles.iconSize * 2.5} color={COLORS.primary} />
              </Animated.View>
            </View>

            <Text style={styles.verificationTitle}>Check Your Email</Text>
            <Text style={styles.verificationSubtitle}>
              We've sent a 6-digit verification code to
            </Text>
            <Text style={styles.verificationEmail}>{values.email.trim().toLowerCase()}</Text>

            {/* Code Input */}
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

            {/* Verify Button */}
            <TouchableOpacity
              style={[styles.primaryButton, dynamicStyles.button, (isVerifying || verificationCode.join('').length !== 6) && styles.buttonDisabled]}
              onPress={handleVerifyCode}
              disabled={isVerifying || verificationCode.join('').length !== 6}
            >
              {isVerifying ? (
                <ActivityIndicator color={COLORS.buttonText} />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={dynamicStyles.iconSize} color={COLORS.buttonText} style={{ marginRight: 8 }} />
                  <Text style={[styles.primaryButtonText, dynamicStyles.buttonText, { marginRight: 0 }]}>Verify & Create Account</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Resend Code */}
            <View style={styles.resendContainer}>
              <Text style={styles.resendText}>Didn't receive the code? </Text>
              {resendTimer > 0 ? (
                <Text style={styles.resendTimer}>Resend in {resendTimer}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResendCode} disabled={isSendingCode}>
                  <Text style={styles.resendLink}>
                    {isSendingCode ? 'Sending...' : 'Resend Code'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Change Email */}
            <TouchableOpacity
              style={styles.changeEmailButton}
              onPress={() => {
                setStep(1);
                setVerificationCode(['', '', '', '', '', '']);
              }}
            >
              <Ionicons name="arrow-back-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.changeEmailText}>Use a different email</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Region Picker Modal */}
      <Modal visible={showRegionPicker} transparent animationType="fade" onRequestClose={() => setShowRegionPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowRegionPicker(false)}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select Region</Text>
            <FlatList
              data={regionsList}
              keyExtractor={(item) => item.reg_code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, selectedRegion?.reg_code === item.reg_code && styles.pickerItemActive]}
                  onPress={() => {
                    setSelectedRegion(item);
                    setSelectedProvince(null);
                    setSelectedCity(null);
                    setSelectedBarangay(null);
                    setShowRegionPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemLabel}>{item.name}</Text>
                  {selectedRegion?.reg_code === item.reg_code && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Province Picker Modal */}
      <Modal visible={showProvincePicker} transparent animationType="fade" onRequestClose={() => setShowProvincePicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowProvincePicker(false)}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select Province</Text>
            <FlatList
              data={provincesList}
              keyExtractor={(item) => item.prov_code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, selectedProvince?.prov_code === item.prov_code && styles.pickerItemActive]}
                  onPress={() => {
                    setSelectedProvince(item);
                    setSelectedCity(null);
                    setSelectedBarangay(null);
                    setShowProvincePicker(false);
                  }}
                >
                  <Text style={styles.pickerItemLabel}>{item.name}</Text>
                  {selectedProvince?.prov_code === item.prov_code && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* City Picker Modal */}
      <Modal visible={showCityPicker} transparent animationType="fade" onRequestClose={() => setShowCityPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowCityPicker(false)}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select City / Municipality</Text>
            <FlatList
              data={citiesList}
              keyExtractor={(item) => item.mun_code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, selectedCity?.mun_code === item.mun_code && styles.pickerItemActive]}
                  onPress={() => {
                    setSelectedCity(item);
                    setSelectedBarangay(null);
                    setShowCityPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemLabel}>{item.name}</Text>
                  {selectedCity?.mun_code === item.mun_code && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Barangay Picker Modal */}
      <Modal visible={showBarangayPicker} transparent animationType="fade" onRequestClose={() => setShowBarangayPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowBarangayPicker(false)}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select Barangay</Text>
            <FlatList
              data={barangaysList}
              keyExtractor={(item, index) => `${item.name}-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, selectedBarangay?.name === item.name && styles.pickerItemActive]}
                  onPress={() => { setSelectedBarangay(item); setShowBarangayPicker(false); }}
                >
                  <Text style={styles.pickerItemLabel}>{item.name}</Text>
                  {selectedBarangay?.name === item.name && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

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

// Requirement item component
const RequirementItem = ({ text, met, colors, itemStyles }) => (
  <View style={itemStyles.requirementItem}>
    <Ionicons
      name={met ? 'checkmark-circle' : 'ellipse-outline'}
      size={16}
      color={met ? colors.success : colors.textSecondary}
    />
    <Text style={[itemStyles.requirementText, met && itemStyles.requirementMet]}>{text}</Text>
  </View>
);

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
  scrollContent: {
    flexGrow: 1,
    padding: 24,
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
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.border,
  },
  progressDotActive: {
    backgroundColor: COLORS.primary,
  },
  progressLine: {
    width: 60,
    height: 2,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: COLORS.primary,
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
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
    flex: 1,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingLeft: 2,
  },
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
  secondaryButton: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  flexButton: {
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
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
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  termsLink: {
    color: COLORS.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  backButton: {
    position: 'absolute',
    left: 12,
    top: Platform.OS === 'web' ? 12 : 8,
    zIndex: 20,
    padding: 6,
    borderRadius: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
  },
  // Verification step styles
  verificationIconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  verificationIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  verificationSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
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
  changeEmailButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 6,
  },
  changeEmailText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  addressSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  detectLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight + '18',
  },
  detectLocationText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  addressRow: {
    flexDirection: 'row',
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dropdownDisabled: {
    opacity: 0.5,
  },
  dropdownText: {
    fontSize: 16,
    color: COLORS.text,
  },
  dropdownPlaceholder: {
    fontSize: 16,
    color: COLORS.textSecondary + '80',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerModal: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    maxHeight: 420,
    width: '100%',
    maxWidth: 500,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pickerItemActive: {
    backgroundColor: COLORS.primary + '15',
    borderRadius: 8,
  },
  pickerItemLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
});

export default RegisterScreen;
