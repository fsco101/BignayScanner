import 'react-native-gesture-handler';
import React, { useEffect, useState, useMemo, createContext, useContext } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './src/services/NavigationService';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Image, ActivityIndicator, ScrollView, useWindowDimensions, Animated, BackHandler, Alert } from 'react-native';

// API initialization
import { initializeApi, API_CONFIG } from './src/config/api';
import { checkAndApplyOtaUpdate, checkBackendCompatibility } from './src/services/AppUpdateService';

// Context Providers
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CartProvider, useCart } from './src/context/CartContext';
import { NotificationProvider, useNotifications } from './src/context/NotificationContext';
import { ThemeProvider, useThemeColors, useTheme } from './src/context/ThemeContext';

// Components
import FloatingChatWidget from './src/components/FloatingChatWidget';
import Footer from './src/components/Footer';

// Hooks
import { useNotificationPermission } from './src/hooks/useNotificationPermission';

// Logo
const BIGNAY_LOGO = require('./slideshow/BIGNAY LOGO.png');

// Import screens directly
import ScannerScreen from './src/screens/Scanner/ScannerScreen';
import ChatbotScreen from './src/screens/Chatbot/ChatbotScreen';
import MarketplaceScreen from './src/screens/Marketplace/MarketplaceScreen';
import HeatMapScreen from './src/screens/HeatMap/HeatMapScreen';
import PricePredictionScreen from './src/screens/PricePrediction/PricePredictionScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/Auth/LoginScreen';
import RegisterScreen from './src/screens/Auth/RegisterScreen';
import ForgotPasswordScreen from './src/screens/Auth/ForgotPasswordScreen';
import TermsAndConditionsScreen from './src/screens/Auth/TermsAndConditionsScreen';
import ProfileScreen from './src/screens/Profile/ProfileScreen';
import UserSalesTracking from './src/screens/Marketplace/user/UserSalesTracking';
import UserOrderManagement from './src/screens/Marketplace/user/UserOrderManagement';
import RelatedStudiesScreen from './src/screens/Forum/RelatedStudiesScreen';
import LandingScreen from './src/screens/LandingScreen';
// Payment screens removed — payments are handled inline in CartModal with SweetAlert

const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator();

// Sidebar Context for toggling drawer on web
const SidebarContext = createContext();
export const useSidebar = () => useContext(SidebarContext);

function SidebarProvider({ children }) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  
  const toggleSidebar = () => setIsSidebarExpanded(prev => !prev);
  const showSidebar = () => setIsSidebarExpanded(true);
  const hideSidebar = () => setIsSidebarExpanded(false);

  return (
    <SidebarContext.Provider value={{ 
      isSidebarVisible: true, 
      isSidebarExpanded, 
      toggleSidebar, 
      showSidebar, 
      hideSidebar 
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

// COLORS is now provided by ThemeContext (useThemeColors hook)

// Import Admin Screens
import ProductManagement from './src/screens/Marketplace/admin/ProductManagement';
import OrderManagement from './src/screens/Marketplace/admin/OrderManagement';
import UserManagement from './src/screens/Marketplace/admin/UserManagement';
import SweetAlert, { useSweetAlert } from './src/components/SweetAlert';
import AdminSalesTracking from './src/screens/Marketplace/admin/AdminSalesTracking';
import ProductDetailScreen from './src/screens/Marketplace/ProductDetailScreen';

// Import Forum Screens
import ForumHomeScreen from './src/screens/Forum/ForumHomeScreen';
import ForumPostDetailScreen from './src/screens/Forum/ForumPostDetailScreen';
import ForumAllPostsScreen from './src/screens/Forum/ForumAllPostsScreen';
import ForumManagement from './src/screens/Forum/admin/ForumManagement';
import HeatMapManagement from './src/screens/HeatMap/admin/HeatMapManagement';
import ManageStudiesScreen from './src/screens/Forum/admin/ManageStudiesScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';

// Custom Drawer Content Component
function CustomDrawerContent(props) {
  const { navigation, state } = props;
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const { isSidebarExpanded } = useSidebar();
  const { alertConfig, showSuccess, showConfirm, hideAlert } = useSweetAlert();
  const COLORS = useThemeColors();
  const { isDark, toggleTheme, themeMode, setTheme } = useTheme();
  const drawerStyles = React.useMemo(() => createDrawerStyles(COLORS), [COLORS]);
  
  // State for admin modals
  const [showProductManagement, setShowProductManagement] = React.useState(false);
  const [showOrderManagement, setShowOrderManagement] = React.useState(false);
  const [showUserOrderManagement, setShowUserOrderManagement] = React.useState(false);
  const [showUserManagement, setShowUserManagement] = React.useState(false);
  const [showForumManagement, setShowForumManagement] = React.useState(false);
  const [showHeatMapManagement, setShowHeatMapManagement] = React.useState(false);
  const [hoveredItem, setHoveredItem] = React.useState(null);

  const handleLogout = () => {
    showConfirm(
      'Logout',
      'Are you sure you want to logout?',
      async () => {
        await logout();
        showSuccess('Goodbye!', 'You have been successfully logged out.', {
          autoClose: 1500,
        });
        // Redirect to Landing screen (web) or Auth/Login (mobile) after logout
        setTimeout(() => {
          navigation.getParent()?.reset({
            index: 0,
            routes: [Platform.OS === 'web' ? { name: 'Landing' } : { name: 'Auth', params: { screen: 'Login' } }],
          });
        }, 1600);
      },
      {
        confirmText: 'Logout',
        cancelText: 'Cancel',
      }
    );
  };

  const menuItems = [
    { name: 'Forum', icon: 'newspaper', label: 'Home', desc: 'Community feed' },
    ...(isAuthenticated ? [{ name: 'Notifications', icon: 'notifications', label: 'Notifications', desc: 'Your alerts', badge: unreadCount }] : []),
    { name: 'RelatedStudies', icon: 'book', label: 'Related Studies', desc: 'Research & articles' },
    { name: 'Scanner', icon: 'camera', label: 'Bignay Scanner', desc: 'Scan fruits & leaves' },
    { name: 'Chatbot', icon: 'chatbubbles', label: 'AI Assistant', desc: 'Get smart answers' },
    { name: 'Marketplace', icon: 'cart', label: 'Marketplace', desc: 'Buy & sell products' },
    { name: 'HeatMap', icon: 'map', label: 'Harvest Map', desc: 'Locate harvests' },
    { name: 'PricePrediction', icon: 'trending-up', label: 'Price Prediction', desc: 'Market forecasts' },
    ...(isAuthenticated ? [{ name: 'History', icon: 'time', label: 'History', desc: 'Past scans & data' }] : []),
    { name: 'Settings', icon: 'settings', label: 'Settings', desc: 'App preferences' },
  ];

  // Admin menu items
  const adminMenuItems = [
    { id: 'products', icon: 'cube', label: 'Products', color: '#2E7D32' },
    { id: 'orders', icon: 'receipt', label: 'Orders', color: '#2196F3' },
    { id: 'users', icon: 'people', label: 'Users', color: '#FFA000' },
    { id: 'studies', icon: 'book', label: 'Studies', color: '#1976D2' },
    { id: 'forum', icon: 'newspaper', label: 'Forum', color: '#9C27B0' },
    { id: 'heatmap', icon: 'map', label: 'Harvest Map', color: '#E91E63' },
  ];

  const handleAdminMenuPress = (menuId) => {
    navigation.closeDrawer();
    setTimeout(() => {
      switch (menuId) {
        case 'products':
          setShowProductManagement(true);
          break;
        case 'orders':
          setShowOrderManagement(true);
          break;
        case 'users':
          setShowUserManagement(true);
          break;
        case 'studies':
          navigation.navigate('ManageStudies');
          break;
        case 'forum':
          setShowForumManagement(true);
          break;
        case 'heatmap':
          setShowHeatMapManagement(true);
          break;
      }
    }, 300);
  };

  const currentRouteName = (state.routes && state.routes[state.index] && state.routes[state.index].name) || (state.routeNames && state.routeNames[state.index]);

  return (
    <View style={drawerStyles.container}>
      {/* Header with Logo */}
      <View style={[drawerStyles.header, !isSidebarExpanded && drawerStyles.headerCollapsed]}>
        <View style={drawerStyles.headerGradientOverlay} />
        {isAuthenticated && user ? (
          <TouchableOpacity 
            style={[drawerStyles.userProfile, !isSidebarExpanded && drawerStyles.userProfileCollapsed]}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.7}
          >
            {user.profile_image ? (
              <Image source={{ uri: user.profile_image }} style={drawerStyles.userAvatar} />
            ) : (
              <View style={drawerStyles.avatarPlaceholder}>
                <Text style={drawerStyles.avatarText}>
                  {user.first_name?.[0]?.toUpperCase()}{user.last_name?.[0]?.toUpperCase()}
                </Text>
              </View>
            )}
            {isSidebarExpanded && (
              <View style={drawerStyles.userInfo}>
                <Text style={drawerStyles.userName}>{user.first_name} {user.last_name}</Text>
                <Text style={drawerStyles.userEmail}>{user.email}</Text>
                {user.role === 'admin' && (
                  <View style={drawerStyles.adminBadge}>
                    <Ionicons name="shield-checkmark" size={10} color="#FFFFFF" />
                    <Text style={drawerStyles.adminText}>Admin</Text>
                  </View>
                )}
              </View>
            )}
            {isSidebarExpanded && <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />}
          </TouchableOpacity>
        ) : (
          <>
            <View style={[drawerStyles.logoRow, !isSidebarExpanded && { justifyContent: 'center' }]}>
              <Image source={BIGNAY_LOGO} style={drawerStyles.logoImage} resizeMode="contain" />
              {isSidebarExpanded && (
                <View>
                  <Text style={drawerStyles.appName}>Bignay</Text>
                  <Text style={drawerStyles.appSubtitle}>Smart Fruit Analysis</Text>
                </View>
              )}
            </View>
            {isSidebarExpanded && (
              <TouchableOpacity 
                style={drawerStyles.loginButton}
                onPress={() => navigation.getParent()?.navigate('Auth', { screen: 'Login' })}
                activeOpacity={0.8}
              >
                <Ionicons name="log-in-outline" size={16} color={COLORS.primary} />
                <Text style={drawerStyles.loginButtonText}>Login / Register</Text>
              </TouchableOpacity>
            )}
            {!isSidebarExpanded && (
              <TouchableOpacity 
                style={{ alignSelf: 'center', marginTop: 8 }}
                onPress={() => navigation.getParent()?.navigate('Auth', { screen: 'Login' })}
                activeOpacity={0.8}
              >
                <Ionicons name="log-in-outline" size={22} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Menu Items */}
      <ScrollView 
        style={drawerStyles.menuContainer}
        contentContainerStyle={[drawerStyles.menuContentContainer, !isSidebarExpanded && { alignItems: 'center' }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Navigation label */}
        {isSidebarExpanded && <Text style={drawerStyles.sectionLabel}>NAVIGATION</Text>}

        {menuItems.map((item) => {
          const isActive = currentRouteName === item.name;
          const isHovered = hoveredItem === item.name;
          return (
            <TouchableOpacity
              key={item.name}
              style={[
                drawerStyles.menuItem,
                isActive && drawerStyles.menuItemActive,
                isHovered && !isActive && drawerStyles.menuItemHover,
                !isSidebarExpanded && drawerStyles.menuItemCollapsed,
              ]}
              onPress={() => {
                navigation.navigate(item.name);
                if (navigation.closeDrawer) navigation.closeDrawer();
              }}
              onPressIn={() => setHoveredItem(item.name)}
              onPressOut={() => setHoveredItem(null)}
              activeOpacity={0.7}
              {...(Platform.OS === 'web' ? {
                onMouseEnter: () => setHoveredItem(item.name),
                onMouseLeave: () => setHoveredItem(null),
              } : {})}
            >
              <View style={[
                drawerStyles.menuIconWrap,
                isActive && { backgroundColor: COLORS.primary + '18' },
              ]}>
                <Ionicons
                  name={isActive ? item.icon : `${item.icon}-outline`}
                  size={20}
                  color={isActive ? COLORS.primary : COLORS.textSecondary}
                />
              </View>
              {isSidebarExpanded && (
                <View style={drawerStyles.menuTextWrap}>
                  <Text
                    style={[
                      drawerStyles.menuLabel,
                      isActive && drawerStyles.menuLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              )}
              {item.badge > 0 && (
                <View style={[drawerStyles.notifBadge, !isSidebarExpanded && drawerStyles.notifBadgeCollapsed]}>
                  <Text style={drawerStyles.notifBadgeText}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </Text>
                </View>
              )}
              {isActive && !isSidebarExpanded && <View style={[drawerStyles.activeIndicator, { right: -2 }]} />}
              {isActive && isSidebarExpanded && <View style={drawerStyles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}

        {/* Shop / Marketplace Section — available to all authenticated users */}
        {isAuthenticated && (
          <>
            <View style={[drawerStyles.adminDivider, { marginTop: 8 }]}>
              <View style={drawerStyles.dividerLine} />
              {isSidebarExpanded && (
                <View style={[drawerStyles.dividerBadge, { backgroundColor: '#1565C0' }]}>
                  <Ionicons name="cart" size={10} color="#FFFFFF" />
                  <Text style={drawerStyles.dividerText}>SHOP</Text>
                </View>
              )}
              {!isSidebarExpanded && (
                <Ionicons name="cart" size={14} color={COLORS.primary} style={{ marginHorizontal: 4 }} />
              )}
              <View style={drawerStyles.dividerLine} />
            </View>

            {[
              {
                icon: 'receipt',
                label: 'Order History',
                desc: 'View your orders',
                onPress: () => {
                  if (navigation.closeDrawer) navigation.closeDrawer();
                  setTimeout(() => navigation.navigate('Marketplace', { openOrderHistory: Date.now() }), 300);
                },
              },
              ...(isAdmin ? [{
                icon: 'clipboard',
                label: 'Order Management',
                desc: 'Manage all orders',
                onPress: () => {
                  if (navigation.closeDrawer) navigation.closeDrawer();
                  setTimeout(() => navigation.navigate('Marketplace', { openOrderManagement: Date.now() }), 300);
                },
              }] : []),
              ...(!isAdmin ? [{
                icon: 'clipboard',
                label: 'Order Management',
                desc: 'Manage your customer orders',
                onPress: () => {
                  if (navigation.closeDrawer) navigation.closeDrawer();
                  setTimeout(() => setShowUserOrderManagement(true), 300);
                },
              }] : []),
              {
                icon: 'storefront',
                label: isAdmin ? 'Product Management' : 'My Products',
                desc: isAdmin ? 'Manage all products' : 'Manage your listings',
                onPress: () => {
                  if (navigation.closeDrawer) navigation.closeDrawer();
                  if (isAdmin) {
                    setTimeout(() => setShowProductManagement(true), 300);
                  } else {
                    setTimeout(() => navigation.navigate('Marketplace', { openUserProducts: Date.now() }), 300);
                  }
                },
              },
              {
                icon: 'stats-chart',
                label: 'Analytics',
                desc: 'Sales & performance',
                onPress: () => {
                  if (navigation.closeDrawer) navigation.closeDrawer();
                  navigation.navigate(isAdmin ? 'AdminSalesTracking' : 'UserSalesTracking');
                },
              },
            ].map((item, idx) => {
              const isHoveredShop = hoveredItem === `shop_${idx}`;
              return (
                <TouchableOpacity
                  key={`shop_${idx}`}
                  style={[
                    drawerStyles.menuItem,
                    isHoveredShop && drawerStyles.menuItemHover,
                    !isSidebarExpanded && drawerStyles.menuItemCollapsed,
                  ]}
                  onPress={item.onPress}
                  onPressIn={() => setHoveredItem(`shop_${idx}`)}
                  onPressOut={() => setHoveredItem(null)}
                  activeOpacity={0.7}
                  {...(Platform.OS === 'web' ? {
                    onMouseEnter: () => setHoveredItem(`shop_${idx}`),
                    onMouseLeave: () => setHoveredItem(null),
                  } : {})}
                >
                  <View style={drawerStyles.menuIconWrap}>
                    <Ionicons name={`${item.icon}-outline`} size={20} color={COLORS.textSecondary} />
                  </View>
                  {isSidebarExpanded && (
                    <View style={drawerStyles.menuTextWrap}>
                      <Text style={drawerStyles.menuLabel}>{item.label}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Admin Section */}
        {isAdmin && (
          <>
            <View style={drawerStyles.adminDivider}>
              <View style={drawerStyles.dividerLine} />
              {isSidebarExpanded && (
                <View style={drawerStyles.dividerBadge}>
                  <Ionicons name="shield-checkmark" size={10} color={COLORS.textOnPrimary} />
                  <Text style={drawerStyles.dividerText}>ADMIN</Text>
                </View>
              )}
              {!isSidebarExpanded && (
                <Ionicons name="shield-checkmark" size={14} color={COLORS.primary} style={{ marginHorizontal: 4 }} />
              )}
              <View style={drawerStyles.dividerLine} />
            </View>

            <View style={[drawerStyles.adminGrid, !isSidebarExpanded && drawerStyles.adminGridCollapsed]}>
              {adminMenuItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[drawerStyles.adminGridItem, !isSidebarExpanded && drawerStyles.adminGridItemCollapsed]}
                  onPress={() => handleAdminMenuPress(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[drawerStyles.adminGridIcon, { backgroundColor: item.color + '15' }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  {isSidebarExpanded && <Text style={drawerStyles.adminGridLabel} numberOfLines={1}>{item.label}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Logout Button */}
        {isAuthenticated && (
          <TouchableOpacity 
            style={[drawerStyles.logoutButton, !isSidebarExpanded && drawerStyles.logoutButtonCollapsed]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
            {isSidebarExpanded && <Text style={drawerStyles.logoutText}>Logout</Text>}
          </TouchableOpacity>
        )}

        {/* Dark Mode Toggle */}
        <TouchableOpacity 
          style={[drawerStyles.themeToggle, !isSidebarExpanded && drawerStyles.themeToggleCollapsed]}
          onPress={toggleTheme}
          activeOpacity={0.7}
        >
          <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color={isDark ? '#FFC107' : '#6B7280'} />
          {isSidebarExpanded && <Text style={drawerStyles.themeToggleText}>{isDark ? 'Light Mode' : 'Dark Mode'}</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Footer */}
      <View style={[drawerStyles.footer, !isSidebarExpanded && { alignItems: 'center' }]}>
        <View style={[drawerStyles.footerBrand, !isSidebarExpanded && { justifyContent: 'center' }]}>
          <Image source={BIGNAY_LOGO} style={drawerStyles.footerLogo} resizeMode="contain" />
          {isSidebarExpanded && (
            <View>
              <Text style={drawerStyles.footerName}>Bignay App</Text>
              <Text style={drawerStyles.footerVersion}>v1.0.0 · © 2025</Text>
            </View>
          )}
        </View>
      </View>

      {/* Admin Modals */}
      <ProductManagement
        visible={showProductManagement}
        onClose={() => setShowProductManagement(false)}
      />
      <OrderManagement
        visible={showOrderManagement}
        onClose={() => setShowOrderManagement(false)}
      />
      <UserOrderManagement
        visible={showUserOrderManagement}
        onClose={() => setShowUserOrderManagement(false)}
      />
      <UserManagement
        visible={showUserManagement}
        onClose={() => setShowUserManagement(false)}
      />
      <ForumManagement
        visible={showForumManagement}
        onClose={() => setShowForumManagement(false)}
      />
      <HeatMapManagement
        visible={showHeatMapManagement}
        onClose={() => setShowHeatMapManagement(false)}
      />

      {/* SweetAlert Component for Logout */}
      <SweetAlert
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm || hideAlert}
        onCancel={hideAlert}
        onClose={hideAlert}
        showCancel={alertConfig.showCancel}
        autoClose={alertConfig.autoClose}
        closeOnOverlayPress={alertConfig.closeOnOverlayPress}
      />
    </View>
  );
}

const createDrawerStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: Platform.OS === 'web' ? 20 : 50,
    paddingBottom: 18,
    paddingHorizontal: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  headerGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  // Logo row (unauthenticated)
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  logoImage: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  appName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textOnPrimary,
    letterSpacing: -0.3,
  },
  appSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
    letterSpacing: 0.2,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: 'flex-start',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    ...Platform.select({
      web: { cursor: 'pointer' },
      default: {},
    }),
  },
  loginButtonText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  // User profile (authenticated)
  userProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    letterSpacing: -0.2,
  },
  userEmail: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 1,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
    gap: 4,
  },
  adminText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    letterSpacing: 0.3,
  },
  // Menu
  menuContainer: {
    flex: 1,
  },
  menuContentContainer: {
    paddingTop: 10,
    paddingBottom: 16,
    paddingHorizontal: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    paddingHorizontal: 12,
    marginBottom: 6,
    opacity: 0.6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 1,
    position: 'relative',
  },
  menuItemActive: {
    backgroundColor: COLORS.primary + '0D',
  },
  menuItemHover: {
    backgroundColor: '#F5F5F5',
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  menuLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  menuLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  activeIndicator: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    position: 'absolute',
    right: 0,
  },
  // Notification badge
  notifBadge: {
    backgroundColor: '#DC2626',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    marginRight: 4,
  },
  notifBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  // Admin Section
  adminDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.divider,
  },
  dividerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginHorizontal: 8,
    gap: 4,
  },
  dividerText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textOnPrimary,
    letterSpacing: 0.8,
  },
  adminGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 4,
  },
  adminGridItem: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceVariant,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  adminGridIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  adminGridLabel: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    marginTop: 16,
    marginHorizontal: 4,
    borderRadius: 10,
    backgroundColor: COLORS.danger + '08',
    borderWidth: 1,
    borderColor: COLORS.danger + '20',
    gap: 6,
  },
  logoutText: {
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: '600',
  },
  // Footer
  footer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  footerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerLogo: {
    width: 20,
    height: 20,
    borderRadius: 6,
    opacity: 0.6,
  },
  footerName: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  footerVersion: {
    fontSize: 10,
    color: COLORS.textSecondary,
    opacity: 0.5,
    marginTop: 1,
  },
  // Collapsed sidebar styles
  headerCollapsed: {
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  userProfileCollapsed: {
    justifyContent: 'center',
  },
  menuItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 10,
  },
  notifBadgeCollapsed: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
  },
  adminGridCollapsed: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  adminGridItemCollapsed: {
    width: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  logoutButtonCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    marginTop: 8,
    marginHorizontal: 4,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceVariant,
    gap: 6,
  },
  themeToggleCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  themeToggleText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
});

// Notification bell icon for the header (uses context)
function NotificationBellIcon({ navigation }) {
  const COLORS = useThemeColors();
  let unreadCount = 0;
  try {
    const notifCtx = useNotifications();
    unreadCount = notifCtx.unreadCount || 0;
  } catch (e) {
    // Context not available
  }

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Notifications')}
      style={{ marginRight: 16, padding: 8 }}
    >
      <Ionicons name="notifications-outline" size={22} color={COLORS.textOnPrimary} />
      {unreadCount > 0 && (
        <View style={{
          position: 'absolute',
          top: 4,
          right: 4,
          backgroundColor: '#DC2626',
          minWidth: 16,
          height: 16,
          borderRadius: 8,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 3,
          borderWidth: 1.5,
          borderColor: COLORS.primary,
        }}>
          <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Cart badge icon for the header (uses CartContext)
function CartBadgeIcon({ navigation }) {
  const COLORS = useThemeColors();
  let cartCount = 0;
  try {
    const cartCtx = useCart();
    cartCount = cartCtx.getCartCount() || 0;
  } catch (e) {
    // Context not available
  }

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Marketplace', { openCart: true })}
      style={{ marginRight: 4, padding: 8 }}
    >
      <Ionicons name="cart-outline" size={22} color={COLORS.textOnPrimary} />
      {cartCount > 0 && (
        <View style={{
          position: 'absolute',
          top: 4,
          right: 0,
          backgroundColor: '#DC2626',
          minWidth: 16,
          height: 16,
          borderRadius: 8,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 3,
          borderWidth: 1.5,
          borderColor: COLORS.primary,
        }}>
          <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>
            {cartCount > 99 ? '99+' : cartCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Main Drawer Navigator
function MainNavigator() {
  const COLORS = useThemeColors();
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768 && width < 1024;
  const { isSidebarExpanded, toggleSidebar } = useSidebar();

  // Responsive drawer width - collapsed shows only icons (68px)
  const expandedWidth = isDesktop ? 280 : isTablet ? 260 : 270;
  const collapsedWidth = 68;
  const drawerWidth = isDesktop ? (isSidebarExpanded ? expandedWidth : collapsedWidth) : expandedWidth;
  // On desktop, drawer is always permanent
  const drawerType = isDesktop ? 'permanent' : 'front';

  // Header toggle button for web/desktop
  const HeaderToggleButton = () => (
    <TouchableOpacity
      onPress={toggleSidebar}
      style={{
        marginLeft: 16,
        padding: 8,
      }}
    >
      <Ionicons 
        name={isSidebarExpanded ? 'menu' : 'menu-outline'} 
        size={24} 
        color={COLORS.textOnPrimary} 
      />
    </TouchableOpacity>
  );

  // Header logo component
  const HeaderLogo = ({ title }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image
        source={BIGNAY_LOGO}
        style={{ width: 28, height: 28, borderRadius: 8 }}
        resizeMode="contain"
      />
      <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textOnPrimary, letterSpacing: -0.3 }}>
        {title || 'Bignay'}
      </Text>
    </View>
  );

  // Header right side with cart and notification badges
  const HeaderRightIcons = ({ navigation }) => {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <CartBadgeIcon navigation={navigation} />
        <NotificationBellIcon navigation={navigation} />
      </View>
    );
  };

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={({ navigation, route }) => ({
        headerStyle: {
          backgroundColor: COLORS.primary,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        headerTintColor: COLORS.textOnPrimary,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerTitle: () => <HeaderLogo title={route.params?.headerTitle} />,
        drawerStyle: {
          width: drawerWidth,
          ...(isDesktop && { borderRightWidth: 1, borderRightColor: COLORS.divider }),
        },
        drawerType: drawerType,
        // Show toggle button on desktop, hamburger menu on mobile
        headerLeft: () => (
          isDesktop ? (
            <HeaderToggleButton />
          ) : (
            <TouchableOpacity
              onPress={() => navigation.toggleDrawer()}
              style={{ marginLeft: 16, padding: 8 }}
            >
              <Ionicons name="menu" size={24} color={COLORS.textOnPrimary} />
            </TouchableOpacity>
          )
        ),
        headerRight: () => <HeaderRightIcons navigation={navigation} />,
      })}
      initialRouteName="Forum"
      backBehavior="history"
    >
      <Drawer.Screen
        name="Forum"
        component={ForumHomeScreen}
        options={{ title: 'Bignay' }}
      />
      <Drawer.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'Notifications' }}
      />
      <Drawer.Screen
        name="RelatedStudies"
        component={RelatedStudiesScreen}
        options={{ title: 'Related Studies' }}
      />
      <Drawer.Screen
        name="ManageStudies"
        component={ManageStudiesScreen}
        options={{ title: 'Manage Studies', drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="Scanner"
        component={ScannerScreen}
        options={{ title: 'Bignay Scanner' }}
      />
      <Drawer.Screen
        name="Chatbot"
        component={ChatbotScreen}
        options={{ title: 'AI Assistant' }}
      />
      <Drawer.Screen
        name="Marketplace"
        component={MarketplaceScreen}
        options={{ title: 'Marketplace' }}
      />
      <Drawer.Screen
        name="HeatMap"
        component={HeatMapScreen}
        options={{ title: 'Harvest Map' }}
      />
      <Drawer.Screen
        name="PricePrediction"
        component={PricePredictionScreen}
        options={{ title: 'Price Prediction' }}
      />
      <Drawer.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'History' }}
      />
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <Drawer.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'My Profile' }}
      />
      <Drawer.Screen
        name="UserSalesTracking"
        component={UserSalesTracking}
        options={{ 
          title: 'My Sales',
          drawerItemStyle: { display: 'none' }
        }}
      />
      <Drawer.Screen
        name="AdminSalesTracking"
        component={AdminSalesTracking}
        options={{ 
          title: 'Platform Analytics',
          drawerItemStyle: { display: 'none' }
        }}
      />
      <Drawer.Screen
        name="ForumPostDetail"
        component={ForumPostDetailScreen}
        options={{ 
          title: 'Post',
          drawerItemStyle: { display: 'none' }
        }}
      />
      <Drawer.Screen
        name="ForumAllPosts"
        component={ForumAllPostsScreen}
        options={{ 
          title: 'All Posts',
          drawerItemStyle: { display: 'none' }
        }}
      />
      <Drawer.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={{ 
          title: 'Product Details',
          drawerItemStyle: { display: 'none' }
        }}
      />
    </Drawer.Navigator>
  );
}

// Auth Stack Navigator
function AuthNavigator() {
  const COLORS = useThemeColors();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.primary,
        },
        headerTintColor: COLORS.textOnPrimary,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TermsAndConditions"
        component={TermsAndConditionsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Root Navigator with Auth Flow
function RootNavigator() {
  const isWeb = Platform.OS === 'web';
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={isWeb ? 'Landing' : 'Main'}>
      {isWeb && (
        <Stack.Screen name="Landing" component={LandingScreen} />
      )}
      <Stack.Screen name="Main" component={MainNavigator} />
      <Stack.Screen 
        name="Auth" 
        component={AuthNavigator}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [isApiReady, setIsApiReady] = useState(false);
  const [apiError, setApiError] = useState(null);

  // Request notification permission on first launch (mobile)
  useNotificationPermission({ autoRequest: true });

  // Hardware back button handler (Android/iOS)
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const onBackPress = () => {
      if (!navigationRef.isReady()) return false;

      // Find the drawer navigator state to determine current screen & history
      const rootState = navigationRef.getRootState();
      const findDrawerInfo = (navState) => {
        if (!navState) return null;
        if (navState.type === 'drawer') {
          const activeRoute = navState.routes?.[navState.index];
          return {
            routeName: activeRoute?.name,
            historyLength: navState.history?.length || 0,
          };
        }
        if (navState.routes) {
          for (const r of navState.routes) {
            if (r.state) {
              const result = findDrawerInfo(r.state);
              if (result) return result;
            }
          }
        }
        return null;
      };

      const drawerInfo = findDrawerInfo(rootState);
      const currentRoute = drawerInfo?.routeName || navigationRef.getCurrentRoute()?.name;
      const historyLength = drawerInfo?.historyLength || 0;
      const isAtRoot = currentRoute === 'Forum';

      // At root screen with no back history → confirm exit
      if (isAtRoot && historyLength <= 1) {
        Alert.alert(
          'Exit Bignay',
          'Are you sure you want to exit the app?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
          ],
          { cancelable: true }
        );
        return true;
      }

      // Otherwise, go back
      if (navigationRef.canGoBack()) {
        navigationRef.goBack();
        return true;
      }

      // Fallback: navigate to root
      if (!isAtRoot) {
        navigationRef.navigate('Forum');
        return true;
      }

      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Initialize API connection on app start
    const init = async () => {
      try {
        console.log('[App] Initializing API connection...');
        const workingUrl = await initializeApi();
        if (workingUrl) {
          console.log(`[App] API initialized with URL: ${workingUrl}`);
        } else {
          console.log('[App] No working API URL found - app will retry on requests');
        }

        await checkBackendCompatibility();
        await checkAndApplyOtaUpdate();
      } catch (error) {
        console.error('[App] API initialization error:', error);
        setApiError(error.message);
      } finally {
        setIsApiReady(true);
      }
    };
    
    init();
  }, []);

  // Show loading while initializing API
  if (!isApiReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={{ marginTop: 16, color: '#757575' }}>Connecting to server...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  // Web-specific root styles to ensure full viewport usage
  const webRootStyle = Platform.OS === 'web' ? {
    minHeight: '100vh',
    width: '100%',
    overflow: 'hidden',
  } : {};

  return (
    <SafeAreaProvider style={webRootStyle}>
      <ThemeProvider>
      <AuthProvider>
        <CartProvider>
          <NotificationProvider>
          <SidebarProvider>
            <AppStatusBar />
            <NavigationContainer
              ref={navigationRef}
              linking={{
                prefixes: ['bignay://', 'exp://'],
                config: {
                  screens: {
                    Landing: '',
                    Main: {
                      path: '',
                      screens: {
                        Home: 'home',
                        Predict: 'predict',
                        Products: 'products',
                        Orders: 'orders',
                        Forum: 'forum',
                        Profile: 'profile',
                        HarvestMap: 'map',
                        PricePredict: 'price-predict',
                        Settings: 'settings',
                        ProductDetail: 'product/:id',
                        ForumPostDetail: 'post/:id',
                        UserSalesTracking: 'my-sales',
                        AdminSalesTracking: 'analytics',
                        ForumAllPosts: 'all-posts'
                      }
                    },
                    Auth: {
                      screens: {
                        Login: 'login',
                        Register: 'register',
                        ForgotPassword: 'forgot-password'
                      }
                    }
                  }
                }
              }}
              documentTitle={{
                formatter: (options, route) => 
                  `${options?.title ?? route?.name} - Bignay App`,
              }}
            >
              <View style={[styles.appContainer, webRootStyle]}>
                <RootNavigator />
              </View>
              <FloatingChatWidget />
            </NavigationContainer>
          </SidebarProvider>
          </NotificationProvider>
        </CartProvider>
      </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// StatusBar component that reacts to theme
function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

// Minimal styles used by App
const styles = StyleSheet.create({
  appContainer: { flex: 1 },
});
