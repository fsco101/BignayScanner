// User Sales Tracking Screen
// Clean, minimalist analytics dashboard inspired by modern dashboard design
// Uses reusable chart components, real API data, WebSocket live updates

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Modal,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../context/AuthContext';
import { API_CONFIG } from '../../../config/api';
import { useResponsive } from '../../../hooks/useResponsive';
import { connectSocket, disconnectSocket, subscribeToAnalytics, isSocketConnected } from '../../../services/socketService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors } from '../../../context/ThemeContext';
import {
  KPICard,
  SalesChartCard,
  CategoryPieCard,
  TopProductsCard,
  ProfitCard,
  GoalCard,
  InsightCard,
} from '../../Charts';

const PERIOD_OPTIONS = [
  { key: 'weekly', label: 'Weekly', icon: 'calendar-outline' },
  { key: 'monthly', label: 'Monthly', icon: 'calendar' },
  { key: 'yearly', label: 'Yearly', icon: 'calendar-sharp' },
];

export default function UserSalesTracking({ navigation }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { user, isAuthenticated } = useAuth();
  const { width: screenWidth, isDesktop, isTablet, sp, fp, responsive, maxContentWidth } = useResponsive();

  useEffect(() => {
    if (!isAuthenticated) {
      Alert.alert('Login Required', 'You must be logged in to view sales analytics.', [
        { text: 'OK', onPress: () => navigation.navigate('Auth', { screen: 'Login' }) },
      ]);
    }
  }, [isAuthenticated, navigation]);

  if (!isAuthenticated) {
    return <View style={styles.container} />;
  }

  const contentMaxWidth = isDesktop ? maxContentWidth : screenWidth;
  const chartWidth = Math.min(screenWidth - 80, contentMaxWidth - 80);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('monthly');
  const [chartType, setChartType] = useState('area');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const [summary, setSummary] = useState({
    total_sales: 0,
    total_orders: 0,
    avg_order_value: 0,
    total_items_sold: 0,
    total_cogs: 0,
    gross_profit: 0,
    profit_margin: 0,
    cancelled_orders: 0,
    growth_rate: 0,
  });
  const [salesTrend, setSalesTrend] = useState([]);
  const [orderTrend, setOrderTrend] = useState([]);
  const [productSales, setProductSales] = useState([]);

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
    ]).start();
  }, []);

  // Pulse animation for live indicator
  useEffect(() => {
    if (wsConnected) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [wsConnected]);

  // WebSocket connection
  useEffect(() => {
    const socket = connectSocket();
    setWsConnected(isSocketConnected());

    const unsubscribe = subscribeToAnalytics('user-sales', (update) => {
      console.log('[UserSales] Live update received:', update.type);
      setLastUpdate(new Date());
      if (['new_order', 'order_status_change', 'order_delivered', 'order_cancelled'].includes(update.type)) {
        fetchSalesData(true);
      }
    });

    const checkInterval = setInterval(() => {
      setWsConnected(isSocketConnected());
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(checkInterval);
    };
  }, []);

  // Data fetching
  const fetchSalesData = useCallback(async (silent = false) => {
    if (!isAuthenticated) return;
    try {
      if (!silent) setError(null);
      const token = await AsyncStorage.getItem('@bignay_auth_token');

      const response = await fetch(`${API_CONFIG.BASE_URL}/api/analytics/user/sales?period=${selectedPeriod}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.ok) {
        setSummary(data.summary || {});
        setSalesTrend(data.sales_trend || []);
        setOrderTrend(data.order_trend || []);
        setProductSales(data.product_sales || []);
      } else if (!silent) {
        setError(data.error || 'Failed to fetch sales data');
      }
    } catch (err) {
      console.error('Error fetching sales data:', err);
      if (!silent) setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated, selectedPeriod]);

  useEffect(() => { fetchSalesData(); }, [fetchSalesData]);

  const onRefresh = () => { setIsRefreshing(true); fetchSalesData(); };

  // Export
  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      const token = await AsyncStorage.getItem('@bignay_auth_token');
      const url = `${API_CONFIG.BASE_URL}/api/analytics/export/pdf?period=${selectedPeriod}&type=user&token=${encodeURIComponent(token)}`;
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
    } catch (err) {
      Alert.alert('Export Error', 'Failed to export PDF report');
    } finally {
      setIsExporting(false);
    }
  };

  // Formatters
  const formatCurrency = (amount) =>
    `₱${(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatShortCurrency = (amount) => {
    if (amount >= 1000000) return `₱${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `₱${(amount / 1000).toFixed(1)}K`;
    return `₱${(amount || 0).toFixed(0)}`;
  };

  // ── Chart Data Preparation ──

  const formatChartLabel = useCallback((dateStr, period, index, total) => {
    const parts = dateStr.split('-');
    const labelStep = Math.max(1, Math.ceil(total / 7));
    if (period === 'yearly') {
      return ['J','F','M','A','M','J','J','A','S','O','N','D'][parseInt(parts[1]) - 1] || '';
    }
    if (period === 'monthly') {
      if (index % labelStep !== 0) return '';
      const d = new Date(parts[0], parseInt(parts[1]) - 1, parseInt(parts[2]));
      const mon = d.toLocaleString('en', { month: 'short' });
      return `${mon} ${d.getDate()}`;
    }
    // weekly
    if (index % labelStep !== 0) return '';
    const d = new Date(parts[0], parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleString('en', { weekday: 'short' });
  }, []);

  const revenueLineData = useMemo(() => {
    if (salesTrend.length === 0) return [];
    const len = salesTrend.length;
    return salesTrend.map((item, index) => ({
      value: item.amount || 0,
      label: formatChartLabel(item.date, selectedPeriod, index, len),
      dataPointText: item.date,
      labelTextStyle: { color: COLORS.textLight, fontSize: 9 },
    }));
  }, [salesTrend, selectedPeriod, formatChartLabel]);

  const orderBarData = useMemo(() => {
    if (orderTrend.length === 0) return [];
    const len = orderTrend.length;
    const maxVal = Math.max(...orderTrend.map(d => d.count));
    return orderTrend.map((item, index) => {
      const intensity = maxVal > 0 ? item.count / maxVal : 0;
      return {
        value: item.count || 0,
        label: formatChartLabel(item.date, selectedPeriod, index, len),
        dataPointText: item.date,
        frontColor: item.count > 0 ? `rgba(132, 204, 22, ${0.3 + intensity * 0.7})` : '#F7FEE7',
        topLabelComponent: () => (
          item.count > 0 ? <Text style={{ fontSize: 9, color: COLORS.text, fontWeight: '700', marginBottom: 4 }}>{item.count}</Text> : null
        ),
        labelTextStyle: { color: COLORS.textLight, fontSize: 9 },
      };
    });
  }, [orderTrend, selectedPeriod, formatChartLabel]);

  const productPieItems = useMemo(() => {
    return productSales.slice(0, 6).map((item) => ({
      name: item.product_name,
      value: item.revenue,
      image: item.image,
      quantity: item.quantity,
      cogs: item.cogs,
      profit: item.profit,
      cost_price: item.cost_price,
      product_name: item.product_name,
      revenue: item.revenue,
    }));
  }, [productSales]);

  const topProductsItems = useMemo(() => {
    return productSales.slice(0, 5).map((item) => ({
      name: item.product_name,
      value: item.revenue,
      image: item.image,
    }));
  }, [productSales]);

  const cogsProducts = useMemo(() => {
    return productSales.filter(p => p.cogs > 0).slice(0, 5).map((item) => ({
      name: item.product_name,
      value: item.cogs,
    }));
  }, [productSales]);

  // Insight message
  const insightMessage = useMemo(() => {
    if (summary.total_orders === 0) return "📦 Add more products to increase your visibility and sales potential!";
    if (summary.avg_order_value < 100) return "💡 Consider bundling products to increase your average order value!";
    if (summary.profit_margin > 30) return "🎉 Great margins! Keep maintaining your product quality and customer service!";
    return "📊 Review your pricing strategy to improve profit margins.";
  }, [summary]);

  // Period label
  const periodLabel = selectedPeriod === 'weekly' ? 'Weekly' : selectedPeriod === 'monthly' ? 'Monthly' : 'Yearly';

  // Product modal handler
  const handleProductPress = (product) => {
    setSelectedProduct(product);
    setShowProductModal(true);
  };

  // ── Loading ──
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#84CC16" />
        <Text style={[styles.loadingText, { color: COLORS.text }]}>Loading your sales data...</Text>
        <Text style={[styles.loadingSubtext, { color: COLORS.textSecondary }]}>Analyzing your performance</Text>
      </View>
    );
  }

  // ── Main Render ──
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && { maxWidth: maxContentWidth, width: '100%', alignSelf: 'center', paddingHorizontal: 24 }
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={['#84CC16']} tintColor={'#84CC16'} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ──── Header ──── */}
        <Animated.View style={[styles.headerSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={[styles.headerTitle, { color: COLORS.text }]}>Dashboard</Text>
              <Text style={[styles.headerSubtitle, { color: COLORS.textSecondary }]}>
                Overview of your sales performance
              </Text>
            </View>
            <View style={styles.headerRight}>
              {/* Live indicator */}
              <View style={[styles.liveBadge, { backgroundColor: wsConnected ? '#DCFCE7' : COLORS.surfaceVariant }]}>
                <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }], backgroundColor: wsConnected ? '#16A34A' : COLORS.textLight }]} />
                <Text style={[styles.liveText, { color: wsConnected ? '#16A34A' : COLORS.textLight }]}>
                  {wsConnected ? 'LIVE' : 'OFFLINE'}
                </Text>
              </View>
              {/* Profile avatar */}
              <View style={[styles.avatarWrap, { borderColor: COLORS.border }]}>
                {user?.profile_image ? (
                  <Image source={{ uri: user.profile_image }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: COLORS.surfaceVariant }]}>
                    <Ionicons name="person" size={20} color={COLORS.textLight} />
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Controls row */}
          <View style={styles.controlsRow}>
            {/* Period selector */}
            <View style={[styles.periodContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
              {PERIOD_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.periodButton,
                    selectedPeriod === option.key && styles.periodButtonActive,
                  ]}
                  onPress={() => setSelectedPeriod(option.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.periodButtonText,
                    { color: COLORS.textSecondary },
                    selectedPeriod === option.key && styles.periodButtonTextActive,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Export button */}
            <TouchableOpacity
              style={styles.exportButton}
              onPress={handleExportPDF}
              disabled={isExporting}
              activeOpacity={0.7}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={16} color="#FFF" />
                  <Text style={styles.exportButtonText}>Export</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline-outline" size={64} color={COLORS.textLight} />
            <Text style={[styles.errorTitle, { color: COLORS.text }]}>Oops!</Text>
            <Text style={[styles.errorText, { color: COLORS.textSecondary }]}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => fetchSalesData()}>
              <Ionicons name="refresh" size={20} color="#FFF" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* ──── KPI Grid ──── */}
            <View style={styles.kpiGrid}>
              <KPICard
                title="Total Revenue"
                value={formatShortCurrency(summary.total_sales)}
                trend={summary.growth_rate}
                icon="cash-outline"
                color="green"
              />
              <KPICard
                title="Net Profit"
                value={formatShortCurrency(summary.gross_profit)}
                trend={0}
                icon="trending-up-outline"
                color="lime"
                sublabel={summary.profit_margin > 0 ? `${summary.profit_margin}% margin` : undefined}
              />
              <KPICard
                title="Total Orders"
                value={`${summary.total_orders}`}
                trend={0}
                icon="receipt-outline"
                color="blue"
              />
              <KPICard
                title="Units Sold"
                value={`${summary.total_items_sold || 0}`}
                trend={0}
                icon="cube-outline"
                color="orange"
              />
              <KPICard
                title="COGS"
                value={formatShortCurrency(summary.total_cogs)}
                icon="pricetags-outline"
                color="red"
                sublabel="Cost of Goods"
              />
              <KPICard
                title="Avg. Order Value"
                value={formatShortCurrency(summary.avg_order_value)}
                icon="cart-outline"
                color="purple"
              />
            </View>

            {/* ──── Revenue Trend (with chart type toggle) ──── */}
            <SalesChartCard
              title="Performance Analytics"
              subtitle={selectedPeriod === 'weekly' ? 'Last 14 days' : selectedPeriod === 'monthly' ? 'Last 30 days' : 'Last 12 months'}
              data={revenueLineData}
              chartType={chartType}
              onChartTypeChange={setChartType}
              chartWidth={chartWidth}
              height={220}
              accentColor="#84CC16"
              periodLabel={periodLabel}
              tooltipFormatter={(val) => formatCurrency(val)}
              showChartToggle
            />

            {/* ──── Order Volume ──── */}
            <SalesChartCard
              title="Order Volume"
              subtitle="Transactions over time"
              data={orderBarData}
              chartType="bar"
              chartWidth={chartWidth}
              height={180}
              accentColor="#10B981"
              yAxisLabelPrefix=""
              showChartToggle={false}
              tooltipFormatter={(val) => `${val} Orders`}
              formatYLabel={(val) => `${parseFloat(val).toFixed(0)}`}
            />

            {/* ──── Top Products ──── */}
            <TopProductsCard
              title="Top Products by Revenue"
              subtitle="Best performing items"
              data={topProductsItems}
              chartWidth={chartWidth}
              height={200}
              accentColor="#10B981"
            />

            {/* ──── COGS Breakdown ──── */}
            {cogsProducts.length > 0 && (
              <TopProductsCard
                title="COGS Breakdown"
                subtitle="Cost per product"
                data={cogsProducts}
                chartWidth={chartWidth}
                height={180}
                accentColor="#EF4444"
              />
            )}

            {/* ──── Revenue Distribution Pie ──── */}
            <CategoryPieCard
              title="Revenue Distribution"
              subtitle="Share by product"
              data={productPieItems}
              chartWidth={chartWidth}
              onItemPress={handleProductPress}
              showImages
              formatValue={formatCurrency}
            />

            {/* ──── Profitability Snapshot ──── */}
            <ProfitCard
              revenue={summary.total_sales}
              cogs={summary.total_cogs}
              profit={summary.gross_profit}
              profitMargin={summary.profit_margin}
              formatCurrency={formatCurrency}
            />

            {/* ──── Goal Card ──── */}
            <GoalCard
              title="Monthly Goal"
              subtitle={`Revenue Target for ${new Date().toLocaleString('en', { month: 'long' })}`}
              currentValue={summary.total_sales}
              targetValue={Math.max(summary.total_sales * 1.2, 10000)}
            />

            {/* ──── Insight ──── */}
            <InsightCard message={insightMessage} />
          </Animated.View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ──── Product Detail Modal ──── */}
      <Modal visible={showProductModal} animationType="slide" transparent onRequestClose={() => setShowProductModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: COLORS.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: COLORS.border }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: COLORS.text }]}>Product Details</Text>
              <TouchableOpacity onPress={() => setShowProductModal(false)} style={[styles.modalCloseButton, { backgroundColor: COLORS.surfaceVariant }]}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            {selectedProduct && (
              <View style={styles.modalBody}>
                {/* Product image */}
                <View style={[styles.modalImageWrap, { backgroundColor: COLORS.surfaceVariant }]}>
                  {selectedProduct.image ? (
                    <Image source={{ uri: selectedProduct.image }} style={styles.modalImage} resizeMode="cover" />
                  ) : (
                    <Ionicons name="leaf" size={36} color={COLORS.textLight} />
                  )}
                </View>
                <Text style={[styles.modalProductName, { color: COLORS.text }]}>{selectedProduct.product_name || selectedProduct.name}</Text>

                <View style={styles.modalStatsGrid}>
                  <View style={[styles.modalStatCard, { backgroundColor: COLORS.surfaceVariant }]}>
                    <View style={[styles.modalStatIcon, { backgroundColor: '#DCFCE7' }]}>
                      <Ionicons name="cash-outline" size={22} color="#16A34A" />
                    </View>
                    <Text style={[styles.modalStatValue, { color: COLORS.text }]}>{formatCurrency(selectedProduct.value || selectedProduct.revenue)}</Text>
                    <Text style={[styles.modalStatLabel, { color: COLORS.textSecondary }]}>Revenue</Text>
                  </View>
                  <View style={[styles.modalStatCard, { backgroundColor: COLORS.surfaceVariant }]}>
                    <View style={[styles.modalStatIcon, { backgroundColor: '#DBEAFE' }]}>
                      <Ionicons name="cube-outline" size={22} color="#2563EB" />
                    </View>
                    <Text style={[styles.modalStatValue, { color: COLORS.text }]}>{selectedProduct.quantity || 0}</Text>
                    <Text style={[styles.modalStatLabel, { color: COLORS.textSecondary }]}>Units Sold</Text>
                  </View>
                </View>

                {(selectedProduct.cogs > 0 || selectedProduct.cost_price > 0) && (
                  <View style={styles.modalCogsSection}>
                    <View style={[styles.modalInfoRow, { backgroundColor: COLORS.surfaceVariant }]}>
                      <Ionicons name="pricetag-outline" size={18} color="#DC2626" />
                      <Text style={[styles.modalInfoLabel, { color: COLORS.textSecondary }]}>Cost Price</Text>
                      <Text style={[styles.modalInfoValue, { color: '#DC2626' }]}>{formatCurrency(selectedProduct.cost_price)}/unit</Text>
                    </View>
                    <View style={[styles.modalInfoRow, { backgroundColor: COLORS.surfaceVariant }]}>
                      <Ionicons name="calculator-outline" size={18} color="#F97316" />
                      <Text style={[styles.modalInfoLabel, { color: COLORS.textSecondary }]}>Total COGS</Text>
                      <Text style={[styles.modalInfoValue, { color: '#F97316' }]}>{formatCurrency(selectedProduct.cogs)}</Text>
                    </View>
                    <View style={[styles.modalInfoRow, { backgroundColor: selectedProduct.profit >= 0 ? '#DCFCE7' : '#FEE2E2' }]}>
                      <Ionicons name="trending-up" size={18} color={selectedProduct.profit >= 0 ? '#16A34A' : '#DC2626'} />
                      <Text style={[styles.modalInfoLabel, { color: COLORS.textSecondary }]}>Profit</Text>
                      <Text style={[styles.modalInfoValue, { fontWeight: '800', color: selectedProduct.profit >= 0 ? '#16A34A' : '#DC2626' }]}>
                        {formatCurrency(selectedProduct.profit)}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={[styles.modalDivider, { backgroundColor: COLORS.divider }]} />
                <View style={[styles.modalInfoRow, { backgroundColor: COLORS.surfaceVariant }]}>
                  <Ionicons name="calculator-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={[styles.modalInfoLabel, { color: COLORS.textSecondary }]}>Avg. Price/Unit</Text>
                  <Text style={[styles.modalInfoValue, { color: COLORS.text }]}>
                    {formatCurrency((selectedProduct.value || selectedProduct.revenue || 0) / (selectedProduct.quantity || 1))}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 14,
  },

  // Header
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {},
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // Live badge
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Avatar
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Controls
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  periodContainer: {
    flexDirection: 'row',
    flex: 1,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  periodButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: '#84CC16',
  },
  periodButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },

  // Export
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#292524',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  exportButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // KPI
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 12,
    marginTop: 8,
    gap: 10,
  },

  // Error
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#84CC16',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 20,
    gap: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 12,
    minHeight: 380,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    alignItems: 'center',
  },
  modalImageWrap: {
    width: 72,
    height: 72,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  modalImage: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  modalProductName: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  modalStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: 14,
  },
  modalStatCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
  },
  modalStatIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalStatValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalStatLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  modalCogsSection: {
    width: '100%',
    marginTop: 16,
    gap: 6,
  },
  modalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    width: '100%',
  },
  modalInfoLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  modalInfoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalDivider: {
    height: 1,
    width: '100%',
    marginVertical: 16,
  },
});
