// Top Products Bar Chart Component
// Displays product rankings with vertical bars and interactive tooltips
// Improved: proper label truncation, no overlap, color-coded bars, scrollable

import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import { useThemeColors } from '../../context/ThemeContext';

const CHART_PALETTE = [
  '#10B981', '#84CC16', '#3B82F6', '#F59E0B', '#8B5CF6',
  '#EF4444', '#14B8A6', '#F97316', '#6366F1', '#EC4899',
];

export default function TopProductsCard({
  title = 'Top Products by Revenue',
  subtitle,
  data = [],         // [{ name, value, image? }]
  chartWidth = 300,
  height = 200,
  accentColor,
  formatValue,
  yAxisLabelPrefix = '₱',
  onItemPress,
}) {
  const COLORS = useThemeColors();
  const hasData = data.length > 0;

  const defaultFormat = (val) => {
    if (val >= 1000000) return `₱${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `₱${(val / 1000).toFixed(1)}K`;
    return `₱${(val || 0).toFixed(0)}`;
  };
  const fmt = formatValue || defaultFormat;

  const safeChartWidth = Math.max(chartWidth - 20, 180);
  const sliced = data.slice(0, 6);

  const maxValue = useMemo(() => {
    if (!hasData) return 100;
    const max = Math.max(...sliced.map(d => d.value || d.revenue || 0));
    return max > 0 ? max * 1.2 : 100; // 20% headroom for top labels
  }, [sliced, hasData]);

  const barData = useMemo(() => {
    const barCount = sliced.length || 1;
    const barWidth = Math.min(Math.max(safeChartWidth / barCount - 24, 20), 44);

    return sliced.map((item, index) => {
      const name = item.name || item.product_name || '';
      // Truncate label based on available space
      const maxLabelLen = barWidth > 36 ? 8 : 6;
      const label = name.length > maxLabelLen
        ? name.substring(0, maxLabelLen) + '..'
        : name;

      return {
        value: item.value || item.revenue || 0,
        label,
        frontColor: CHART_PALETTE[index % CHART_PALETTE.length],
        topLabelComponent: () => (
          <Text style={{
            fontSize: 9,
            color: COLORS.text,
            fontWeight: '700',
            marginBottom: 4,
            textAlign: 'center',
          }}>
            {fmt(item.value || item.revenue || 0)}
          </Text>
        ),
        labelTextStyle: {
          color: COLORS.textSecondary,
          fontSize: 9,
          textAlign: 'center',
        },
      };
    });
  }, [sliced, safeChartWidth, COLORS, fmt]);

  const barCount = barData.length || 1;
  const barWidth = Math.min(Math.max(safeChartWidth / barCount - 24, 20), 44);
  const barSpacing = Math.max(safeChartWidth / barCount - barWidth, 12);

  return (
    <View style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.titleAccent, { backgroundColor: accentColor || '#10B981' }]} />
          <View>
            <Text style={[styles.title, { color: COLORS.text }]}>{title}</Text>
            {subtitle && <Text style={[styles.subtitle, { color: COLORS.textSecondary }]}>{subtitle}</Text>}
          </View>
        </View>
        {hasData && (
          <View style={[styles.countBadge, { backgroundColor: COLORS.surfaceVariant }]}>
            <Text style={[styles.countText, { color: COLORS.textSecondary }]}>{sliced.length} items</Text>
          </View>
        )}
      </View>

      {hasData ? (
        <View style={styles.chartWrap}>
          <BarChart
            data={barData}
            width={safeChartWidth}
            height={height}
            spacing={barSpacing}
            barWidth={barWidth}
            barBorderRadius={8}
            barBorderTopLeftRadius={8}
            barBorderTopRightRadius={8}
            noOfSections={4}
            maxValue={maxValue}
            yAxisColor="transparent"
            xAxisColor={COLORS.border}
            yAxisTextStyle={{ color: COLORS.textLight, fontSize: 10 }}
            hideRules={false}
            rulesColor={COLORS.border + '40'}
            rulesType="dashed"
            dashWidth={4}
            dashGap={4}
            isAnimated
            animationDuration={800}
            yAxisLabelPrefix={yAxisLabelPrefix}
            formatYLabel={(val) => {
              const num = parseFloat(val);
              if (isNaN(num)) return '0';
              if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
              if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
              return `${num.toFixed(0)}`;
            }}
            disableScroll={barCount <= 6}
            showScrollIndicator={false}
            renderTooltip={(item, index) => (
              <View style={[styles.tooltip, { backgroundColor: '#1C1917' }]}>
                <Text style={styles.tooltipName} numberOfLines={1}>
                  {sliced[index]?.name || sliced[index]?.product_name || 'Product'}
                </Text>
                <Text style={styles.tooltipValue}>
                  {`₱${item.value.toLocaleString()}`}
                </Text>
              </View>
            )}
          />
        </View>
      ) : (
        <View style={styles.noData}>
          <Ionicons name="cube-outline" size={48} color={COLORS.textLight} />
          <Text style={[styles.noDataText, { color: COLORS.textSecondary }]}>No product data</Text>
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
    overflow: 'hidden',
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
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
    marginTop: 1,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  countText: {
    fontSize: 11,
    fontWeight: '500',
  },
  chartWrap: {
    alignItems: 'center',
    marginTop: 4,
    overflow: 'hidden',
    paddingRight: 4,
  },
  tooltip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 6,
    alignItems: 'center',
    elevation: 4,
    minWidth: 80,
  },
  tooltipName: {
    color: '#A8A29E',
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 2,
  },
  tooltipValue: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
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
