import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { API_CONFIG, checkServerHealth, getApiInfo } from '../config/api';
import { useResponsive } from '../hooks/useResponsive';
import { rules, validateField } from '../utils/validation';
import { useThemeColors } from '../context/ThemeContext';

const STORAGE_KEY = '@bignay_api_url';

export default function SettingsScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const [customApiUrl, setCustomApiUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [apiInfo, setApiInfo] = useState(null);

  // URL validation
  const [urlError, setUrlError] = useState(null);
  const [urlTouched, setUrlTouched] = useState(false);
  const urlRules = [rules.required('Backend URL'), rules.url()];
  
  // Use responsive hook for dynamic sizing
  const {
    width: screenWidth,
    isMobile,
    isTablet,
    isDesktop,
    sp,
    fp,
    responsive,
    maxContentWidth,
  } = useResponsive();
  
  // Dynamic responsive styles
  const dynamicStyles = useMemo(() => ({
    container: {
      padding: responsive({ mobile: sp(16), tablet: sp(24), desktop: sp(32) }),
      alignItems: isDesktop ? 'center' : 'stretch',
    },
    contentWidth: {
      width: isDesktop ? Math.min(screenWidth * 0.6, maxContentWidth * 0.6) : '100%',
      maxWidth: 600,
    },
    title: {
      fontSize: responsive({ mobile: fp(20), tablet: fp(24), desktop: fp(26) }),
    },
    sectionTitle: {
      fontSize: responsive({ mobile: fp(16), tablet: fp(18), desktop: fp(20) }),
    },
    label: {
      fontSize: responsive({ mobile: fp(13), tablet: fp(14), desktop: fp(15) }),
    },
    input: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(15), desktop: fp(16) }),
      padding: responsive({ mobile: sp(12), tablet: sp(14), desktop: sp(16) }),
    },
    buttonText: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(15), desktop: fp(16) }),
    },
    button: {
      padding: responsive({ mobile: sp(14), tablet: sp(16), desktop: sp(18) }),
      borderRadius: responsive({ mobile: sp(10), tablet: sp(12), desktop: sp(14) }),
    },
    iconSize: responsive({ mobile: sp(20), tablet: sp(22), desktop: sp(24) }),
    infoText: {
      fontSize: responsive({ mobile: fp(12), tablet: fp(13), desktop: fp(14) }),
    },
  }), [screenWidth, isMobile, isTablet, isDesktop, sp, fp, responsive, maxContentWidth]);

  useEffect(() => {
    loadSavedUrl();
    // Get current API configuration info
    try {
      const info = getApiInfo();
      setApiInfo(info);
    } catch (e) {
      console.log('Could not get API info');
    }
  }, []);

  const loadSavedUrl = async () => {
    try {
      const savedUrl = await AsyncStorage.getItem(STORAGE_KEY);
      if (savedUrl) {
        setCustomApiUrl(savedUrl);
      } else {
        setCustomApiUrl(API_CONFIG.BASE_URL);
      }
    } catch (error) {
      console.error('Failed to load saved URL:', error);
      setCustomApiUrl(API_CONFIG.BASE_URL);
    }
  };

  const saveUrl = async () => {
    const err = validateField(customApiUrl, urlRules);
    setUrlError(err);
    setUrlTouched(true);
    if (err) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, customApiUrl);
      Alert.alert('Saved', 'Custom API URL has been saved. Restart the app for changes to take effect.');
    } catch (error) {
      Alert.alert('Error', 'Failed to save the URL.');
    }
  };

  const testConnection = async () => {
    setIsTesting(true);
    setConnectionStatus(null);
    
    const urlToTest = customApiUrl || API_CONFIG.BASE_URL;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      console.log(`Testing connection to: ${urlToTest}/health`);
      
      const response = await fetch(`${urlToTest}/health`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        setConnectionStatus({
          success: true,
          message: `✓ Connected successfully!`,
          url: urlToTest,
          data: data,
        });
      } else {
        setConnectionStatus({
          success: false,
          message: `Server returned error: ${response.status}`,
          url: urlToTest,
        });
      }
    } catch (error) {
      let errorMessage = error.message;
      if (error.name === 'AbortError') {
        errorMessage = 'Connection timeout (10s) - server not responding';
      } else if (error.message.includes('Network request failed')) {
        errorMessage = 'Network error - cannot reach server';
      }
      
      setConnectionStatus({
        success: false,
        message: errorMessage,
        url: urlToTest,
        troubleshooting: [
          '• Is the backend server running?',
          '• Are you on the same WiFi network?',
          '• Is the IP address correct?',
          '• Is port 5000 open in firewall?',
        ],
      });
    } finally {
      setIsTesting(false);
    }
  };

  const resetToDefault = () => {
    Alert.alert(
      'Reset URL',
      `Reset to auto-detected URL?\n\nCurrent: ${API_CONFIG.BASE_URL}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset', 
          onPress: async () => {
            setCustomApiUrl(API_CONFIG.BASE_URL);
            await AsyncStorage.removeItem(STORAGE_KEY);
            Alert.alert('Reset', 'URL has been reset to auto-detected value.');
          }
        },
      ]
    );
  };

  const openDocs = () => {
    Linking.openURL('https://github.com/your-repo/bignay-ml');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[
      styles.contentContainer,
      isDesktop && { maxWidth: maxContentWidth, width: '100%', alignSelf: 'center', paddingHorizontal: 32 },
    ]}>
      {/* Current Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="information-circle-outline" size={20} /> Current Configuration
        </Text>
        
        <View style={styles.configCard}>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Active URL:</Text>
            <Text style={styles.configValue} numberOfLines={1}>{API_CONFIG.BASE_URL}</Text>
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Platform:</Text>
            <Text style={styles.configValue}>{Platform.OS}</Text>
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Device Type:</Text>
            <Text style={styles.configValue}>{Constants.isDevice ? 'Physical Device' : 'Emulator/Simulator'}</Text>
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Timeout:</Text>
            <Text style={styles.configValue}>{API_CONFIG.TIMEOUT / 1000}s</Text>
          </View>
        </View>
      </View>

      {/* API Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="server-outline" size={20} /> API Configuration
        </Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Backend URL (Custom)</Text>
          <TextInput
            style={[styles.input, urlTouched && urlError && styles.inputError]}
            value={customApiUrl}
            onChangeText={(t) => {
              setCustomApiUrl(t);
              if (urlTouched) setUrlError(validateField(t, urlRules));
            }}
            onBlur={() => {
              setUrlTouched(true);
              setUrlError(validateField(customApiUrl, urlRules));
            }}
            placeholder="http://192.168.x.x:5000"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {urlTouched && urlError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
              <Text style={styles.errorText}>{urlError}</Text>
            </View>
          ) : null}
          <Text style={styles.hint}>
            Override the auto-detected URL if needed. Use your computer's local IP for physical devices.
          </Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.button, styles.primaryButton]} 
            onPress={testConnection}
            disabled={isTesting}
          >
            <Ionicons name="wifi" size={18} color={COLORS.buttonText} />
            <Text style={styles.buttonText}>
              {isTesting ? 'Testing...' : 'Test Connection'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton]} 
            onPress={saveUrl}
          >
            <Ionicons name="save" size={18} color={COLORS.primary} />
            <Text style={[styles.buttonText, { color: COLORS.primary }]}>Save</Text>
          </TouchableOpacity>
        </View>

        {connectionStatus && (
          <View style={[
            styles.statusCard,
            connectionStatus.success ? styles.statusSuccess : styles.statusError
          ]}>
            <Ionicons 
              name={connectionStatus.success ? 'checkmark-circle' : 'alert-circle'} 
              size={24} 
              color={connectionStatus.success ? '#388E3C' : '#D32F2F'} 
            />
            <View style={styles.statusContent}>
              <Text style={styles.statusMessage}>{connectionStatus.message}</Text>
              <Text style={styles.statusUrl}>URL: {connectionStatus.url}</Text>
              {connectionStatus.data && (
                <>
                  <Text style={styles.statusDetail}>
                    Database: {connectionStatus.data.db?.ok ? '✓ Connected' : '✗ Not connected'}
                  </Text>
                  {connectionStatus.data.models && (
                    <Text style={styles.statusDetail}>
                      Models: Fruit {connectionStatus.data.models.fruit?.available ? '✓' : '✗'} | Leaf {connectionStatus.data.models.leaf?.available ? '✓' : '✗'}
                    </Text>
                  )}
                </>
              )}
              {connectionStatus.troubleshooting && (
                <View style={styles.troubleshooting}>
                  <Text style={styles.troubleshootTitle}>Troubleshooting:</Text>
                  {connectionStatus.troubleshooting.map((tip, index) => (
                    <Text key={index} style={styles.troubleshootTip}>{tip}</Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Network Help */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="help-circle-outline" size={20} /> Network Setup Help
        </Text>
        
        <View style={styles.helpCard}>
          <Text style={styles.helpTitle}>Finding Your Computer's IP Address:</Text>
          
          <View style={styles.helpStep}>
            <Text style={styles.stepNumber}>1</Text>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Windows</Text>
              <Text style={styles.stepText}>Open Command Prompt and type: ipconfig</Text>
              <Text style={styles.stepText}>Look for "IPv4 Address" under your network adapter</Text>
            </View>
          </View>
          
          <View style={styles.helpStep}>
            <Text style={styles.stepNumber}>2</Text>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>macOS/Linux</Text>
              <Text style={styles.stepText}>Open Terminal and type: ifconfig</Text>
              <Text style={styles.stepText}>Look for "inet" under your network interface</Text>
            </View>
          </View>
          
          <View style={styles.helpStep}>
            <Text style={styles.stepNumber}>3</Text>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Make sure</Text>
              <Text style={styles.stepText}>• Phone and computer are on the same WiFi network</Text>
              <Text style={styles.stepText}>• Backend server is running (python app.py)</Text>
              <Text style={styles.stepText}>• Firewall allows port 5000</Text>
            </View>
          </View>
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="information-circle-outline" size={20} /> About
        </Text>
        
        <View style={styles.aboutCard}>
          <Text style={styles.appName}>Bignay ML Scanner</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.appDescription}>
            Machine learning-powered fruit and leaf classification system for Bignay 
            (Antidesma bunius). Analyze ripeness, detect mold, and get usage recommendations.
          </Text>
        </View>

        <TouchableOpacity style={styles.linkButton} onPress={resetToDefault}>
          <Ionicons name="refresh" size={20} color={COLORS.danger} />
          <Text style={[styles.linkText, { color: COLORS.danger }]}>Reset to Default URL</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputError: {
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
  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  secondaryButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.surface,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
    gap: 12,
  },
  statusSuccess: {
    backgroundColor: COLORS.primaryBg,
  },
  statusError: {
    backgroundColor: COLORS.errorLight,
  },
  statusContent: {
    flex: 1,
  },
  statusMessage: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  statusDetail: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  statusUrl: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  troubleshooting: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  troubleshootTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  troubleshootTip: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 8,
    marginTop: 2,
  },
  configCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  configLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  configValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  helpCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  helpStep: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    backgroundColor: COLORS.primary,
    color: COLORS.surface,
    borderRadius: 14,
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: 'bold',
    fontSize: 14,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  stepText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  aboutCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  appDescription: {
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 20,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
