// Mobile-specific Button component
// Styled touchable button for mobile apps

import React, { useRef, useCallback, useMemo } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  Animated,
} from 'react-native';
import { Icon } from './Icon';

import { useThemeColors } from '../../context/ThemeContext';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

/**
 * Platform-specific Button component for mobile
 * 
 * Note: When creating a web version, create a web/Button.js that uses
 * HTML button elements with appropriate styling
 */
export function Button({
  title,
  onPress,
  variant = 'primary', // primary, secondary, outline, danger, ghost
  size = 'medium', // small, medium, large
  icon,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
}) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
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
  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return {
          container: styles.secondaryContainer,
          text: styles.secondaryText,
        };
      case 'outline':
        return {
          container: styles.outlineContainer,
          text: styles.outlineText,
        };
      case 'danger':
        return {
          container: styles.dangerContainer,
          text: styles.dangerText,
        };
      case 'ghost':
        return {
          container: styles.ghostContainer,
          text: styles.ghostText,
        };
      case 'primary':
      default:
        return {
          container: styles.primaryContainer,
          text: styles.primaryText,
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          container: styles.smallContainer,
          text: styles.smallText,
          iconSize: 16,
        };
      case 'large':
        return {
          container: styles.largeContainer,
          text: styles.largeText,
          iconSize: 24,
        };
      case 'medium':
      default:
        return {
          container: styles.mediumContainer,
          text: styles.mediumText,
          iconSize: 20,
        };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  const iconColor = variant === 'outline' || variant === 'ghost'
    ? COLORS.primary
    : variant === 'danger'
    ? COLORS.textOnPrimary
    : COLORS.textOnPrimary;

  return (
    <AnimatedTouchable
      style={[
        styles.container,
        variantStyles.container,
        sizeStyles.container,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        { transform: [{ scale: scaleAnim }] },
        style,
      ]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'ghost' ? COLORS.primary : COLORS.textOnPrimary}
        />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === 'left' && (
            <Icon name={icon} size={sizeStyles.iconSize} color={iconColor} style={styles.iconLeft} />
          )}
          <Text style={[styles.text, variantStyles.text, sizeStyles.text, textStyle]}>
            {title}
          </Text>
          {icon && iconPosition === 'right' && (
            <Icon name={icon} size={sizeStyles.iconSize} color={iconColor} style={styles.iconRight} />
          )}
        </View>
      )}
    </AnimatedTouchable>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '600',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },

  // Variants
  primaryContainer: {
    backgroundColor: COLORS.primary,
  },
  primaryText: {
    color: COLORS.textOnPrimary,
  },
  secondaryContainer: {
    backgroundColor: COLORS.surfaceVariant,
  },
  secondaryText: {
    color: COLORS.text,
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  outlineText: {
    color: COLORS.primary,
  },
  dangerContainer: {
    backgroundColor: COLORS.danger,
  },
  dangerText: {
    color: COLORS.textOnPrimary,
  },
  ghostContainer: {
    backgroundColor: 'transparent',
  },
  ghostText: {
    color: COLORS.primary,
  },

  // Sizes
  smallContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  smallText: {
    fontSize: 12,
  },
  mediumContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  mediumText: {
    fontSize: 14,
  },
  largeContainer: {
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  largeText: {
    fontSize: 16,
  },
});

export default Button;
