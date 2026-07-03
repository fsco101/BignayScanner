// Floating Chat Widget Component
// A persistent animated FAB with an inline floating chat window

import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import {
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useResponsive } from '../hooks/useResponsive';
import { useAuth } from '../context/AuthContext';
import { useThemeColors } from '../context/ThemeContext';
import { ChatContent } from '../screens/Chatbot/ChatbotScreen';

export default function FloatingChatWidget() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { isAuthenticated } = useAuth();
  const [showChat, setShowChat] = useState(false);

  // Animations
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const breatheAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const chatSlideAnim = useRef(new Animated.Value(0)).current;

  // Draggable FAB position
  const fabPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const fabPosition = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  const {
    width: screenWidth,
    height: screenHeight,
    isDesktop,
    isMobile,
    sp,
    responsive,
  } = useResponsive();

  const dynamicStyles = useMemo(() => ({
    fabSize: responsive({ mobile: sp(58), tablet: sp(62), desktop: sp(66) }),
  }), [sp, responsive]);

  // Chat window dimensions
  const chatWidth = isMobile ? screenWidth - 24 : responsive({ mobile: 340, tablet: 380, desktop: 400 });
  const chatHeight = isMobile
    ? screenHeight * 0.65
    : responsive({ mobile: 450, tablet: 500, desktop: 550 });

  // Build PanResponder for draggable FAB
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !showChat,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !showChat && (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4),
      onPanResponderGrant: () => {
        isDragging.current = false;
        fabPan.setOffset({
          x: fabPosition.current.x,
          y: fabPosition.current.y,
        });
        fabPan.setValue({ x: 0, y: 0 });
        // Press-in scale
        Animated.spring(scaleAnim, {
          toValue: 0.9,
          useNativeDriver: false,
          speed: 50,
          bounciness: 4,
        }).start();
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4) {
          isDragging.current = true;
        }
        fabPan.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
      onPanResponderRelease: (_, gestureState) => {
        fabPan.flattenOffset();
        fabPosition.current = {
          x: fabPosition.current.x + gestureState.dx,
          y: fabPosition.current.y + gestureState.dy,
        };
        fabPan.setValue({ x: fabPosition.current.x, y: fabPosition.current.y });

        // Release scale
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: false,
          speed: 14,
          bounciness: 8,
        }).start();

        // Only navigate if it was a tap (not a drag)
        if (!isDragging.current) {
          handleTap();
        }
        isDragging.current = false;
      },
    })
  ).current;

  // Idle breathing animation
  useEffect(() => {
    if (!isAuthenticated || showChat) return;
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(breatheAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    );
    breathing.start();
    return () => breathing.stop();
  }, [breatheAnim, isAuthenticated, showChat]);

  // Subtle glow pulse
  useEffect(() => {
    if (!isAuthenticated || showChat) return;
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 3000,
          easing: (t) => 0.5 * (1 - Math.cos(Math.PI * t)),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 3000,
          easing: (t) => 0.5 * (1 - Math.cos(Math.PI * t)),
          useNativeDriver: false,
        }),
      ])
    );
    glow.start();
    return () => glow.stop();
  }, [glowAnim, isAuthenticated, showChat]);

  // Occasional bounce to attract attention
  useEffect(() => {
    if (!isAuthenticated || showChat) return;
    let cancelled = false;
    const startBounce = () => {
      if (cancelled) return;
      Animated.sequence([
        Animated.delay(8000 + Math.random() * 6000),
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: -8, duration: 150, useNativeDriver: false }),
          Animated.spring(bounceAnim, { toValue: 0, useNativeDriver: false, speed: 12, bounciness: 14 }),
        ]),
      ]).start(() => { if (!cancelled) startBounce(); });
    };
    startBounce();
    return () => { cancelled = true; bounceAnim.stopAnimation(); };
  }, [bounceAnim, isAuthenticated, showChat]);

  // Animate chat window open/close
  useEffect(() => {
    Animated.spring(chatSlideAnim, {
      toValue: showChat ? 1 : 0,
      useNativeDriver: false,
      speed: 16,
      bounciness: 6,
    }).start();
  }, [showChat, chatSlideAnim]);

  const handleTap = useCallback(() => {
    // Pop animation on tap
    Animated.sequence([
      Animated.timing(rotateAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.timing(rotateAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();

    // Toggle chat window
    setShowChat(prev => !prev);
  }, [rotateAnim]);

  const handleClose = useCallback(() => {
    setShowChat(false);
  }, []);

  if (!isAuthenticated) {
    return null;
  }

  const breatheScale = breatheAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const rotateInterp = rotateAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '15deg', '0deg'],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  const chatScale = chatSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  const chatOpacity = chatSlideAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.8, 1],
  });

  const chatTranslateY = chatSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });

  const fabBase = {
    right: isDesktop ? 24 : 16,
    bottom: isDesktop ? 24 : 20,
  };

  return (
    <>
      {/* Floating Chat Window */}
      {showChat && (
        <Animated.View
          style={[
            styles.chatWindow,
            {
              right: isMobile ? 12 : fabBase.right,
              bottom: fabBase.bottom + dynamicStyles.fabSize + 12,
              width: chatWidth,
              height: chatHeight,
              opacity: chatOpacity,
              transform: [
                { scale: chatScale },
                { translateY: chatTranslateY },
              ],
            },
          ]}
        >
          <ChatContent isModal onClose={handleClose} />
        </Animated.View>
      )}

      {/* Glow ring behind FAB */}
      {!showChat && (
        <Animated.View
          style={[
            styles.glowRing,
            {
              right: fabBase.right - 6,
              bottom: fabBase.bottom - 6,
              width: dynamicStyles.fabSize + 12,
              height: dynamicStyles.fabSize + 12,
              borderRadius: (dynamicStyles.fabSize + 12) / 2,
              opacity: glowOpacity,
              transform: [
                { translateX: fabPan.x },
                { translateY: fabPan.y },
                { scale: breatheScale },
              ],
            },
          ]}
          pointerEvents="none"
        />
      )}

      {/* Floating Action Button */}
      <Animated.View
        style={[
          styles.fab,
          {
            right: fabBase.right,
            bottom: fabBase.bottom,
            width: dynamicStyles.fabSize,
            height: dynamicStyles.fabSize,
            borderRadius: dynamicStyles.fabSize / 2,
            backgroundColor: showChat ? COLORS.danger : COLORS.primary,
            transform: showChat
              ? [{ scale: scaleAnim }]
              : [
                  { translateX: fabPan.x },
                  { translateY: fabPan.y },
                  { scale: Animated.multiply(scaleAnim, breatheScale) },
                  { translateY: bounceAnim },
                  { rotate: rotateInterp },
                ],
          },
        ]}
        {...(showChat ? {} : panResponder.panHandlers)}
      >
        {showChat ? (
          <TouchableOpacity
            onPress={handleClose}
            style={styles.fabTouchable}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={28} color={COLORS.textOnPrimary} />
          </TouchableOpacity>
        ) : (
          <>
            <Ionicons name="chatbubble-ellipses" size={28} color={COLORS.textOnPrimary} />
            <Animated.View
              style={[
                styles.sparkleDot,
                {
                  opacity: glowAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                },
              ]}
            />
          </>
        )}
      </Animated.View>
    </>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  fab: {
    position: 'absolute',
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    zIndex: 1000,
  },
  fabTouchable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowRing: {
    position: 'absolute',
    backgroundColor: COLORS.primary,
    zIndex: 999,
  },
  sparkleDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFD700',
  },
  chatWindow: {
    position: 'absolute',
    backgroundColor: COLORS.background,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    zIndex: 1001,
    borderWidth: 1,
    borderColor: COLORS.border || COLORS.divider,
  },
});
