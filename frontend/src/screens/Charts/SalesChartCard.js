// Sales Area / Line / Bar Chart Component
// Supports area, line, and bar chart types with gradient fills
// Uses react-native-gifted-charts for React Native
// Improved: better tooltip positioning, no overlap, interactive HiLo summary

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { useThemeColors } from '../../context/ThemeContext';

const CHART_TYPES = [
  { key: 'area', icon: 'trending-up', label: 'Area' },
  { key: 'bar', icon: 'bar-chart', label: 'Bar' },
  { key: 'line', icon: 'analytics', label: 'Line' },
];

export default function SalesChartCard({
  title = 'Sales & Revenue',
  subtitle,
  data = [],
  chartType = 'area',
  onChartTypeChange,
  chartWidth = 300,
  height = 220,
  formatYLabel,
  yAxisLabelPrefix = '₱',
  accentColor,
  tooltipFormatter,
  periodLabel,
  showChartToggle = true,
}) {
  const COLORS = useThemeColors();
  const lineColor = accentColor || '#84CC16';
  const gradientColor = accentColor || '#84CC16';

  const hasData = data.length > 0;
  const hasNonZero = hasData && data.some(d => d.value > 0);

  const defaultFormatYLabel = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return `${num.toFixed(0)}`;
  };

  // Calculate safe spacing to prevent label overlap
  const safeChartWidth = Math.max(chartWidth - 20, 180);
  const dataLen = data.length || 1;

  const renderTooltip = useCallback((items) => {
    const item = items?.[0];
    const val = item?.value ?? 0;
    const dateLabel = item?.dataPointText || item?.label || '';
    return (
      <View style={[tooltipStyles.container, { backgroundColor: '#1C1917' }]}>
        {dateLabel ? <Text style={tooltipStyles.dateText}>{dateLabel}</Text> : null}
        <Text style={tooltipStyles.text}>
          {tooltipFormatter ? tooltipFormatter(val) : `₱${val.toLocaleString()}`}
        </Text>
        <View style={tooltipStyles.arrow} />
      </View>
    );
  }, [tooltipFormatter]);

  const pointerConfig = useMemo(() => ({
    pointerStripColor: lineColor,
    pointerStripWidth: 1,
    pointerStripUptoDataPoint: true,
    strokeDashArray: [4, 4],
    pointerColor: lineColor,
    radius: 6,
    pointerLabelWidth: 140,
    pointerLabelHeight: 50,
    activatePointersOnLongPress: false,
    autoAdjustPointerLabelPosition: true,
    shiftPointerLabelX: -70,
    shiftPointerLabelY: -60,
    pointerLabelComponent: renderTooltip,
    pointerVanishDelay: 3000,
    persistPointer: true,
  }), [lineColor, renderTooltip]);

  const maxValue = useMemo(() => {
    if (!hasNonZero) return 100;
    const max = Math.max(...data.map(d => d.value || 0));
    return max > 0 ? max * 1.15 : 100;
  }, [data, hasNonZero]);

  const { highVal, lowVal, avgVal } = useMemo(() => {
    if (!hasNonZero) return { highVal: 0, lowVal: 0, avgVal: 0 };
    const positiveData = data.filter(d => d.value > 0).map(d => d.value);
    if (positiveData.length === 0) return { highVal: 0, lowVal: 0, avgVal: 0 };
    return {
      highVal: Math.max(...positiveData),
      lowVal: Math.min(...positiveData),
      avgVal: positiveData.reduce((s, v) => s + v, 0) / positiveData.length,
    };
  }, [data, hasNonZero]);

  const renderChart = () => {
    if (data.length === 0) {
      return (
        <View style={styles.noData}>
          <Ionicons name="bar-chart-outline" size={48} color={COLORS.textLight} />
          <Text style={[styles.noDataText, { color: COLORS.textSecondary }]}>No data available</Text>
          <Text style={[styles.noDataSubtext, { color: COLORS.textLight }]}>Data will appear when activity occurs</Text>
        </View>
      );
    }

    if (chartType === 'bar') {
      const barSpacing = Math.max(safeChartWidth / dataLen - 12, 10);
      const barWidth = Math.min(Math.max(safeChartWidth / dataLen - 16, 8), 32);
      return (
        <BarChart
          data={data}
          width={safeChartWidth}
          height={height}
          spacing={barSpacing}
          barWidth={barWidth}
          barBorderRadius={6}
          frontColor={lineColor}
          noOfSections={4}
          maxValue={maxValue}
          yAxisColor="transparent"
          xAxisColor={COLORS.border}
          yAxisTextStyle={{ color: COLORS.textLight, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: COLORS.textLight, fontSize: 9 }}
          hideRules={false}
          rulesColor={COLORS.border + '40'}
          rulesType="dashed"
          dashWidth={4}
          dashGap={4}
          isAnimated
          animationDuration={800}
          yAxisLabelPrefix={yAxisLabelPrefix}
          formatYLabel={formatYLabel || defaultFormatYLabel}
          disableScroll={dataLen <= 12}
          scrollToEnd={dataLen > 12}
          showScrollIndicator={false}
          renderTooltip={(item) => {
            const dateLabel = item?.dataPointText || item?.label || '';
            return (
              <View style={[tooltipStyles.barContainer, { backgroundColor: '#1C1917' }]}>
                {dateLabel ? <Text style={tooltipStyles.dateText}>{dateLabel}</Text> : null}
                <Text style={tooltipStyles.text}>
                  {tooltipFormatter ? tooltipFormatter(item.value) : `₱${item.value.toLocaleString()}`}
                </Text>
              </View>
            );
          }}
        />
      );
    }

    const lineSpacing = safeChartWidth / Math.max(dataLen - 1, 1);
    return (
      <LineChart
        data={data}
        width={safeChartWidth}
        height={height}
        spacing={lineSpacing}
        adjustToWidth
        initialSpacing={0}
        endSpacing={0}
        color={lineColor}
        thickness={2.5}
        startFillColor={gradientColor}
        endFillColor={gradientColor}
        startOpacity={chartType === 'area' ? 0.25 : 0}
        endOpacity={chartType === 'area' ? 0.01 : 0}
        areaChart={chartType === 'area'}
        curved
        curveType={0}
        hideDataPoints={dataLen > 20}
        dataPointsColor={lineColor}
        dataPointsRadius={dataLen > 15 ? 3 : 4}
        focusEnabled
        showDataPointOnFocus
        focusedDataPointRadius={7}
        focusedDataPointColor={lineColor}
        showStripOnFocus
        stripColor={lineColor + '20'}
        stripWidth={2}
        yAxisColor="transparent"
        xAxisColor={COLORS.border}
        yAxisTextStyle={{ color: COLORS.textLight, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: COLORS.textLight, fontSize: 9 }}
        hideRules={false}
        rulesColor={COLORS.border + '40'}
        rulesType="dashed"
        dashWidth={4}
        dashGap={4}
        yAxisLabelPrefix={yAxisLabelPrefix}
        formatYLabel={formatYLabel || defaultFormatYLabel}
        noOfSections={4}
        maxValue={maxValue}
        isAnimated
        animationDuration={1000}
        disableScroll
        pointerConfig={pointerConfig}
      />
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
      {/* Decorative blur */}
      <View style={[styles.decorativeBlur, { backgroundColor: lineColor + '15' }]} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.titleAccent, { backgroundColor: lineColor }]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.title, { color: COLORS.text }]}>{title}</Text>
              {periodLabel && (
                <View style={[styles.periodBadge, { backgroundColor: lineColor + '15' }]}>
                  <Text style={[styles.periodBadgeText, { color: lineColor }]}>{periodLabel}</Text>
                </View>
              )}
            </View>
            {subtitle && <Text style={[styles.subtitle, { color: COLORS.textSecondary }]}>{subtitle}</Text>}
          </View>
        </View>

        {/* Chart Type Toggle */}
        {showChartToggle && onChartTypeChange && (
          <View style={[styles.chartToggle, { backgroundColor: COLORS.surfaceVariant }]}>
            {CHART_TYPES.map((type) => (
              <TouchableOpacity
                key={type.key}
                onPress={() => onChartTypeChange(type.key)}
                style={[
                  styles.chartToggleBtn,
                  chartType === type.key && [styles.chartToggleBtnActive, { backgroundColor: COLORS.surface }],
                ]}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={type.icon}
                  size={15}
                  color={chartType === type.key ? lineColor : COLORS.textLight}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Summary row for quick glance */}
      {hasNonZero && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: COLORS.textLight }]}>HIGH</Text>
            <Text style={[styles.summaryValue, { color: '#16A34A' }]}>
              {yAxisLabelPrefix}{defaultFormatYLabel(highVal)}
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: COLORS.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: COLORS.textLight }]}>LOW</Text>
            <Text style={[styles.summaryValue, { color: '#DC2626' }]}>
              {yAxisLabelPrefix}{defaultFormatYLabel(lowVal)}
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: COLORS.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: COLORS.textLight }]}>AVG</Text>
            <Text style={[styles.summaryValue, { color: COLORS.text }]}>
              {yAxisLabelPrefix}{defaultFormatYLabel(avgVal)}
            </Text>
          </View>
        </View>
      )}

      {/* Chart */}
      <View style={styles.chartWrap}>
        {renderChart()}
      </View>
    </View>
  );
}

const tooltipStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    alignItems: 'center',
  },
  arrow: {
    position: 'absolute',
    bottom: -5,
    width: 10,
    height: 10,
    backgroundColor: '#1C1917',
    transform: [{ rotate: '45deg' }],
  },
  barContainer: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 6,
    alignSelf: 'center',
  },
  text: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  dateText: {
    color: '#A3A3A3',
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 2,
  },
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  decorativeBlur: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    zIndex: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  titleAccent: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginTop: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  periodBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  periodBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  chartToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
  },
  chartToggleBtn: {
    padding: 7,
    borderRadius: 6,
  },
  chartToggleBtnActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 16,
  },
  summaryItem: {
    alignItems: 'center',
    gap: 2,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  summaryDivider: {
    width: 1,
    height: 24,
  },
  chartWrap: {
    alignItems: 'center',
    marginTop: 4,
    overflow: 'hidden',
    paddingRight: 4,
  },
  noData: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
  },
  noDataSubtext: {
    fontSize: 12,
    marginTop: 3,
  },
});
