import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  Animated,
  Easing,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import { useThemeColors } from '../context/ThemeContext';
import slideshowImages from '../../slideshow';

const BIGNAY_LOGO = require('../../slideshow/BIGNAY LOGO.png');

// ─── Data ────────────────────────────────────────────────────────────────────

const HERO_SLIDES = [
  { title: 'Discover the Bignay Berry', subtitle: 'A Philippine superfruit powering communities with its incredible versatility — from wine to medicine.' },
  { title: 'AI-Powered Fruit Analysis', subtitle: 'Instantly scan and classify Bignay ripeness using our deep-learning scanner.' },
  { title: 'Empowering Filipino Farmers', subtitle: 'Market insights, price predictions, and a vibrant marketplace — all in one app.' },
];

const FEATURES = [
  {
    icon: 'scan-outline',
    title: 'Smart Scanner',
    description: 'AI-powered image recognition classifies Bignay fruit ripeness and detects leaf diseases in seconds.',
    color: '#4CAF50',
  },
  {
    icon: 'chatbubbles-outline',
    title: 'Bignay AI Assistant',
    description: 'Gemini-powered chatbot answers all your questions about growing, harvesting, and processing Bignay.',
    color: '#2196F3',
  },
  {
    icon: 'storefront-outline',
    title: 'Marketplace',
    description: 'Buy and sell Bignay products — fresh fruit, wine, jam, vinegar, and herbal tea leaves.',
    color: '#FF9800',
  },
  {
    icon: 'trending-up-outline',
    title: 'Price Prediction',
    description: 'Machine learning models forecast market prices so you can sell at the right time.',
    color: '#9C27B0',
  },
  {
    icon: 'map-outline',
    title: 'Harvest Heatmap',
    description: 'Community-driven map showing Bignay harvest locations and seasonal availability across the Philippines.',
    color: '#E91E63',
  },
  {
    icon: 'people-outline',
    title: 'Community Forum',
    description: 'Share knowledge and connect with other Bignay enthusiasts and farmers.',
    color: '#00BCD4',
  },
];

const BIGNAY_FACTS = [
  { icon: 'nutrition-outline', title: 'Rich in Antioxidants', text: 'Bignay is packed with anthocyanins and Vitamin C, making it a powerful antioxidant superfruit.' },
  { icon: 'flask-outline', title: 'Traditional Medicine', text: 'Used for centuries in Philippine folk medicine to treat kidney ailments, hypertension, and digestive issues.' },
  { icon: 'wine-outline', title: 'Versatile Products', text: 'From premium wine and vinegar to jam, jelly, and herbal tea — every part of the Bignay tree is valuable.' },
  { icon: 'leaf-outline', title: 'Leaf Benefits', text: 'Dried Bignay leaves brew into herbal tea that supports cholesterol management and kidney health.' },
];

const RIPENESS_STAGES = [
  { stage: 'Unripe', emoji: '🟢', color: '#4CAF50', description: 'Green berries — ideal for tangy juice, vinegar, and pickling.' },
  { stage: 'Ripe', emoji: '🍇', color: '#7B1FA2', description: 'Deep purple — perfect for eating fresh, jam, and juice.' },
  { stage: 'Overripe', emoji: '🟤', color: '#795548', description: 'Very dark — best for wine and vinegar production.' },
];

const STATS = [
  { value: '1,000+', label: 'Scans Completed' },
  { value: '500+', label: 'Active Users' },
  { value: '95%', label: 'AI Accuracy' },
  { value: '50+', label: 'Products Listed' },
];

const TEAM_MEMBERS = [
  { name: 'Ramo N. Francisco Jr.', image: require('../../assets/Ramon.jpg') },
  { name: 'Aeron Jhon Canta',image: require('../../assets/Aeron.jpg') },
  { name: 'Decibelle Tanora', image: require('../../assets/Decibelle.jpg') },
  { name: 'Ronald Ajusan', image: require('../../assets/Ronald.jpg') },
];

// ─── Animated Section Wrapper ────────────────────────────────────────────────

function AnimatedSection({ children, delay = 0, style }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const [hasAnimated, setHasAnimated] = useState(false);

  const onLayout = useCallback(() => {
    if (hasAnimated) return;
    setHasAnimated(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [hasAnimated, delay, fadeAnim, slideAnim]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={[style, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
    >
      {children}
    </Animated.View>
  );
}

// ─── Floating animated icon ─────────────────────────────────────────────────

function FloatingIcon({ name, size, color, style, duration = 3000 }) {
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -10, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 10, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [floatAnim, duration]);

  return (
    <Animated.View style={[style, { transform: [{ translateY: floatAnim }] }]}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

// ─── Pulsing dot component ──────────────────────────────────────────────────

function PulsingDot({ color, size = 10, style }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <View style={[{ width: size * 2.5, height: size * 2.5, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View style={{
        position: 'absolute',
        width: size * 2.2,
        height: size * 2.2,
        borderRadius: size * 1.1,
        backgroundColor: color + '30',
        transform: [{ scale: pulseAnim }],
      }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Animated Counter ───────────────────────────────────────────────────────

function AnimatedCounter({ value, suffix = '', style }) {
  const numericPart = value.replace(/[^0-9]/g, '');
  const prefix = value.replace(/[0-9,+%]/g, '');
  const numVal = parseInt(numericPart, 10) || 0;
  const hasSuffix = value.includes('+') ? '+' : value.includes('%') ? '%' : '';

  const animValue = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState('0');
  const [started, setStarted] = useState(false);

  const onLayout = useCallback(() => {
    if (started) return;
    setStarted(true);
    Animated.timing(animValue, {
      toValue: numVal,
      duration: 1800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [started, animValue, numVal]);

  useEffect(() => {
    const id = animValue.addListener(({ value: v }) => {
      const rounded = Math.round(v);
      setDisplay(rounded >= 1000 ? rounded.toLocaleString() : String(rounded));
    });
    return () => animValue.removeListener(id);
  }, [animValue]);

  return (
    <Text onLayout={onLayout} style={style}>
      {prefix}{display}{hasSuffix}{suffix}
    </Text>
  );
}

// ─── Interactive Card (scale on press) ──────────────────────────────────────

function InteractiveCard({ children, style, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, friction: 8, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
      style={{ width: style?.width }}
    >
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LandingScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const navigation = useNavigation();
  const { isAuthenticated } = useAuth();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const {
    width: screenWidth,
    isMobile,
    isTablet,
    isDesktop,
    sp,
    fp,
    responsive,
  } = useResponsive();

  const youtubeIframeRef = useRef(null);

  const pauseAndMuteYoutube = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const iframe = youtubeIframeRef.current;
    const targetWindow = iframe?.contentWindow;
    if (!targetWindow) return;

    try {
      targetWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
        '*'
      );
      targetWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'mute', args: [] }),
        '*'
      );
    } catch (error) {
      // no-op: iframe may already be unmounted
    }
  }, []);

  // ── Hero slideshow with cross-fade ──
  const [currentSlide, setCurrentSlide] = useState(0);
  const [nextSlide, setNextSlide] = useState(1);
  const crossFade = useRef(new Animated.Value(1)).current;
  const textFade = useRef(new Animated.Value(1)).current;
  const textSlide = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      const next = (currentSlide + 1) % HERO_SLIDES.length;
      setNextSlide(next);

      // Fade out current text with slide
      Animated.parallel([
        Animated.timing(textFade, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(textSlide, { toValue: -20, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        // Cross-fade images
        Animated.timing(crossFade, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start(() => {
          setCurrentSlide(next);
          crossFade.setValue(1);

          // Ken Burns: subtle zoom
          heroScale.setValue(1);
          Animated.timing(heroScale, { toValue: 1.08, duration: 5000, easing: Easing.linear, useNativeDriver: true }).start();
        });

        // Fade in new text
        textSlide.setValue(20);
        Animated.parallel([
          Animated.timing(textFade, { toValue: 1, duration: 500, delay: 200, useNativeDriver: true }),
          Animated.timing(textSlide, { toValue: 0, duration: 500, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      });
    }, 5500);

    // Initial Ken Burns
    Animated.timing(heroScale, { toValue: 1.08, duration: 5500, easing: Easing.linear, useNativeDriver: true }).start();

    return () => clearInterval(timer);
  }, [currentSlide, crossFade, textFade, textSlide, heroScale]);

  // ── Badge pulse
  const badgePulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.05, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [badgePulse]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        pauseAndMuteYoutube();
      };
    }, [pauseAndMuteYoutube])
  );

  useEffect(() => {
    return () => {
      pauseAndMuteYoutube();
    };
  }, [pauseAndMuteYoutube]);

  // Scroll animations
  const scrollY = useRef(new Animated.Value(0)).current;

  const navigateToApp = () => {
    if (isAuthenticated) {
      navigation.navigate('Main', { screen: 'Forum' });
    } else {
      navigation.navigate('Auth', { screen: 'Login' });
    }
  };

  const navigateToLogin = () => {
    navigation.navigate('Auth', { screen: 'Login' });
  };

  const navigateToRegister = () => {
    navigation.navigate('Auth', { screen: 'Register' });
  };

  const goToMainApp = () => {
    navigation.navigate('Main', { screen: 'Forum' });
  };

  // ─── Hero responsive height ─────────────────────────────────────────────────

  const heroHeight = useMemo(() => {
    if (isMobile) return Math.max(windowHeight * 0.75, 480);
    if (isTablet) return Math.max(windowHeight * 0.7, 520);
    return Math.max(windowHeight * 0.85, 600);
  }, [isMobile, isTablet, windowHeight]);

  // ─── Responsive styles ──────────────────────────────────────────────────────

  const ds = useMemo(() => ({
    sectionPadding: {
      paddingHorizontal: responsive({ mobile: 20, tablet: 40, desktop: 80 }),
      paddingVertical: responsive({ mobile: 40, tablet: 60, desktop: 80 }),
    },
    headingSize: responsive({ mobile: 28, tablet: 36, desktop: 48 }),
    subheadingSize: responsive({ mobile: 20, tablet: 24, desktop: 32 }),
    bodySize: responsive({ mobile: 14, tablet: 15, desktop: 16 }),
    featuresGrid: {
      flexDirection: isMobile ? 'column' : 'row',
      flexWrap: 'wrap',
    },
    featureCard: {
      width: isMobile ? '100%' : isTablet ? '48%' : '31%',
    },
    statsGrid: {
      flexDirection: isMobile ? 'column' : 'row',
    },
    teamGrid: {
      flexDirection: isMobile ? 'column' : 'row',
      flexWrap: 'wrap',
    },
    teamCard: {
      width: isMobile ? '100%' : isTablet ? '48%' : '23%',
    },
    maxWidth: {
      maxWidth: 1200,
      width: '100%',
      alignSelf: 'center',
    },
  }), [isMobile, isTablet, isDesktop, responsive]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: false }
      )}
      scrollEventThrottle={16}
    >
      {/* ════════════ NAV BAR ════════════ */}
      <View style={[styles.navbar, { paddingHorizontal: responsive({ mobile: 16, tablet: 32, desktop: 60 }) }]}>
        <TouchableOpacity style={styles.navBrand} activeOpacity={0.8}>
          <Image source={BIGNAY_LOGO} style={styles.navLogo} resizeMode="contain" />
          <Text style={[styles.navTitle, { fontSize: responsive({ mobile: 18, tablet: 20, desktop: 22 }) }]}>
            Bignay Scanner
          </Text>
        </TouchableOpacity>
        <View style={styles.navActions}>
          {!isMobile && (
            <TouchableOpacity onPress={goToMainApp} style={styles.navLink}>
              <Text style={styles.navLinkText}>Explore</Text>
            </TouchableOpacity>
          )}
          {isAuthenticated ? (
            <TouchableOpacity style={styles.navBtnPrimary} onPress={goToMainApp}>
              <Ionicons name="apps-outline" size={18} color="#fff" />
              <Text style={styles.navBtnText}>Open App</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.navBtnOutline} onPress={navigateToLogin}>
                <Text style={[styles.navBtnOutlineText, { color: COLORS.primary }]}>Login</Text>
              </TouchableOpacity>
              {!isMobile && (
                <TouchableOpacity style={styles.navBtnPrimary} onPress={navigateToRegister}>
                  <Text style={styles.navBtnText}>Get Started</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>

      {/* ════════════ HERO SECTION ════════════ */}
      <View style={[styles.heroSection, { height: heroHeight }]}>
        {/* Next image (underneath) */}
        <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ scale: 1.02 }] }]}>
          <Image
            source={slideshowImages[nextSlide % slideshowImages.length]}
            style={styles.heroImage}
            resizeMode="cover"
          />
        </Animated.View>
        {/* Current image (on top, fades out) */}
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: crossFade, transform: [{ scale: heroScale }] }]}>
          <Image
            source={slideshowImages[currentSlide % slideshowImages.length]}
            style={styles.heroImage}
            resizeMode="cover"
          />
        </Animated.View>
        <View style={styles.heroOverlay} />

        {/* Floating decorative elements */}
        {!isMobile && (
          <>
            <FloatingIcon name="leaf" size={24} color="rgba(255,255,255,0.15)" style={{ position: 'absolute', top: '15%', right: '10%' }} duration={3500} />
            <FloatingIcon name="nutrition" size={20} color="rgba(255,255,255,0.12)" style={{ position: 'absolute', top: '60%', right: '15%' }} duration={4000} />
            <FloatingIcon name="sparkles" size={18} color="rgba(255,255,255,0.1)" style={{ position: 'absolute', bottom: '25%', right: '25%' }} duration={2800} />
          </>
        )}

        <View style={[styles.heroContentWrap, { paddingHorizontal: responsive({ mobile: 24, tablet: 48, desktop: 80 }) }]}>
          <View style={[styles.heroContentInner, ds.maxWidth]}>
            <Animated.View style={[styles.heroBadge, { transform: [{ scale: badgePulse }] }]}>
              <PulsingDot color="#4CAF50" size={8} />
              <Text style={styles.heroBadgeText}>AI-Powered Agriculture</Text>
            </Animated.View>

            <Animated.Text
              style={[
                styles.heroTitle,
                {
                  fontSize: ds.headingSize,
                  lineHeight: ds.headingSize * 1.25,
                  opacity: textFade,
                  transform: [{ translateY: textSlide }],
                },
              ]}
            >
              {HERO_SLIDES[currentSlide].title}
            </Animated.Text>
            <Animated.Text
              style={[
                styles.heroSubtitle,
                {
                  fontSize: ds.bodySize + 2,
                  maxWidth: isDesktop ? 600 : '100%',
                  opacity: textFade,
                  transform: [{ translateY: textSlide }],
                },
              ]}
            >
              {HERO_SLIDES[currentSlide].subtitle}
            </Animated.Text>

            <View style={styles.heroBtns}>
              <TouchableOpacity style={styles.heroBtnPrimary} onPress={navigateToApp} activeOpacity={0.85}>
                <Ionicons name="rocket-outline" size={20} color="#fff" />
                <Text style={styles.heroBtnPrimaryText}>
                  {isAuthenticated ? 'Open Dashboard' : 'Get Started Free'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroBtnSecondary} onPress={goToMainApp} activeOpacity={0.85}>
                <Ionicons name="compass-outline" size={20} color="#fff" />
                <Text style={styles.heroBtnSecondaryText}>Explore App</Text>
              </TouchableOpacity>
            </View>

            {/* Slide dots */}
            <View style={styles.slideDots}>
              {HERO_SLIDES.map((_, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.slideDot,
                    currentSlide === i && styles.slideDotActive,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* ════════════ STATS BAR ════════════ */}
      <AnimatedSection style={[styles.statsBar, ds.sectionPadding, { paddingVertical: responsive({ mobile: 28, tablet: 36, desktop: 44 }) }]}>
        <View style={[ds.maxWidth, ds.statsGrid, styles.statsGrid]}>
          {STATS.map((stat, i) => (
            <View key={i} style={styles.statItem}>
              <AnimatedCounter
                value={stat.value}
                style={[styles.statValue, { fontSize: responsive({ mobile: 26, tablet: 30, desktop: 36 }) }]}
              />
              <Text style={[styles.statLabel, { fontSize: ds.bodySize - 1 }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </AnimatedSection>

      {/* ════════════ BIGNAY VIDEO ════════════ */}
      <View style={[styles.section, ds.sectionPadding, { backgroundColor: COLORS.surface }]}>
        <View style={ds.maxWidth}>
          <AnimatedSection style={styles.sectionHeader}>
            <Text style={styles.sectionTag}>WATCH & LEARN</Text>
            <Text style={[styles.sectionTitle, { fontSize: ds.subheadingSize }]}>
              Discover Bignay
            </Text>
            <Text style={[styles.sectionSubtitle, { fontSize: ds.bodySize }]}>
              Learn more about the amazing Bignay berry — its uses, benefits, and how it empowers Filipino communities.
            </Text>
          </AnimatedSection>
          <AnimatedSection delay={100}>
            <View style={[styles.videoContainer, { height: responsive({ mobile: 220, tablet: 360, desktop: 480 }) }]}>
              {Platform.OS === 'web' ? (
                <iframe
                  ref={youtubeIframeRef}
                  width="100%"
                  height="100%"
                  src="https://www.youtube.com/embed/FegDCgHHfXo?autoplay=1&mute=1&loop=1&playlist=FegDCgHHfXo&enablejsapi=1"
                  title="Discover Bignay"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ borderRadius: 16 }}
                />
              ) : (
                <TouchableOpacity
                  style={styles.videoFallback}
                  onPress={() => {
                    const { Linking } = require('react-native');
                    Linking.openURL('https://www.youtube.com/watch?v=FegDCgHHfXo');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.videoPlayCircle}>
                    <Ionicons name="play" size={40} color="#fff" />
                  </View>
                  <Text style={styles.videoFallbackText}>Tap to Watch on YouTube</Text>
                </TouchableOpacity>
              )}
            </View>
          </AnimatedSection>
        </View>
      </View>

      {/* ════════════ ABOUT BIGNAY ════════════ */}
      <View style={[styles.section, ds.sectionPadding, { backgroundColor: COLORS.background }]}>
        <View style={ds.maxWidth}>
          <AnimatedSection style={styles.sectionHeader}>
            <Text style={styles.sectionTag}>ABOUT BIGNAY</Text>
            <Text style={[styles.sectionTitle, { fontSize: ds.subheadingSize }]}>
              The Philippine Superfruit
            </Text>
            <Text style={[styles.sectionSubtitle, { fontSize: ds.bodySize }]}>
              Antidesma bunius, commonly known as Bignay, is a tropical fruit tree native to Southeast Asia. 
              Its berries are prized for their rich nutritional value and remarkable versatility.
            </Text>
          </AnimatedSection>

          <View style={[styles.factsGrid, { flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap' }]}>
            {BIGNAY_FACTS.map((fact, i) => (
              <AnimatedSection key={i} delay={i * 120} style={[styles.factCard, { width: isMobile ? '100%' : isTablet ? '48%' : '23%' }]}>
                <InteractiveCard style={styles.factCardInner}>
                  <View style={[styles.factIconWrap, { backgroundColor: COLORS.primaryBg || COLORS.primaryLight + '20' }]}>
                    <Ionicons name={fact.icon} size={28} color={COLORS.primary} />
                  </View>
                  <Text style={[styles.factTitle, { fontSize: ds.bodySize + 1 }]}>{fact.title}</Text>
                  <Text style={[styles.factText, { fontSize: ds.bodySize - 1 }]}>{fact.text}</Text>
                </InteractiveCard>
              </AnimatedSection>
            ))}
          </View>
        </View>
      </View>

      {/* ════════════ RIPENESS STAGES ════════════ */}
      <View style={[styles.section, ds.sectionPadding, { backgroundColor: COLORS.surface }]}>
        <View style={ds.maxWidth}>
          <AnimatedSection style={styles.sectionHeader}>
            <Text style={styles.sectionTag}>RIPENESS STAGES</Text>
            <Text style={[styles.sectionTitle, { fontSize: ds.subheadingSize }]}>
              From Green to Wine-Ready
            </Text>
            <Text style={[styles.sectionSubtitle, { fontSize: ds.bodySize }]}>
              Understanding ripeness is key to maximizing the value of every Bignay harvest.
            </Text>
          </AnimatedSection>
          <View style={[styles.ripenessRow, { flexDirection: isMobile ? 'column' : 'row' }]}>
            {RIPENESS_STAGES.map((s, i) => (
              <AnimatedSection key={i} delay={i * 150} style={{ flex: isMobile ? undefined : 1 }}>
                <InteractiveCard style={styles.ripenessCard}>
                  <View style={[styles.ripenessEmojiWrap, { backgroundColor: s.color + '18' }]}>
                    <Text style={styles.ripenessEmoji}>{s.emoji}</Text>
                  </View>
                  <Text style={[styles.ripenessStage, { color: s.color, fontSize: ds.bodySize + 2 }]}>{s.stage}</Text>
                  <Text style={[styles.ripenessDesc, { fontSize: ds.bodySize - 1 }]}>{s.description}</Text>
                </InteractiveCard>
                {i < RIPENESS_STAGES.length - 1 && !isMobile && (
                  <View style={styles.ripenessArrowWrap}>
                    <Ionicons name="arrow-forward" size={22} color={COLORS.primary + '60'} />
                  </View>
                )}
              </AnimatedSection>
            ))}
          </View>
        </View>
      </View>

      {/* ════════════ FEATURES ════════════ */}
      <View style={[styles.section, ds.sectionPadding, { backgroundColor: COLORS.background }]}>
        <View style={ds.maxWidth}>
          <AnimatedSection style={styles.sectionHeader}>
            <Text style={styles.sectionTag}>FEATURES</Text>
            <Text style={[styles.sectionTitle, { fontSize: ds.subheadingSize }]}>
              Everything You Need
            </Text>
            <Text style={[styles.sectionSubtitle, { fontSize: ds.bodySize }]}>
              Powerful tools designed for Bignay farmers, researchers, and enthusiasts.
            </Text>
          </AnimatedSection>

          <View style={[styles.featuresGrid, ds.featuresGrid]}>
            {FEATURES.map((f, i) => (
              <AnimatedSection key={i} delay={i * 100} style={ds.featureCard}>
                <InteractiveCard style={styles.featureCard}>
                  <View style={[styles.featureIconCircle, { backgroundColor: f.color + '15' }]}>
                    <Ionicons name={f.icon} size={28} color={f.color} />
                  </View>
                  <Text style={[styles.featureTitle, { fontSize: ds.bodySize + 1 }]}>{f.title}</Text>
                  <Text style={[styles.featureDesc, { fontSize: ds.bodySize - 1 }]}>{f.description}</Text>
                </InteractiveCard>
              </AnimatedSection>
            ))}
          </View>
        </View>
      </View>

      {/* ════════════ HOW IT WORKS ════════════ */}
      <View style={[styles.section, ds.sectionPadding, { backgroundColor: COLORS.surface }]}>
        <View style={ds.maxWidth}>
          <AnimatedSection style={styles.sectionHeader}>
            <Text style={styles.sectionTag}>HOW IT WORKS</Text>
            <Text style={[styles.sectionTitle, { fontSize: ds.subheadingSize }]}>
              Scan in 3 Simple Steps
            </Text>
          </AnimatedSection>
          <View style={[styles.stepsRow, { flexDirection: isMobile ? 'column' : 'row' }]}>
            {[
              { step: '1', icon: 'camera-outline', title: 'Capture or Upload', desc: 'Take a photo of your Bignay fruit or leaf, or upload from gallery.' },
              { step: '2', icon: 'analytics-outline', title: 'AI Analysis', desc: 'Our deep-learning model analyzes the image and classifies ripeness or health.' },
              { step: '3', icon: 'checkmark-done-outline', title: 'Get Results', desc: 'Receive detailed results with recommendations for best use — instantly.' },
            ].map((item, i) => (
              <AnimatedSection key={i} delay={i * 200} style={{ flex: isMobile ? undefined : 1 }}>
                <InteractiveCard style={styles.stepCard}>
                  <View style={styles.stepNumberWrap}>
                    <Text style={styles.stepNumber}>{item.step}</Text>
                  </View>
                  <View style={[styles.stepIconWrap, { backgroundColor: COLORS.primaryBg || COLORS.primaryLight + '20' }]}>
                    <Ionicons name={item.icon} size={32} color={COLORS.primary} />
                  </View>
                  <Text style={[styles.stepTitle, { fontSize: ds.bodySize + 1 }]}>{item.title}</Text>
                  <Text style={[styles.stepDesc, { fontSize: ds.bodySize - 1 }]}>{item.desc}</Text>
                </InteractiveCard>
              </AnimatedSection>
            ))}
          </View>
          {/* Connecting line for desktop */}
          {!isMobile && (
            <View style={styles.stepsConnector}>
              <View style={[styles.connectorLine, { backgroundColor: COLORS.primary + '25' }]} />
            </View>
          )}
        </View>
      </View>

      {/* ════════════ TEAM ════════════ */}
      <View style={[styles.section, ds.sectionPadding, { backgroundColor: COLORS.background }]}>
        <View style={ds.maxWidth}>
          <AnimatedSection style={styles.sectionHeader}>
            <Text style={styles.sectionTag}>OUR TEAM</Text>
            <Text style={[styles.sectionTitle, { fontSize: ds.subheadingSize }]}>
              Meet the Developers
            </Text>
            <Text style={[styles.sectionSubtitle, { fontSize: ds.bodySize }]}>
              A passionate team dedicated to empowering Filipino agriculture through technology.
            </Text>
          </AnimatedSection>
          <View style={[styles.teamGrid, ds.teamGrid]}>
            {TEAM_MEMBERS.map((m, i) => (
              <AnimatedSection key={i} delay={i * 150} style={ds.teamCard}>
                <InteractiveCard style={styles.teamCard}>
                  <View style={styles.teamAvatarWrap}>
                    <Image source={m.image} style={styles.teamAvatar} resizeMode="cover" />
                  </View>
                  <Text style={[styles.teamName, { fontSize: ds.bodySize + 1 }]}>{m.name}</Text>
                  <Text style={[styles.teamRole, { fontSize: ds.bodySize - 1 }]}>{m.role}</Text>
                </InteractiveCard>
              </AnimatedSection>
            ))}
          </View>
        </View>
      </View>

      {/* ════════════ CTA ════════════ */}
      <AnimatedSection style={[styles.ctaSection, ds.sectionPadding]}>
        <View style={ds.maxWidth}>
          <FloatingIcon name="sparkles" size={32} color="rgba(255,255,255,0.3)" style={{ alignSelf: 'center', marginBottom: 16 }} duration={2500} />
          <Text style={[styles.ctaTitle, { fontSize: ds.subheadingSize }]}>
            Ready to Discover Bignay?
          </Text>
          <Text style={[styles.ctaSubtitle, { fontSize: ds.bodySize + 1 }]}>
            Join our growing community of farmers, researchers, and Bignay enthusiasts.
          </Text>
          <View style={styles.ctaBtns}>
            {isAuthenticated ? (
              <TouchableOpacity style={styles.ctaBtnPrimary} onPress={goToMainApp} activeOpacity={0.85}>
                <Ionicons name="apps-outline" size={20} color={COLORS.primary} />
                <Text style={styles.ctaBtnPrimaryText}>Go to Dashboard</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.ctaBtnPrimary} onPress={navigateToRegister} activeOpacity={0.85}>
                  <Ionicons name="person-add-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.ctaBtnPrimaryText}>Create Free Account</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ctaBtnLight} onPress={navigateToLogin} activeOpacity={0.7}>
                  <Text style={styles.ctaBtnLightText}>Already have an account? Login</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </AnimatedSection>

      {/* ════════════ FOOTER ════════════ */}
      <View style={[styles.footer, { paddingHorizontal: responsive({ mobile: 20, tablet: 40, desktop: 80 }) }]}>
        <View style={[ds.maxWidth, styles.footerContent, { flexDirection: isMobile ? 'column' : 'row' }]}>
          <View style={styles.footerBrand}>
            <Image source={BIGNAY_LOGO} style={styles.footerLogo} resizeMode="contain" />
            <View>
              <Text style={styles.footerBrandName}>Bignay Scanner</Text>
              <Text style={styles.footerTagline}>Smart Fruit Analysis & Marketplace</Text>
            </View>
          </View>
          <Text style={styles.footerCopy}>
            © {new Date().getFullYear()} Bignay Project. All rights reserved.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Navbar ──
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    ...(Platform.OS === 'web' ? { position: 'sticky', top: 0, zIndex: 100 } : {}),
  },
  navBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  navTitle: {
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navLink: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  navLinkText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  navBtnOutline: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  navBtnOutlineText: {
    fontWeight: '600',
    fontSize: 14,
  },
  navBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  navBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // ── Hero ──
  heroSection: {
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' ? { objectFit: 'cover' } : {}),
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 50, 15, 0.68)',
    zIndex: 1,
  },
  heroContentWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    justifyContent: 'center',
  },
  heroContentInner: {
    paddingVertical: 40,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroTitle: {
    color: '#fff',
    fontWeight: '900',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 28,
    marginBottom: 36,
  },
  heroBtns: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
    marginBottom: 28,
  },
  heroBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 30,
    borderRadius: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  heroBtnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  heroBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    paddingVertical: 16,
    paddingHorizontal: 30,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroBtnSecondaryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  slideDots: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  slideDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  slideDotActive: {
    backgroundColor: '#fff',
    width: 32,
    borderRadius: 4,
  },

  // ── Stats Bar ──
  statsBar: {
    backgroundColor: COLORS.primary,
  },
  statsGrid: {
    justifyContent: 'space-around',
    gap: 24,
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  statValue: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.78)',
    marginTop: 4,
    fontWeight: '500',
  },

  // ── Section generic ──
  section: {},
  sectionHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  sectionTag: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  sectionSubtitle: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 640,
  },

  // ── Facts ──
  factsGrid: {
    gap: 16,
    justifyContent: 'space-between',
  },
  factCard: {
    marginBottom: 16,
  },
  factCardInner: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.divider,
    ...(Platform.OS === 'web' ? { transition: 'box-shadow 0.3s ease, transform 0.2s ease' } : {}),
  },
  factIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  factTitle: {
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  factText: {
    color: COLORS.textSecondary,
    lineHeight: 22,
  },

  // ── Ripeness ──
  ripenessRow: {
    gap: 20,
    alignItems: 'stretch',
  },
  ripenessCard: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.divider,
    position: 'relative',
  },
  ripenessEmojiWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  ripenessEmoji: {
    fontSize: 36,
  },
  ripenessStage: {
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  ripenessDesc: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  ripenessArrowWrap: {
    position: 'absolute',
    right: -14,
    top: '45%',
    zIndex: 5,
    backgroundColor: COLORS.surface,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.divider,
  },

  // ── Features ──
  featuresGrid: {
    gap: 16,
  },
  featureCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  featureIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureTitle: {
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  featureDesc: {
    color: COLORS.textSecondary,
    lineHeight: 22,
  },

  // ── Steps ──
  stepsRow: {
    gap: 24,
    position: 'relative',
    zIndex: 1,
  },
  stepCard: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  stepNumberWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 3,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  stepNumber: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },
  stepIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepTitle: {
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  stepDesc: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  stepsConnector: {
    position: 'absolute',
    top: '50%',
    left: '15%',
    right: '15%',
    height: 2,
    zIndex: 0,
  },
  connectorLine: {
    height: 2,
    width: '100%',
    borderRadius: 1,
  },

  // ── Team ──
  teamGrid: {
    gap: 20,
    justifyContent: 'center',
  },
  teamCard: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.divider,
    marginBottom: 16,
  },
  teamAvatarWrap: {
    marginBottom: 14,
    borderRadius: 44,
    padding: 3,
    borderWidth: 3,
    borderColor: COLORS.primary + '35',
  },
  teamAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  teamName: {
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  teamRole: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 13,
  },

  // ── CTA ──
  ctaSection: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  ctaTitle: {
    color: '#fff',
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
  },
  ctaSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  ctaBtns: {
    alignItems: 'center',
    gap: 14,
  },
  ctaBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  ctaBtnPrimaryText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  ctaBtnLight: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  ctaBtnLightText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    fontSize: 14,
  },

  // ── Footer ──
  footer: {
    backgroundColor: COLORS.primaryDark || '#1B5E20',
    paddingVertical: 24,
  },
  footerContent: {
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  footerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  footerBrandName: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  footerTagline: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
  },
  footerCopy: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
  },
  videoContainer: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  videoFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1B5E20',
    borderRadius: 16,
  },
  videoPlayCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  videoFallbackText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
