import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { savePdfOnMobile } from '../utils/pdfExport';
import { API_CONFIG, apiUrl } from '../config/api';
import { useResponsive } from '../hooks/useResponsive';
import { useAuth } from '../context/AuthContext';
import AuthService from '../services/AuthService';
import { formatPhilippineDateTime } from '../utils/dateTime';
import { useThemeColors } from '../context/ThemeContext';
import SweetAlert, { useSweetAlert } from '../components/SweetAlert';

const CATEGORY_OPTIONS = [
  { key: 'all', label: 'All', icon: 'apps-outline' },
  { key: 'fruit', label: 'Fruit', icon: 'nutrition-outline' },
  { key: 'leaf', label: 'Leaf', icon: 'leaf-outline' },
];

const DATE_OPTIONS = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
];

const getDateRange = (range) => {
  const now = new Date();
  const endDate = now.toISOString();

  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start_date: start.toISOString(), end_date: endDate };
  }

  if (range === '7d') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return { start_date: start.toISOString(), end_date: endDate };
  }

  if (range === '30d') {
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    return { start_date: start.toISOString(), end_date: endDate };
  }

  return {};
};

const getBestTimestamp = (item) => {
  if (!item) return null;
  return item.time || item.timestamp || item.createdAt || null;
};

const parseHistoryDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const dateFromNumber = new Date(value);
    return Number.isNaN(dateFromNumber.getTime()) ? null : dateFromNumber;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // If timezone is missing, treat as UTC (backend timestamps are UTC-based)
    const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed);
    const normalized = hasTimezone ? trimmed : `${trimmed}Z`;

    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }

    const fallbackParsed = new Date(trimmed);
    return Number.isNaN(fallbackParsed.getTime()) ? null : fallbackParsed;
  }

  return null;
};

export default function HistoryScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const navigation = useNavigation();
  const { isAuthenticated } = useAuth();
  const { alertConfig, showSuccess, showError, showDelete, showWarning, hideAlert } = useSweetAlert();

  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsLayout, setDetailsLayout] = useState('current');
  const [compareItem, setCompareItem] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const {
    width: screenWidth,
    isDesktop,
    sp,
    fp,
    responsive,
    maxContentWidth,
  } = useResponsive();

  const dynamicStyles = useMemo(() => ({
    listContent: {
      padding: responsive({ mobile: sp(12), tablet: sp(16), desktop: sp(20) }),
      width: '100%',
      alignSelf: 'center',
      maxWidth: isDesktop ? Math.min(maxContentWidth, 980) : undefined,
    },
    title: {
      fontSize: responsive({ mobile: fp(20), tablet: fp(24), desktop: fp(26) }),
    },
    subtitle: {
      fontSize: responsive({ mobile: fp(12), tablet: fp(13), desktop: fp(14) }),
    },
    summaryNumber: {
      fontSize: responsive({ mobile: fp(18), tablet: fp(20), desktop: fp(22) }),
    },
    cardTitle: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(15), desktop: fp(16) }),
    },
    cardText: {
      fontSize: responsive({ mobile: fp(12), tablet: fp(13), desktop: fp(14) }),
    },
  }), [screenWidth, isDesktop, sp, fp, responsive, maxContentWidth]);

  useEffect(() => {
    if (!isAuthenticated) {
      showWarning('Login Required', 'You must be logged in to view prediction history.', {
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
            Please login to view your prediction history and past scan results.
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

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await AuthService.getToken();
      if (!token) {
        setHistory([]);
        setError('Please login to view your prediction history.');
        return;
      }

      const params = new URLSearchParams({ limit: '100' });

      if (categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }

      const dateRange = getDateRange(dateFilter);
      if (dateRange.start_date) params.append('start_date', dateRange.start_date);
      if (dateRange.end_date) params.append('end_date', dateRange.end_date);

      const response = await fetch(apiUrl(`${API_CONFIG.ENDPOINTS.PREDICTIONS}?${params.toString()}`), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        setHistory(Array.isArray(data.items) ? data.items : []);
      } else {
        setHistory([]);
        setError(data.error || 'Failed to fetch history');
      }
    } catch (err) {
      setHistory([]);
      setError(`Cannot connect to server: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter, dateFilter]);

  const handleDeletePrediction = useCallback((item) => {
    showDelete(
      'Delete Prediction',
      `Are you sure you want to delete this ${item.subject || 'prediction'} scan result? This action cannot be undone.`,
      async () => {
        try {
          const token = await AuthService.getToken();
          const response = await fetch(apiUrl(`${API_CONFIG.ENDPOINTS.PREDICTIONS}/${item._id}`), {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          });
          const data = await response.json();
          if (response.ok && data.ok) {
            showSuccess('Deleted', 'Prediction deleted successfully');
            setHistory(prev => prev.filter(h => h._id !== item._id));
            if (selectedItem?._id === item._id) {
              setShowDetailsModal(false);
              setSelectedItem(null);
            }
          } else {
            showError('Error', data.error || 'Failed to delete prediction');
          }
        } catch (err) {
          showError('Error', 'Could not connect to server');
        }
      }
    );
  }, [showDelete, showSuccess, showError, selectedItem]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatDate = (dateValue) => {
    if (!dateValue) return 'No date';
    const result = formatPhilippineDateTime(dateValue);
    return result === 'N/A' ? 'No date' : result;
  };

  const getQualityColor = (quality) => {
    switch ((quality || '').toLowerCase()) {
      case 'good': return COLORS.success;
      case 'ok': return COLORS.warning || '#F59E0B';
      case 'reject': return COLORS.danger || '#DC2626';
      default: return COLORS.textSecondary;
    }
  };

  const getSubjectLabel = (subject) => {
    if (subject === 'leaf') return 'Leaf';
    return 'Fruit';
  };

  const summary = useMemo(() => {
    const total = history.length;
    if (total === 0) {
      return { total: 0, fruit: 0, leaf: 0, avgConfidence: 0 };
    }

    const fruit = history.filter((item) => item.subject === 'fruit').length;
    const leaf = history.filter((item) => item.subject === 'leaf').length;
    const confidenceItems = history.filter((item) => typeof item.confidence === 'number');
    const avgConfidence = confidenceItems.length
      ? confidenceItems.reduce((sum, item) => sum + item.confidence, 0) / confidenceItems.length
      : 0;

    return { total, fruit, leaf, avgConfidence };
  }, [history]);

  const renderFilterChips = (items, value, onChange) => (
    <View style={styles.chipRow}>
      {items.map((item) => {
        const isActive = value === item.key;
        return (
          <TouchableOpacity
            key={item.key}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onChange(item.key)}
          >
            {item.icon ? (
              <Ionicons
                name={item.icon}
                size={14}
                color={isActive ? '#fff' : COLORS.textSecondary}
                style={styles.chipIcon}
              />
            ) : null}
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderItem = ({ item }) => {
    const createdAt = getBestTimestamp(item);
    const quality = item.fruit?.quality;
    const ripeness = item.fruit?.ripeness_stage;
    const confidencePercent = typeof item.confidence === 'number' ? item.confidence * 100 : null;

    return (
      <View style={styles.historyCard}>
        <View style={styles.cardTopRow}>
          <View style={[styles.subjectPill, item.subject === 'leaf' && styles.subjectPillLeaf]}>
            <Ionicons
              name={item.subject === 'leaf' ? 'leaf-outline' : 'nutrition-outline'}
              size={13}
              color={COLORS.buttonText}
            />
            <Text style={styles.subjectPillText}>{getSubjectLabel(item.subject)}</Text>
          </View>

          <Text style={styles.dateText}>{formatDate(createdAt)}</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={[styles.resultText, dynamicStyles.cardTitle]} numberOfLines={1}>
            {item.result || 'Unknown'}
          </Text>
          {confidencePercent !== null ? (
            <Text style={styles.confidenceText}>{confidencePercent.toFixed(1)}%</Text>
          ) : null}
        </View>

        {confidencePercent !== null ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(3, Math.min(100, confidencePercent))}%` }]} />
          </View>
        ) : null}

        <View style={styles.detailsGrid}>
          {quality ? (
            <View style={styles.detailItem}>
              <Ionicons name="star-outline" size={14} color={getQualityColor(quality)} />
              <Text style={[styles.detailText, dynamicStyles.cardText, { color: getQualityColor(quality) }]}>
                Quality: {quality}
              </Text>
            </View>
          ) : null}

          {ripeness ? (
            <View style={styles.detailItem}>
              <Ionicons name="color-filter-outline" size={14} color={COLORS.textSecondary} />
              <Text style={[styles.detailText, dynamicStyles.cardText]}>Ripeness: {ripeness}</Text>
            </View>
          ) : null}

          {item.image_quality?.overall_quality ? (
            <View style={styles.detailItem}>
              <Ionicons name="images-outline" size={14} color={COLORS.textSecondary} />
              <Text style={[styles.detailText, dynamicStyles.cardText]}>
                Image: {item.image_quality.overall_quality}
              </Text>
            </View>
          ) : null}
        </View>

        {item.recommendation?.primary ? (
          <View style={styles.recommendationBox}>
            <Ionicons name="bulb-outline" size={15} color={COLORS.primary} />
            <Text style={[styles.recommendationText, dynamicStyles.cardText]} numberOfLines={2}>
              {item.recommendation.primary}
            </Text>
          </View>
        ) : null}

        <View style={styles.cardActionsRow}>
          <TouchableOpacity
            style={styles.seeMoreButton}
            onPress={() => {
              setSelectedItem(item);
              setDetailsLayout('current');
              setShowDetailsModal(true);
            }}
          >
            <Ionicons name="document-text-outline" size={14} color={COLORS.primary} />
            <Text style={styles.seeMoreText}>See More Details</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeletePrediction(item)}
          >
            <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDetailRow = (label, value) => {
    if (value === undefined || value === null || value === '') return null;
    return (
      <View style={styles.detailRow}>
        <Text style={styles.detailRowLabel}>{label}</Text>
        <Text style={styles.detailRowValue}>{String(value)}</Text>
      </View>
    );
  };

  // ── PDF Export ──────────────────────────────────────────
  const handleExportPDF = async () => {
    if (isExporting || !selectedItem) return;
    setIsExporting(true);

    try {
      const token = await AuthService.getToken();
      if (!token) {
        showError('Authentication required', 'Please login to export reports.');
        return;
      }

      const payload = {
        prediction: selectedItem,
      };

      // If in compare mode and a compare item is selected, include it
      if (detailsLayout === 'compare' && compareItem) {
        payload.comparePrediction = compareItem;
      }

      const url = apiUrl(API_CONFIG.ENDPOINTS.PREDICTIONS_EXPORT_PDF);

      if (Platform.OS === 'web') {
        // Web: fetch as blob and open via object URL
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to generate PDF');
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        const subject = (selectedItem.subject || 'scan').toLowerCase();
        const result = (selectedItem.result || 'report').toLowerCase().replace(/\s+/g, '_');
        const suffix = (detailsLayout === 'compare' && compareItem) ? '_comparison' : '';
        a.download = `bignay_${subject}_${result}${suffix}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        showSuccess('PDF Downloaded', 'The report has been downloaded.');
      } else {
        // Mobile: fetch and use savePdfOnMobile utility (arrayBuffer approach)
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to generate PDF');
        }

        const subject = (selectedItem.subject || 'scan').toLowerCase();
        const result = (selectedItem.result || 'report').toLowerCase().replace(/\s+/g, '_');
        const suffix = (detailsLayout === 'compare' && compareItem) ? '_comparison' : '';
        const filename = `bignay_${subject}_${result}${suffix}.pdf`;

        const pdfResult = await savePdfOnMobile(response, filename, {
          dialogTitle: 'Scan Analysis Report',
          UTI: 'com.adobe.pdf',
        });

        if (pdfResult.success) {
          showSuccess('PDF Ready', pdfResult.message);
        } else {
          throw new Error(pdfResult.message);
        }
      }
    } catch (err) {
      console.error('[HistoryScreen] PDF export error:', err);
      showError('Export Failed', err.message || 'Could not generate PDF report.');
    } finally {
      setIsExporting(false);
    }
  };

  const renderDetailsModal = () => {
    if (!selectedItem) return null;

    const createdAt = getBestTimestamp(selectedItem);
    const confidencePercent = typeof selectedItem.confidence === 'number'
      ? `${(selectedItem.confidence * 100).toFixed(1)}%`
      : 'N/A';

    const tips = selectedItem.recommendation?.tips || [];
    const qualityIssues = selectedItem.image_quality?.issues || [];
    const qualityRecommendations = selectedItem.image_quality?.recommendations || [];

    const selectedIndex = history.findIndex((entry) => entry._id === selectedItem._id);
    // Get comparable items (same subject, excluding the selected one)
    const comparableItems = history.filter(
      (entry) => entry._id !== selectedItem._id && entry.subject === selectedItem.subject
    );

    // Use user-picked compare item or null
    const previousItem = compareItem || null;

    const currentConfidence = typeof selectedItem.confidence === 'number' ? selectedItem.confidence : null;
    const previousConfidence = typeof previousItem?.confidence === 'number' ? previousItem.confidence : null;
    const confidenceDelta =
      currentConfidence !== null && previousConfidence !== null
        ? (currentConfidence - previousConfidence) * 100
        : null;

    const currentQuality = selectedItem.image_quality?.overall_quality || null;
    const previousQuality = previousItem?.image_quality?.overall_quality || null;
    const qualityChanged = currentQuality && previousQuality && currentQuality !== previousQuality;

    const currentMold = selectedItem.fruit?.mold_detected ?? selectedItem.leaf?.mold_detected;
    const previousMold = previousItem?.fruit?.mold_detected ?? previousItem?.leaf?.mold_detected;

    const currentRec = selectedItem.recommendation?.primary || null;
    const previousRec = previousItem?.recommendation?.primary || null;

    const formatDelta = (value) => {
      if (value === null || Number.isNaN(value)) return 'N/A';
      const sign = value > 0 ? '+' : '';
      return `${sign}${value.toFixed(1)}%`;
    };

    const toPercent = (value) => {
      if (typeof value !== 'number' || Number.isNaN(value)) return null;
      if (value <= 1) return Math.max(0, Math.min(100, value * 100));
      return Math.max(0, Math.min(100, value));
    };

    const renderScoreBar = (label, rawValue, color = COLORS.primary) => {
      const pct = toPercent(rawValue);
      if (pct === null) return null;
      return (
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>{label}</Text>
          <View style={styles.metricBarBg}>
            <View style={[styles.metricBarFill, { width: `${pct}%`, backgroundColor: color }]} />
          </View>
          <Text style={styles.metricValue}>{pct.toFixed(0)}%</Text>
        </View>
      );
    };

    return (
      <Modal
        visible={showDetailsModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowDetailsModal(false);
          setDetailsLayout('current');
          setCompareItem(null);
        }}
      >
        <View style={[styles.modalOverlay, isDesktop && { justifyContent: 'center' }]}>
          <View style={[styles.modalSheet, isDesktop && detailsLayout === 'compare' && { maxWidth: 1100, width: '95%', alignSelf: 'center', borderRadius: 18 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Analysis Details</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={handleExportPDF}
                  disabled={isExporting}
                  style={styles.exportPdfBtn}
                >
                  {isExporting ? (
                    <ActivityIndicator size={16} color="#fff" />
                  ) : (
                    <Ionicons name="download-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.exportPdfBtnText}>
                    {isExporting ? 'Exporting...' : (detailsLayout === 'compare' && compareItem ? 'Export Compare' : 'Export PDF')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setShowDetailsModal(false);
                    setDetailsLayout('current');
                    setCompareItem(null);
                  }}
                  style={styles.modalCloseBtn}
                >
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
              </View>
            </View>

            <View style={styles.layoutToggleRow}>
              <TouchableOpacity
                style={[styles.layoutTab, detailsLayout === 'current' && styles.layoutTabActive]}
                onPress={() => setDetailsLayout('current')}
              >
                <Ionicons name="analytics-outline" size={14} color={detailsLayout === 'current' ? '#fff' : COLORS.textSecondary} />
                <Text style={[styles.layoutTabText, detailsLayout === 'current' && styles.layoutTabTextActive]}>
                  Current Analysis
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.layoutTab, detailsLayout === 'compare' && styles.layoutTabActive]}
                onPress={() => setDetailsLayout('compare')}
              >
                <Ionicons name="git-compare-outline" size={14} color={detailsLayout === 'compare' ? '#fff' : COLORS.textSecondary} />
                <Text style={[styles.layoutTabText, detailsLayout === 'compare' && styles.layoutTabTextActive]}>
                  Compare Scans
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScrollContent}>
              {detailsLayout === 'current' ? (
                <>
                  <View style={styles.currentHeroCard}>
                    <View style={styles.currentHeroTopRow}>
                      <View>
                        <Text style={styles.currentHeroLabel}>{getSubjectLabel(selectedItem.subject)} Analysis</Text>
                        <Text style={styles.currentHeroResult}>{selectedItem.result || 'Unknown'}</Text>
                      </View>
                      <View style={styles.currentConfidencePill}>
                        <Text style={styles.currentConfidencePillText}>{confidencePercent}</Text>
                      </View>
                    </View>
                    <Text style={styles.currentHeroSub}>{formatDate(createdAt)}</Text>
                    {renderScoreBar('Confidence', selectedItem.confidence, COLORS.primary)}
                    {renderDetailRow('Detection Level', selectedItem.detection?.confidence_level)}
                    {renderDetailRow('Detection Reason', selectedItem.detection?.reason)}
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Quality Scores</Text>
                    {renderScoreBar('Overall', selectedItem.image_quality?.overall_score, COLORS.success)}
                    {renderScoreBar('Blur', selectedItem.image_quality?.blur_score, '#7C3AED')}
                    {renderScoreBar('Brightness', selectedItem.image_quality?.brightness_score, '#2563EB')}
                    {renderScoreBar('Contrast', selectedItem.image_quality?.contrast_score, '#D97706')}
                    {renderScoreBar('Subject Size', selectedItem.image_quality?.subject_size_score, '#16A34A')}
                    {qualityIssues.length > 0 ? (
                      <View style={styles.bulletBlock}>
                        <Text style={styles.bulletTitle}>Issues</Text>
                        {qualityIssues.map((issue, index) => (
                          <Text key={`${issue}-${index}`} style={styles.bulletItem}>• {issue}</Text>
                        ))}
                      </View>
                    ) : null}
                    {qualityRecommendations.length > 0 ? (
                      <View style={styles.bulletBlock}>
                        <Text style={styles.bulletTitle}>Recommendations</Text>
                        {qualityRecommendations.map((rec, index) => (
                          <Text key={`${rec}-${index}`} style={styles.bulletItem}>• {rec}</Text>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Fruit / Leaf Details</Text>
                    {renderDetailRow('Fruit Quality', selectedItem.fruit?.quality)}
                    {renderDetailRow('Ripeness Stage', selectedItem.fruit?.ripeness_stage)}
                    {renderDetailRow('Mold Present', selectedItem.fruit?.mold_present != null
                      ? (selectedItem.fruit.mold_present ? 'Yes' : 'No') : undefined)}
                    {renderDetailRow('Leaf Health', selectedItem.leaf?.class)}
                    {renderDetailRow('HSV Mean', selectedItem.color?.hsv_mean?.map?.(v => v?.toFixed?.(1) ?? v)?.join(', '))}
                  </View>

                  {/* Fruit Detection */}
                  {selectedItem.subject === 'fruit' && selectedItem.fruit_detection && selectedItem.fruit_detection.total_detected > 0 && (
                    <View style={styles.modalSection}>
                      <View style={styles.historySectionTitleRow}>
                        <Text style={[styles.modalSectionTitle, { marginBottom: 0 }]}>Fruit Detection</Text>
                        <View style={styles.historyDetectionBadge}>
                          <Text style={styles.historyDetectionBadgeText}>
                            {selectedItem.fruit_detection.total_detected} detected
                          </Text>
                        </View>
                      </View>
                      {selectedItem.fruit_detection.summary && (
                        <View style={styles.historyDetectionCounts}>
                          {[
                            { label: 'Ripe', count: selectedItem.fruit_detection.summary.ripe, color: '#8B5CF6' },
                            { label: 'Unripe', count: selectedItem.fruit_detection.summary.unripe, color: '#22C55E' },
                            { label: 'Overripe', count: selectedItem.fruit_detection.summary.overripe, color: '#F59E0B' },
                            { label: 'Mold', count: selectedItem.fruit_detection.summary.mold, color: '#EF4444' },
                          ].filter(item => item.count > 0).map((item) => (
                            <View key={item.label} style={styles.historyCountChip}>
                              <View style={[styles.historyCountDot, { backgroundColor: item.color }]} />
                              <Text style={styles.historyCountText}>{item.count} {item.label}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Ripeness Breakdown */}
                  {selectedItem.subject === 'fruit' && selectedItem.analytics?.ripeness_analysis && (
                    <View style={styles.modalSection}>
                      <View style={styles.historySectionTitleRow}>
                        <Text style={[styles.modalSectionTitle, { marginBottom: 0 }]}>Ripeness Breakdown</Text>
                        {selectedItem.analytics.ripeness_analysis.source === 'per_fruit_detection' && (
                          <View style={[styles.historyDetectionBadge, { backgroundColor: '#DCFCE7' }]}>
                            <Text style={[styles.historyDetectionBadgeText, { color: '#16A34A' }]}>
                              Per-fruit
                            </Text>
                          </View>
                        )}
                      </View>
                      {[
                        { label: 'Ripe', pct: selectedItem.analytics.ripeness_analysis.ripe_pct, color: '#8B5CF6' },
                        { label: 'Unripe', pct: selectedItem.analytics.ripeness_analysis.unripe_pct, color: '#22C55E' },
                        { label: 'Overripe', pct: selectedItem.analytics.ripeness_analysis.overripe_pct, color: '#F59E0B' },
                        { label: 'Mold', pct: selectedItem.analytics.ripeness_analysis.mold_pct, color: '#EF4444' },
                      ].filter(item => (item.pct || 0) > 0).map((item) => (
                        renderScoreBar(item.label, item.pct / 100, item.color)
                      ))}
                      {renderDetailRow('Ripeness Index', `${selectedItem.analytics.ripeness_analysis.ripeness_index}/100`)}
                    </View>
                  )}

                  {/* Moldy Detection */}
                  {selectedItem.subject === 'fruit' && selectedItem.analytics?.mold_detection && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Mold Detection</Text>
                      {renderDetailRow('Status', selectedItem.analytics.mold_detection.status === 'clear' ? 'Clean' : 'Detected')}
                      {renderDetailRow('Severity', selectedItem.analytics.mold_detection.severity)}
                      {renderScoreBar('Mold', selectedItem.analytics.mold_detection.mold_probability / 100, COLORS.danger)}
                      {renderScoreBar('Clean', selectedItem.analytics.mold_detection.clean_probability / 100, COLORS.success)}
                    </View>
                  )}

                  {/* Quality Assessment */}
                  {selectedItem.analytics?.quality_assessment && (
                    <View style={styles.modalSection}>
                      <View style={styles.historySectionTitleRow}>
                        <Text style={[styles.modalSectionTitle, { marginBottom: 0 }]}>Product Suitability</Text>
                        <View style={[styles.historyDetectionBadge, {
                          backgroundColor: selectedItem.analytics.quality_assessment.grade === 'A' ? '#DCFCE7'
                            : selectedItem.analytics.quality_assessment.grade === 'B' ? '#DBEAFE'
                            : selectedItem.analytics.quality_assessment.grade === 'C' ? '#FEF3C7' : '#FEE2E2'
                        }]}>
                          <Text style={[styles.historyDetectionBadgeText, {
                            color: selectedItem.analytics.quality_assessment.grade === 'A' ? '#16A34A'
                              : selectedItem.analytics.quality_assessment.grade === 'B' ? '#2563EB'
                              : selectedItem.analytics.quality_assessment.grade === 'C' ? '#92400E' : COLORS.danger
                          }]}>
                            Grade {selectedItem.analytics.quality_assessment.grade}
                          </Text>
                        </View>
                      </View>
                      {selectedItem.analytics.quality_assessment.product_suitability &&
                        Object.entries(selectedItem.analytics.quality_assessment.product_suitability).map(([key, val]) => (
                          renderScoreBar(
                            key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                            val / 100,
                            val >= 70 ? '#16A34A' : val >= 40 ? '#D97706' : '#DC2626'
                          )
                        ))
                      }
                      {selectedItem.analytics.quality_assessment.summary && (
                        <Text style={styles.historySummaryText}>
                          {selectedItem.analytics.quality_assessment.summary}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Leaf Health */}
                  {selectedItem.subject === 'leaf' && selectedItem.analytics && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Leaf Health Analysis</Text>
                      {renderDetailRow('Status', selectedItem.analytics.health_assessment?.status)}
                      {renderScoreBar('Health', selectedItem.analytics.health_score / 100, COLORS.success)}
                      {selectedItem.analytics.mold_detection && (
                        <>
                          {renderDetailRow('Mold Status', selectedItem.analytics.mold_detection.status === 'clear' ? 'Clean' : 'Detected')}
                          {renderScoreBar('Mold', selectedItem.analytics.mold_detection.mold_probability / 100, COLORS.danger)}
                        </>
                      )}
                      {selectedItem.analytics.details?.map((detail, idx) => (
                        <Text key={idx} style={styles.bulletItem}>• {detail}</Text>
                      ))}
                      {selectedItem.analytics.recommendations?.length > 0 && (
                        <View style={styles.bulletBlock}>
                          <Text style={styles.bulletTitle}>Recommendations</Text>
                          {selectedItem.analytics.recommendations.map((rec, idx) => (
                            <Text key={idx} style={styles.bulletItem}>• {rec}</Text>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.currentRecommendationCard}>
                    <View style={styles.currentRecHeaderRow}>
                      <Ionicons name="bulb-outline" size={16} color={COLORS.warning} />
                      <Text style={styles.currentRecTitle}>Recommendation</Text>
                    </View>
                    {renderDetailRow('Primary', selectedItem.recommendation?.primary)}
                    {renderDetailRow('Alternatives', selectedItem.recommendation?.alternatives)}
                    {renderDetailRow('Reason', selectedItem.recommendation?.reason)}
                    {tips.length > 0 ? (
                      <View style={styles.bulletBlock}>
                        <Text style={styles.bulletTitle}>Tips</Text>
                        {tips.map((tip, index) => (
                          <Text key={`${tip}-${index}`} style={styles.bulletItem}>• {tip}</Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </>
              ) : (
                <>
                  {/* Compare scan picker */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Select a Scan to Compare</Text>
                    {comparableItems.length === 0 ? (
                      <Text style={styles.comparisonEmptyText}>
                        No other {selectedItem.subject} scans available to compare with.
                      </Text>
                    ) : (
                      <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled showsVerticalScrollIndicator>
                        {comparableItems.map((entry) => {
                          const entryDate = getBestTimestamp(entry);
                          const isSelected = compareItem?._id === entry._id;
                          const entryConf = typeof entry.confidence === 'number' ? `${(entry.confidence * 100).toFixed(1)}%` : '';
                          return (
                            <TouchableOpacity
                              key={entry._id}
                              style={[
                                styles.comparePickerItem,
                                isSelected && styles.comparePickerItemActive,
                              ]}
                              onPress={() => setCompareItem(isSelected ? null : entry)}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.comparePickerResult, isSelected && { color: '#fff' }]} numberOfLines={1}>
                                  {entry.result || 'Unknown'}
                                </Text>
                                <Text style={[styles.comparePickerDate, isSelected && { color: 'rgba(255,255,255,0.8)' }]}>
                                  {formatDate(entryDate)}
                                </Text>
                              </View>
                              {entryConf ? (
                                <Text style={[styles.comparePickerConf, isSelected && { color: '#fff' }]}>{entryConf}</Text>
                              ) : null}
                              <Ionicons
                                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                                size={20}
                                color={isSelected ? '#fff' : COLORS.textLight}
                              />
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>

                  {/* Full comparison - renders both scans with same Current Analysis design */}
                  {previousItem ? (
                    <>
                      {/* Quick Delta Summary */}
                      <View style={styles.changeHighlightsRow}>
                        <View style={styles.changeChip}>
                          <Text style={styles.changeChipLabel}>Confidence Δ</Text>
                          <Text style={styles.changeChipValue}>{formatDelta(confidenceDelta)}</Text>
                        </View>
                        <View style={styles.changeChip}>
                          <Text style={styles.changeChipLabel}>Quality</Text>
                          <Text style={styles.changeChipValue}>{qualityChanged ? 'Changed' : 'Same'}</Text>
                        </View>
                      </View>

                      {/* ===== SIDE-BY-SIDE ON DESKTOP, STACKED ON MOBILE ===== */}
                      <View style={isDesktop ? styles.compareSideBySide : undefined}>
                      {/* ===== CURRENT SCAN (full analysis) ===== */}
                      <View style={[styles.compareScanSection, isDesktop && styles.compareScanHalf]}>
                        <View style={styles.compareScanLabel}>
                          <Ionicons name="analytics-outline" size={14} color={COLORS.primary} />
                          <Text style={styles.compareScanLabelText}>Current Scan</Text>
                        </View>

                        <View style={styles.currentHeroCard}>
                          <View style={styles.currentHeroTopRow}>
                            <View>
                              <Text style={styles.currentHeroLabel}>{getSubjectLabel(selectedItem.subject)} Analysis</Text>
                              <Text style={styles.currentHeroResult}>{selectedItem.result || 'Unknown'}</Text>
                            </View>
                            <View style={styles.currentConfidencePill}>
                              <Text style={styles.currentConfidencePillText}>{confidencePercent}</Text>
                            </View>
                          </View>
                          <Text style={styles.currentHeroSub}>{formatDate(createdAt)}</Text>
                          {renderScoreBar('Confidence', selectedItem.confidence, COLORS.primary)}
                        </View>

                        <View style={styles.modalSection}>
                          <Text style={styles.modalSectionTitle}>Quality Scores</Text>
                          {renderScoreBar('Overall', selectedItem.image_quality?.overall_score, COLORS.success)}
                          {renderScoreBar('Blur', selectedItem.image_quality?.blur_score, '#7C3AED')}
                          {renderScoreBar('Brightness', selectedItem.image_quality?.brightness_score, '#2563EB')}
                          {renderScoreBar('Contrast', selectedItem.image_quality?.contrast_score, '#D97706')}
                          {renderScoreBar('Subject Size', selectedItem.image_quality?.subject_size_score, '#16A34A')}
                        </View>

                        <View style={styles.modalSection}>
                          <Text style={styles.modalSectionTitle}>Details</Text>
                          {renderDetailRow('Fruit Quality', selectedItem.fruit?.quality)}
                          {renderDetailRow('Ripeness Stage', selectedItem.fruit?.ripeness_stage)}
                          {renderDetailRow('Mold Present', selectedItem.fruit?.mold_present != null
                            ? (selectedItem.fruit.mold_present ? 'Yes' : 'No') : undefined)}
                          {renderDetailRow('Leaf Health', selectedItem.leaf?.class)}
                        </View>

                        {selectedItem.subject === 'fruit' && selectedItem.fruit_detection && selectedItem.fruit_detection.total_detected > 0 && (
                          <View style={styles.modalSection}>
                            <View style={styles.historySectionTitleRow}>
                              <Text style={[styles.modalSectionTitle, { marginBottom: 0 }]}>Fruit Detection</Text>
                              <View style={styles.historyDetectionBadge}>
                                <Text style={styles.historyDetectionBadgeText}>
                                  {selectedItem.fruit_detection.total_detected} detected
                                </Text>
                              </View>
                            </View>
                            {selectedItem.fruit_detection.summary && (
                              <View style={styles.historyDetectionCounts}>
                                {[
                                  { label: 'Ripe', count: selectedItem.fruit_detection.summary.ripe, color: '#8B5CF6' },
                                  { label: 'Unripe', count: selectedItem.fruit_detection.summary.unripe, color: '#22C55E' },
                                  { label: 'Overripe', count: selectedItem.fruit_detection.summary.overripe, color: '#F59E0B' },
                                  { label: 'Mold', count: selectedItem.fruit_detection.summary.mold, color: '#EF4444' },
                                ].filter(item => item.count > 0).map((item) => (
                                  <View key={item.label} style={styles.historyCountChip}>
                                    <View style={[styles.historyCountDot, { backgroundColor: item.color }]} />
                                    <Text style={styles.historyCountText}>{item.count} {item.label}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        )}

                        {selectedItem.subject === 'fruit' && selectedItem.analytics?.ripeness_analysis && (
                          <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>Ripeness Breakdown</Text>
                            {[
                              { label: 'Ripe', pct: selectedItem.analytics.ripeness_analysis.ripe_pct, color: '#8B5CF6' },
                              { label: 'Unripe', pct: selectedItem.analytics.ripeness_analysis.unripe_pct, color: '#22C55E' },
                              { label: 'Overripe', pct: selectedItem.analytics.ripeness_analysis.overripe_pct, color: '#F59E0B' },
                              { label: 'Mold', pct: selectedItem.analytics.ripeness_analysis.mold_pct, color: '#EF4444' },
                            ].filter(item => (item.pct || 0) > 0).map((item) => (
                              renderScoreBar(item.label, item.pct / 100, item.color)
                            ))}
                          </View>
                        )}

                        {selectedItem.analytics?.quality_assessment && (
                          <View style={styles.modalSection}>
                            <View style={styles.historySectionTitleRow}>
                              <Text style={[styles.modalSectionTitle, { marginBottom: 0 }]}>Product Suitability</Text>
                              <View style={[styles.historyDetectionBadge, {
                                backgroundColor: selectedItem.analytics.quality_assessment.grade === 'A' ? '#DCFCE7'
                                  : selectedItem.analytics.quality_assessment.grade === 'B' ? '#DBEAFE'
                                  : selectedItem.analytics.quality_assessment.grade === 'C' ? '#FEF3C7' : '#FEE2E2'
                              }]}>
                                <Text style={[styles.historyDetectionBadgeText, {
                                  color: selectedItem.analytics.quality_assessment.grade === 'A' ? '#16A34A'
                                    : selectedItem.analytics.quality_assessment.grade === 'B' ? '#2563EB'
                                    : selectedItem.analytics.quality_assessment.grade === 'C' ? '#92400E' : COLORS.danger
                                }]}>
                                  Grade {selectedItem.analytics.quality_assessment.grade}
                                </Text>
                              </View>
                            </View>
                            {selectedItem.analytics.quality_assessment.product_suitability &&
                              Object.entries(selectedItem.analytics.quality_assessment.product_suitability).map(([key, val]) => (
                                renderScoreBar(
                                  key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                                  val / 100,
                                  val >= 70 ? '#16A34A' : val >= 40 ? '#D97706' : '#DC2626'
                                )
                              ))
                            }
                          </View>
                        )}

                        <View style={styles.currentRecommendationCard}>
                          <View style={styles.currentRecHeaderRow}>
                            <Ionicons name="bulb-outline" size={16} color={COLORS.warning} />
                            <Text style={styles.currentRecTitle}>Recommendation</Text>
                          </View>
                          {renderDetailRow('Primary', selectedItem.recommendation?.primary)}
                          {renderDetailRow('Reason', selectedItem.recommendation?.reason)}
                        </View>
                      </View>

                      {/* ===== SELECTED SCAN (full analysis) ===== */}
                      <View style={[styles.compareScanSection, isDesktop && styles.compareScanHalf]}>
                        <View style={[styles.compareScanLabel, { backgroundColor: COLORS.primary + '15', borderColor: COLORS.primary + '40' }]}>
                          <Ionicons name="git-compare-outline" size={14} color={COLORS.primary} />
                          <Text style={[styles.compareScanLabelText, { color: COLORS.primary }]}>Selected Scan</Text>
                        </View>

                        <View style={[styles.currentHeroCard, { borderColor: COLORS.primary + '50' }]}>
                          <View style={styles.currentHeroTopRow}>
                            <View>
                              <Text style={styles.currentHeroLabel}>{getSubjectLabel(previousItem.subject)} Analysis</Text>
                              <Text style={styles.currentHeroResult}>{previousItem.result || 'Unknown'}</Text>
                            </View>
                            <View style={[styles.currentConfidencePill, { backgroundColor: '#7C3AED' }]}>
                              <Text style={styles.currentConfidencePillText}>
                                {previousConfidence !== null ? `${(previousConfidence * 100).toFixed(1)}%` : 'N/A'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.currentHeroSub}>{formatDate(getBestTimestamp(previousItem))}</Text>
                          {renderScoreBar('Confidence', previousItem.confidence, '#7C3AED')}
                        </View>

                        <View style={styles.modalSection}>
                          <Text style={styles.modalSectionTitle}>Quality Scores</Text>
                          {renderScoreBar('Overall', previousItem.image_quality?.overall_score, COLORS.success)}
                          {renderScoreBar('Blur', previousItem.image_quality?.blur_score, '#7C3AED')}
                          {renderScoreBar('Brightness', previousItem.image_quality?.brightness_score, '#2563EB')}
                          {renderScoreBar('Contrast', previousItem.image_quality?.contrast_score, '#D97706')}
                          {renderScoreBar('Subject Size', previousItem.image_quality?.subject_size_score, '#16A34A')}
                        </View>

                        <View style={styles.modalSection}>
                          <Text style={styles.modalSectionTitle}>Details</Text>
                          {renderDetailRow('Fruit Quality', previousItem.fruit?.quality)}
                          {renderDetailRow('Ripeness Stage', previousItem.fruit?.ripeness_stage)}
                          {renderDetailRow('Mold Present', previousItem.fruit?.mold_present != null
                            ? (previousItem.fruit.mold_present ? 'Yes' : 'No') : undefined)}
                          {renderDetailRow('Leaf Health', previousItem.leaf?.class)}
                        </View>

                        {previousItem.subject === 'fruit' && previousItem.fruit_detection && previousItem.fruit_detection.total_detected > 0 && (
                          <View style={styles.modalSection}>
                            <View style={styles.historySectionTitleRow}>
                              <Text style={[styles.modalSectionTitle, { marginBottom: 0 }]}>Fruit Detection</Text>
                              <View style={styles.historyDetectionBadge}>
                                <Text style={styles.historyDetectionBadgeText}>
                                  {previousItem.fruit_detection.total_detected} detected
                                </Text>
                              </View>
                            </View>
                            {previousItem.fruit_detection.summary && (
                              <View style={styles.historyDetectionCounts}>
                                {[
                                  { label: 'Ripe', count: previousItem.fruit_detection.summary.ripe, color: '#8B5CF6' },
                                  { label: 'Unripe', count: previousItem.fruit_detection.summary.unripe, color: '#22C55E' },
                                  { label: 'Overripe', count: previousItem.fruit_detection.summary.overripe, color: '#F59E0B' },
                                  { label: 'Mold', count: previousItem.fruit_detection.summary.mold, color: '#EF4444' },
                                ].filter(item => item.count > 0).map((item) => (
                                  <View key={item.label} style={styles.historyCountChip}>
                                    <View style={[styles.historyCountDot, { backgroundColor: item.color }]} />
                                    <Text style={styles.historyCountText}>{item.count} {item.label}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        )}

                        {previousItem.subject === 'fruit' && previousItem.analytics?.ripeness_analysis && (
                          <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>Ripeness Breakdown</Text>
                            {[
                              { label: 'Ripe', pct: previousItem.analytics.ripeness_analysis.ripe_pct, color: '#8B5CF6' },
                              { label: 'Unripe', pct: previousItem.analytics.ripeness_analysis.unripe_pct, color: '#22C55E' },
                              { label: 'Overripe', pct: previousItem.analytics.ripeness_analysis.overripe_pct, color: '#F59E0B' },
                              { label: 'Mold', pct: previousItem.analytics.ripeness_analysis.mold_pct, color: '#EF4444' },
                            ].filter(item => (item.pct || 0) > 0).map((item) => (
                              renderScoreBar(item.label, item.pct / 100, item.color)
                            ))}
                          </View>
                        )}

                        {previousItem.analytics?.quality_assessment && (
                          <View style={styles.modalSection}>
                            <View style={styles.historySectionTitleRow}>
                              <Text style={[styles.modalSectionTitle, { marginBottom: 0 }]}>Product Suitability</Text>
                              <View style={[styles.historyDetectionBadge, {
                                backgroundColor: previousItem.analytics.quality_assessment.grade === 'A' ? '#DCFCE7'
                                  : previousItem.analytics.quality_assessment.grade === 'B' ? '#DBEAFE'
                                  : previousItem.analytics.quality_assessment.grade === 'C' ? '#FEF3C7' : '#FEE2E2'
                              }]}>
                                <Text style={[styles.historyDetectionBadgeText, {
                                  color: previousItem.analytics.quality_assessment.grade === 'A' ? '#16A34A'
                                    : previousItem.analytics.quality_assessment.grade === 'B' ? '#2563EB'
                                    : previousItem.analytics.quality_assessment.grade === 'C' ? '#92400E' : COLORS.danger
                                }]}>
                                  Grade {previousItem.analytics.quality_assessment.grade}
                                </Text>
                              </View>
                            </View>
                            {previousItem.analytics.quality_assessment.product_suitability &&
                              Object.entries(previousItem.analytics.quality_assessment.product_suitability).map(([key, val]) => (
                                renderScoreBar(
                                  key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                                  val / 100,
                                  val >= 70 ? '#16A34A' : val >= 40 ? '#D97706' : '#DC2626'
                                )
                              ))
                            }
                          </View>
                        )}

                        <View style={styles.currentRecommendationCard}>
                          <View style={styles.currentRecHeaderRow}>
                            <Ionicons name="bulb-outline" size={16} color={COLORS.warning} />
                            <Text style={styles.currentRecTitle}>Recommendation</Text>
                          </View>
                          {renderDetailRow('Primary', previousItem.recommendation?.primary)}
                          {renderDetailRow('Reason', previousItem.recommendation?.reason)}
                        </View>
                      </View>
                      </View>{/* end side-by-side wrapper */}
                    </>
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                      <Ionicons name="git-compare-outline" size={36} color={COLORS.textLight} />
                      <Text style={[styles.comparisonEmptyText, { textAlign: 'center', marginTop: 8 }]}>
                        Tap a scan above to compare it with the current analysis.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="time-outline" size={58} color={COLORS.textSecondary} />
      <Text style={styles.emptyTitle}>No History Found</Text>
      <Text style={styles.emptyText}>
        {error || 'No predictions match your selected filters yet.'}
      </Text>
      <TouchableOpacity style={styles.refreshButton} onPress={fetchHistory}>
        <Ionicons name="refresh" size={18} color={COLORS.buttonText} />
        <Text style={styles.refreshButtonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={history}
        renderItem={renderItem}
        keyExtractor={(item, index) => item._id || index.toString()}
        contentContainerStyle={[
          dynamicStyles.listContent,
          history.length === 0 && styles.emptyListContent,
        ]}
        ListHeaderComponent={
          <View>
            <View style={styles.headerSection}>
              <Text style={[styles.title, dynamicStyles.title]}>My Prediction History</Text>
              <Text style={[styles.subtitle, dynamicStyles.subtitle]}>
                Private records for your account only
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryNumber, dynamicStyles.summaryNumber]}>{summary.total}</Text>
                <Text style={styles.summaryLabel}>Total</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryNumber, dynamicStyles.summaryNumber]}>{summary.fruit}</Text>
                <Text style={styles.summaryLabel}>Fruit</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryNumber, dynamicStyles.summaryNumber]}>{summary.leaf}</Text>
                <Text style={styles.summaryLabel}>Leaf</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryNumber, dynamicStyles.summaryNumber]}>
                  {(summary.avgConfidence * 100).toFixed(0)}%
                </Text>
                <Text style={styles.summaryLabel}>Avg Conf.</Text>
              </View>
            </View>

            <View style={styles.filterContainer}>
              <Text style={styles.filterLabel}>Category</Text>
              {renderFilterChips(CATEGORY_OPTIONS, categoryFilter, setCategoryFilter)}

              <Text style={[styles.filterLabel, styles.filterLabelSpacing]}>Date</Text>
              {renderFilterChips(DATE_OPTIONS, dateFilter, setDateFilter)}
            </View>
          </View>
        }
        ListEmptyComponent={!isLoading ? renderEmpty : null}
        ListFooterComponent={isLoading && history.length > 0 ? <ActivityIndicator style={styles.footerLoader} color={COLORS.primary} /> : null}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchHistory}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      />

      {isLoading && history.length === 0 ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading your history...</Text>
        </View>
      ) : null}

      {renderDetailsModal()}

      <SweetAlert
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        showCancel={alertConfig.showCancel}
        onConfirm={alertConfig.onConfirm}
        onCancel={hideAlert}
        onClose={hideAlert}
        confirmColor={alertConfig.confirmColor}
        autoClose={alertConfig.autoClose}
        closeOnOverlayPress={alertConfig.closeOnOverlayPress}
      />
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerSection: {
    marginBottom: 14,
  },
  title: {
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    marginTop: 4,
    color: COLORS.textSecondary,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryNumber: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  summaryLabel: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  filterContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  filterLabelSpacing: {
    marginTop: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.surface,
  },
  historyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subjectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  subjectPillLeaf: {
    backgroundColor: COLORS.primaryDark,
  },
  subjectPillText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  dateText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  resultRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  resultText: {
    flex: 1,
    fontWeight: '800',
    textTransform: 'capitalize',
    color: COLORS.text,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  progressTrack: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 999,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 999,
  },
  detailsGrid: {
    marginTop: 10,
    gap: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    color: COLORS.textSecondary,
  },
  recommendationBox: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: `${COLORS.primary}14`,
    borderWidth: 1,
    borderColor: `${COLORS.primary}33`,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  recommendationText: {
    flex: 1,
    color: COLORS.text,
    lineHeight: 18,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  seeMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: `${COLORS.primary}12`,
    gap: 6,
  },
  seeMoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: `${COLORS.danger}12`,
    gap: 6,
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalCloseBtn: {
    padding: 4,
  },
  layoutToggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  layoutTab: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.background,
  },
  layoutTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  layoutTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  layoutTabTextActive: {
    color: COLORS.surface,
  },
  modalScrollContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  currentHeroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  currentHeroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentHeroLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  currentHeroResult: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 3,
    textTransform: 'capitalize',
  },
  currentHeroSub: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  currentConfidencePill: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  currentConfidencePillText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '800',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  metricLabel: {
    width: 86,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  metricBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  metricBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  metricValue: {
    width: 42,
    textAlign: 'right',
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '700',
  },
  currentRecommendationCard: {
    backgroundColor: COLORS.warningBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  currentRecHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  currentRecTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.warning,
  },
  compareCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  compareCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
  },
  compareCardLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontWeight: '700',
  },
  compareCardDate: {
    marginTop: 3,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  compareCardResult: {
    marginTop: 6,
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  compareCardSub: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
  },
  changeHighlightsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  changeChip: {
    flex: 1,
    backgroundColor: `${COLORS.primary}12`,
    borderWidth: 1,
    borderColor: `${COLORS.primary}35`,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  changeChipLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  changeChipValue: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '800',
    marginTop: 2,
  },
  modalSection: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  historySectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  historyDetectionBadge: {
    backgroundColor: COLORS.purpleBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  historyDetectionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.purple,
  },
  historyDetectionCounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  historyCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  historyCountDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  historyCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
  },
  historySummaryText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 6,
    fontStyle: 'italic',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailRowLabel: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  detailRowValue: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text,
    textAlign: 'right',
  },
  bulletBlock: {
    marginTop: 8,
    paddingTop: 6,
  },
  bulletTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  bulletItem: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  comparisonEmptyText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  comparePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginBottom: 6,
    gap: 8,
  },
  comparePickerItemActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  comparePickerResult: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    textTransform: 'capitalize',
  },
  comparePickerDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  comparePickerConf: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: 4,
  },
  compareSideBySide: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  compareScanHalf: {
    flex: 1,
  },
  compareScanSection: {
    gap: 10,
    marginBottom: 4,
  },
  compareScanLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  compareScanLabelText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  emptyText: {
    marginTop: 8,
    textAlign: 'center',
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  refreshButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  refreshButtonText: {
    color: COLORS.surface,
    fontWeight: '700',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: 12,
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
    backgroundColor: COLORS.primaryBg || COLORS.primaryLight + '20',
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
  exportPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  exportPdfBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
});
