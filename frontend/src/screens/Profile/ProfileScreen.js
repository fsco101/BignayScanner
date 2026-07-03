// Profile Screen
// User profile view and edit functionality

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import AuthService from '../../services/AuthService';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';
import { useFormValidation, rules } from '../../utils/validation';
import {
  COUNTRY_CODES,
  getRegions,
  getProvinces,
  getCities,
  getBarangays,
  findRegionByName,
  findProvinceByName,
  findCityByName,
  findBarangayByName,
  composeFullAddress,
  validatePhoneNumber,
} from '../../data/philippineLocations';
import { useThemeColors } from '../../context/ThemeContext';


const ProfileScreen = ({ navigation }) => {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { user, updateProfile, logout, refreshUser } = useAuth();
  const { alertConfig, showSuccess, showError, showWarning, showConfirm, hideAlert } = useSweetAlert();
  
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
    content: {
      padding: responsive({ mobile: sp(16), tablet: sp(24), desktop: sp(32) }),
      alignItems: isDesktop ? 'center' : 'stretch',
    },
    contentWidth: {
      width: isDesktop ? Math.min(wp(600), maxContentWidth * 0.5) : '100%',
      maxWidth: 700,
    },
    header: {
      paddingVertical: responsive({ mobile: sp(24), tablet: sp(32), desktop: sp(40) }),
      marginBottom: responsive({ mobile: sp(16), tablet: sp(24), desktop: sp(28) }),
    },
    avatarSize: responsive({ mobile: sp(100), tablet: sp(120), desktop: sp(140) }),
    userName: {
      fontSize: responsive({ mobile: fp(22), tablet: fp(26), desktop: fp(28) }),
    },
    userEmail: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(15), desktop: fp(16) }),
    },
    sectionTitle: {
      fontSize: responsive({ mobile: fp(16), tablet: fp(18), desktop: fp(20) }),
    },
    label: {
      fontSize: responsive({ mobile: fp(12), tablet: fp(14), desktop: fp(15) }),
    },
    value: {
      fontSize: responsive({ mobile: fp(15), tablet: fp(16), desktop: fp(17) }),
    },
    input: {
      fontSize: responsive({ mobile: fp(15), tablet: fp(16), desktop: fp(17) }),
      paddingVertical: responsive({ mobile: sp(12), tablet: sp(14), desktop: sp(16) }),
    },
    buttonText: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(16), desktop: fp(17) }),
    },
    button: {
      paddingVertical: responsive({ mobile: sp(14), tablet: sp(16), desktop: sp(18) }),
      borderRadius: responsive({ mobile: sp(10), tablet: sp(12), desktop: sp(14) }),
    },
    iconSize: responsive({ mobile: sp(20), tablet: sp(22), desktop: sp(24) }),
    formCard: {
      padding: responsive({ mobile: sp(16), tablet: sp(20), desktop: sp(24) }),
      borderRadius: responsive({ mobile: sp(14), tablet: sp(16), desktop: sp(18) }),
    },
  }), [screenWidth, isMobile, isTablet, isDesktop, sp, fp, wp, responsive, maxContentWidth]);
  
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Phone country code
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]); // Philippines default
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');

  // Structured address
  const [selectedRegion, setSelectedRegion] = useState(null); // { name, reg_code }
  const [selectedProvince, setSelectedProvince] = useState(null); // { name, prov_code }
  const [selectedCity, setSelectedCity] = useState(null); // { name, mun_code }
  const [selectedBarangay, setSelectedBarangay] = useState(null); // { name }
  const [houseNumber, setHouseNumber] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [postalCode, setPostalCode] = useState('');

  // Dropdown visibility
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showProvincePicker, setShowProvincePicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showBarangayPicker, setShowBarangayPicker] = useState(false);

  // Derived lists
  const regionsList = useMemo(() => getRegions(), []);
  const provincesList = useMemo(() => selectedRegion ? getProvinces(selectedRegion.reg_code) : [], [selectedRegion]);
  const citiesList = useMemo(() => selectedProvince ? getCities(selectedProvince.prov_code) : [], [selectedProvince]);
  const barangaysList = useMemo(() => selectedCity ? getBarangays(selectedCity.mun_code) : [], [selectedCity]);

  // Profile form validation
  const {
    values, errors, touched, handleChange, handleBlur,
    validate, setValues, setErrors: setFormErrors, resetForm,
  } = useFormValidation(
    {
      firstName: '',
      lastName: '',
    },
    {
      firstName: [rules.required('First name')],
      lastName: [rules.required('Last name')],
    }
  );

  // Password form validation
  const {
    values: pwValues, errors: pwErrors, touched: pwTouched,
    handleChange: pwHandleChange, handleBlur: pwHandleBlur,
    validate: pwValidate, resetForm: pwResetForm,
  } = useFormValidation(
    { currentPassword: '', newPassword: '', confirmPassword: '' },
    {
      currentPassword: [rules.required('Current password')],
      newPassword: [
        rules.required('New password'),
        rules.minLength(8, 'New password'),
        rules.hasUppercase(),
        rules.hasLowercase(),
        rules.hasDigit(),
        rules.hasSpecialChar(),
      ],
      confirmPassword: [
        rules.required('Confirm password'),
        rules.matches('newPassword', 'Password'),
      ],
    }
  );

  useEffect(() => {
    if (user) {
      setValues({
        firstName: user.first_name || '',
        lastName: user.last_name || '',
      });

      // Parse phone: detect country code
      const rawPhone = user.phone || '';
      if (rawPhone) {
        const matched = COUNTRY_CODES.find(c => rawPhone.startsWith(c.code));
        if (matched) {
          setSelectedCountry(matched);
          setPhoneNumber(rawPhone.slice(matched.code.length).trim());
        } else {
          setSelectedCountry(COUNTRY_CODES[0]); // default PH
          setPhoneNumber(rawPhone);
        }
      }

      // Parse structured address
      const addr = user.address_structured || {};
      // Restore region
      if (addr.region) {
        const foundRegion = findRegionByName(addr.region);
        if (foundRegion) {
          setSelectedRegion({ name: addr.region, reg_code: foundRegion.reg_code });
          // Restore province
          if (addr.province) {
            const foundProv = findProvinceByName(addr.province, foundRegion.reg_code);
            if (foundProv) {
              setSelectedProvince({ name: addr.province, prov_code: foundProv.prov_code });
              // Restore city
              if (addr.city) {
                const foundCity = findCityByName(addr.city, foundProv.prov_code);
                if (foundCity) {
                  setSelectedCity({ name: addr.city, mun_code: foundCity.mun_code });
                  // Restore barangay
                  if (addr.barangay) {
                    setSelectedBarangay({ name: addr.barangay });
                  }
                } else {
                  setSelectedCity({ name: addr.city, mun_code: '' });
                }
              }
            } else {
              setSelectedProvince({ name: addr.province, prov_code: '' });
            }
          }
        } else {
          setSelectedRegion({ name: addr.region, reg_code: '' });
        }
      } else if (addr.province) {
        // Legacy: no region saved, try to find province directly
        const foundProv = findProvinceByName(addr.province);
        if (foundProv) {
          const foundRegion = regionsList.find(r => r.reg_code === foundProv.reg_code);
          if (foundRegion) setSelectedRegion(foundRegion);
          setSelectedProvince({ name: addr.province, prov_code: foundProv.prov_code });
          if (addr.city) {
            const foundCity = findCityByName(addr.city, foundProv.prov_code);
            if (foundCity) {
              setSelectedCity({ name: addr.city, mun_code: foundCity.mun_code });
              if (addr.barangay) setSelectedBarangay({ name: addr.barangay });
            } else {
              setSelectedCity({ name: addr.city, mun_code: '' });
            }
          }
        } else {
          setSelectedProvince({ name: addr.province, prov_code: '' });
        }
      }
      setHouseNumber(addr.house_number || '');
      setStreet(addr.street || '');
      setLandmark(addr.landmark || '');
      setPostalCode(addr.postal_code || user.postal_code || '');
    }
  }, [user]);

  const handleSave = async () => {
    if (!validate()) return;

    // Validate required address fields (all except landmark)
    const missingFields = [];
    if (!selectedRegion) missingFields.push('Region');
    if (!selectedProvince) missingFields.push('Province');
    if (!selectedCity) missingFields.push('City/Municipality');
    if (!selectedBarangay) missingFields.push('Barangay');
    if (!houseNumber.trim()) missingFields.push('House/Unit No.');
    if (!street.trim()) missingFields.push('Street');
    if (!postalCode.trim()) missingFields.push('Postal Code');
    if (!phoneNumber.trim()) missingFields.push('Phone Number');

    if (missingFields.length > 0) {
      showWarning('Missing Required Fields', `Please fill in:\n${missingFields.join(', ')}`);
      return;
    }

    // Validate phone
    if (phoneNumber) {
      const phoneResult = validatePhoneNumber(phoneNumber, selectedCountry.code);
      if (!phoneResult.valid) {
        showError('Invalid Phone', phoneResult.error);
        return;
      }
    }
    
    setIsSaving(true);
    try {
      // Compose full phone with country code
      const fullPhone = phoneNumber
        ? `${selectedCountry.code}${phoneNumber.replace(/^0+/, '')}`
        : null;

      const regionName = selectedRegion?.name || '';
      const provinceName = selectedProvince?.name || '';
      const cityName = selectedCity?.name || '';
      const barangayName = selectedBarangay?.name || '';

      // Compose full address
      const composedAddress = composeFullAddress({
        houseNumber,
        street,
        barangay: barangayName,
        city: cityName,
        province: provinceName,
        region: regionName,
        postalCode,
      });

      const addressStructured = {
        region: regionName || null,
        region_code: selectedRegion?.reg_code || null,
        house_number: houseNumber.trim() || null,
        street: street.trim() || null,
        barangay: barangayName || null,
        city: cityName || null,
        province: provinceName || null,
        province_code: selectedProvince?.prov_code || null,
        city_code: selectedCity?.mun_code || null,
        postal_code: postalCode.trim() || null,
        landmark: landmark.trim() || null,
      };

      const result = await updateProfile({
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        phone: fullPhone,
        address: composedAddress || null,
        city: cityName || null,
        province: provinceName || null,
        postal_code: postalCode.trim() || null,
        address_structured: addressStructured,
      });
      
      if (result.ok) {
        setIsEditing(false);
        showSuccess('Success', 'Profile updated successfully');
      } else {
        showError('Error', result.error || 'Failed to update profile');
      }
    } catch (error) {
      showError('Error', 'An error occurred while updating profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setValues({
        firstName: user.first_name || '',
        lastName: user.last_name || '',
      });
      // Reset phone
      const rawPhone = user.phone || '';
      if (rawPhone) {
        const matched = COUNTRY_CODES.find(c => rawPhone.startsWith(c.code));
        if (matched) {
          setSelectedCountry(matched);
          setPhoneNumber(rawPhone.slice(matched.code.length).trim());
        } else {
          setSelectedCountry(COUNTRY_CODES[0]);
          setPhoneNumber(rawPhone);
        }
      } else {
        setPhoneNumber('');
      }
      // Reset address - re-trigger useEffect logic by resetting to null first
      setSelectedRegion(null);
      setSelectedProvince(null);
      setSelectedCity(null);
      setSelectedBarangay(null);
      const addr = user.address_structured || {};
      if (addr.region) {
        const foundRegion = findRegionByName(addr.region);
        if (foundRegion) {
          setSelectedRegion({ name: addr.region, reg_code: foundRegion.reg_code });
          if (addr.province) {
            const foundProv = findProvinceByName(addr.province, foundRegion.reg_code);
            if (foundProv) {
              setSelectedProvince({ name: addr.province, prov_code: foundProv.prov_code });
              if (addr.city) {
                const foundCity = findCityByName(addr.city, foundProv.prov_code);
                if (foundCity) {
                  setSelectedCity({ name: addr.city, mun_code: foundCity.mun_code });
                  if (addr.barangay) setSelectedBarangay({ name: addr.barangay });
                }
              }
            }
          }
        }
      }
      setHouseNumber(addr.house_number || '');
      setStreet(addr.street || '');
      setLandmark(addr.landmark || '');
      setPostalCode(addr.postal_code || user.postal_code || '');
    }
    setFormErrors({});
    setIsEditing(false);
  };

  const handleChangePassword = async () => {
    if (!pwValidate()) return;
    
    setIsLoading(true);
    try {
      const result = await AuthService.changePassword(pwValues.currentPassword, pwValues.newPassword);
      
      if (result.ok) {
        setShowPasswordModal(false);
        pwResetForm();
        showSuccess('Success', 'Password changed successfully');
      } else {
        showError('Error', result.error || 'Failed to change password');
      }
    } catch (error) {
      showError('Error', 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    showConfirm(
      'Logout',
      'Are you sure you want to logout?',
      async () => {
        await logout();
        // Redirect to Landing screen (web) or Auth/Login (mobile) after logout
        navigation.getParent()?.reset({
          index: 0,
          routes: [Platform.OS === 'web' ? { name: 'Landing' } : { name: 'Auth', params: { screen: 'Login' } }],
        });
      },
      {
        confirmText: 'Logout',
        cancelText: 'Cancel',
      }
    );
  };

  // Convert blob URL to base64 (for web compatibility)
  const convertToBase64 = async (uri) => {
    if (uri.startsWith('data:')) {
      console.log('[ProfileScreen] Image already in data URL format');
      return uri;
    }
    
    if (Platform.OS === 'web') {
      try {
        console.log('[ProfileScreen] Converting blob URL to base64...');
        const response = await fetch(uri);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            console.log('[ProfileScreen] Base64 conversion successful, length:', reader.result?.length);
            resolve(reader.result);
          };
          reader.onerror = (err) => {
            console.error('[ProfileScreen] FileReader error:', err);
            reject(err);
          };
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.error('[ProfileScreen] Error converting to base64:', error);
        return null;
      }
    }
    
    console.log('[ProfileScreen] Non-web platform, returning URI');
    return uri;
  };

  const pickImage = async () => {
    // Skip permission check on web
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showWarning('Permission needed', 'Please allow access to your photos');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: Platform.OS !== 'web',
    });

    if (!result.canceled && result.assets[0]) {
      // Upload profile image
      setIsLoading(true);
      try {
        let imageData;
        const asset = result.assets[0];
        
        console.log('[ProfileScreen] Asset info:', {
          hasBase64: !!asset.base64,
          uri: asset.uri?.substring(0, 50),
          mimeType: asset.mimeType,
        });
        
        if (asset.base64) {
          // Determine MIME type from asset
          const mimeType = asset.mimeType || 'image/jpeg';
          imageData = `data:${mimeType};base64,${asset.base64}`;
          console.log(`[ProfileScreen] Created data URL with ${mimeType}, length: ${imageData.length}`);
        } else {
          // Convert for web
          console.log('[ProfileScreen] No base64 in asset, converting from URI...');
          imageData = await convertToBase64(asset.uri);
        }
        
        if (!imageData || !imageData.startsWith('data:')) {
          console.error('[ProfileScreen] Invalid image data:', imageData?.substring(0, 50));
          showError('Error', 'Failed to process image');
          setIsLoading(false);
          return;
        }
        
        console.log('[ProfileScreen] Uploading profile image, data length:', imageData.length);
        const response = await AuthService.updateProfileImage(imageData);
        if (response.ok) {
          await refreshUser();
          showSuccess('Success', 'Profile image updated');
        } else {
          console.error('[ProfileScreen] Upload failed:', response.error);
          showError('Error', response.error || 'Failed to update image');
        }
      } catch (error) {
        console.error('[ProfileScreen] Error in pickImage:', error);
        showError('Error', 'Failed to upload image');
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={dynamicStyles.content}>
        <View style={dynamicStyles.contentWidth}>
          {/* Profile Header */}
          <View style={[styles.header, dynamicStyles.header]}>
          <TouchableOpacity style={[styles.avatarContainer, { width: dynamicStyles.avatarSize, height: dynamicStyles.avatarSize, borderRadius: dynamicStyles.avatarSize / 2 }]} onPress={pickImage}>
            {user.profile_image ? (
              <Image source={{ uri: user.profile_image }} style={[styles.avatar, { width: dynamicStyles.avatarSize, height: dynamicStyles.avatarSize, borderRadius: dynamicStyles.avatarSize / 2 }]} />
            ) : (
              <View style={[styles.avatarPlaceholder, { width: dynamicStyles.avatarSize, height: dynamicStyles.avatarSize, borderRadius: dynamicStyles.avatarSize / 2 }]}>
                <Text style={[styles.avatarText, { fontSize: dynamicStyles.avatarSize * 0.35 }]}>
                  {user.first_name?.[0]?.toUpperCase()}{user.last_name?.[0]?.toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.editAvatarIcon}>
              <Ionicons name="camera" size={sp(16)} color={COLORS.buttonText} />
            </View>
          </TouchableOpacity>
          <Text style={[styles.userName, dynamicStyles.userName]}>{user.full_name || `${user.first_name} ${user.last_name}`}</Text>
          <Text style={[styles.userEmail, dynamicStyles.userEmail]}>{user.email}</Text>
          {user.role === 'admin' && (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={sp(14)} color={COLORS.buttonText} />
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}
        </View>

        {/* Profile Form */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>Personal Information</Text>
            {!isEditing && (
              <TouchableOpacity onPress={() => setIsEditing(true)}>
                <Ionicons name="create-outline" size={dynamicStyles.iconSize} color={COLORS.primary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.formCard, dynamicStyles.formCard]}>
            {/* First Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, dynamicStyles.label]}>First Name</Text>
              {isEditing ? (
                <>
                  <TextInput
                    style={[styles.input, dynamicStyles.input, touched.firstName && errors.firstName && styles.inputError]}
                    value={values.firstName}
                    onChangeText={(text) => handleChange('firstName', text)}
                    onBlur={() => handleBlur('firstName')}
                    placeholder="Enter first name"
                    placeholderTextColor={COLORS.textSecondary + '80'}
                    autoCapitalize="words"
                  />
                  {touched.firstName && errors.firstName && (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                      <Text style={styles.errorText}>{errors.firstName}</Text>
                    </View>
                  )}
                </>
              ) : (
                <Text style={[styles.value, dynamicStyles.value]}>{user.first_name || '-'}</Text>
              )}
            </View>

            {/* Last Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, dynamicStyles.label]}>Last Name</Text>
              {isEditing ? (
                <>
                  <TextInput
                    style={[styles.input, dynamicStyles.input, touched.lastName && errors.lastName && styles.inputError]}
                    value={values.lastName}
                    onChangeText={(text) => handleChange('lastName', text)}
                    onBlur={() => handleBlur('lastName')}
                    placeholder="Enter last name"
                    placeholderTextColor={COLORS.textSecondary + '80'}
                    autoCapitalize="words"
                  />
                  {touched.lastName && errors.lastName && (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                      <Text style={styles.errorText}>{errors.lastName}</Text>
                    </View>
                  )}
                </>
              ) : (
                <Text style={[styles.value, dynamicStyles.value]}>{user.last_name || '-'}</Text>
              )}
            </View>

          {/* Phone */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            {isEditing ? (
              <View style={styles.phoneRow}>
                <TouchableOpacity
                  style={styles.countryCodeBtn}
                  onPress={() => setShowCountryPicker(true)}
                >
                  <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                  <Text style={styles.countryCodeText}>{selectedCountry.code}</Text>
                  <Ionicons name="chevron-down" size={14} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder={selectedCountry.code === '+63' ? '9171234567' : 'Phone number'}
                  placeholderTextColor={COLORS.textSecondary + '80'}
                  keyboardType="phone-pad"
                />
              </View>
            ) : (
              <Text style={styles.value}>{user.phone || 'Not set'}</Text>
            )}
          </View>

          {/* Address Section Header */}
          {isEditing && (
            <View style={styles.addressSectionHeader}>
              <Ionicons name="location" size={16} color={COLORS.primary} />
              <Text style={[styles.label, { marginBottom: 0, marginLeft: 6, fontWeight: '600', color: COLORS.primary }]}>Shipping Address</Text>
            </View>
          )}

          {/* Region Dropdown */}
          {isEditing && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Region *</Text>
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
          )}

          {/* Province Dropdown */}
          <View style={styles.inputGroup}>
            {isEditing ? (
              <>
                <Text style={styles.label}>Province *</Text>
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
              </>
            ) : null}
          </View>

          {/* City Dropdown */}
          {(isEditing || (!isEditing && (selectedCity || user.city))) && (
            <View style={styles.inputGroup}>
              {isEditing ? (
                <>
                  <Text style={styles.label}>City / Municipality *</Text>
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
                </>
              ) : null}
            </View>
          )}

          {/* Barangay Dropdown */}
          {isEditing && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Barangay *</Text>
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
          )}

          {/* House/Unit & Street */}
          {isEditing && (
            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfInput]}>
                <Text style={styles.label}>House/Unit No. *</Text>
                <TextInput
                  style={styles.input}
                  value={houseNumber}
                  onChangeText={setHouseNumber}
                  placeholder="e.g., 123"
                  placeholderTextColor={COLORS.textSecondary + '80'}
                />
              </View>
              <View style={[styles.inputGroup, styles.halfInput]}>
                <Text style={styles.label}>Street *</Text>
                <TextInput
                  style={styles.input}
                  value={street}
                  onChangeText={setStreet}
                  placeholder="e.g., Rizal St."
                  placeholderTextColor={COLORS.textSecondary + '80'}
                />
              </View>
            </View>
          )}

          {/* Landmark & Postal Code */}
          {isEditing && (
            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfInput]}>
                <Text style={styles.label}>Landmark (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={landmark}
                  onChangeText={setLandmark}
                  placeholder="Near..."
                  placeholderTextColor={COLORS.textSecondary + '80'}
                />
              </View>
              <View style={[styles.inputGroup, styles.halfInput]}>
                <Text style={styles.label}>Postal Code *</Text>
                <TextInput
                  style={styles.input}
                  value={postalCode}
                  onChangeText={setPostalCode}
                  placeholder="e.g., 4217"
                  placeholderTextColor={COLORS.textSecondary + '80'}
                  keyboardType="numeric"
                />
              </View>
            </View>
          )}

          {/* Display full address in view mode */}
          {!isEditing && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Address</Text>
              <Text style={styles.value}>
                {user.address || [user.city, user.province].filter(Boolean).join(', ') || 'Not set'}
              </Text>
            </View>
          )}

          {/* Edit Actions */}
          {isEditing && (
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color={COLORS.buttonText} size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Account Actions */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>Account Settings</Text>
        <View style={styles.actionsCard}>
          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => setShowPasswordModal(true)}
          >
            <View style={styles.actionLeft}>
              <Ionicons name="key-outline" size={dynamicStyles.iconSize} color={COLORS.primary} />
              <Text style={styles.actionText}>Change Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={dynamicStyles.iconSize} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleLogout}>
            <View style={styles.actionLeft}>
              <Ionicons name="log-out-outline" size={dynamicStyles.iconSize} color={COLORS.error} />
              <Text style={[styles.actionText, { color: COLORS.error }]}>Logout</Text>
            </View>
            <Ionicons name="chevron-forward" size={dynamicStyles.iconSize} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Account Info */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>Account Information</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member Since</Text>
            <Text style={styles.infoValue}>
              {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Account Status</Text>
            <View style={[styles.statusBadge, user.is_active ? styles.statusActive : styles.statusInactive]}>
              <Text style={styles.statusText}>{user.is_active ? 'Active' : 'Inactive'}</Text>
            </View>
          </View>
        </View>
      </View>
      </View>

      {/* Change Password Modal */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Current Password</Text>
              <TextInput
                style={[styles.input, pwTouched.currentPassword && pwErrors.currentPassword && styles.inputError]}
                value={pwValues.currentPassword}
                onChangeText={(text) => pwHandleChange('currentPassword', text)}
                onBlur={() => pwHandleBlur('currentPassword')}
                placeholder="Enter current password"
                secureTextEntry
              />
              {pwTouched.currentPassword && pwErrors.currentPassword && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                  <Text style={styles.errorText}>{pwErrors.currentPassword}</Text>
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>New Password</Text>
              <TextInput
                style={[styles.input, pwTouched.newPassword && pwErrors.newPassword && styles.inputError]}
                value={pwValues.newPassword}
                onChangeText={(text) => pwHandleChange('newPassword', text)}
                onBlur={() => pwHandleBlur('newPassword')}
                placeholder="Enter new password"
                secureTextEntry
              />
              {pwTouched.newPassword && pwErrors.newPassword && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                  <Text style={styles.errorText}>{pwErrors.newPassword}</Text>
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm New Password</Text>
              <TextInput
                style={[styles.input, pwTouched.confirmPassword && pwErrors.confirmPassword && styles.inputError]}
                value={pwValues.confirmPassword}
                onChangeText={(text) => pwHandleChange('confirmPassword', text)}
                onBlur={() => pwHandleBlur('confirmPassword')}
                placeholder="Confirm new password"
                secureTextEntry
              />
              {pwTouched.confirmPassword && pwErrors.confirmPassword && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                  <Text style={styles.errorText}>{pwErrors.confirmPassword}</Text>
                </View>
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowPasswordModal(false);
                  pwResetForm();
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveButton, isLoading && styles.buttonDisabled]}
                onPress={handleChangePassword}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.buttonText} size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Change Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>

      {/* Country Code Picker Modal */}
      <Modal visible={showCountryPicker} transparent animationType="fade" onRequestClose={() => setShowCountryPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowCountryPicker(false)}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select Country</Text>
            <FlatList
              data={COUNTRY_CODES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, selectedCountry.code === item.code && styles.pickerItemActive]}
                  onPress={() => { setSelectedCountry(item); setShowCountryPicker(false); }}
                >
                  <Text style={styles.pickerItemFlag}>{item.flag}</Text>
                  <Text style={styles.pickerItemLabel}>{item.country}</Text>
                  <Text style={styles.pickerItemCode}>{item.code}</Text>
                  {selectedCountry.code === item.code && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
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
                    setPostalCode('');
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
        onConfirm={alertConfig.onConfirm}
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
  content: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 60,
    paddingBottom: 30,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: COLORS.surface,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.surface,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  editAvatarIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.surface,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adminBadgeText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  value: {
    fontSize: 16,
    color: COLORS.text,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputError: {
    borderColor: COLORS.error,
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  saveButtonText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 16,
    color: COLORS.text,
    marginLeft: 12,
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusActive: {
    backgroundColor: COLORS.success + '20',
  },
  statusInactive: {
    backgroundColor: COLORS.error + '20',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalSaveText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  // Phone row styles
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  countryFlag: {
    fontSize: 18,
  },
  countryCodeText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  phoneInput: {
    flex: 1,
  },
  // Address section styles
  addressSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
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
  // Picker modal styles
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
  pickerItemFlag: {
    fontSize: 20,
    marginRight: 10,
  },
  pickerItemLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  pickerItemCode: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginRight: 8,
  },
});

export default ProfileScreen;
