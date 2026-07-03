import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, Platform, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../context/ThemeContext';

const LOGO = require('../../slideshow/BIGNAY LOGO.png');


export default function Footer({ style }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const year = new Date().getFullYear();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.divider} />

      <View style={styles.content}>
        {/* Brand row */}
        <View style={styles.brandRow}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={styles.brandName}>Bignay App</Text>
            <Text style={styles.tagline}>Smart Fruit Analysis & Marketplace</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoRow}>
          <Text style={styles.version}>Version 1.0.0</Text>
          <View style={styles.dot} />
          <Text style={styles.copyright}>© {year} Bignay Project</Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    backgroundColor: COLORS.primary,
    paddingBottom: Platform.OS === 'web' ? 0 : 20,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginHorizontal: 16,
  },
  content: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  brandName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  tagline: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  version: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.textMuted,
  },
  copyright: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
});
