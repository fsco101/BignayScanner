// Category / Product Pie Chart Component
// Donut chart with clean legend, product images, and tap-to-detail
// Improved: no overlapping text on chart, better legend layout, animated focus

import React, { useState, useMemo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PieChart } from 'react-native-gifted-charts';
import { useThemeColors } from '../../context/ThemeContext';

const CHART_PALETTE = [
  '#84CC16', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6',
  '#EF4444', '#14B8A6', '#F97316', '#6366F1', '#EC4899',
];

export default function CategoryPieCard({
  title = 'Revenue Distribution',
  subtitle,
  data = [],        // [{ name, value, image? }]
  chartWidth = 300,
  onItemPress,
  centerLabel,
  centerValue,
  showImages = true,
  formatValue,
}) {
  const COLORS = useThemeColors();
  const hasData = data.length > 0;
  const total = data.reduce((s, d) => s + (d.value || 0), 0) || 1;
  const [focusedIndex, setFocusedIndex] = useState(0);

  const slicedData = useMemo(() => data.slice(0, 8), [data]);

  const pieData = useMemo(() => {
    return slicedData.map((item, index) => ({
      value: item.value || 0,
      color: CHART_PALETTE[index % CHART_PALETTE.length],
      focused: index === focusedIndex,
      onPress: () => setFocusedIndex(index),
      // Don't render text on pie segments - show percentage in legend instead
    }));
  }, [slicedData, focusedIndex]);

  const radius = Math.min(chartWidth * 0.26, 100);
  const innerRadius = Math.min(chartWidth * 0.16, 60);

  const defaultFormat = (val) =>
    `₱${(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmt = formatValue || defaultFormat;

  const focusedItem = slicedData[focusedIndex] || slicedData[0];
  const focusedPercentage = focusedItem
    ? ((focusedItem.value / total) * 100).toFixed(1)
    : '0';

  return (
    <View style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={[styles.titleAccent, { backgroundColor: '#84CC16' }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: COLORS.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.subtitle, { color: COLORS.textSecondary }]}>{subtitle}</Text>}
        </View>
      </View>

      {hasData ? (
        <>
          {/* Pie Chart + Focused info side by side or stacked */}
          <View style={styles.chartSection}>
            <View style={styles.pieWrap}>
              <PieChart
                data={pieData}
                donut
                radius={radius}
                innerRadius={innerRadius}
                innerCircleColor={COLORS.surface}
                centerLabelComponent={() => (
                  <View style={styles.centerLabel}>
                    <Text style={[styles.centerValue, { color: COLORS.text }]}>
                      {centerValue !== undefined ? centerValue : slicedData.length}
                    </Text>
                    <Text style={[styles.centerText, { color: COLORS.textSecondary }]}>
                      {centerLabel || 'Items'}
                    </Text>
                  </View>
                )}
                isAnimated
                animationDuration={800}
                focusOnPress
                sectionAutoFocus
                showText={false}
              />
            </View>

            {/* Focused item info */}
            {focusedItem && (
              <View style={styles.focusedInfo}>
                <View style={[styles.focusedDot, { backgroundColor: CHART_PALETTE[focusedIndex % CHART_PALETTE.length] }]} />
                <Text style={[styles.focusedName, { color: COLORS.text }]} numberOfLines={2}>
                  {focusedItem.name || focusedItem.product_name || 'Product'}
                </Text>
                <Text style={[styles.focusedValue, { color: CHART_PALETTE[focusedIndex % CHART_PALETTE.length] }]}>
                  {fmt(focusedItem.value)}
                </Text>
                <Text style={[styles.focusedPercent, { color: COLORS.textSecondary }]}>
                  {focusedPercentage}% of total
                </Text>
              </View>
            )}
          </View>

          {/* Legend */}
          <View style={[styles.legend, { borderTopColor: COLORS.divider }]}>
            {slicedData.map((item, index) => {
              const percentage = ((item.value / total) * 100).toFixed(1);
              const color = CHART_PALETTE[index % CHART_PALETTE.length];
              const isActive = index === focusedIndex;

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.legendItem,
                    {
                      backgroundColor: isActive ? color + '12' : COLORS.surfaceVariant,
                      borderLeftColor: color,
                      borderLeftWidth: isActive ? 5 : 4,
                    },
                  ]}
                  onPress={() => {
                    setFocusedIndex(index);
                    onItemPress?.(item);
                  }}
                  activeOpacity={0.7}
                >
                  {/* Product image or color dot */}
                  {showImages && item.image ? (
                    <Image
                      source={{ uri: item.image }}
                      style={styles.legendImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.legendDot, { backgroundColor: color }]} />
                  )}

                  <View style={styles.legendInfo}>
                    <Text style={[styles.legendName, { color: COLORS.text }]} numberOfLines={1}>
                      {item.name || item.product_name || 'Product'}
                    </Text>
                    <Text style={[styles.legendStats, { color: COLORS.textSecondary }]}>
                      {fmt(item.value)} · {percentage}%
                    </Text>
                    {item.cogs > 0 && (
                      <Text style={[styles.legendCogs, { color: COLORS.textLight }]}>
                        COGS: {fmt(item.cogs)} · Profit: {fmt(item.profit)}
                      </Text>
                    )}
                  </View>

                  {/* Percentage badge instead of qty to avoid clutter */}
                  <View style={styles.percentBadge}>
                    {item.quantity !== undefined && (
                      <View style={[styles.qtyBadge, { backgroundColor: COLORS.surface }]}>
                        <Text style={[styles.qtyText, { color: COLORS.text }]}>{item.quantity}</Text>
                        <Text style={[styles.qtyLabel, { color: COLORS.textSecondary }]}>sold</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : (
        <View style={styles.noData}>
          <Ionicons name="pie-chart-outline" size={48} color={COLORS.textLight} />
          <Text style={[styles.noDataText, { color: COLORS.textSecondary }]}>No data available</Text>
        </View>
      )}
    </View>
  );
}

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
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
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
  chartSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  pieWrap: {
    alignItems: 'center',
  },
  centerLabel: {
    alignItems: 'center',
  },
  centerValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  centerText: {
    fontSize: 11,
  },
  focusedInfo: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 4,
    paddingLeft: 4,
  },
  focusedDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 2,
  },
  focusedName: {
    fontSize: 15,
    fontWeight: '700',
  },
  focusedValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  focusedPercent: {
    fontSize: 12,
  },
  legend: {
    marginTop: 16,
    borderTopWidth: 1,
    paddingTop: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    gap: 10,
  },
  legendImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendInfo: {
    flex: 1,
  },
  legendName: {
    fontSize: 14,
    fontWeight: '600',
  },
  legendStats: {
    fontSize: 12,
    marginTop: 2,
  },
  legendCogs: {
    fontSize: 10,
    marginTop: 2,
  },
  percentBadge: {
    alignItems: 'flex-end',
  },
  qtyBadge: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 50,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  qtyText: {
    fontSize: 16,
    fontWeight: '700',
  },
  qtyLabel: {
    fontSize: 9,
    marginTop: 1,
  },
  noData: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
  },
});
