import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
  Linking,
  Animated,
  PanResponder,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { API_CONFIG, buildApiUrl, SUBJECT_TYPES, RECOMMENDATION_ICONS } from '../../config/api';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';
import AuthService from '../../services/AuthService';
import { useThemeColors } from '../../context/ThemeContext';

// Training labels for each subject type
const TRAINING_LABELS = {
  fruit: [
    { value: 'ripe', label: 'Ripe', emoji: '🍇', description: 'Ready to eat' },
    { value: 'unripe', label: 'Unripe', emoji: '🟢', description: 'Not yet ready' },
    { value: 'overripe', label: 'Overripe', emoji: '🟤', description: 'Past prime' },
    { value: 'mold', label: 'Moldy', emoji: '🦠', description: 'Moldy detected' },
  ],
  leaf: [
    { value: 'healthy', label: 'Healthy', emoji: '🍃', description: 'Healthy green leaf' },
    { value: 'mold', label: 'Moldy', emoji: '🦠', description: 'Moldy or disease present' },
  ],
};

// Ripeness recommendation map
const RIPENESS_RECOMMENDATIONS = {
  unripe: {
    advice: 'Allow the fruit to ripen naturally. Store at room temperature away from direct sunlight.',
    bestUse: 'Best for vinegar production or pickled preparations.',
    icon: 'time-outline',
  },
  ripe: {
    advice: 'Fruit is at peak quality. Consume fresh or process within 1–2 days.',
    bestUse: 'Ideal for eating fresh, making juice, or wine production.',
    icon: 'checkmark-circle-outline',
  },
  overripe: {
    advice: 'Process the fruit soon to avoid spoilage. Not ideal for fresh consumption.',
    bestUse: 'Best suited for jam, wine, or vinegar production.',
    icon: 'warning-outline',
  },
  mold: {
    advice: 'Discard immediately. Do not consume or process moldy fruit.',
    bestUse: 'Not suitable for any use. Remove to prevent contamination.',
    icon: 'close-circle-outline',
  },
};

// Leaf health recommendation map
const LEAF_RECOMMENDATIONS = {
  healthy: {
    advice: 'Leaf appears healthy. Continue regular plant care and monitoring.',
    icon: 'leaf-outline',
    color: '#16A34A',
    benefits: [
      'Rich in antioxidants (flavonoids, phenolic compounds) that help fight free radicals.',
      'Traditionally used in herbal tea to aid digestion and relieve stomach discomfort.',
      'Contains anti-inflammatory properties that may help reduce swelling and pain.',
      'Used in traditional Filipino medicine for treating skin conditions and minor wounds.',
      'Has antimicrobial properties — leaf extracts can inhibit bacterial and fungal growth.',
      'May help regulate blood sugar levels due to its bioactive compounds.',
      'Bignay leaf decoction is used as a natural remedy for snake bites in folk medicine.',
      'Contains vitamins and minerals beneficial for overall immune system health.',
    ],
    uses: [
      'Herbal Tea: Dry the leaves and brew as a health tea for daily consumption.',
      'Poultice: Crush fresh leaves and apply to minor skin irritations or wounds.',
      'Natural Pesticide: Leaf extract can deter certain garden pests.',
      'Composting: Healthy pruned leaves make excellent compost material.',
    ],
  },
  mold: {
    advice: 'Disease or mold detected. Take immediate action to prevent spread.',
    icon: 'warning-outline',
    color: '#DC2626',
    benefits: [],
    uses: [
      'Do not use diseased leaves for tea or medicinal purposes.',
      'Remove and destroy affected leaves to prevent spread.',
      'Compost only if your compost reaches high enough temperatures to kill pathogens.',
    ],
  },
};

// ── Mold Confidence Threshold ──
// The system only recommends discarding when mold confidence >= this value.
// Below this threshold, a monitoring/warning message is shown instead.
const MOLD_DISCARD_THRESHOLD = 0.30; // 30%
const CLIENT_BLUR_THRESHOLD = 0.12; // lower blur cutoff for client-side quality gating

// Dynamic mold recommendation based on confidence
const getMoldRecommendation = (confidence, subjectType) => {
  if (confidence >= MOLD_DISCARD_THRESHOLD) {
    // High mold confidence — discard
    if (subjectType === 'leaf') {
      return {
        advice: 'Disease or mold detected. Take immediate action to prevent spread.',
        icon: 'warning-outline',
        color: '#DC2626',
        severity: 'high',
      };
    }
    return {
      advice: 'Discard immediately. Do not consume or process moldy fruit.',
      bestUse: 'Not suitable for any use. Remove to prevent contamination.',
      icon: 'close-circle-outline',
      severity: 'high',
    };
  }
  // Low mold confidence — monitor / warning
  const pct = (confidence * 100).toFixed(0);
  if (subjectType === 'leaf') {
    return {
      advice: `Minor mold indicators detected (${pct}% confidence). The leaf may be in early stages of infection. Monitor closely and inspect again in 2–3 days.`,
      icon: 'eye-outline',
      color: '#D97706',
      severity: 'low',
    };
  }
  return {
    advice: `Low-level mold indicators detected (${pct}% confidence, below ${(MOLD_DISCARD_THRESHOLD * 100).toFixed(0)}% threshold). The fruit may still be usable — inspect visually and monitor for progression.`,
    bestUse: 'Consider processing soon (jam, wine, or vinegar) if visual inspection confirms quality.',
    icon: 'eye-outline',
    severity: 'low',
  };
};

// Suitability bar color helper
const getSuitabilityColor = (pct) => {
  if (pct >= 70) return '#16A34A';
  if (pct >= 40) return '#D97706';
  return '#DC2626';
};

export default function ScannerScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { isAuthenticated } = useAuth();
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  // Now web supports camera too through WebRTC
  const [inputMode, setInputMode] = useState('camera');
  const [subject, setSubject] = useState(SUBJECT_TYPES.FRUIT);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState({ message: '', type: 'info' });
  const { alertConfig, showError, showSuccess, showWarning, hideAlert } = useSweetAlert();
  
  // Training contribution states
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [isSubmittingTraining, setIsSubmittingTraining] = useState(false);
  const [trainingStats, setTrainingStats] = useState(null);
  
  // Image quality validation states
  const [qualityIssues, setQualityIssues] = useState(null);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState(false);
  
  // Crop guide states (for gallery uploads)
  const [showCropGuide, setShowCropGuide] = useState(false);
  const [rawPickedImage, setRawPickedImage] = useState(null); // original uncropped image
  const [cropRect, setCropRect] = useState({ x: 50, y: 50, w: 200, h: 200 }); // crop rectangle in display coords
  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0 }); // displayed image size (View)
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 }); // actual image pixel dimensions
  const [imageRendered, setImageRendered] = useState({ x: 0, y: 0, w: 0, h: 0 }); // actual rendered image rect inside the view (after contain)
  
  // Scan frame animation
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  
  // Web camera states
  const [webCameraStream, setWebCameraStream] = useState(null);
  const [isWebCameraActive, setIsWebCameraActive] = useState(false);
  const [webCameraError, setWebCameraError] = useState(null);
  const webVideoRef = useRef(null);
  const isStartingWebCameraRef = useRef(false);
  const hasAutoRequestedCameraPermission = useRef(false);
  
  const cameraRef = useRef(null);
  
  // Use responsive hook for dynamic sizing
  const {
    width: screenWidth,
    isMobile,
    isTablet,
    isDesktop,
    sp,
    fp,
    wp,
    hp,
    responsive,
    maxContentWidth,
  } = useResponsive();
  
  // Dynamic responsive values
  const contentMaxWidth = isDesktop ? Math.min(screenWidth, maxContentWidth) : screenWidth;
  
  // Dynamic responsive styles
  const dynamicStyles = useMemo(() => ({
    container: {
      padding: responsive({ mobile: sp(0), tablet: sp(16), desktop: sp(24) }),
    },
    contentWidth: {
      maxWidth: isDesktop ? maxContentWidth : '100%',
      alignSelf: 'center',
      width: '100%',
    },
    header: {
      padding: responsive({ mobile: sp(16), tablet: sp(20), desktop: sp(24) }),
    },
    title: {
      fontSize: responsive({ mobile: fp(22), tablet: fp(26), desktop: fp(28) }),
    },
    subtitle: {
      fontSize: responsive({ mobile: fp(13), tablet: fp(14), desktop: fp(15) }),
    },
    cameraSize: responsive({ mobile: hp(380), tablet: hp(420), desktop: hp(500) }),
    buttonText: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(15), desktop: fp(16) }),
    },
    iconSize: responsive({ mobile: sp(24), tablet: sp(26), desktop: sp(28) }),
    cardPadding: responsive({ mobile: sp(16), tablet: sp(20), desktop: sp(24) }),
    sectionTitle: {
      fontSize: responsive({ mobile: fp(16), tablet: fp(18), desktop: fp(20) }),
    },
    resultText: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(15), desktop: fp(16) }),
    },
  }), [screenWidth, isMobile, isTablet, isDesktop, sp, fp, wp, hp, responsive, maxContentWidth]);

  const updateStatus = (message, type = 'info') => {
    setStatus({ message, type });
  };

  // Scan line animation for the focus frame
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanLineAnim]);

  // ── Crop guide drag/resize logic ──
  const cropRectRef = useRef({ x: 50, y: 50, w: 200, h: 200 });
  const imageRenderedRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const MIN_CROP = 60; // minimum crop dimension in display px
  
  useEffect(() => { cropRectRef.current = cropRect; }, [cropRect]);
  useEffect(() => { imageRenderedRef.current = imageRendered; }, [imageRendered]);

  // Helper: clamp crop rect within the actually-rendered image area
  const clampCrop = (rect) => {
    const ir = imageRenderedRef.current;
    const r = { ...rect };
    r.w = Math.max(MIN_CROP, Math.min(r.w, ir.w));
    r.h = Math.max(MIN_CROP, Math.min(r.h, ir.h));
    r.x = Math.max(ir.x, Math.min(r.x, ir.x + ir.w - r.w));
    r.y = Math.max(ir.y, Math.min(r.y, ir.y + ir.h - r.h));
    return r;
  };

  // PanResponder for moving the crop box (center drag)
  const cropMoveStartRef = useRef({ x: 0, y: 0, w: 200, h: 200 });
  const cropMovePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        cropMoveStartRef.current = { ...cropRectRef.current };
      },
      onPanResponderMove: (_, gs) => {
        const start = cropMoveStartRef.current;
        setCropRect(clampCrop({
          ...start,
          x: start.x + gs.dx,
          y: start.y + gs.dy,
        }));
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  // Factory for corner drag PanResponders
  const makeCornerPan = (corner) => {
    const startRef = { current: { x: 0, y: 0, w: 200, h: 200 } };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = { ...cropRectRef.current };
      },
      onPanResponderMove: (_, gs) => {
        const s = startRef.current;
        let newRect;
        if (corner === 'tl') {
          newRect = { x: s.x + gs.dx, y: s.y + gs.dy, w: s.w - gs.dx, h: s.h - gs.dy };
        } else if (corner === 'tr') {
          newRect = { x: s.x, y: s.y + gs.dy, w: s.w + gs.dx, h: s.h - gs.dy };
        } else if (corner === 'bl') {
          newRect = { x: s.x + gs.dx, y: s.y, w: s.w - gs.dx, h: s.h + gs.dy };
        } else { // br
          newRect = { x: s.x, y: s.y, w: s.w + gs.dx, h: s.h + gs.dy };
        }
        setCropRect(clampCrop(newRect));
      },
      onPanResponderRelease: () => {},
    });
  };

  const tlPan = useRef(makeCornerPan('tl')).current;
  const trPan = useRef(makeCornerPan('tr')).current;
  const blPan = useRef(makeCornerPan('bl')).current;
  const brPan = useRef(makeCornerPan('br')).current;

  // Confirm crop from crop guide overlay
  const confirmCrop = useCallback(async () => {
    if (!rawPickedImage) return;
    
    try {
      const base64Data = rawPickedImage.base64;
      if (!base64Data) {
        setCapturedImage(rawPickedImage);
        setShowCropGuide(false);
        setRawPickedImage(null);
        return;
      }

      if (Platform.OS === 'web') {
        const croppedBase64 = await new Promise((resolve) => {
          const img = new window.Image();
          img.onload = () => {
            const imgW = img.width;
            const imgH = img.height;
            
            // imageRendered = the actual rendered image rect inside the view
            // after resizeMode="contain". This accounts for letterboxing.
            const ir = imageRendered;
            if (ir.w === 0 || ir.h === 0) {
              resolve(base64Data);
              return;
            }
            
            // Scale from rendered image display coords to actual pixel coords
            const scaleX = imgW / ir.w;
            const scaleY = imgH / ir.h;
            
            // cropRect is in view coords, offset by ir.x/ir.y to get
            // position relative to the rendered image area
            const relX = cropRect.x - ir.x;
            const relY = cropRect.y - ir.y;
            
            // Map to actual pixel coords
            const sx = Math.max(0, Math.round(relX * scaleX));
            const sy = Math.max(0, Math.round(relY * scaleY));
            const sw = Math.min(imgW - sx, Math.round(cropRect.w * scaleX));
            const sh = Math.min(imgH - sy, Math.round(cropRect.h * scaleY));
            
            const canvas = document.createElement('canvas');
            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            resolve(dataUrl.split(',')[1]);
          };
          img.onerror = () => resolve(base64Data);
          img.src = `data:image/jpeg;base64,${base64Data}`;
        });
        
        setCapturedImage({
          uri: `data:image/jpeg;base64,${croppedBase64}`,
          base64: croppedBase64,
        });
      } else {
        setCapturedImage(rawPickedImage);
      }
      
      setShowCropGuide(false);
      setRawPickedImage(null);
      updateStatus('Image cropped successfully', 'success');
    } catch (error) {
      console.error('Crop error:', error);
      setCapturedImage(rawPickedImage);
      setShowCropGuide(false);
      setRawPickedImage(null);
    }
  }, [rawPickedImage, cropRect, imageRendered]);

  // Cancel crop guide
  const cancelCrop = useCallback(() => {
    setShowCropGuide(false);
    setRawPickedImage(null);
  }, []);

  // Crop image to the scan frame region (70% center square)
  const cropToScanFrame = useCallback(async (base64Data, videoWidth, videoHeight) => {
    if (Platform.OS !== 'web') return base64Data; // native: return as-is
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const w = img.width;
        const h = img.height;
        const frameSize = Math.min(w, h) * 0.70;
        const sx = (w - frameSize) / 2;
        const sy = (h - frameSize) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = frameSize;
        canvas.height = frameSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, frameSize, frameSize, 0, 0, frameSize, frameSize);
        const cropped = canvas.toDataURL('image/jpeg', 0.85);
        resolve(cropped.split(',')[1]);
      };
      img.onerror = () => resolve(base64Data);
      img.src = `data:image/jpeg;base64,${base64Data}`;
    });
  }, []);

  // Auto-request camera permission on mobile each time user enters camera mode.
  // Guard prevents duplicate prompts during the same camera session.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (inputMode !== 'camera') {
      hasAutoRequestedCameraPermission.current = false;
      return;
    }
    // Wait until the permission module has loaded the initial status;
    // calling requestPermission() while permission is still null can
    // cause an automatic decline on some devices / Expo SDK versions.
    if (!permission) return;
    if (permission.granted) return;
    if (permission.canAskAgain === false) return;
    if (hasAutoRequestedCameraPermission.current) return;

    hasAutoRequestedCameraPermission.current = true;
    requestPermission();
  }, [inputMode, permission, requestPermission]);

  // Open device settings for camera permission (when denied permanently)
  const openAppSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }, []);

  // Initialize web camera when mode changes
  useEffect(() => {
    if (Platform.OS === 'web' && inputMode === 'camera' && !capturedImage) {
      startWebCamera();
    }
    return () => {
      if (Platform.OS === 'web') {
        stopWebCamera();
      }
    };
  }, [inputMode, capturedImage]);

  // Start web camera (for web platform)
  const startWebCamera = async () => {
    if (Platform.OS !== 'web') return;
    if (isStartingWebCameraRef.current) return;
    if (isWebCameraActive && webCameraStream) return;
    
    try {
      isStartingWebCameraRef.current = true;
      setWebCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      setWebCameraStream(stream);
      setIsWebCameraActive(true);
      
      // Attach stream to video element after render
      setTimeout(() => {
        if (webVideoRef.current) {
          webVideoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (error) {
      console.error('Web camera error:', error);
      setWebCameraError(error.message || 'Camera access denied');
      setIsWebCameraActive(false);
      updateStatus('Camera access failed. You can retry or switch to gallery.', 'error');
    } finally {
      isStartingWebCameraRef.current = false;
    }
  };

  // Stop web camera
  const stopWebCamera = () => {
    if (webCameraStream) {
      webCameraStream.getTracks().forEach(track => track.stop());
      setWebCameraStream(null);
      setIsWebCameraActive(false);
    }
  };

  // Capture image from web camera — captures the full video frame as-is
  const captureWebImage = async () => {
    if (!webVideoRef.current || !isWebCameraActive) {
      updateStatus('Web camera not ready', 'error');
      return;
    }

    try {
      updateStatus('Capturing image...', 'info');
      const video = webVideoRef.current;
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // Capture the full video frame (no cropping) so the captured image
      // matches what the user sees in the preview without appearing zoomed.
      const canvas = document.createElement('canvas');
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, vw, vh);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.split(',')[1];
      
      setCapturedImage({
        uri: dataUrl,
        base64: base64,
      });
      
      stopWebCamera();
      updateStatus('Image captured successfully', 'success');
    } catch (error) {
      updateStatus(`Capture failed: ${error.message}`, 'error');
    }
  };

  const captureImage = async () => {
    if (!cameraRef.current) return;
    
    try {
      updateStatus('Capturing image...', 'info');
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });
      
      setCapturedImage(photo);
      updateStatus('Image captured successfully', 'success');
    } catch (error) {
      updateStatus(`Capture failed: ${error.message}`, 'error');
    }
  };

  // Convert blob URL to base64 (for web compatibility)
  const convertToBase64 = async (uri) => {
    if (uri.startsWith('data:')) {
      return uri.split(',')[1]; // Remove data URI prefix, return just base64
    }
    
    if (Platform.OS === 'web') {
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result;
            // Extract base64 part from data URL
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.error('Error converting to base64:', error);
        return null;
      }
    }
    
    return null;
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false, // No auto-crop — user will crop via our guide
        quality: 0.8,
        base64: Platform.OS !== 'web',
      });

      if (!result.canceled && result.assets[0]) {
        let base64Data = result.assets[0].base64;
        
        // Convert for web if base64 not available
        if (!base64Data && Platform.OS === 'web') {
          base64Data = await convertToBase64(result.assets[0].uri);
        }

        // Show crop guide overlay instead of auto-cropping
        const pickedImage = {
          uri: result.assets[0].uri,
          base64: base64Data,
        };
        setRawPickedImage(pickedImage);
        setCropRect({ x: 50, y: 50, w: 200, h: 200 }); // will be re-initialized on layout
        setShowCropGuide(true);
        updateStatus('Drag corners to resize, drag center to move, then tap Confirm', 'info');
      }
    } catch (error) {
      updateStatus(`Failed to pick image: ${error.message}`, 'error');
    }
  };

  const analyzeImage = async () => {
    if (!capturedImage?.base64) {
      updateStatus('No image to analyze', 'error');
      return;
    }

    // Go straight to ML analysis — no blocking quality gate.
    setIsLoading(true);
    setQualityIssues(null);
    await performAnalysis();
  };

  // Force-analyze bypassing quality check (user chose to proceed anyway)
  const forceAnalyze = async () => {
    setShowQualityModal(false);
    setIsLoading(true);
    await performAnalysis();
  };

  const performAnalysis = async () => {
    updateStatus('Analyzing image with trained ML model...', 'info');

    try {
      const imageDataUrl = `data:image/jpeg;base64,${capturedImage.base64}`;
      const token = await AuthService.getToken();
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.PREDICT), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          image: imageDataUrl,
          subject: subject,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        updateStatus(`Analysis failed: ${data.error || response.statusText}`, 'error');
        return;
      }

      setResult(data);
      
      // Show appropriate status message and SweetAlert based on detection
      if (data.is_bignay === false) {
        updateStatus('Image does not appear to be a Bignay fruit or leaf', 'error');
        showWarning(
          'Not Recognized',
          data.detection?.reason || 'The uploaded image does not appear to be a Bignay fruit or leaf. Please try again with a clearer image.'
        );
      } else {
        const confidenceLevel = data.detection?.confidence_level || 'unknown';
        const pct = (data.confidence * 100).toFixed(0);
        const displayResult = data.result === 'mold' ? 'Moldy' : data.result;
        
        // Build alert message with mold threshold awareness
        let alertMsg = `Classification: ${displayResult}\nConfidence: ${pct}% (${confidenceLevel})`;
        
        // Mold threshold guidance
        if (data.result === 'mold' && data.confidence < MOLD_DISCARD_THRESHOLD) {
          alertMsg += `\n\n⚠️ Mold detected at ${pct}% confidence (below ${(MOLD_DISCARD_THRESHOLD * 100).toFixed(0)}% discard threshold). Monitor the ${data.subject || 'subject'} closely rather than discarding immediately.`;
        }
        
        if (data.leaf_interference?.has_significant_leaves) {
          alertMsg += '\n\n⚠️ Leaves detected in the image may have affected the classification. For best results, capture the fruit with minimal leaf coverage.';
        }
        
        updateStatus(`Analysis complete — ${displayResult} (${pct}%)`, 'success');
        
        if (data.result === 'mold' && data.confidence < MOLD_DISCARD_THRESHOLD) {
          showWarning('Mold Detected — Low Confidence', alertMsg);
        } else {
          showSuccess('Analysis Complete', alertMsg);
        }
      }
    } catch (error) {
      updateStatus(`Connection error: ${error.message}`, 'error');
      showError(
        'Connection Error', 
        `Could not connect to the server. Please check your network and ensure the backend is running.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const resetCapture = () => {
    setCapturedImage(null);
    setResult(null);
    setShowTrainingModal(false);
    setSelectedLabel(null);
    setQualityIssues(null);
    setShowQualityModal(false);
    setShowCropGuide(false);
    setRawPickedImage(null);
    setCropRect({ x: 50, y: 50, w: 200, h: 200 });
    updateStatus('', 'info');
    // Restart web camera if in camera mode on web
    if (Platform.OS === 'web' && inputMode === 'camera') {
      setTimeout(() => startWebCamera(), 100);
    }
  };

  // Training contribution functions
  const fetchTrainingStats = async () => {
    try {
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.TRAINING_STATS));
      if (response.ok) {
        const data = await response.json();
        setTrainingStats(data);
      }
    } catch (error) {
      console.log('Could not fetch training stats:', error.message);
    }
  };

  const openTrainingModal = () => {
    if (result) {
      setSelectedLabel(result.result);
    }
    setShowTrainingModal(true);
    fetchTrainingStats();
  };

  const submitTrainingContribution = async (isCorrection = false, labelOverride = null) => {
    const label = labelOverride || selectedLabel;
    if (!capturedImage?.base64 || !label) {
      updateStatus('Please select a label for training', 'error');
      return;
    }

    setIsSubmittingTraining(true);

    try {
      const imageDataUrl = `data:image/jpeg;base64,${capturedImage.base64}`;
      
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.TRAINING_CONTRIBUTE), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: subject,
          label: label,
          image: imageDataUrl,
          original_prediction: result?.result || 'unknown',
          original_confidence: result?.confidence || 0,
          is_correction: isCorrection,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        updateStatus('🎉 Thank you! Your contribution helps improve the model.', 'success');
        setShowTrainingModal(false);
        fetchTrainingStats();
      } else {
        updateStatus(`Contribution failed: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      updateStatus(`Connection error: ${error.message}`, 'error');
    } finally {
      setIsSubmittingTraining(false);
    }
  };

  const confirmClassification = () => {
    if (result) {
      const label = result.result;
      setSelectedLabel(label);
      submitTrainingContribution(false, label);
    }
  };

  const correctClassification = () => {
    submitTrainingContribution(true);
  };

  // Missed detection contribution
  const submitMissedDetection = async () => {
    if (!capturedImage?.base64) {
      updateStatus('No image to submit.', 'error');
      return;
    }
    setIsSubmittingTraining(true);
    try {
      const imageDataUrl = `data:image/jpeg;base64,${capturedImage.base64}`;
      const response = await fetch(buildApiUrl('/api/training/contribute/missed'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: subject,
          image: imageDataUrl,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        updateStatus('🎉 Thank you! Your upload will help the AI learn to detect Bignay better.', 'success');
      } else {
        updateStatus(`Contribution failed: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      updateStatus(`Connection error: ${error.message}`, 'error');
    } finally {
      setIsSubmittingTraining(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      showWarning('Login Required', 'You must be logged in to access the Scanner.', {
        onConfirm: () => {
          hideAlert();
          navigation.getParent()?.navigate('Auth', { screen: 'Login' });
        },
      });
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.loginPrompt}>
          <View style={styles.loginPromptIcon}>
            <Ionicons name="lock-closed" size={48} color={COLORS.primary} />
          </View>
          <Text style={styles.loginPromptTitle}>Login Required</Text>
          <Text style={styles.loginPromptText}>
            Please login to access the Bignay Scanner and analyze fruit or leaf images.
          </Text>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => navigation.getParent()?.navigate('Auth', { screen: 'Login' })}
          >
            <Ionicons name="log-in-outline" size={20} color={COLORS.textOnPrimary} />
            <Text style={styles.loginBtnText}>Login / Register</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // No longer block the entire screen for permissions — handled inline in camera view

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={[
        styles.contentContainer,
        isDesktop && {
          maxWidth: maxContentWidth,
          width: '100%',
          alignSelf: 'center',
          paddingHorizontal: 24,
        }
      ]}
    >
      <View style={[styles.scannerLayout, isDesktop && styles.scannerLayoutDesktop]}>
        <View style={[styles.leftPanel, isDesktop && styles.leftPanelDesktop]}>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeButton, inputMode === 'camera' && styles.modeButtonActive]}
              onPress={() => {
                setInputMode('camera');
                if (Platform.OS === 'web') {
                  setWebCameraError(null);
                }
              }}
            >
              <Ionicons
                name="camera"
                size={22}
                color={inputMode === 'camera' ? COLORS.textOnPrimary : COLORS.text}
              />
              <Text style={[styles.modeButtonText, inputMode === 'camera' && styles.modeButtonTextActive]}>
                Camera
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, inputMode === 'gallery' && styles.modeButtonActive]}
              onPress={() => {
                setInputMode('gallery');
                if (Platform.OS === 'web') stopWebCamera();
              }}
            >
              <Ionicons
                name="image"
                size={22}
                color={inputMode === 'gallery' ? COLORS.textOnPrimary : COLORS.text}
              />
              <Text style={[styles.modeButtonText, inputMode === 'gallery' && styles.modeButtonTextActive]}>
                Gallery
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.subjectContainer}>
            <Text style={styles.sectionLabel}>Classification Type</Text>
            <View style={styles.subjectButtons}>
              <TouchableOpacity
                style={[styles.subjectButton, subject === SUBJECT_TYPES.FRUIT && styles.subjectButtonActive]}
                onPress={() => setSubject(SUBJECT_TYPES.FRUIT)}
              >
                <Text style={styles.subjectEmoji}>🍇</Text>
                <Text style={[styles.subjectButtonText, subject === SUBJECT_TYPES.FRUIT && styles.subjectButtonTextActive]}>
                  Fruit
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subjectButton, subject === SUBJECT_TYPES.LEAF && styles.subjectButtonActive]}
                onPress={() => setSubject(SUBJECT_TYPES.LEAF)}
              >
                <Text style={styles.subjectEmoji}>🍃</Text>
                <Text style={[styles.subjectButtonText, subject === SUBJECT_TYPES.LEAF && styles.subjectButtonTextActive]}>
                  Leaf
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.cameraContainer, isDesktop && styles.cameraContainerDesktop]}>
            {showCropGuide && rawPickedImage ? (
              /* ── Free Crop Guide Overlay ── */
              <View style={styles.cropGuideContainer}>
                <Image
                  source={{ uri: rawPickedImage.uri }}
                  style={styles.cropGuideImage}
                  resizeMode="contain"
                  onLayout={(e) => {
                    const { width: viewW, height: viewH } = e.nativeEvent.layout;
                    setImageLayout({ width: viewW, height: viewH });
                    
                    // Get natural image dimensions to calculate the actual rendered rect
                    if (Platform.OS === 'web') {
                      const tempImg = new window.Image();
                      tempImg.onload = () => {
                        const natW = tempImg.width;
                        const natH = tempImg.height;
                        setImageNaturalSize({ width: natW, height: natH });
                        
                        // Calculate where the image actually renders inside the view
                        // with resizeMode="contain" (letterboxing)
                        const imageAspect = natW / natH;
                        const viewAspect = viewW / viewH;
                        let renderedW, renderedH, offsetX, offsetY;
                        
                        if (imageAspect > viewAspect) {
                          // Image is wider than view — pillarboxing (bars top/bottom)
                          renderedW = viewW;
                          renderedH = viewW / imageAspect;
                          offsetX = 0;
                          offsetY = (viewH - renderedH) / 2;
                        } else {
                          // Image is taller than view — letterboxing (bars left/right)
                          renderedH = viewH;
                          renderedW = viewH * imageAspect;
                          offsetX = (viewW - renderedW) / 2;
                          offsetY = 0;
                        }
                        
                        const ir = { x: offsetX, y: offsetY, w: renderedW, h: renderedH };
                        setImageRendered(ir);
                        imageRenderedRef.current = ir;
                        
                        // Initialize crop rect centered at 70% of the rendered image
                        const size = Math.min(renderedW, renderedH) * 0.7;
                        const initRect = {
                          x: offsetX + (renderedW - size) / 2,
                          y: offsetY + (renderedH - size) / 2,
                          w: size,
                          h: size,
                        };
                        setCropRect(initRect);
                        cropRectRef.current = initRect;
                      };
                      tempImg.src = rawPickedImage.uri;
                    } else {
                      // On native, Image.getSize would be used, but for now
                      // assume the image fills the view
                      const ir = { x: 0, y: 0, w: viewW, h: viewH };
                      setImageRendered(ir);
                      imageRenderedRef.current = ir;
                      const size = Math.min(viewW, viewH) * 0.7;
                      const initRect = {
                        x: (viewW - size) / 2,
                        y: (viewH - size) / 2,
                        w: size,
                        h: size,
                      };
                      setCropRect(initRect);
                      cropRectRef.current = initRect;
                    }
                  }}
                />
                {/* Dimmed overlay outside crop area */}
                <View style={styles.cropOverlayMask} pointerEvents="none">
                  {/* Top dim */}
                  <View style={[styles.cropDimRegion, { top: 0, left: 0, right: 0, height: cropRect.y }]} />
                  {/* Bottom dim */}
                  <View style={[styles.cropDimRegion, { top: cropRect.y + cropRect.h, left: 0, right: 0, bottom: 0 }]} />
                  {/* Left dim */}
                  <View style={[styles.cropDimRegion, { top: cropRect.y, left: 0, width: cropRect.x, height: cropRect.h }]} />
                  {/* Right dim */}
                  <View style={[styles.cropDimRegion, { top: cropRect.y, left: cropRect.x + cropRect.w, right: 0, height: cropRect.h }]} />
                  {/* Crop border */}
                  <View style={[styles.cropGuideFrame, {
                    left: cropRect.x,
                    top: cropRect.y,
                    width: cropRect.w,
                    height: cropRect.h,
                  }]}>
                    {/* Grid lines (rule of thirds) */}
                    <View style={[styles.cropGridLineH, { top: '33.3%' }]} />
                    <View style={[styles.cropGridLineH, { top: '66.6%' }]} />
                    <View style={[styles.cropGridLineV, { left: '33.3%' }]} />
                    <View style={[styles.cropGridLineV, { left: '66.6%' }]} />
                    {/* Corner brackets */}
                    <View style={[styles.cropCorner, styles.cropCornerTL]} />
                    <View style={[styles.cropCorner, styles.cropCornerTR]} />
                    <View style={[styles.cropCorner, styles.cropCornerBL]} />
                    <View style={[styles.cropCorner, styles.cropCornerBR]} />
                  </View>
                </View>
                {/* Draggable center area to move */}
                <View
                  style={[styles.cropMoveSurface, {
                    left: cropRect.x + 24,
                    top: cropRect.y + 24,
                    width: Math.max(20, cropRect.w - 48),
                    height: Math.max(20, cropRect.h - 48),
                  }]}
                  {...cropMovePanResponder.panHandlers}
                />
                {/* Corner resize handles */}
                <View style={[styles.cropHandle, { left: cropRect.x - 15, top: cropRect.y - 15 }]} {...tlPan.panHandlers} />
                <View style={[styles.cropHandle, { left: cropRect.x + cropRect.w - 15, top: cropRect.y - 15 }]} {...trPan.panHandlers} />
                <View style={[styles.cropHandle, { left: cropRect.x - 15, top: cropRect.y + cropRect.h - 15 }]} {...blPan.panHandlers} />
                <View style={[styles.cropHandle, { left: cropRect.x + cropRect.w - 15, top: cropRect.y + cropRect.h - 15 }]} {...brPan.panHandlers} />

                <Text style={styles.cropGuideLabel}>Drag corners to resize, drag center to move</Text>
                <View style={styles.cropActions}>
                  <TouchableOpacity style={styles.cropCancelButton} onPress={cancelCrop}>
                    <Ionicons name="close-circle-outline" size={22} color={COLORS.danger} />
                    <Text style={styles.cropCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cropConfirmButton} onPress={confirmCrop}>
                    <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.textOnPrimary} />
                    <Text style={styles.cropConfirmText}>Confirm Crop</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : capturedImage ? (
              <Image source={{ uri: capturedImage.uri }} style={styles.capturedImage} />
            ) : inputMode === 'camera' ? (
              Platform.OS === 'web' ? (
                <View style={styles.cameraWrapper}>
                  {isWebCameraActive ? (
                    <>
                      <video
                        ref={webVideoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          transform: 'scaleX(1)',
                        }}
                      />
                      <View style={styles.cameraOverlay}>
                        <View style={styles.scanFrameOuter}>
                          {/* Corner brackets */}
                          <View style={[styles.cornerBracket, styles.cornerTL]} />
                          <View style={[styles.cornerBracket, styles.cornerTR]} />
                          <View style={[styles.cornerBracket, styles.cornerBL]} />
                          <View style={[styles.cornerBracket, styles.cornerBR]} />
                          {/* Animated scan line */}
                          <Animated.View style={[
                            styles.scanLine,
                            { top: scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: ['10%', '90%'] }) }
                          ]} />
                        </View>
                        <Text style={styles.scanFrameLabel}>Position {subject === 'leaf' ? 'leaf' : 'fruit'} inside the frame</Text>
                      </View>
                    </>
                  ) : webCameraError ? (
                    <View style={styles.webCameraErrorContainer}>
                      <Ionicons name="camera-outline" size={64} color={COLORS.danger} />
                      <Text style={styles.webCameraErrorTitle}>Camera Access Issue</Text>
                      <Text style={styles.webCameraErrorText}>{webCameraError}</Text>
                      <TouchableOpacity style={styles.retryWebCameraButton} onPress={startWebCamera}>
                        <Text style={styles.retryWebCameraText}>Try Again</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.switchToGalleryButton} onPress={() => setInputMode('gallery')}>
                        <Text style={styles.switchToGalleryText}>Use Gallery Instead</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.webCameraLoading}>
                      <ActivityIndicator size="large" color={COLORS.primary} />
                      <Text style={styles.webCameraLoadingText}>Starting camera...</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.cameraWrapper}>
                  {permission?.granted ? (
                    <>
                      <CameraView ref={cameraRef} style={styles.camera} facing="back" />
                      <View style={styles.cameraOverlay}>
                        <View style={styles.scanFrameOuter}>
                          {/* Corner brackets */}
                          <View style={[styles.cornerBracket, styles.cornerTL]} />
                          <View style={[styles.cornerBracket, styles.cornerTR]} />
                          <View style={[styles.cornerBracket, styles.cornerBL]} />
                          <View style={[styles.cornerBracket, styles.cornerBR]} />
                          {/* Animated scan line */}
                          <Animated.View style={[
                            styles.scanLine,
                            { top: scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: ['10%', '90%'] }) }
                          ]} />
                        </View>
                        <Text style={styles.scanFrameLabel}>Position {subject === 'leaf' ? 'leaf' : 'fruit'} inside the frame</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.permissionInlineContainer}>
                      <Ionicons name="camera-outline" size={48} color={COLORS.textSecondary} />
                      <Text style={styles.permissionInlineTitle}>Camera Permission Required</Text>
                      {permission?.canAskAgain === false ? (
                        <>
                          <Text style={styles.permissionInlineText}>Camera permission was denied. Please enable it in your device settings to use the camera.</Text>
                          <TouchableOpacity style={styles.permissionInlineButton} onPress={openAppSettings}>
                            <Ionicons name="settings-outline" size={18} color={COLORS.textOnPrimary} />
                            <Text style={styles.permissionInlineButtonText}>Open Settings</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <Text style={styles.permissionInlineText}>Tap below to grant camera access, or switch to Gallery mode.</Text>
                          <TouchableOpacity style={styles.permissionInlineButton} onPress={requestPermission}>
                            <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.textOnPrimary} />
                            <Text style={styles.permissionInlineButtonText}>Grant Access</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      <TouchableOpacity style={styles.permissionInlineFallback} onPress={() => setInputMode('gallery')}>
                        <Text style={styles.permissionInlineFallbackText}>Use Gallery Instead</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )
            ) : (
              <TouchableOpacity style={styles.uploadPlaceholder} onPress={pickImage}>
                <Ionicons name="cloud-upload-outline" size={64} color={COLORS.primary} />
                <Text style={styles.uploadText}>Tap to select an image</Text>
                <Text style={styles.uploadHint}>Supports JPG, PNG formats</Text>
                <View style={styles.uploadCropHint}>
                  <Ionicons name="crop-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.uploadCropHintText}>You can position a crop guide after selecting</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.actionContainer}>
            {capturedImage ? (
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.analyzeButton]}
                  onPress={analyzeImage}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.textOnPrimary} />
                  ) : (
                    <>
                      <Ionicons name="scan" size={24} color={COLORS.textOnPrimary} />
                      <Text style={styles.actionButtonText}>Analyze</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.retakeButton]}
                  onPress={resetCapture}
                  disabled={isLoading}
                >
                  <Ionicons name="refresh" size={24} color={COLORS.textOnPrimary} />
                  <Text style={styles.actionButtonText}>Retake</Text>
                </TouchableOpacity>
              </View>
            ) : inputMode === 'camera' ? (
              <TouchableOpacity
                style={styles.captureButton}
                onPress={Platform.OS === 'web' ? captureWebImage : captureImage}
                disabled={Platform.OS === 'web' && !isWebCameraActive}
              >
                <View style={[styles.captureButtonOuter, Platform.OS === 'web' && !isWebCameraActive && styles.captureButtonDisabled]}>
                  <View style={styles.captureButtonInner} />
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* ===== RIGHT PANEL: RESULTS ===== */}
        <View style={[styles.rightPanel, isDesktop && styles.rightPanelDesktop]}>
          <View style={styles.panelHeader}>
            <Ionicons name="analytics-outline" size={20} color={COLORS.primary} />
            <Text style={styles.panelTitle}>Analysis Report</Text>
          </View>

          {status.message ? (
            <View style={[styles.statusBar, styles[`status_${status.type}`]]}>
              <Ionicons
                name={status.type === 'success' ? 'checkmark-circle' : status.type === 'error' ? 'alert-circle' : 'information-circle'}
                size={18}
                color={status.type === 'success' ? COLORS.success : status.type === 'error' ? COLORS.danger : COLORS.info}
              />
              <Text style={styles.statusText}>{status.message}</Text>
            </View>
          ) : null}

          {/* Client-side quality warnings (non-blocking) */}
          {qualityIssues?.warnings?.length > 0 && !showQualityModal && (
            <View style={styles.qualityWarningBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.warning} />
              <Text style={styles.qualityWarningBannerText}>
                {qualityIssues.warnings.map(w => w.message).join(' ')}
              </Text>
            </View>
          )}

          {!result ? (
            <View style={styles.placeholderContainer}>
              {/* Sample Result Placeholder */}
              <View style={styles.placeholderCard}>
                <View style={styles.placeholderIconRow}>
                  <View style={styles.placeholderIconCircle}>
                    <Ionicons name="leaf-outline" size={28} color={COLORS.primary} />
                  </View>
                </View>
                <Text style={styles.placeholderTitle}>Awaiting Scan</Text>
                <Text style={styles.placeholderSubtitle}>Your analysis report will appear here</Text>

                <View style={styles.placeholderDivider} />

                {/* Sample skeleton rows */}
                <View style={styles.placeholderRow}>
                  <Text style={styles.placeholderLabel}>Classification</Text>
                  <View style={styles.placeholderValueBar}>
                    <View style={[styles.placeholderValueFill, { width: '60%' }]} />
                  </View>
                </View>
                <View style={styles.placeholderRow}>
                  <Text style={styles.placeholderLabel}>Confidence</Text>
                  <View style={styles.placeholderValueBar}>
                    <View style={[styles.placeholderValueFill, { width: '45%' }]} />
                  </View>
                </View>
                <View style={styles.placeholderRow}>
                  <Text style={styles.placeholderLabel}>Ripeness</Text>
                  <View style={styles.placeholderValueBar}>
                    <View style={[styles.placeholderValueFill, { width: '55%' }]} />
                  </View>
                </View>
                <View style={styles.placeholderRow}>
                  <Text style={styles.placeholderLabel}>Moldy Level</Text>
                  <View style={styles.placeholderValueBar}>
                    <View style={[styles.placeholderValueFill, { width: '20%' }]} />
                  </View>
                </View>
                <View style={styles.placeholderRow}>
                  <Text style={styles.placeholderLabel}>Recommendation</Text>
                  <View style={styles.placeholderValueBar}>
                    <View style={[styles.placeholderValueFill, { width: '70%' }]} />
                  </View>
                </View>

                <View style={styles.placeholderFooter}>
                  <Ionicons name="information-circle-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.placeholderFooterText}>Capture or upload an image, then tap Analyze</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.resultsContainer}>
              {result.is_bignay === false ? (
                <View style={styles.notBignayCard}>
                  <View style={styles.notBignayHeader}>
                    <View style={styles.notBignayIconCircle}>
                      <Ionicons name="close-circle" size={24} color={COLORS.danger} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notBignayTitle}>Not a Bignay</Text>
                      <Text style={styles.notBignaySubtitle}>
                        {result.detection?.confidence_level === 'ml_rejected'
                          ? 'AI Model Detection'
                          : 'Not identified as Bignay'}
                      </Text>
                    </View>
                    {result.detection?.not_bignay_model?.model_available && (
                      <View style={[styles.confidencePill, { backgroundColor: COLORS.danger }]}>
                        <Text style={styles.confidencePillText}>
                          {(result.detection.not_bignay_model.not_bignay_probability * 100).toFixed(0)}%
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.notBignayMessage}>
                    {result.detection?.reason || 'The uploaded image could not be classified as a Bignay fruit or leaf. Please ensure the subject is clearly visible.'}
                  </Text>
                  {result.detection?.not_bignay_model?.model_available && (
                    <View style={styles.notBignayModelInfo}>
                      <Ionicons name="hardware-chip-outline" size={14} color={COLORS.textSecondary} />
                      <Text style={styles.notBignayModelText}>
                        AI Detection: {(result.detection.not_bignay_model.not_bignay_probability * 100).toFixed(1)}% not-bignay confidence
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <>
                  {/* Primary Classification Card */}
                  <View style={styles.classificationCard}>
                    <View style={styles.classificationTopRow}>
                      <View style={styles.classificationIconCircle}>
                        <Ionicons
                          name={result.subject === 'fruit' ? 'nutrition-outline' : 'leaf-outline'}
                          size={22}
                          color={COLORS.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.classificationLabel}>
                          {result.subject === 'fruit' ? 'Fruit' : 'Leaf'} Classification
                        </Text>
                        <Text style={styles.classificationValue}>
                          {result.result === 'mold' ? 'Moldy' : 
                           result.result.charAt(0).toUpperCase() + result.result.slice(1)}
                        </Text>
                      </View>
                      <View style={[
                        styles.confidencePill,
                        { backgroundColor: result.confidence > 0.7 ? COLORS.success : result.confidence > 0.4 ? COLORS.warning : COLORS.danger }
                      ]}>
                        <Text style={styles.confidencePillText}>{(result.confidence * 100).toFixed(0)}%</Text>
                      </View>
                    </View>

                    {/* Confidence bar */}
                    <View style={styles.confidenceBarContainer}>
                      <View style={styles.confidenceBarBg}>
                        <View style={[
                          styles.confidenceBarFill,
                          {
                            width: `${(result.confidence * 100).toFixed(0)}%`,
                            backgroundColor: result.confidence > 0.7 ? COLORS.success : result.confidence > 0.4 ? COLORS.warning : COLORS.danger,
                          }
                        ]} />
                      </View>
                      {result.detection?.confidence_level && (
                        <Text style={styles.confidenceLevelText}>
                          {result.detection.confidence_level.charAt(0).toUpperCase() + result.detection.confidence_level.slice(1)} confidence
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Fruit Detection Card removed - detection pinning not accurate */}

                  {/* Ripeness & Moldy Analysis Card (Fruit only) */}
                  {result.subject === 'fruit' && result.analytics && (
                    <View style={styles.analyticsDetailCard}>
                      <View style={styles.proCardHeaderRow}>
                        <Ionicons name="bar-chart-outline" size={18} color={COLORS.primary} />
                        <Text style={styles.proCardTitle}>Detailed Analysis</Text>
                      </View>

                      {/* Color Analysis (HSV-based ripeness verification) */}
                      {result.fruit?.color_analysis && (
                        <View style={styles.analyticsSection}>
                          <Text style={styles.analyticsSectionTitle}>Color Analysis</Text>
                          <View style={styles.colorAnalysisGrid}>
                            {[
                              { label: 'Green (Unripe)', pct: result.fruit.color_analysis.green_pct, color: '#22C55E' },
                              { label: 'Purple/Red (Ripe)', pct: result.fruit.color_analysis.purple_red_pct, color: '#8B5CF6' },
                              { label: 'Dark (Overripe)', pct: result.fruit.color_analysis.dark_pct, color: '#6B7280' },
                            ].map((item) => (
                              <View key={item.label} style={styles.analyticsBarRow}>
                                <Text style={styles.analyticsBarLabel}>{item.label}</Text>
                                <View style={styles.analyticsBarBg}>
                                  <View style={[styles.analyticsBarFill, { width: `${Math.min(item.pct, 100)}%`, backgroundColor: item.color }]} />
                                </View>
                                <Text style={styles.analyticsBarValue}>{item.pct?.toFixed(1)}%</Text>
                              </View>
                            ))}
                          </View>
                          {result.fruit.color_analysis.details?.map((detail, idx) => (
                            <View key={idx} style={styles.colorAnalysisDetail}>
                              <Ionicons name="color-palette-outline" size={14} color={COLORS.textSecondary} />
                              <Text style={styles.colorAnalysisDetailText}>{detail}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Ripeness Breakdown */}
                      {result.analytics.ripeness_analysis && (
                        <View style={styles.analyticsSection}>
                          <View style={styles.analyticsSectionTitleRow}>
                            <Text style={styles.analyticsSectionTitle}>Ripeness Breakdown</Text>
                            {result.analytics.ripeness_analysis.source === 'per_fruit_detection' && (
                              <View style={[styles.qualityChip, { backgroundColor: '#DCFCE7' }]}>
                                <Text style={[styles.qualityChipText, { color: '#16A34A', fontSize: 10 }]}>
                                  Per-fruit ({result.analytics.fruit_detection_count || '?'})
                                </Text>
                              </View>
                            )}
                          </View>
                          {[
                            { label: 'Ripe', pct: result.analytics.ripeness_analysis.ripe_pct, color: '#8B5CF6' },
                            { label: 'Unripe', pct: result.analytics.ripeness_analysis.unripe_pct, color: '#22C55E' },
                            { label: 'Overripe', pct: result.analytics.ripeness_analysis.overripe_pct, color: '#F59E0B' },
                            { label: 'Mold', pct: result.analytics.ripeness_analysis.mold_pct, color: '#EF4444' },
                          ].filter(item => (item.pct || 0) > 0).map((item) => (
                            <View key={item.label} style={styles.analyticsBarRow}>
                              <Text style={styles.analyticsBarLabel}>{item.label}</Text>
                              <View style={styles.analyticsBarBg}>
                                <View style={[styles.analyticsBarFill, { width: `${Math.min(item.pct, 100)}%`, backgroundColor: item.color }]} />
                              </View>
                              <Text style={styles.analyticsBarValue}>{item.pct?.toFixed(1)}%</Text>
                            </View>
                          ))}
                          <View style={styles.ripenessIndexRow}>
                            <Text style={styles.ripenessIndexLabel}>Ripeness Index</Text>
                            <Text style={styles.ripenessIndexValue}>{result.analytics.ripeness_analysis.ripeness_index}/100</Text>
                          </View>
                        </View>
                      )}

                      {/* Moldy Detection */}
                      {result.analytics.mold_detection && (
                        <View style={styles.analyticsSection}>
                          <Text style={styles.analyticsSectionTitle}>Moldy Detection</Text>
                          <View style={styles.moldRow}>
                            <View style={styles.moldIndicator}>
                              <Ionicons
                                name={result.analytics.mold_detection.status === 'clear' ? 'shield-checkmark' : 'warning'}
                                size={20}
                                color={result.analytics.mold_detection.status === 'clear' ? COLORS.success : COLORS.danger}
                              />
                              <Text style={[
                                styles.moldStatusText,
                                { color: result.analytics.mold_detection.status === 'clear' ? COLORS.success : COLORS.danger }
                              ]}>
                                {result.analytics.mold_detection.status === 'clear' ? 'Clean' : 'Moldy Detected'}
                              </Text>
                            </View>
                            {result.analytics.mold_detection.severity !== 'none' && (
                              <View style={[styles.severityChip, {
                                backgroundColor: result.analytics.mold_detection.severity === 'severe' ? '#FEE2E2'
                                  : result.analytics.mold_detection.severity === 'moderate' ? '#FEF3C7' : '#E0F2FE'
                              }]}>
                                <Text style={[styles.severityChipText, {
                                  color: result.analytics.mold_detection.severity === 'severe' ? COLORS.danger
                                    : result.analytics.mold_detection.severity === 'moderate' ? '#92400E' : '#0369A1'
                                }]}>
                                  {result.analytics.mold_detection.severity.charAt(0).toUpperCase() + result.analytics.mold_detection.severity.slice(1)}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.analyticsBarRow}>
                            <Text style={styles.analyticsBarLabel}>Moldy</Text>
                            <View style={styles.analyticsBarBg}>
                              <View style={[styles.analyticsBarFill, {
                                width: `${Math.min(result.analytics.mold_detection.mold_probability, 100)}%`,
                                backgroundColor: result.analytics.mold_detection.mold_probability > 40 ? COLORS.danger : result.analytics.mold_detection.mold_probability > 15 ? COLORS.warning : COLORS.success
                              }]} />
                            </View>
                            <Text style={styles.analyticsBarValue}>{result.analytics.mold_detection.mold_probability}%</Text>
                          </View>
                          <View style={styles.analyticsBarRow}>
                            <Text style={styles.analyticsBarLabel}>Clean</Text>
                            <View style={styles.analyticsBarBg}>
                              <View style={[styles.analyticsBarFill, { width: `${Math.min(result.analytics.mold_detection.clean_probability, 100)}%`, backgroundColor: COLORS.success }]} />
                            </View>
                            <Text style={styles.analyticsBarValue}>{result.analytics.mold_detection.clean_probability}%</Text>
                          </View>
                        </View>
                      )}

                      {/* Mold Spot Analysis (visual spot detection) */}
                      {result.fruit?.mold_spot_analysis && result.fruit.mold_spot_analysis.total_mold_pct > 0.5 && (
                        <View style={styles.analyticsSection}>
                          <Text style={styles.analyticsSectionTitle}>Mold Spot Inspection</Text>
                          {result.fruit.mold_spot_analysis.white_mold_pct > 0.5 && (
                            <View style={styles.analyticsBarRow}>
                              <Text style={styles.analyticsBarLabel}>White Spots</Text>
                              <View style={styles.analyticsBarBg}>
                                <View style={[styles.analyticsBarFill, {
                                  width: `${Math.min(result.fruit.mold_spot_analysis.white_mold_pct, 100)}%`,
                                  backgroundColor: '#9CA3AF'
                                }]} />
                              </View>
                              <Text style={styles.analyticsBarValue}>{result.fruit.mold_spot_analysis.white_mold_pct.toFixed(1)}%</Text>
                            </View>
                          )}
                          {result.fruit.mold_spot_analysis.black_mold_pct > 0.5 && (
                            <View style={styles.analyticsBarRow}>
                              <Text style={styles.analyticsBarLabel}>Dark Spots</Text>
                              <View style={styles.analyticsBarBg}>
                                <View style={[styles.analyticsBarFill, {
                                  width: `${Math.min(result.fruit.mold_spot_analysis.black_mold_pct, 100)}%`,
                                  backgroundColor: '#374151'
                                }]} />
                              </View>
                              <Text style={styles.analyticsBarValue}>{result.fruit.mold_spot_analysis.black_mold_pct.toFixed(1)}%</Text>
                            </View>
                          )}
                          {result.fruit.mold_spot_analysis.details?.map((detail, idx) => (
                            <View key={idx} style={styles.colorAnalysisDetail}>
                              <Ionicons name="search-outline" size={14} color={COLORS.textSecondary} />
                              <Text style={styles.colorAnalysisDetailText}>{detail}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Product Suitability */}
                      {result.analytics.quality_assessment && (
                        <View style={styles.analyticsSection}>
                          <View style={styles.suitabilityHeaderRow}>
                            <Text style={styles.analyticsSectionTitle}>Product Suitability</Text>
                            <View style={[styles.gradeChip, {
                              backgroundColor: result.analytics.quality_assessment.grade === 'A' ? '#DCFCE7'
                                : result.analytics.quality_assessment.grade === 'B' ? '#DBEAFE'
                                : result.analytics.quality_assessment.grade === 'C' ? '#FEF3C7'
                                : '#FEE2E2'
                            }]}>
                              <Text style={[styles.gradeChipText, {
                                color: result.analytics.quality_assessment.grade === 'A' ? '#16A34A'
                                  : result.analytics.quality_assessment.grade === 'B' ? '#2563EB'
                                  : result.analytics.quality_assessment.grade === 'C' ? '#92400E'
                                  : COLORS.danger
                              }]}>
                                Grade {result.analytics.quality_assessment.grade}
                              </Text>
                            </View>
                          </View>
                          {result.analytics.quality_assessment.product_suitability && Object.entries(result.analytics.quality_assessment.product_suitability).map(([key, val]) => (
                            <View key={key} style={styles.analyticsBarRow}>
                              <Text style={styles.analyticsBarLabel}>{key.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
                              <View style={styles.analyticsBarBg}>
                                <View style={[styles.analyticsBarFill, { width: `${Math.min(val, 100)}%`, backgroundColor: getSuitabilityColor(val) }]} />
                              </View>
                              <Text style={styles.analyticsBarValue}>{val.toFixed(0)}%</Text>
                            </View>
                          ))}
                          {result.analytics.quality_assessment.summary && (
                            <Text style={styles.suitabilitySummary}>{result.analytics.quality_assessment.summary}</Text>
                          )}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Leaf Health Analysis */}
                  {result.subject === 'leaf' && result.analytics && (
                    <View style={styles.analyticsDetailCard}>
                      <View style={styles.proCardHeaderRow}>
                        <Ionicons name="bar-chart-outline" size={18} color={COLORS.primary} />
                        <Text style={styles.proCardTitle}>Leaf Health Analysis</Text>
                      </View>
                      {result.analytics.mold_detection && (
                        <View style={styles.analyticsSection}>
                          <View style={styles.moldRow}>
                            <View style={styles.moldIndicator}>
                              <Ionicons
                                name={result.analytics.mold_detection.status === 'clear' ? 'shield-checkmark' : 'warning'}
                                size={20}
                                color={result.analytics.mold_detection.status === 'clear' ? COLORS.success : COLORS.danger}
                              />
                              <Text style={[
                                styles.moldStatusText,
                                { color: result.analytics.mold_detection.status === 'clear' ? COLORS.success : COLORS.danger }
                              ]}>
                                {result.analytics.mold_detection.status === 'clear' ? 'Healthy Leaf' : 'Moldy / Disease Detected'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.analyticsBarRow}>
                            <Text style={styles.analyticsBarLabel}>Healthy</Text>
                            <View style={styles.analyticsBarBg}>
                              <View style={[styles.analyticsBarFill, { width: `${Math.min(result.analytics.health_score || 0, 100)}%`, backgroundColor: COLORS.success }]} />
                            </View>
                            <Text style={styles.analyticsBarValue}>{result.analytics.health_score?.toFixed(1) || '0'}%</Text>
                          </View>
                          <View style={styles.analyticsBarRow}>
                            <Text style={styles.analyticsBarLabel}>Moldy</Text>
                            <View style={styles.analyticsBarBg}>
                              <View style={[styles.analyticsBarFill, {
                                width: `${Math.min(result.analytics.mold_detection.mold_probability, 100)}%`,
                                backgroundColor: result.analytics.mold_detection.mold_probability > 40 ? COLORS.danger : COLORS.warning
                              }]} />
                            </View>
                            <Text style={styles.analyticsBarValue}>{result.analytics.mold_detection.mold_probability}%</Text>
                          </View>
                        </View>
                      )}

                      {/* Leaf Recommendations */}
                      {result.analytics.recommendations?.length > 0 && (
                        <View style={styles.analyticsSection}>
                          <Text style={styles.analyticsSectionTitle}>Recommendations</Text>
                          {result.analytics.recommendations.map((rec, idx) => (
                            <View key={idx} style={styles.leafRecommendationRow}>
                              <Ionicons
                                name={result.analytics.mold_detection?.status === 'clear' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                                size={16}
                                color={result.analytics.mold_detection?.status === 'clear' ? COLORS.success : COLORS.warning}
                              />
                              <Text style={styles.leafRecommendationText}>{rec}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Leaf Care Tips */}
                      {result.analytics.care_tips?.length > 0 && (
                        <View style={styles.analyticsSection}>
                          <Text style={styles.analyticsSectionTitle}>Care Tips</Text>
                          {result.analytics.care_tips.map((tip, idx) => (
                            <View key={idx} style={styles.leafRecommendationRow}>
                              <Ionicons name="leaf-outline" size={16} color={COLORS.primary} />
                              <Text style={styles.leafRecommendationText}>{tip}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Leaf Details */}
                      {result.analytics.details?.length > 0 && (
                        <View style={styles.analyticsSection}>
                          <Text style={styles.analyticsSectionTitle}>Assessment Details</Text>
                          {result.analytics.details.map((detail, idx) => (
                            <View key={idx} style={styles.leafRecommendationRow}>
                              <Ionicons name="information-circle-outline" size={16} color={COLORS.textSecondary} />
                              <Text style={styles.leafRecommendationText}>{detail}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Leaf Interference Warning (Fruit only) */}
                  {result.subject === 'fruit' && result.leaf_interference?.leaf_coverage > 0 && (
                    <View style={styles.leafInterferenceCard}>
                      <View style={styles.proCardHeaderRow}>
                        <Ionicons name="leaf-outline" size={18} color={COLORS.warning} />
                        <Text style={styles.proCardTitle}>Leaf Detection</Text>
                        <View style={[styles.qualityChip, {
                          backgroundColor: result.leaf_interference.has_significant_leaves ? '#FEF3C7' : '#E0F2FE'
                        }]}>
                          <Text style={[styles.qualityChipText, {
                            color: result.leaf_interference.has_significant_leaves ? '#92400E' : '#0369A1'
                          }]}>
                            {result.leaf_interference.leaf_coverage.toFixed(1)}% coverage
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.leafInterferenceText}>
                        {result.leaf_interference.warning || 'Leaves detected in the image.'}
                      </Text>
                      {result.leaf_interference.correction_applied && (
                        <View style={styles.leafCorrectionRow}>
                          <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                          <Text style={styles.leafCorrectionText}>
                            Classification auto-corrected: {result.leaf_interference.original_prediction} → {result.leaf_interference.corrected_prediction}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Leaf Health Advice & Recommendation Card (for leaf subject) */}
                  {result.subject === 'leaf' && (() => {
                    const rec = result.result === 'mold'
                      ? getMoldRecommendation(result.confidence, 'leaf')
                      : LEAF_RECOMMENDATIONS[result.result];
                    if (!rec) return null;
                    const leafRec = LEAF_RECOMMENDATIONS[result.result];
                    const isLowMold = result.result === 'mold' && result.confidence < MOLD_DISCARD_THRESHOLD;
                    return (
                      <View style={[styles.ripenessAdviceCard, isLowMold && styles.moldWarningCard]}>
                        <View style={styles.proCardHeaderRow}>
                          <Ionicons name={rec.icon} size={18} color={rec.color || (isLowMold ? '#D97706' : '#16A34A')} />
                          <Text style={styles.proCardTitle}>{isLowMold ? 'Monitor Recommended' : 'What to Do'}</Text>
                          {isLowMold && (
                            <View style={styles.moldThresholdBadge}>
                              <Text style={styles.moldThresholdBadgeText}>Below {(MOLD_DISCARD_THRESHOLD * 100).toFixed(0)}% threshold</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.ripenessAdviceText}>{rec.advice}</Text>

                        {/* Suggested Uses (inside recommendation) */}
                        {leafRec && leafRec.uses && leafRec.uses.length > 0 && (
                          <>
                            <View style={styles.leafUsesSection}>
                              <View style={styles.proCardHeaderRow}>
                                <Ionicons name="flask-outline" size={16} color={isLowMold ? '#D97706' : '#7C3AED'} />
                                <Text style={[styles.proCardTitle, { fontSize: 13 }]}>Suggested Uses</Text>
                              </View>
                              {leafRec.uses.map((use, idx) => (
                                <View key={idx} style={styles.leafBenefitRow}>
                                  <Ionicons name="arrow-forward-circle" size={15} color={isLowMold ? '#D97706' : '#7C3AED'} />
                                  <Text style={styles.leafBenefitText}>{use}</Text>
                                </View>
                              ))}
                            </View>
                          </>
                        )}
                      </View>
                    );
                  })()}

                  {/* Bignay Leaf Benefits Card (for leaf subject) */}
                  {result.subject === 'leaf' && (() => {
                    const leafRec = LEAF_RECOMMENDATIONS[result.result];
                    if (!leafRec || !leafRec.benefits || leafRec.benefits.length === 0) return null;
                    return (
                      <View style={styles.leafBenefitsCard}>
                        <View style={styles.proCardHeaderRow}>
                          <Ionicons name="medical-outline" size={18} color="#059669" />
                          <Text style={styles.proCardTitle}>Bignay Leaf Benefits</Text>
                          <View style={[styles.qualityChip, { backgroundColor: '#DCFCE7' }]}>
                            <Text style={[styles.qualityChipText, { color: '#059669' }]}>
                              {leafRec.benefits.length} benefits
                            </Text>
                          </View>
                        </View>
                        {leafRec.benefits.map((benefit, idx) => (
                          <View key={idx} style={styles.leafBenefitRow}>
                            <Ionicons name="checkmark-circle" size={15} color="#059669" />
                            <Text style={styles.leafBenefitText}>{benefit}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  })()}

                  {/* Ripeness / Mold Recommendation Card (Fruit) */}
                  {result.subject === 'fruit' && (() => {
                    const isMold = result.result === 'mold';
                    const rec = isMold
                      ? getMoldRecommendation(result.confidence, 'fruit')
                      : RIPENESS_RECOMMENDATIONS[result.result];
                    if (!rec) return null;
                    const isLowMold = isMold && result.confidence < MOLD_DISCARD_THRESHOLD;
                    return (
                      <View style={[styles.ripenessAdviceCard, isLowMold && styles.moldWarningCard]}>
                        <View style={styles.proCardHeaderRow}>
                          <Ionicons name={rec.icon} size={18} color={isLowMold ? '#D97706' : '#4338CA'} />
                          <Text style={styles.proCardTitle}>{isLowMold ? 'Monitor & Inspect' : 'What to Do'}</Text>
                          {isLowMold && (
                            <View style={styles.moldThresholdBadge}>
                              <Text style={styles.moldThresholdBadgeText}>Below {(MOLD_DISCARD_THRESHOLD * 100).toFixed(0)}% threshold</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.ripenessAdviceText}>{rec.advice}</Text>
                        {rec.bestUse && (
                          <View style={styles.ripenessAdviceBestUse}>
                            <Ionicons name="star-outline" size={14} color={isLowMold ? '#D97706' : '#4338CA'} />
                            <Text style={styles.ripenessAdviceBestUseText}>{rec.bestUse}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Recommendation Card */}
                  {result.recommendation && (
                    <View style={styles.proRecommendationCard}>
                      <View style={styles.proCardHeaderRow}>
                        <Ionicons name="bulb-outline" size={18} color={COLORS.warning} />
                        <Text style={styles.proCardTitle}>Recommendation</Text>
                      </View>
                      <Text style={styles.proRecommendationValue}>
                        {result.recommendation.primary === 'mold' ? 'Moldy' : result.recommendation.primary}
                      </Text>
                      {result.recommendation.alternatives?.length > 0 && (
                        <Text style={styles.proRecommendationAlt}>
                          Also suitable: {result.recommendation.alternatives.map(a => a === 'mold' ? 'Moldy' : a).join(', ')}
                        </Text>
                      )}
                      {result.recommendation.reason && (
                        <Text style={styles.proRecommendationReason}>{result.recommendation.reason}</Text>
                      )}
                    </View>
                  )}
                </>
              )}

              {/* Image Quality Notice */}
              {result.image_quality && result.image_quality.overall !== 'good' && (
                <View style={styles.qualityNoticeCard}>
                  <View style={styles.proCardHeaderRow}>
                    <Ionicons name="image-outline" size={18} color={COLORS.warning} />
                    <Text style={styles.proCardTitle}>Image Quality</Text>
                    <View style={[
                      styles.qualityChip,
                      { backgroundColor: result.image_quality.overall === 'acceptable' ? '#FEF3C7' : '#FEE2E2' }
                    ]}>
                      <Text style={[
                        styles.qualityChipText,
                        { color: result.image_quality.overall === 'acceptable' ? '#92400E' : COLORS.danger }
                      ]}>
                        {result.image_quality.overall === 'acceptable' ? 'Fair' : 'Poor'}
                      </Text>
                    </View>
                  </View>
                  {result.image_quality.issues?.slice(0, 2).map((issue, index) => (
                    <View key={index} style={styles.qualityNoticeRow}>
                      <View style={styles.qualityNoticeDot} />
                      <Text style={styles.qualityNoticeText}>{issue}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Training Feedback */}
              <View style={styles.feedbackCard}>
                <View style={styles.proCardHeaderRow}>
                  <Ionicons name="fitness-outline" size={18} color={COLORS.success} />
                  <Text style={styles.proCardTitle}>Improve the Model</Text>
                </View>
                <Text style={styles.feedbackDescription}>Was this classification accurate?</Text>
                {result.is_bignay === false ? (
                  <TouchableOpacity
                    style={[styles.feedbackButton, styles.feedbackButtonPrimary]}
                    onPress={submitMissedDetection}
                    disabled={isSubmittingTraining}
                  >
                    {isSubmittingTraining ? (
                      <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={16} color={COLORS.textOnPrimary} />
                        <Text style={styles.feedbackButtonText}>Submit as Bignay</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.feedbackButtonsRow}>
                    <TouchableOpacity
                      style={[styles.feedbackButton, styles.feedbackButtonConfirm]}
                      onPress={confirmClassification}
                      disabled={isSubmittingTraining}
                    >
                      {isSubmittingTraining ? (
                        <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-outline" size={16} color={COLORS.textOnPrimary} />
                          <Text style={styles.feedbackButtonText}>Correct</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.feedbackButton, styles.feedbackButtonCorrect]}
                      onPress={openTrainingModal}
                      disabled={isSubmittingTraining}
                    >
                      <Ionicons name="pencil-outline" size={16} color={COLORS.textOnPrimary} />
                      <Text style={styles.feedbackButtonText}>Correct It</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Image Quality Issues Modal */}
      <Modal
        visible={showQualityModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => { setShowQualityModal(false); setIsLoading(false); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.qualityModalContent}>
            <View style={styles.qualityModalHeader}>
              <View style={styles.qualityModalIconCircle}>
                <Ionicons name="warning-outline" size={32} color={COLORS.warning} />
              </View>
              <Text style={styles.qualityModalTitle}>Image Quality Issues</Text>
              <Text style={styles.qualityModalSubtitle}>
                The following issues were detected and may reduce detection accuracy:
              </Text>
            </View>

            <View style={styles.qualityIssuesList}>
              {qualityIssues?.issues?.map((issue, idx) => (
                <View key={idx} style={styles.qualityIssueItem}>
                  <View style={styles.qualityIssueIconCircle}>
                    <Ionicons name={issue.icon || 'alert-circle-outline'} size={20} color={COLORS.danger} />
                  </View>
                  <View style={styles.qualityIssueTextContainer}>
                    <Text style={styles.qualityIssueMessage}>{issue.message}</Text>
                    <Text style={styles.qualityIssueInstruction}>{issue.instruction}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.qualityModalActions}>
              <TouchableOpacity
                style={styles.qualityModalRetakeBtn}
                onPress={() => {
                  setShowQualityModal(false);
                  setIsLoading(false);
                  resetCapture();
                }}
              >
                <Ionicons name="camera-outline" size={18} color={COLORS.primary} />
                <Text style={styles.qualityModalRetakeText}>Retake Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.qualityModalProceedBtn}
                onPress={forceAnalyze}
              >
                <Ionicons name="arrow-forward-outline" size={18} color={COLORS.textOnPrimary} />
                <Text style={styles.qualityModalProceedText}>Analyze Anyway</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Training Correction Modal */}
      <Modal
        visible={showTrainingModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTrainingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Correct Classification</Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowTrainingModal(false)}
              >
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Select the correct label for this {subject}:
            </Text>

            <View style={styles.labelOptionsContainer}>
              {TRAINING_LABELS[subject]?.map((item) => (
                <TouchableOpacity
                  key={item.value}
                  style={[
                    styles.labelOption,
                    selectedLabel === item.value && styles.labelOptionSelected,
                  ]}
                  onPress={() => setSelectedLabel(item.value)}
                >
                  <Text style={styles.labelEmoji}>{item.emoji}</Text>
                  <View style={styles.labelTextContainer}>
                    <Text style={[
                      styles.labelTitle,
                      selectedLabel === item.value && styles.labelTitleSelected,
                    ]}>
                      {item.label}
                    </Text>
                    <Text style={styles.labelDescription}>{item.description}</Text>
                  </View>
                  {selectedLabel === item.value && (
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setShowTrainingModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.modalButton, 
                  styles.modalSubmitButton,
                  !selectedLabel && styles.modalButtonDisabled,
                ]}
                onPress={correctClassification}
                disabled={!selectedLabel || isSubmittingTraining}
              >
                {isSubmittingTraining ? (
                  <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Submit Correction</Text>
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
        onConfirm={alertConfig.onConfirm || hideAlert}
        onCancel={hideAlert}
        onClose={hideAlert}
        showCancel={alertConfig.showCancel}
        autoClose={alertConfig.autoClose}
        closeOnOverlayPress={alertConfig.closeOnOverlayPress !== undefined ? alertConfig.closeOnOverlayPress : true}
      />
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
    paddingBottom: 40,
  },
  scannerLayout: {
    flexDirection: 'column',
    gap: 16,
  },
  scannerLayoutDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  leftPanel: {
    width: '100%',
  },
  leftPanelDesktop: {
    flex: 1,
    maxWidth: 560,
  },
  rightPanel: {
    width: '100%',
  },
  rightPanelDesktop: {
    flex: 1,
    minWidth: 320,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  // Placeholder / skeleton
  placeholderContainer: {
    flex: 1,
  },
  placeholderCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  placeholderIconRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  placeholderIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  placeholderSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  placeholderDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  placeholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  placeholderLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    width: 100,
  },
  placeholderValueBar: {
    flex: 1,
    height: 10,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 5,
    overflow: 'hidden',
  },
  placeholderValueFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: COLORS.border,
  },
  placeholderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  placeholderFooterText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },
  // Permission inline (native camera fallback)
  permissionInlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 24,
  },
  permissionInlineTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 12,
    textAlign: 'center',
  },
  permissionInlineText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 19,
  },
  permissionInlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  permissionInlineButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  permissionInlineFallback: {
    marginTop: 14,
    paddingVertical: 6,
  },
  permissionInlineFallbackText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '500',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loginPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loginPromptIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loginPromptTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  loginPromptText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  loginBtnText: {
    color: COLORS.textOnPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 24,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  permissionText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 11,
    gap: 7,
  },
  modeButtonActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modeButtonTextActive: {
    color: COLORS.textOnPrimary,
  },
  webUploadPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceVariant,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
  },
  webUploadText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  subjectContainer: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  subjectButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  subjectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  subjectButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryBg,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.1,
  },
  subjectEmoji: {
    fontSize: 18,
  },
  subjectButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  subjectButtonTextActive: {
    color: COLORS.primary,
  },
  cameraContainer: {
    height: 340,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#1A1A1A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  cameraContainerDesktop: {
    height: 420,
    maxHeight: '50vh',
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scanFrame: {
    width: '70%',
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 16,
  },
  // Enhanced scan focus frame (facial recognition style)
  scanFrameOuter: {
    width: '70%',
    aspectRatio: 1,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  cornerBracket: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#00E676',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  scanLine: {
    position: 'absolute',
    left: '5%',
    width: '90%',
    height: 2,
    backgroundColor: 'rgba(0, 230, 118, 0.6)',
    borderRadius: 1,
  },
  scanFrameLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Upload crop hint
  uploadCropHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.primaryBg,
    borderRadius: 8,
  },
  uploadCropHintText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '500',
  },
  // ── Crop Guide Styles ──
  cropGuideContainer: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cropGuideImage: {
    width: '100%',
    height: '100%',
  },
  cropOverlayMask: {
    ...StyleSheet.absoluteFillObject,
  },
  cropDimRegion: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  cropGuideFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'transparent',
  },
  cropGridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  cropGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  cropCorner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: COLORS.surface,
  },
  cropCornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cropCornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cropCornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cropCornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  cropMoveSurface: {
    position: 'absolute',
    backgroundColor: 'transparent',
    zIndex: 10,
    ...(Platform.OS === 'web' ? { cursor: 'move' } : {}),
  },
  cropHandle: {
    position: 'absolute',
    width: 30,
    height: 30,
    backgroundColor: 'transparent',
    zIndex: 20,
    ...(Platform.OS === 'web' ? { cursor: 'nwse-resize' } : {}),
  },
  cropGuideLabel: {
    position: 'absolute',
    bottom: 56,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cropActions: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'center',
  },
  cropCancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  cropCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
  },
  cropConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  cropConfirmText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  // Mold threshold styles
  moldWarningCard: {
    borderWidth: 1,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningBg,
  },
  moldThresholdBadge: {
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  moldThresholdBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.warning,
  },
  // Quality warning banner
  qualityWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warning,
    marginBottom: 10,
  },
  qualityWarningBannerText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.warning,
    fontWeight: '500',
    lineHeight: 16,
  },
  // Quality Issues Modal styles
  qualityModalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  qualityModalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  qualityModalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.warningBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  qualityModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  qualityModalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  qualityIssuesList: {
    gap: 12,
    marginBottom: 20,
  },
  qualityIssueItem: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: COLORS.dangerBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  qualityIssueIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qualityIssueTextContainer: {
    flex: 1,
  },
  qualityIssueMessage: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
    marginBottom: 3,
  },
  qualityIssueInstruction: {
    fontSize: 12,
    color: COLORS.danger,
    lineHeight: 17,
  },
  qualityModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  qualityModalRetakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  qualityModalRetakeText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  qualityModalProceedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.textSecondary,
  },
  qualityModalProceedText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  // Web camera specific styles
  webCameraErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    padding: 20,
  },
  webCameraErrorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.danger,
    marginTop: 12,
  },
  webCameraErrorText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  retryWebCameraButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  retryWebCameraText: {
    color: COLORS.textOnPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  switchToGalleryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  switchToGalleryText: {
    color: COLORS.primary,
    fontWeight: '500',
    fontSize: 14,
  },
  webCameraLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.text,
  },
  webCameraLoadingText: {
    color: COLORS.textOnPrimary,
    marginTop: 12,
    fontSize: 14,
  },
  capturedImage: {
    flex: 1,
    resizeMode: 'contain',
  },
  uploadPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    margin: 12,
    borderRadius: 12,
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 14,
  },
  uploadHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  actionContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  captureButton: {
    padding: 4,
  },
  captureButtonOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.primary,
  },
  captureButtonDisabled: {
    opacity: 0.4,
    borderColor: COLORS.textSecondary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  analyzeButton: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.25,
  },
  retakeButton: {
    backgroundColor: COLORS.textSecondary,
  },
  actionButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    gap: 10,
  },
  status_info: {
    backgroundColor: COLORS.infoBg,
    borderWidth: 1,
    borderColor: COLORS.info,
  },
  status_success: {
    backgroundColor: COLORS.successBg,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  status_error: {
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  statusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
    lineHeight: 18,
  },
  resultsContainer: {
    gap: 12,
  },
  // Professional Classification Card
  classificationCard: {
    backgroundColor: COLORS.surface,
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  classificationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  classificationIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  classificationLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  classificationValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  confidencePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  confidencePillText: {
    color: COLORS.textOnPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  confidenceBarContainer: {
    marginTop: 14,
  },
  confidenceBarBg: {
    height: 6,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 3,
    overflow: 'hidden',
  },
  confidenceBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  confidenceLevelText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
    textAlign: 'right',
  },
  // Pro Recommendation Card
  proRecommendationCard: {
    backgroundColor: COLORS.warningBg,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  proCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  proCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  proRecommendationValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.warning,
    textTransform: 'capitalize',
  },
  proRecommendationAlt: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  proRecommendationReason: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 19,
  },
  // Quality Notice
  qualityNoticeCard: {
    backgroundColor: COLORS.warningBg,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  qualityChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qualityChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  qualityNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  qualityNoticeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.warning,
  },
  qualityNoticeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  // Feedback Card
  feedbackCard: {
    backgroundColor: COLORS.successBg,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  feedbackDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  feedbackButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  feedbackButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  feedbackButtonPrimary: {
    backgroundColor: COLORS.primary,
  },
  feedbackButtonConfirm: {
    backgroundColor: COLORS.success,
  },
  feedbackButtonCorrect: {
    backgroundColor: COLORS.warning,
  },
  feedbackButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  // Not Bignay Card (professional)
  notBignayIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notBignaySubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  // Detailed Analytics Card
  analyticsDetailCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  analyticsSection: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  analyticsSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  analyticsSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  analyticsBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  analyticsBarLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    width: 65,
  },
  analyticsBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 4,
    overflow: 'hidden',
  },
  analyticsBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  analyticsBarValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    width: 44,
    textAlign: 'right',
  },
  ripenessIndexRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceVariant,
  },
  ripenessIndexLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  ripenessIndexValue: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
  },
  moldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  moldIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moldStatusText: {
    fontSize: 14,
    fontWeight: '700',
  },
  severityChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  severityChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  suitabilityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  gradeChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gradeChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  suitabilitySummary: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 17,
  },
  // Ripeness Advice Card
  ripenessAdviceCard: {
    backgroundColor: COLORS.indigoBg,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.indigo,
  },
  ripenessAdviceText: {
    fontSize: 14,
    color: COLORS.indigo,
    lineHeight: 20,
    marginBottom: 10,
  },
  ripenessAdviceBestUse: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 10,
    borderRadius: 8,
  },
  ripenessAdviceBestUseText: {
    fontSize: 13,
    color: COLORS.indigo,
    fontWeight: '600',
    flex: 1,
  },
  // Fruit Detection styles
  detectionAnnotatedImage: {
    width: '100%',
    height: 260,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 12,
    backgroundColor: COLORS.surfaceVariant,
  },
  detectionSummarySection: {
    marginTop: 4,
    marginBottom: 8,
  },
  detectionCountsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detectionCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  detectionCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  detectionLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  detectionLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detectionLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  detectionLegendText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  // Leaf Recommendations
  leafRecommendationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
    paddingLeft: 4,
  },
  leafRecommendationText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 19,
    flex: 1,
  },
  // Leaf Benefits Card
  leafBenefitsCard: {
    backgroundColor: '#F0FDF4',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  leafUsesCard: {
    backgroundColor: '#F5F3FF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  leafUsesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  leafBenefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    paddingLeft: 4,
  },
  leafBenefitText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 19,
    flex: 1,
  },
  // Leaf Interference Card
  leafInterferenceCard: {
    backgroundColor: COLORS.warningBg,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  leafInterferenceText: {
    fontSize: 13,
    color: COLORS.warning,
    lineHeight: 19,
    marginTop: 4,
  },
  leafCorrectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  leafCorrectionText: {
    fontSize: 13,
    color: COLORS.success,
    fontWeight: '600',
    flex: 1,
  },
  // Color Analysis styles
  colorAnalysisGrid: {
    marginTop: 4,
    marginBottom: 8,
  },
  colorAnalysisDetail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 6,
    paddingLeft: 2,
  },
  colorAnalysisDetailText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
    flex: 1,
  },
  detailCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardEmoji: {
    fontSize: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  detailLabel: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    textTransform: 'capitalize',
  },
  recommendationCard: {
    backgroundColor: COLORS.warningBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    borderColor: COLORS.warning,
  },
  recommendationCardWarning: {
    backgroundColor: COLORS.dangerBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  recommendationMain: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  recommendationIcon: {
    fontSize: 32,
  },
  recommendationText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: -0.3,
  },
  alternativesText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 14,
    color: COLORS.text,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  // Recommendation tips styles
  recommendationTipsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  recommendationTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  recommendationTipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  // Low confidence warning styles
  lowConfidenceWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    gap: 8,
  },
  lowConfidenceWarningText: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
  // Image quality feedback styles
  imageQualityCard: {
    backgroundColor: COLORS.warningBg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  qualityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 'auto',
  },
  qualityBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  qualityIssuesContainer: {
    marginBottom: 12,
  },
  qualityIssuesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  qualityIssueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  qualityIssueText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  qualityTipsContainer: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  qualityTipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  qualityTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  qualityTipText: {
    fontSize: 13,
    color: COLORS.primary,
    flex: 1,
  },
  qualityScoresContainer: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  qualityScoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  qualityScoreLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    width: 80,
  },
  qualityScoreBar: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  qualityScoreFill: {
    height: '100%',
    borderRadius: 3,
  },
  // Not Bignay detection styles
  notBignayCard: {
    backgroundColor: COLORS.dangerBg,
    padding: 18,
    borderRadius: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  notBignayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  notBignayTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.danger,
    letterSpacing: -0.2,
  },
  notBignayMessage: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 14,
    lineHeight: 21,
  },
  notBignayModelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  notBignayModelText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  notBignayTips: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  tipItem: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 4,
    paddingLeft: 4,
  },
  confidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  confidenceLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  confidenceBadgeLow: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  confidenceTextWhite: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: 'bold',
  },
  detectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  detectionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  simpleMetaText: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  // Training contribution styles
  trainingCard: {
    backgroundColor: COLORS.successBg,
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  trainingDescription: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 14,
    lineHeight: 20,
  },
  trainingButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  trainingButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 1,
  },
  confirmButton: {
    backgroundColor: COLORS.success,
  },
  correctButton: {
    backgroundColor: COLORS.warning,
  },
  trainingButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  trainingStatsRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
  },
  trainingStatsText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  labelOptionsContainer: {
    gap: 10,
    marginBottom: 20,
  },
  labelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    gap: 12,
  },
  labelOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceVariant,
  },
  labelEmoji: {
    fontSize: 28,
  },
  labelTextContainer: {
    flex: 1,
  },
  labelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    textTransform: 'capitalize',
  },
  labelTitleSelected: {
    color: COLORS.primary,
  },
  labelDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalSubmitButton: {
    backgroundColor: COLORS.primary,
  },
  modalButtonDisabled: {
    backgroundColor: COLORS.textSecondary,
    opacity: 0.6,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalSubmitText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
});

// ===== Analytics Dashboard Styles =====
const createAnalyticsStyles = (COLORS) => StyleSheet.create({
  analyticsContainer: {
    gap: 12,
    marginBottom: 12,
  },
  analyticsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  dangerCard: {
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
    borderColor: '#FECACA',
  },
  qualityCard: {
    backgroundColor: '#FAF5FF',
    borderLeftWidth: 3,
    borderLeftColor: '#7B1FA2',
    borderColor: '#E9D5FF',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  cardIcon: {
    fontSize: 20,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
    letterSpacing: -0.2,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusChipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  // Gauge bars (mold detection, health)
  gaugeRow: {
    gap: 10,
  },
  gaugeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  gaugeLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    width: 50,
  },
  gaugeBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  gaugeBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  gaugeValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    width: 44,
    textAlign: 'right',
  },
  severityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  severityText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.danger,
  },
  // Ripeness index
  indexContainer: {
    marginBottom: 16,
  },
  indexLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  indexBarBg: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F3F4F6',
  },
  indexBarFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#7B1FA2',
  },
  indexMarker: {
    position: 'absolute',
    top: -3,
    width: 20,
    height: 20,
    marginLeft: -10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexMarkerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#7B1FA2',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  indexLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  indexEndLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  // Breakdown bars
  breakdownContainer: {
    gap: 8,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownIcon: {
    fontSize: 16,
    width: 22,
    textAlign: 'center',
  },
  breakdownLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    width: 60,
  },
  breakdownBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  breakdownBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    width: 44,
    textAlign: 'right',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  stageLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  stageValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#7B1FA2',
    letterSpacing: 0.5,
  },
  // Quality Assessment
  overallScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  overallScoreLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    width: 85,
  },
  overallScoreBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 5,
    overflow: 'hidden',
  },
  overallScoreBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  overallScoreValue: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    width: 40,
    textAlign: 'right',
  },
  gradeCircle: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  qualitySummary: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    lineHeight: 19,
    marginBottom: 14,
  },
  suitabilityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  suitabilityContainer: {
    gap: 8,
    marginBottom: 12,
  },
  suitabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  suitabilityIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  suitabilityLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    width: 70,
  },
  suitabilityBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  suitabilityBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  suitabilityValue: {
    fontSize: 13,
    fontWeight: '700',
    width: 38,
    textAlign: 'right',
  },
  bestBadge: {
    backgroundColor: COLORS.success,
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
  detailsList: {
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  detailItemText: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
    lineHeight: 18,
  },
  // Health score circle (leaf)
  healthScoreContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  healthScoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
  },
  healthScoreNumber: {
    fontSize: 26,
    fontWeight: '800',
  },
  healthScoreUnit: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  healthScoreLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});
