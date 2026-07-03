// Mobile-specific Card component
// Styled container card for mobile apps

import React, { useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
} from 'react-native';

import { useThemeColors } from '../../context/ThemeContext';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

/**
 * Platform-specific Card component for mobile
 * 
 * Note: When creating a web version, create a web/Card.js that uses
 * HTML div elements with appropriate CSS styling
 */
export function Card({
  children,
  onPress,
  style,
  contentStyle,
  elevation = 2,
  borderRadius = 12,
}) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
  }, [scaleAnim]);

  const containerStyle = [
    styles.container,
    {
      borderRadius,
      elevation,
      shadowOpacity: elevation * 0.05,
    },
    style,
  ];

  if (onPress) {
    return (
      <AnimatedTouchable
        style={[...containerStyle, { transform: [{ scale: scaleAnim }] }]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
      >
        <View style={[styles.content, contentStyle]}>{children}</View>
      </AnimatedTouchable>
    );
  }

  return (
    <View style={containerStyle}>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

/**
 * Card with image header
 */
export function ImageCard({
  image,
  imageHeight = 160,
  title,
  subtitle,
  children,
  onPress,
  badge,
  style,
}) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  return (
    <Card onPress={onPress} style={style}>
      {image ? (
        <Image source={{ uri: image }} style={[styles.image, { height: imageHeight }]} />
      ) : (
        <View style={[styles.imagePlaceholder, { height: imageHeight }]}>
          <Text style={styles.placeholderText}>No Image</Text>
        </View>
      )}
      {badge && (
        <View style={styles.badgeContainer}>
          {badge}
        </View>
      )}
      <View style={styles.cardContent}>
        {title && <Text style={styles.title} numberOfLines={2}>{title}</Text>}
        {subtitle && <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>}
        {children}
      </View>
    </Card>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    overflow: 'hidden',
  },
  content: {},
  image: {
    width: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.textLight,
    fontSize: 14,
  },
  badgeContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 1,
  },
  cardContent: {
    padding: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
    lineHeight: 22,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
});

export default Card;
