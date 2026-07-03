import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../context/ThemeContext';

const LOGO = require('../../slideshow/BIGNAY LOGO.png');


export default function Header({ title, onMenuPress, onLogoPress, showMenu = true, style }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.inner}>
        {/* Left: Menu button */}
        {showMenu && (
          <TouchableOpacity onPress={onMenuPress} style={styles.menuBtn}>
            <Ionicons name="menu" size={24} color={COLORS.textOnPrimary} />
          </TouchableOpacity>
        )}

        {/* Center: Logo + Title */}
        <TouchableOpacity
          style={styles.brand}
          onPress={onLogoPress}
          activeOpacity={0.8}
          disabled={!onLogoPress}
        >
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title} numberOfLines={1}>
            {title || 'Bignay Scanner'}
          </Text>
        </TouchableOpacity>

        {/* Right: spacer to balance layout */}
        <View style={styles.spacer} />

        <Text style={styles.watermark}>chunmaru</Text>
      </View>
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    backgroundColor: COLORS.primary,
    paddingTop: Platform.OS === 'web' ? 0 : 44,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 8,
  },
  menuBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    letterSpacing: 0.3,
  },
  spacer: {
    width: 44,
  },
  watermark: {
    position: 'absolute',
    right: 8,
    bottom: 4,
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.2)',
    fontStyle: 'italic',
  },
});
