// Monthly Goal / Revenue Target Card  
// Dark gradient card with progress bar, inspired by copydesign

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../context/ThemeContext';

export default function GoalCard({
  title = 'Monthly Goal',
  subtitle = 'Revenue Target',
  currentValue = 0,
  targetValue = 0,
  formatValue,
}) {
  const COLORS = useThemeColors();
  const defaultFmt = (val) => {
    if (val >= 1000000) return `₱${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `₱${(val / 1000).toFixed(1)}K`;
    return `₱${(val || 0).toFixed(0)}`;
  };
  const fmt = formatValue || defaultFmt;

  const percent = targetValue > 0 ? Math.min(Math.round((currentValue / targetValue) * 100), 100) : 0;

  return (
    <View style={styles.card}>
      {/* Decorative glow */}
      <View style={styles.glow} />

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <View style={styles.valueRow}>
        <Text style={styles.currentValue}>{fmt(currentValue)}</Text>
        <Text style={styles.targetValue}>/ {fmt(targetValue)}</Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>

      <Text style={styles.percentText}>{percent}% Achieved</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#292524',
    overflow: 'hidden',
    position: 'relative',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  glow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#84CC16',
    opacity: 0.12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#A8A29E',
    marginBottom: 20,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: 10,
  },
  currentValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  targetValue: {
    fontSize: 15,
    color: '#A8A29E',
    marginBottom: 4,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#44403C',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#84CC16',
    borderRadius: 4,
  },
  percentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#BEF264',
    textAlign: 'right',
    marginTop: 6,
  },
});
