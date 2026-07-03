// Admin Sales Tracking Screen
// Clean, minimalist platform-wide analytics dashboard
// Inspired by modern dashboard design — uses reusable chart components
// Features: 3 tabs (overview/sellers/products), seller drill-down modal,
// payment breakdown, seller rankings, real API data, WebSocket live updates

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
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
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

const CHART_PALETTE = [
  '#84CC16', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6',
  '#EF4444', '#14B8A6', '#F97316', '#6366F1', '#EC4899',
];

const PERIOD_OPTIONS = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

const TAB_OPTIONS = [
  { key: 'overview', label: 'Overview', icon: 'grid-outline' },
  { key: 'sellers', label: 'Sellers', icon: 'people-outline' },
  { key: 'products', label: 'Products', icon: 'cube-outline' },
];

export default function AdminSalesTracking({ navigation }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { user, isAuthenticated } = useAuth();
  const { width: screenWidth, isDesktop, isTablet, sp, fp, responsive, maxContentWidth } = useResponsive();

  useEffect(() => {
    if (!isAuthenticated) {
      Alert.alert('Login Required', 'You must be logged in to view platform analytics.', [
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
  const [activeTab, setActiveTab] = useState('overview');
  const [chartType, setChartType] = useState('area');
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  // Seller detail modal
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [showSellerModal, setShowSellerModal] = useState(false);
  const [sellerDetailData, setSellerDetailData] = useState(null);
  const [isLoadingSellerDetail, setIsLoadingSellerDetail] = useState(false);

  // Product detail modal
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);

  const [summary, setSummary] = useState({
    total_sales: 0,
    total_orders: 0,
    total_sellers: 0,
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
  const [sellerSales, setSellerSales] = useState([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState([]);

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

    const unsubscribe = subscribeToAnalytics('admin-sales', (update) => {
      console.log('[AdminSales] Live update received:', update.type);
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

      const response = await fetch(`${API_CONFIG.BASE_URL}/api/analytics/admin/sales?period=${selectedPeriod}`, {
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
        setSellerSales(data.seller_sales || []);
        setPaymentBreakdown(data.payment_breakdown || []);
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

  // Fetch individual seller analytics
  const fetchSellerDetail = useCallback(async (sellerId) => {
    try {
      setIsLoadingSellerDetail(true);
      const token = await AsyncStorage.getItem('@bignay_auth_token');

      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/analytics/admin/seller/${sellerId}/sales?period=${selectedPeriod}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      if (data.ok) {
        setSellerDetailData(data);
      }
    } catch (err) {
      console.error('Error fetching seller detail:', err);
    } finally {
      setIsLoadingSellerDetail(false);
    }
  }, [selectedPeriod]);

  // Export
  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      const token = await AsyncStorage.getItem('@bignay_auth_token');
      const url = `${API_CONFIG.BASE_URL}/api/analytics/export/pdf?period=${selectedPeriod}&type=admin&token=${encodeURIComponent(token)}`;
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

  // Helpers
  const renderSellerAvatar = (image, size = 40) => (
    <View style={[styles.avatarWrap, { width: size, height: size, borderRadius: size / 2, borderColor: COLORS.border }]}>
      {image ? (
        <Image source={{ uri: image }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.surfaceVariant }]}>
          <Ionicons name="person" size={size * 0.5} color={COLORS.textLight} />
        </View>
      )}
    </View>
  );

  const renderProductThumbnail = (image, size = 36) => (
    <View style={[styles.productThumb, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: COLORS.surfaceVariant }]}>
      {image ? (
        <Image source={{ uri: image }} style={{ width: size, height: size, borderRadius: size * 0.3 }} resizeMode="cover" />
      ) : (
        <Ionicons name="leaf" size={size * 0.5} color={COLORS.textLight} />
      )}
    </View>
  );

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

  const sellerBarItems = useMemo(() => {
    return sellerSales.slice(0, 6).map((seller) => ({
      name: seller.seller_name.split(' ')[0].substring(0, 8),
      value: seller.total_sales,
    }));
  }, [sellerSales]);

  const paymentPieItems = useMemo(() => {
    const colorMap = {
      'cod': '#10B981', 'cash_on_delivery': '#10B981',
      'wallet': '#3B82F6', 'gcash': '#3B82F6',
      'online': '#8B5CF6', 'online_payment': '#8B5CF6',
      'card': '#F59E0B',
    };
    return paymentBreakdown.map((item, index) => ({
      name: item.method.toUpperCase().replace('_', ' '),
      value: item.total,
      quantity: item.count,
      color: colorMap[item.method.toLowerCase()] || CHART_PALETTE[index % CHART_PALETTE.length],
    }));
  }, [paymentBreakdown]);

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

  // Period label
  const periodLabel = selectedPeriod === 'weekly' ? 'Weekly' : selectedPeriod === 'monthly' ? 'Monthly' : 'Yearly';

  // Handlers
  const handleSellerPress = (seller) => {
    setSelectedSeller(seller);
    setSellerDetailData(null);
    setShowSellerModal(true);
    if (seller.seller_id) {
      fetchSellerDetail(seller.seller_id);
    }
  };

  const handleProductPress = (product) => {
    setSelectedProduct(product);
    setShowProductModal(true);
  };

  // ─────────────────────────────────────────────
  // ═══════ TAB: Overview ═══════
  // ─────────────────────────────────────────────
  const renderOverviewTab = () => (
    <Animated.View style={{ opacity: fadeAnim }}>
      {/* KPI Grid */}
      <View style={styles.kpiGrid}>
        <KPICard title="Total Revenue" value={formatShortCurrency(summary.total_sales)} trend={summary.growth_rate} icon="cash-outline" color="green" />
        <KPICard title="Net Profit" value={formatShortCurrency(summary.gross_profit)} icon="trending-up-outline" color="lime" sublabel={summary.profit_margin > 0 ? `${summary.profit_margin}% margin` : undefined} />
        <KPICard title="Transactions" value={`${summary.total_orders}`} icon="receipt-outline" color="blue" />
        <KPICard title="Units Sold" value={`${summary.total_items_sold || 0}`} icon="cube-outline" color="orange" />
        <KPICard title="COGS" value={formatShortCurrency(summary.total_cogs)} icon="pricetags-outline" color="red" sublabel="Cost of Goods" />
        <KPICard title="Avg. Order Value" value={formatShortCurrency(summary.avg_order_value)} icon="cart-outline" color="purple" />
        <KPICard title="Active Sellers" value={`${summary.total_sellers}`} icon="people-outline" color="teal" />
        <KPICard title="Cancelled" value={`${summary.cancelled_orders || 0}`} icon="close-circle-outline" color="red" />
      </View>

      {/* Revenue Trend */}
      <SalesChartCard
        title="Platform Revenue"
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

      {/* Order Volume */}
      <SalesChartCard
        title="Order Volume"
        subtitle="Transactions over time"
        data={orderBarData}
        chartType="bar"
        chartWidth={chartWidth}
        height={180}
        accentColor="#10B981"
        showChartToggle={false}
        tooltipFormatter={(val) => `${val} Orders`}
        formatYLabel={(val) => `${parseFloat(val).toFixed(0)}`}
      />

      {/* Payment Methods */}
      {paymentPieItems.length > 0 && (
        <CategoryPieCard
          title="Payment Methods"
          subtitle="Distribution by type"
          data={paymentPieItems}
          chartWidth={chartWidth}
          centerLabel={`${paymentBreakdown.length}`}
          centerValue="Methods"
          showImages={false}
          formatValue={formatCurrency}
        />
      )}

      {/* Profitability Snapshot */}
      <ProfitCard
        revenue={summary.total_sales}
        cogs={summary.total_cogs}
        profit={summary.gross_profit}
        profitMargin={summary.profit_margin}
        formatCurrency={formatCurrency}
      />

      {/* Goal Card */}
      <GoalCard
        title="Platform Goal"
        subtitle={`Revenue Target for ${new Date().toLocaleString('en', { month: 'long' })}`}
        currentValue={summary.total_sales}
        targetValue={Math.max(summary.total_sales * 1.2, 50000)}
      />
    </Animated.View>
  );

  // ─────────────────────────────────────────────
  // ═══════ TAB: Sellers ═══════
  // ─────────────────────────────────────────────
  const renderSellersTab = () => (
    <Animated.View style={{ opacity: fadeAnim }}>
      {/* Top Sellers Bar Chart */}
      <TopProductsCard
        title="Top Sellers"
        subtitle="By revenue generated"
        data={sellerBarItems}
        chartWidth={chartWidth}
        height={200}
        accentColor="#F59E0B"
      />

      {/* Seller Rankings List */}
      <View style={[styles.card, styles.cardSpacing]}>
        <View style={styles.cardTitleRow}>
          <View style={styles.titleAccent} />
          <View>
            <Text style={[styles.cardTitle, { color: COLORS.text }]}>Seller Rankings</Text>
            <Text style={[styles.cardSubtitle, { color: COLORS.textSecondary }]}>Tap to view individual analytics</Text>
          </View>
        </View>

        {sellerSales.length > 0 ? (
          <View style={styles.sellerList}>
            {sellerSales.map((seller, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.sellerItem, { backgroundColor: COLORS.surfaceVariant }]}
                onPress={() => handleSellerPress(seller)}
                activeOpacity={0.7}
              >
                <View style={styles.sellerRank}>
                  {index < 3 ? (
                    <View style={[styles.rankBadge, {
                      backgroundColor: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32'
                    }]}>
                      <Ionicons name="trophy" size={14} color="#FFF" />
                    </View>
                  ) : (
                    <Text style={[styles.rankNumber, { color: COLORS.textSecondary }]}>#{index + 1}</Text>
                  )}
                </View>
                {renderSellerAvatar(seller.seller_image, 42)}
                <View style={styles.sellerInfo}>
                  <Text style={[styles.sellerName, { color: COLORS.text }]} numberOfLines={1}>{seller.seller_name}</Text>
                  <Text style={[styles.sellerStats, { color: COLORS.textSecondary }]}>
                    {seller.order_count} orders · {seller.items_sold || 0} items
                  </Text>
                </View>
                <View style={styles.sellerRevenue}>
                  <Text style={[styles.sellerRevenueValue, { color: COLORS.text }]}>{formatShortCurrency(seller.total_sales)}</Text>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.noDataChart}>
            <Ionicons name="medal-outline" size={48} color={COLORS.textLight} />
            <Text style={[styles.noDataText, { color: COLORS.textSecondary }]}>No sellers yet</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );

  // ─────────────────────────────────────────────
  // ═══════ TAB: Products ═══════
  // ─────────────────────────────────────────────
  const renderProductsTab = () => (
    <Animated.View style={{ opacity: fadeAnim }}>
      {/* Top Products Bar */}
      <TopProductsCard
        title="Top-Selling Products"
        subtitle="Revenue by product"
        data={topProductsItems}
        chartWidth={chartWidth}
        height={200}
        accentColor="#14B8A6"
      />

      {/* Revenue Distribution Pie */}
      <CategoryPieCard
        title="Revenue Distribution"
        subtitle="Share by product"
        data={productPieItems}
        chartWidth={chartWidth}
        onItemPress={handleProductPress}
        showImages
        formatValue={formatCurrency}
      />
    </Animated.View>
  );

  // ─────────────────────────────────────────────
  // ═══════ Seller Detail Modal Content ═══════
  // ─────────────────────────────────────────────
  const renderSellerDetailContent = () => {
    if (!selectedSeller) return null;

    const sellerTrendData = sellerDetailData?.sales_trend?.map((item, index) => ({
      value: item.amount || 0,
      label: index % Math.ceil((sellerDetailData?.sales_trend?.length || 1) / 5) === 0
        ? (item.date || '').split('-')[2] || ''
        : '',
      labelTextStyle: { color: COLORS.textLight, fontSize: 9 },
    })) || [];

    const sellerProductsData = sellerDetailData?.product_sales?.slice(0, 5).map((item, index) => ({
      value: item.revenue,
      label: item.product_name.length > 5 ? item.product_name.substring(0, 5) + '..' : item.product_name,
      frontColor: CHART_PALETTE[index % CHART_PALETTE.length],
      topLabelComponent: () => (
        <Text style={{ fontSize: 8, color: COLORS.text, fontWeight: '600', marginBottom: 3 }}>{formatShortCurrency(item.revenue)}</Text>
      ),
      labelTextStyle: { color: COLORS.textSecondary, fontSize: 8 },
    })) || [];

    const detailSummary = sellerDetailData?.summary || {};

    return (
      <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
        {/* Seller Header */}
        <View style={styles.modalSellerHeader}>
          {renderSellerAvatar(selectedSeller.seller_image || sellerDetailData?.seller_info?.profile_image, 64)}
          <Text style={[styles.modalSellerName, { color: COLORS.text }]}>{selectedSeller.seller_name}</Text>
          {(selectedSeller.seller_email || sellerDetailData?.seller_info?.email) && (
            <Text style={[styles.modalSellerEmail, { color: COLORS.textSecondary }]}>
              {selectedSeller.seller_email || sellerDetailData?.seller_info?.email}
            </Text>
          )}
        </View>

        {isLoadingSellerDetail ? (
          <View style={styles.modalLoadingWrap}>
            <ActivityIndicator size="small" color="#84CC16" />
            <Text style={[styles.modalLoadingText, { color: COLORS.textSecondary }]}>Loading seller analytics...</Text>
          </View>
        ) : (
          <>
            {/* KPI Row */}
            <View style={styles.modalKpiGrid}>
              <View style={[styles.modalKpiItem, { backgroundColor: '#F0FDF4' }]}>
                <Text style={[styles.modalKpiValue, { color: '#16A34A' }]}>
                  {formatShortCurrency(detailSummary.total_sales || selectedSeller.total_sales)}
                </Text>
                <Text style={[styles.modalKpiLabel, { color: COLORS.textSecondary }]}>Revenue</Text>
              </View>
              <View style={[styles.modalKpiItem, { backgroundColor: '#F0F9FF' }]}>
                <Text style={[styles.modalKpiValue, { color: '#2563EB' }]}>
                  {detailSummary.total_orders || selectedSeller.order_count || 0}
                </Text>
                <Text style={[styles.modalKpiLabel, { color: COLORS.textSecondary }]}>Orders</Text>
              </View>
              <View style={[styles.modalKpiItem, { backgroundColor: '#FFFBEB' }]}>
                <Text style={[styles.modalKpiValue, { color: '#D97706' }]}>
                  {detailSummary.items_sold || selectedSeller.items_sold || 0}
                </Text>
                <Text style={[styles.modalKpiLabel, { color: COLORS.textSecondary }]}>Items</Text>
              </View>
            </View>

            {/* COGS & Profit */}
            {(detailSummary.total_cogs > 0 || detailSummary.gross_profit > 0) && (
              <View style={styles.modalProfitSection}>
                <View style={[styles.modalProfitRow, { backgroundColor: COLORS.surfaceVariant }]}>
                  <Ionicons name="pricetags-outline" size={16} color="#DC2626" />
                  <Text style={[styles.modalProfitLabel, { color: COLORS.textSecondary }]}>COGS</Text>
                  <Text style={[styles.modalProfitValue, { color: '#DC2626' }]}>{formatCurrency(detailSummary.total_cogs)}</Text>
                </View>
                <View style={[styles.modalProfitRow, { backgroundColor: COLORS.surfaceVariant }]}>
                  <Ionicons name="trending-up" size={16} color="#16A34A" />
                  <Text style={[styles.modalProfitLabel, { color: COLORS.textSecondary }]}>Gross Profit</Text>
                  <Text style={[styles.modalProfitValue, { color: '#16A34A' }]}>{formatCurrency(detailSummary.gross_profit)}</Text>
                </View>
                {detailSummary.profit_margin > 0 && (
                  <View style={[styles.modalProfitRow, { backgroundColor: COLORS.surfaceVariant }]}>
                    <Ionicons name="shield-checkmark" size={16} color="#3B82F6" />
                    <Text style={[styles.modalProfitLabel, { color: COLORS.textSecondary }]}>Margin</Text>
                    <Text style={[styles.modalProfitValue, { color: '#3B82F6' }]}>{detailSummary.profit_margin}%</Text>
                  </View>
                )}
                {detailSummary.growth_rate !== undefined && detailSummary.growth_rate !== 0 && (
                  <View style={[styles.modalProfitRow, { backgroundColor: COLORS.surfaceVariant }]}>
                    <Ionicons
                      name={detailSummary.growth_rate > 0 ? 'arrow-up-circle' : 'arrow-down-circle'}
                      size={16}
                      color={detailSummary.growth_rate > 0 ? '#16A34A' : '#DC2626'}
                    />
                    <Text style={[styles.modalProfitLabel, { color: COLORS.textSecondary }]}>Growth</Text>
                    <Text style={[styles.modalProfitValue, { color: detailSummary.growth_rate > 0 ? '#16A34A' : '#DC2626' }]}>
                      {detailSummary.growth_rate > 0 ? '+' : ''}{detailSummary.growth_rate}%
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Sales Trend Mini Chart */}
            {sellerTrendData.length > 0 && sellerTrendData.some(d => d.value > 0) && (
              <View style={styles.modalChartSection}>
                <Text style={[styles.modalChartTitle, { color: COLORS.text }]}>Sales Trend</Text>
                <View style={styles.modalChartWrap}>
                  <LineChart
                    data={sellerTrendData}
                    width={chartWidth - 48}
                    height={120}
                    spacing={Math.max((chartWidth - 48) / (sellerTrendData.length || 1), 14)}
                    color="#84CC16"
                    thickness={2}
                    startFillColor="#84CC16"
                    endFillColor="#84CC16"
                    startOpacity={0.35}
                    endOpacity={0.01}
                    areaChart
                    curved
                    hideDataPoints
                    yAxisColor="transparent"
                    xAxisColor={COLORS.border}
                    yAxisTextStyle={{ color: COLORS.textLight, fontSize: 8 }}
                    hideRules
                    noOfSections={3}
                    isAnimated
                    animationDuration={600}
                  />
                </View>
              </View>
            )}

            {/* Seller's Products Chart */}
            {sellerProductsData.length > 0 && (
              <View style={styles.modalChartSection}>
                <Text style={[styles.modalChartTitle, { color: COLORS.text }]}>Top Products</Text>
                <View style={styles.modalChartWrap}>
                  <BarChart
                    data={sellerProductsData}
                    width={chartWidth - 48}
                    height={140}
                    spacing={Math.max((chartWidth - 48) / (sellerProductsData.length || 1) - 16, 14)}
                    barWidth={Math.min(Math.max((chartWidth - 48) / (sellerProductsData.length || 1) - 20, 16), 32)}
                    barBorderRadius={6}
                    noOfSections={3}
                    yAxisColor="transparent"
                    xAxisColor={COLORS.border}
                    yAxisTextStyle={{ color: COLORS.textLight, fontSize: 8 }}
                    hideRules={false}
                    rulesColor={COLORS.divider}
                    rulesType="dashed"
                    isAnimated
                    animationDuration={600}
                    yAxisLabelPrefix="₱"
                    formatYLabel={(val) => formatShortCurrency(parseFloat(val)).replace('₱', '')}
                  />
                </View>
              </View>
            )}

            {/* Seller's product breakdown list */}
            {sellerDetailData?.product_sales?.length > 0 && (
              <View style={styles.modalProductList}>
                <Text style={[styles.modalChartTitle, { color: COLORS.text }]}>Product Breakdown</Text>
                {sellerDetailData.product_sales.map((product, index) => (
                  <View key={index} style={[styles.modalProductItem, { backgroundColor: COLORS.surfaceVariant }]}>
                    {renderProductThumbnail(product.image, 36)}
                    <View style={styles.modalProductInfo}>
                      <Text style={[styles.modalProductName, { color: COLORS.text }]} numberOfLines={1}>{product.product_name}</Text>
                      <Text style={[styles.modalProductStats, { color: COLORS.textSecondary }]}>
                        {product.quantity} sold · {formatCurrency(product.revenue)}
                      </Text>
                      {product.cogs > 0 && (
                        <Text style={[styles.modalProductCogs, { color: COLORS.textLight }]}>
                          COGS: {formatCurrency(product.cogs)} · Profit: {formatCurrency(product.profit)}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    );
  };

  // ── Loading ──
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#84CC16" />
        <Text style={[styles.loadingText, { color: COLORS.text }]}>Loading platform analytics...</Text>
        <Text style={[styles.loadingSubtext, { color: COLORS.textSecondary }]}>Crunching the numbers</Text>
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
              <View style={styles.headerTitleRow}>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Analytics</Text>
                <View style={[styles.adminBadge]}>
                  <Ionicons name="shield-checkmark" size={11} color="#FFF" />
                  <Text style={styles.adminBadgeText}>Admin</Text>
                </View>
              </View>
              <Text style={[styles.headerSubtitle, { color: COLORS.textSecondary }]}>
                Platform-wide performance overview
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

          {/* Tab Selector */}
          <View style={[styles.tabContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            {TAB_OPTIONS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Ionicons name={tab.icon} size={15} color={activeTab === tab.key ? '#84CC16' : COLORS.textSecondary} />
                <Text style={[
                  styles.tabText,
                  { color: COLORS.textSecondary },
                  activeTab === tab.key && styles.tabTextActive,
                ]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
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
          <>
            {activeTab === 'overview' && renderOverviewTab()}
            {activeTab === 'sellers' && renderSellersTab()}
            {activeTab === 'products' && renderProductsTab()}
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ──── Seller Detail Modal ──── */}
      <Modal visible={showSellerModal} animationType="slide" transparent onRequestClose={() => setShowSellerModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentFull, { backgroundColor: COLORS.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: COLORS.border }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: COLORS.text }]}>Seller Analytics</Text>
              <TouchableOpacity onPress={() => setShowSellerModal(false)} style={[styles.modalCloseButton, { backgroundColor: COLORS.surfaceVariant }]}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            {renderSellerDetailContent()}
          </View>
        </View>
      </Modal>

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
                <View style={[styles.modalImageWrap, { backgroundColor: COLORS.surfaceVariant }]}>
                  {selectedProduct.image ? (
                    <Image source={{ uri: selectedProduct.image }} style={styles.modalImage} resizeMode="cover" />
                  ) : (
                    <Ionicons name="leaf" size={36} color={COLORS.textLight} />
                  )}
                </View>
                <Text style={[styles.modalProductMainName, { color: COLORS.text }]}>{selectedProduct.product_name}</Text>

                <View style={styles.modalStatsGrid}>
                  <View style={[styles.modalStatCard, { backgroundColor: COLORS.surfaceVariant }]}>
                    <View style={[styles.modalStatIcon, { backgroundColor: '#DCFCE7' }]}>
                      <Ionicons name="cash-outline" size={22} color="#16A34A" />
                    </View>
                    <Text style={[styles.modalStatValue, { color: COLORS.text }]}>{formatCurrency(selectedProduct.revenue)}</Text>
                    <Text style={[styles.modalStatLabel, { color: COLORS.textSecondary }]}>Revenue</Text>
                  </View>
                  <View style={[styles.modalStatCard, { backgroundColor: COLORS.surfaceVariant }]}>
                    <View style={[styles.modalStatIcon, { backgroundColor: '#DBEAFE' }]}>
                      <Ionicons name="cube-outline" size={22} color="#2563EB" />
                    </View>
                    <Text style={[styles.modalStatValue, { color: COLORS.text }]}>{selectedProduct.quantity}</Text>
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
    paddingBottom: 4,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {},
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#292524',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.5,
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

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    marginTop: 10,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: '#F7FEE7',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#84CC16',
    fontWeight: '700',
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 12,
    marginTop: 8,
    gap: 10,
  },

  // Card common
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  cardSpacing: {
    marginTop: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  titleAccent: {
    width: 4,
    height: 28,
    backgroundColor: '#84CC16',
    borderRadius: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },

  // Avatar
  avatarWrap: {
    borderWidth: 2,
    overflow: 'hidden',
  },
  avatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Product thumbnail
  productThumb: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  // Seller list
  sellerList: {
    marginTop: 4,
    gap: 8,
  },
  sellerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 10,
  },
  sellerRank: {
    width: 34,
    alignItems: 'center',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  sellerInfo: {
    flex: 1,
  },
  sellerName: {
    fontSize: 14,
    fontWeight: '600',
  },
  sellerStats: {
    fontSize: 12,
    marginTop: 2,
  },
  sellerRevenue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sellerRevenueValue: {
    fontSize: 15,
    fontWeight: '700',
  },

  // No Data
  noDataChart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
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
  modalContentFull: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 12,
    maxHeight: '85%',
    minHeight: '50%',
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
    marginBottom: 16,
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
  modalScrollBody: {
    flex: 1,
  },

  // Modal Product
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
  modalProductMainName: {
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

  // Seller modal
  modalSellerHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalSellerName: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
  },
  modalSellerEmail: {
    fontSize: 13,
    marginTop: 4,
  },

  // Modal KPI grid
  modalKpiGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 16,
  },
  modalKpiItem: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalKpiValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalKpiLabel: {
    fontSize: 10,
    marginTop: 3,
  },

  // Modal profit section
  modalProfitSection: {
    width: '100%',
    gap: 6,
    marginBottom: 16,
  },
  modalProfitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
  },
  modalProfitLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  modalProfitValue: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Modal loading
  modalLoadingWrap: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  modalLoadingText: {
    fontSize: 13,
    marginTop: 10,
  },

  // Modal chart section
  modalChartSection: {
    marginTop: 10,
    marginBottom: 10,
  },
  modalChartTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  modalChartWrap: {
    alignItems: 'center',
    overflow: 'hidden',
  },

  // Modal product list
  modalProductList: {
    marginTop: 10,
  },
  modalProductItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
    gap: 10,
  },
  modalProductInfo: {
    flex: 1,
  },
  modalProductName: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalProductStats: {
    fontSize: 11,
    marginTop: 2,
  },
  modalProductCogs: {
    fontSize: 10,
    marginTop: 2,
  },
});
