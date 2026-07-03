// Profitability Snapshot Card
// Clean breakdown of Revenue - COGS = Profit with progress bar

import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../context/ThemeContext';

export default function ProfitCard({
  revenue = 0,
  cogs = 0,
  profit = 0,
  profitMargin = 0,
  formatCurrency,
}) {
  const COLORS = useThemeColors();

  const defaultFmt = (val) =>
    `₱${(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmt = formatCurrency || defaultFmt;

  const marginPercent = Math.min(Math.max(profitMargin, 0), 100);

  return (
    <View style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
      {/* Header with icon */}
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: '#DCFCE7' }]}>
          <Ionicons name="wallet-outline" size={18} color="#16A34A" />
        </View>
        <Text style={[styles.title, { color: COLORS.text }]}>Profitability Snapshot</Text>
      </View>

      {/* Rows */}
      <View style={styles.rows}>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: COLORS.textSecondary }]}>Revenue</Text>
          <Text style={[styles.rowValue, { color: '#16A34A' }]}>{fmt(revenue)}</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: COLORS.divider }]} />

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: COLORS.textSecondary }]}>Cost of Goods Sold</Text>
          <Text style={[styles.rowValue, { color: '#DC2626' }]}>-{fmt(cogs)}</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: COLORS.divider }]} />

        <View style={[styles.row, styles.totalRow]}>
          <Text style={[styles.totalLabel, { color: COLORS.text }]}>Gross Profit</Text>
          <Text style={[styles.totalValue, { color: profit >= 0 ? '#16A34A' : '#DC2626' }]}>
            {fmt(profit)}
          </Text>
        </View>
      </View>

      {/* Progress bar for margin */}
      {profitMargin > 0 && (
        <View style={styles.marginSection}>
          <View style={styles.marginHeader}>
            <Ionicons name="shield-checkmark" size={14} color="#16A34A" />
            <Text style={[styles.marginText, { color: '#16A34A' }]}>
              {profitMargin}% Profit Margin
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: COLORS.surfaceVariant }]}>
            <View style={[styles.progressFill, { width: `${marginPercent}%` }]} />
          </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  rows: {},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowLabel: {
    fontSize: 14,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    height: 1,
  },
  totalRow: {
    paddingTop: 14,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  marginSection: {
    marginTop: 14,
    gap: 8,
  },
  marginHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  marginText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#84CC16',
    borderRadius: 3,
  },
});
