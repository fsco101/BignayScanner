// Mobile-specific Badge component
// Small label/badge for status indicators

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon } from './Icon';

import { useThemeColors } from '../../context/ThemeContext';

/**
 * Badge component for mobile
 */
export function Badge({
  label,
  icon,
  color: colorProp,
  backgroundColor,
  size = 'medium', // small, medium, large
  variant = 'filled', // filled, outline
  style,
}) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const color = colorProp || COLORS.primary;

  const bgColor = variant === 'outline' 
    ? 'transparent' 
    : backgroundColor || color + '20';
  
  const textColor = variant === 'outline' ? color : color;
  const borderColor = variant === 'outline' ? color : 'transparent';

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return { padding: 4, fontSize: 10, iconSize: 10 };
      case 'large':
        return { padding: 8, fontSize: 14, iconSize: 16 };
      case 'medium':
      default:
        return { padding: 6, fontSize: 12, iconSize: 12 };
    }
  };

  const sizeStyles = getSizeStyles();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderColor,
          paddingHorizontal: sizeStyles.padding * 2,
          paddingVertical: sizeStyles.padding,
        },
        variant === 'outline' && styles.outline,
        style,
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          size={sizeStyles.iconSize}
          color={textColor}
          style={styles.icon}
        />
      )}
      {label && (
        <Text style={[styles.label, { color: textColor, fontSize: sizeStyles.fontSize }]}>
          {label}
        </Text>
      )}
    </View>
  );
}

/**
 * Category Badge - specific for forum categories
 */
export function CategoryBadge({ category, size = 'medium', style }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  return (
    <Badge
      label={category.name}
      icon={category.icon}
      color={category.color}
      size={size}
      style={style}
    />
  );
}

/**
 * Status badges for posts
 */
export function PinnedBadge({ size = 'small' }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  return (
    <Badge
      label="Pinned"
      icon="pin"
      color={COLORS.buttonText}
      backgroundColor={COLORS.danger}
      size={size}
    />
  );
}

export function FeaturedBadge({ size = 'small' }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  return (
    <Badge
      label="Featured"
      icon="star"
      color={COLORS.buttonText}
      backgroundColor={COLORS.warning}
      size={size}
    />
  );
}

export function DraftBadge({ size = 'small' }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  return (
    <Badge
      label="Draft"
      color={COLORS.textSecondary}
      backgroundColor={COLORS.surfaceVariant}
      size={size}
    />
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    gap: 4,
  },
  outline: {
    borderWidth: 1,
  },
  icon: {
    marginRight: 2,
  },
  label: {
    fontWeight: '600',
  },
});

export default Badge;
