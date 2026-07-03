// Insight Tips Card
// Contextual business insight with lightbulb icon

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../context/ThemeContext';

export default function InsightCard({ message }) {
  const COLORS = useThemeColors();

  if (!message) return null;

  return (
    <View style={[styles.card, { backgroundColor: COLORS.warningBg, borderLeftColor: '#F59E0B' }]}>
      <View style={styles.header}>
        <Ionicons name="bulb" size={20} color="#F59E0B" />
        <Text style={[styles.title, { color: COLORS.text }]}>Sales Insights</Text>
      </View>
      <Text style={[styles.text, { color: COLORS.textSecondary }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 18,
    borderLeftWidth: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  text: {
    fontSize: 13,
    lineHeight: 20,
  },
});
