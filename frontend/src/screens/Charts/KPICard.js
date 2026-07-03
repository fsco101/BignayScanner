// KPI Card Component
// Clean, minimalist card inspired by modern dashboard design
// White bg, colored icon accent, trend badge, decorative background circle

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../context/ThemeContext';

const COLOR_MAP = {
  green: { iconBg: '#DCFCE7', iconColor: '#16A34A', decorative: '#16A34A' },
  lime: { iconBg: '#ECFCCB', iconColor: '#65A30D', decorative: '#84CC16' },
  blue: { iconBg: '#DBEAFE', iconColor: '#2563EB', decorative: '#3B82F6' },
  orange: { iconBg: '#FFF7ED', iconColor: '#EA580C', decorative: '#F97316' },
  red: { iconBg: '#FEE2E2', iconColor: '#DC2626', decorative: '#EF4444' },
  purple: { iconBg: '#F5F3FF', iconColor: '#7C3AED', decorative: '#8B5CF6' },
  teal: { iconBg: '#F0FDFA', iconColor: '#0D9488', decorative: '#14B8A6' },
  amber: { iconBg: '#FEF3C7', iconColor: '#D97706', decorative: '#F59E0B' },
};

export default function KPICard({
  title,
  value,
  trend,
  icon = 'cash-outline',
  color = 'green',
  sublabel,
}) {
  const COLORS = useThemeColors();
  const palette = COLOR_MAP[color] || COLOR_MAP.green;

  return (
    <View style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
      <View style={styles.topRow}>
        <View>
          <Text style={[styles.title, { color: COLORS.textSecondary }]}>{title}</Text>
          <Text style={[styles.value, { color: COLORS.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
        </View>
        <View style={[styles.iconWrap, { backgroundColor: palette.iconBg }]}>
          <Ionicons name={icon} size={20} color={palette.iconColor} />
        </View>
      </View>

      <View style={styles.bottomRow}>
        {trend !== undefined && trend !== 0 ? (
          <View style={[styles.trendBadge, { backgroundColor: trend >= 0 ? '#DCFCE7' : '#FEE2E2' }]}>
            <Text style={[styles.trendText, { color: trend >= 0 ? '#16A34A' : '#DC2626' }]}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </Text>
          </View>
        ) : null}
        {sublabel ? (
          <Text style={[styles.sublabel, { color: COLORS.textLight }]}>{sublabel}</Text>
        ) : trend !== undefined && trend !== 0 ? (
          <Text style={[styles.sublabel, { color: COLORS.textLight }]}>vs last period</Text>
        ) : null}
      </View>

      {/* Decorative background circle */}
      <View style={[styles.decorativeCircle, { backgroundColor: palette.decorative }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    maxWidth: '48%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 120,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: -0.3,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sublabel: {
    fontSize: 11,
  },
  decorativeCircle: {
    position: 'absolute',
    bottom: -16,
    right: -16,
    width: 64,
    height: 64,
    borderRadius: 32,
    opacity: 0.08,
  },
});
