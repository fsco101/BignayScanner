/**
 * HeatMapScreen (Harvest Map)
 *
 * Interactive map for viewing and creating harvest location pins.
 * Uses OpenStreetMap tiles via Leaflet (loaded in a WebView for native, iframe for web).
 * Works on Expo Go, Android, iOS, and Expo Web — no paid APIs required.
 *
 * Features:
 *  - View all harvest pins on an interactive OSM map
 *  - Tap or long-press the map to create a new pin
 *  - Filter pins by type (Farm, Blooming Area, Market, Other)
 *  - View pin details with popup / detail modal
 *  - Edit / delete own pins
 *  - OpenStreetMap attribution included
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { useAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { HeatMapService } from '../../services/HeatMapService';
import WebMap from './WebMap';
import AddPinModal from './AddPinModal';
import PinDetailModal from './PinDetailModal';
import { useThemeColors } from '../../context/ThemeContext';

const PIN_FILTERS = [
  { id: 'all', name: 'All', icon: 'globe', color: '#2E7D32' },
  { id: 'farm', name: 'Farm', icon: 'leaf', color: '#4CAF50' },
  { id: 'blooming_area', name: 'Blooming', icon: 'flower', color: '#E91E63' },
  { id: 'market', name: 'Market', icon: 'storefront', color: '#FF9800' },
  { id: 'other', name: 'Other', icon: 'location', color: '#2196F3' },
];

// Vehicle types for routing
const VEHICLE_TYPES = [
  { id: 'driving', name: 'Car', icon: 'car', description: 'All roads & expressways' },
  { id: 'cycling', name: 'Motorcycle', icon: 'bicycle', description: 'Local roads only' },
  { id: 'foot', name: 'Walking', icon: 'walk', description: 'Pedestrian paths' },
];

// Distinct colors for each waypoint (matches WebMap WAYPOINT_COLORS)
const WAYPOINT_COLORS = [
  '#1976D2', '#D32F2F', '#FF9800', '#9C27B0', '#00BCD4',
  '#795548', '#E91E63', '#3F51B5', '#009688', '#FF5722',
  '#607D8B', '#8BC34A',
];

// Default center: Philippines
const DEFAULT_REGION = {
  latitude: 12.8797,
  longitude: 121.774,
  zoom: 6,
};

// Philippines bounding box for coordinate validation
const PH_BOUNDS = {
  minLat: 4.2,
  maxLat: 21.5,
  minLng: 116.0,
  maxLng: 127.5,
};

export default function HeatMapScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { user, isAuthenticated } = useAuth();
  const mapRef = useRef(null);
  const fullscreenMapRef = useRef(null);

  // State
  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [userLocation, setUserLocation] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [stats, setStats] = useState(null);

  // Modals
  const [addPinModalVisible, setAddPinModalVisible] = useState(false);
  const [pinDetailModalVisible, setPinDetailModalVisible] = useState(false);
  const [selectedPin, setSelectedPin] = useState(null);
  const [newPinCoordinate, setNewPinCoordinate] = useState(null);
  const [editingPin, setEditingPin] = useState(null);
  const [saving, setSaving] = useState(false);

  // Pin-drop mode: when true, tapping the map drops a pin
  const [pinMode, setPinMode] = useState(false);

  // Navigation mode
  const [navigationMode, setNavigationMode] = useState(false);
  const [waypoints, setWaypoints] = useState([]); // [{lat, lng, label}]
  const [routeInfo, setRouteInfo] = useState(null);
  const [addingWaypoint, setAddingWaypoint] = useState(false); // when true, next map tap adds waypoint
  const [vehicleType, setVehicleType] = useState('driving'); // driving | cycling | foot

  // Waypoint search
  const [waypointSearchQuery, setWaypointSearchQuery] = useState('');
  const [waypointSearchResults, setWaypointSearchResults] = useState([]);
  const [isWaypointSearching, setIsWaypointSearching] = useState(false);
  const [showWaypointSearchResults, setShowWaypointSearchResults] = useState(false);
  const waypointSearchTimeout = useRef(null);

  // Fullscreen map
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);

  // Live position tracking
  const [liveTracking, setLiveTracking] = useState(false);
  const [followMode, setFollowMode] = useState(false);
  const [userHeading, setUserHeading] = useState(null);
  const [userAccuracy, setUserAccuracy] = useState(null);
  const locationWatcherRef = useRef(null);

  // Turn-by-turn navigation
  const [turnByTurnActive, setTurnByTurnActive] = useState(false);
  const [navInstructions, setNavInstructions] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [currentStepInfo, setCurrentStepInfo] = useState(null);
  const [distanceToNextStep, setDistanceToNextStep] = useState(null);

  // Location search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchedPlaceName, setSearchedPlaceName] = useState('');
  const searchTimeout = useRef(null);

  // Responsive
  const {
    width: screenWidth,
    height: screenHeight,
    isMobile,
    isDesktop,
    sp,
    fp,
    hp,
    responsive,
    maxContentWidth,
  } = useResponsive();

  const dynamicStyles = useMemo(() => ({
    mapHeight: isMapFullscreen
      ? responsive({ mobile: screenHeight - 120, tablet: screenHeight - 100, desktop: screenHeight - 80 })
      : responsive({ mobile: hp(350), tablet: hp(420), desktop: hp(500) }),
  }), [screenWidth, screenHeight, responsive, hp, isMapFullscreen]);

  // ==================== DATA LOADING ====================

  const loadPins = useCallback(async () => {
    try {
      const params = {};
      if (selectedFilter !== 'all') {
        params.pin_type = selectedFilter;
      }
      const result = await HeatMapService.getPins(params);
      if (result.ok) {
        setPins(result.pins || []);
      } else {
        console.warn('[HeatMap] Failed to load pins:', result.error);
      }
    } catch (error) {
      console.error('[HeatMap] Error loading pins:', error);
    }
  }, [selectedFilter]);

  const loadStats = useCallback(async () => {
    try {
      const result = await HeatMapService.getStats();
      if (result.ok) {
        setStats(result.stats);
      }
    } catch (error) {
      console.warn('[HeatMap] Error loading stats:', error);
    }
  }, []);

  const requestLocationPermission = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    } catch (error) {
      console.log('[HeatMap] Location permission error:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([
        loadPins(),
        loadStats(),
        requestLocationPermission(),
      ]);
      setLoading(false);
    };
    init();
  }, []);

  // Reload when filter changes
  useEffect(() => {
    loadPins();
  }, [selectedFilter, loadPins]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPins(), loadStats()]);
    setRefreshing(false);
  }, [loadPins, loadStats]);

  // ==================== MAP EVENT HANDLERS ====================

  const handleMapTap = useCallback((coord) => {
    if (addingWaypoint) {
      // Add waypoint from map tap
      const newWp = { lat: coord.latitude, lng: coord.longitude, label: `Point ${waypoints.length + 1}` };
      const updated = [...waypoints, newWp];
      setWaypoints(updated);
      setAddingWaypoint(false);
      if (updated.length >= 2) {
        mapRef.current?.showRoute(updated, vehicleType);
      }
      return;
    }
    if (pinMode) {
      // Validate coordinate is within Philippines
      if (coord.latitude < PH_BOUNDS.minLat || coord.latitude > PH_BOUNDS.maxLat ||
          coord.longitude < PH_BOUNDS.minLng || coord.longitude > PH_BOUNDS.maxLng) {
        Alert.alert('Invalid Location', 'Please select a location within the Philippines.');
        return;
      }
      // In pin-drop mode, a tap places a new pin
      setNewPinCoordinate(coord);
      setEditingPin(null);
      setAddPinModalVisible(true);
      setPinMode(false);
      mapRef.current?.setPinMode(false);
    }
  }, [pinMode, addingWaypoint, waypoints, vehicleType]);

  const handleLongPress = useCallback((coord) => {
    if (!isAuthenticated) {
      Alert.alert('Login Required', 'Please log in to add harvest pins.');
      return;
    }
    // Validate coordinate is within Philippines
    if (coord.latitude < PH_BOUNDS.minLat || coord.latitude > PH_BOUNDS.maxLat ||
        coord.longitude < PH_BOUNDS.minLng || coord.longitude > PH_BOUNDS.maxLng) {
      Alert.alert('Invalid Location', 'Please select a location within the Philippines.');
      return;
    }
    setNewPinCoordinate(coord);
    setEditingPin(null);
    setAddPinModalVisible(true);
  }, [isAuthenticated]);

  const handlePinTap = useCallback((pin) => {
    setSelectedPin(pin);
    setPinDetailModalVisible(true);
  }, []);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  // ==================== CRUD OPERATIONS ====================

  const handleCreatePin = useCallback(async (pinData) => {
    setSaving(true);
    try {
      const result = await HeatMapService.createPin(pinData);
      if (result.ok) {
        // Add marker to map
        mapRef.current?.addMarker(result.pin);
        setAddPinModalVisible(false);
        // Refresh pins list
        await loadPins();
        await loadStats();
        Alert.alert('Success', 'Harvest pin added successfully!');
      } else {
        Alert.alert('Error', result.error || 'Failed to create pin');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    }
    setSaving(false);
  }, [loadPins, loadStats]);

  const handleUpdatePin = useCallback(async (pinData) => {
    if (!editingPin?._id) return;
    setSaving(true);
    try {
      const result = await HeatMapService.updatePin(editingPin._id, pinData);
      if (result.ok) {
        setAddPinModalVisible(false);
        setEditingPin(null);
        await loadPins();
        Alert.alert('Success', 'Pin updated successfully!');
      } else {
        Alert.alert('Error', result.error || 'Failed to update pin');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    }
    setSaving(false);
  }, [editingPin, loadPins]);

  const handleDeletePin = useCallback(async (pinId) => {
    try {
      const result = await HeatMapService.deletePin(pinId);
      if (result.ok) {
        setPinDetailModalVisible(false);
        setSelectedPin(null);
        await loadPins();
        await loadStats();
        Alert.alert('Deleted', 'Pin has been removed.');
      } else {
        Alert.alert('Error', result.error || 'Failed to delete pin');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    }
  }, [loadPins, loadStats]);

  const handleEditPin = useCallback((pin) => {
    setPinDetailModalVisible(false);
    setEditingPin(pin);
    setNewPinCoordinate({ latitude: pin.latitude, longitude: pin.longitude });
    setAddPinModalVisible(true);
  }, []);

  // ==================== NAVIGATION MODE ====================

  const handleNavigateToPin = useCallback((pin) => {
    // Start navigation mode with user location as start, pin as destination
    const startWaypoints = [];
    if (userLocation) {
      startWaypoints.push({ lat: userLocation.latitude, lng: userLocation.longitude, label: 'My Location' });
    }
    startWaypoints.push({ lat: pin.latitude, lng: pin.longitude, label: pin.place_name || 'Destination' });
    setWaypoints(startWaypoints);
    setNavigationMode(true);
    setRouteInfo(null);
    if (startWaypoints.length >= 2) {
      mapRef.current?.showRoute(startWaypoints, vehicleType);
    } else {
      // Only destination, user needs to add start point
      Alert.alert('Add Starting Point', 'Tap on the map to add your starting point, or enable location services.');
      setAddingWaypoint(true);
    }
  }, [userLocation, vehicleType]);

  const handleAddWaypoint = useCallback(() => {
    setAddingWaypoint(true);
    Alert.alert('Add Waypoint', 'Tap on the map to add a waypoint to your route.');
  }, []);

  const handleAddWaypointFromPin = useCallback((pin) => {
    const newWp = { lat: pin.latitude, lng: pin.longitude, label: pin.place_name || `Point ${waypoints.length + 1}` };
    const updated = [...waypoints, newWp];
    setWaypoints(updated);
    if (updated.length >= 2) {
      mapRef.current?.showRoute(updated, vehicleType);
    }
  }, [waypoints, vehicleType]);

  const handleRemoveWaypoint = useCallback((index) => {
    const updated = waypoints.filter((_, i) => i !== index);
    setWaypoints(updated);
    if (updated.length >= 2) {
      mapRef.current?.showRoute(updated, vehicleType);
    } else {
      mapRef.current?.clearRoute();
      setRouteInfo(null);
    }
  }, [waypoints, vehicleType]);

  const handleClearNavigation = useCallback(() => {
    // Stop turn-by-turn if active
    if (turnByTurnActive) {
      mapRef.current?.stopTurnByTurn();
      if (isMapFullscreen) fullscreenMapRef.current?.stopTurnByTurn();
      setTurnByTurnActive(false);
      setCurrentStepIndex(0);
      setCurrentStepInfo(null);
      setDistanceToNextStep(null);
    }
    setNavigationMode(false);
    setWaypoints([]);
    setRouteInfo(null);
    setAddingWaypoint(false);
    setNavInstructions([]);
    mapRef.current?.clearRoute();
  }, [turnByTurnActive, isMapFullscreen]);

  const handleRouteInfo = useCallback((info) => {
    setRouteInfo(info);
    // Store instructions if present
    if (info.instructions && info.instructions.length > 0) {
      setNavInstructions(info.instructions);
    } else {
      setNavInstructions([]);
    }
  }, []);

  const handleRouteError = useCallback((message) => {
    Alert.alert('Route Error', message || 'Could not calculate route.');
  }, []);

  const handleFollowModeChanged = useCallback((enabled) => {
    setFollowMode(enabled);
  }, []);

  // ==================== LIVE POSITION TRACKING ====================

  const startLiveTracking = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for live tracking.');
        return;
      }

      // Stop any existing watcher
      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
      }

      setLiveTracking(true);
      setFollowMode(true);
      mapRef.current?.setFollowMode(true);
      if (isMapFullscreen) {
        fullscreenMapRef.current?.setFollowMode(true);
      }

      const watcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 3,
        },
        (location) => {
          const { latitude, longitude, heading, accuracy } = location.coords;
          const newLoc = { latitude, longitude };
          setUserLocation(newLoc);
          setUserHeading(heading);
          setUserAccuracy(accuracy);

          // Send to both maps
          mapRef.current?.updateUserLocation(latitude, longitude, heading, accuracy);
          if (isMapFullscreen) {
            fullscreenMapRef.current?.updateUserLocation(latitude, longitude, heading, accuracy);
          }
        }
      );

      locationWatcherRef.current = watcher;
    } catch (error) {
      console.warn('[HeatMap] Live tracking error:', error);
      Alert.alert('Tracking Error', 'Could not start live position tracking.');
    }
  }, [isMapFullscreen]);

  const stopLiveTracking = useCallback(() => {
    if (locationWatcherRef.current) {
      locationWatcherRef.current.remove();
      locationWatcherRef.current = null;
    }
    setLiveTracking(false);
    setFollowMode(false);
    mapRef.current?.clearLiveTracking();
    mapRef.current?.setFollowMode(false);
    if (isMapFullscreen) {
      fullscreenMapRef.current?.clearLiveTracking();
      fullscreenMapRef.current?.setFollowMode(false);
    }
  }, [isMapFullscreen]);

  const toggleLiveTracking = useCallback(() => {
    if (liveTracking) {
      stopLiveTracking();
    } else {
      startLiveTracking();
    }
  }, [liveTracking, startLiveTracking, stopLiveTracking]);

  const toggleFollowMode = useCallback(() => {
    const newMode = !followMode;
    setFollowMode(newMode);
    mapRef.current?.setFollowMode(newMode);
    if (isMapFullscreen) {
      fullscreenMapRef.current?.setFollowMode(newMode);
    }
    // If re-enabling follow mode, immediately center on user
    if (newMode && userLocation) {
      mapRef.current?.flyTo(userLocation.latitude, userLocation.longitude, 16);
    }
  }, [followMode, isMapFullscreen, userLocation]);

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => {
      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
      }
    };
  }, []);

  // ==================== TURN-BY-TURN NAVIGATION ====================

  const getTurnIcon = useCallback((type, modifier) => {
    if (type === 'depart') return 'flag';
    if (type === 'arrive') return 'flag-outline';
    if (type === 'roundabout' || type === 'rotary') return 'sync-circle';
    if (modifier === 'left' || modifier === 'slight left' || modifier === 'sharp left') return 'arrow-back';
    if (modifier === 'right' || modifier === 'slight right' || modifier === 'sharp right') return 'arrow-forward';
    if (modifier === 'uturn') return 'return-down-back';
    return 'arrow-up';
  }, []);

  const formatStepDistance = useCallback((meters) => {
    if (meters == null) return '';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }, []);

  const handleStartTurnByTurn = useCallback(() => {
    if (!routeInfo || navInstructions.length === 0) {
      Alert.alert('No Route', 'Please calculate a route first before starting navigation.');
      return;
    }
    // Start live tracking if not already active
    if (!liveTracking) {
      startLiveTracking();
    }
    setTurnByTurnActive(true);
    setCurrentStepIndex(0);
    if (navInstructions.length > 0) {
      setCurrentStepInfo(navInstructions[0]);
      setDistanceToNextStep(navInstructions[0].distance);
    }
    mapRef.current?.startTurnByTurn();
    if (isMapFullscreen) {
      fullscreenMapRef.current?.startTurnByTurn();
    }
  }, [routeInfo, navInstructions, liveTracking, startLiveTracking, isMapFullscreen]);

  const handleStopTurnByTurn = useCallback(() => {
    setTurnByTurnActive(false);
    setCurrentStepIndex(0);
    setCurrentStepInfo(null);
    setDistanceToNextStep(null);
    mapRef.current?.stopTurnByTurn();
    if (isMapFullscreen) {
      fullscreenMapRef.current?.stopTurnByTurn();
    }
  }, [isMapFullscreen]);

  const handleTurnByTurnStarted = useCallback((data) => {
    setTurnByTurnActive(true);
  }, []);

  const handleTurnByTurnStopped = useCallback(() => {
    setTurnByTurnActive(false);
    setCurrentStepIndex(0);
    setCurrentStepInfo(null);
    setDistanceToNextStep(null);
  }, []);

  const handleNavStepChanged = useCallback((data) => {
    setCurrentStepIndex(data.stepIndex);
    setCurrentStepInfo({
      instruction: data.instruction,
      distance: data.distance,
      road: data.road,
      type: data.type_,
      modifier: data.modifier,
    });
    setDistanceToNextStep(data.distance);
  }, []);

  const handleNavStepProgress = useCallback((data) => {
    setDistanceToNextStep(data.distanceToStep);
    setCurrentStepIndex(data.stepIndex);
  }, []);

  const handleNavArrived = useCallback(() => {
    setTurnByTurnActive(false);
    setCurrentStepIndex(0);
    setCurrentStepInfo(null);
    setDistanceToNextStep(null);
    Alert.alert('\uD83C\uDFC1 You have arrived!', 'You have reached your destination.');
  }, []);

  // ==================== UI HELPERS ====================

  const togglePinMode = useCallback(() => {
    if (!isAuthenticated) {
      Alert.alert('Login Required', 'Please log in to add harvest pins.');
      return;
    }
    const newMode = !pinMode;
    setPinMode(newMode);
    mapRef.current?.setPinMode(newMode);
    if (newMode) {
      Alert.alert('Drop Pin Mode', 'Tap anywhere on the map to place a pin.\nOr long-press for quick placement.');
    }
  }, [pinMode, isAuthenticated]);

  const handleLocateMe = useCallback(() => {
    if (userLocation) {
      mapRef.current?.flyTo(userLocation.latitude, userLocation.longitude, 14);
    } else {
      requestLocationPermission();
    }
  }, [userLocation, requestLocationPermission]);

  // ==================== LOCATION SEARCH ====================

  const searchLocation = useCallback(async (query) => {
    if (!query || query.trim().length < 3) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    setIsSearching(true);
    try {
      const encoded = encodeURIComponent(query.trim());
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=ph&limit=6&addressdetails=1&viewbox=116.0,4.2,127.5,21.5&bounded=1`;
      const response = await fetch(url, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'BignayApp/1.0' },
      });
      const data = await response.json();
      setSearchResults(data || []);
      setShowSearchResults(data && data.length > 0);
    } catch (error) {
      console.warn('[HeatMap] Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback((text) => {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (text.trim().length < 3) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    searchTimeout.current = setTimeout(() => searchLocation(text), 500);
  }, [searchLocation]);

  const handleSelectSearchResult = useCallback((result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const placeName = result.display_name?.split(',').slice(0, 3).join(',').trim() || result.display_name;

    setSearchQuery(placeName);
    setShowSearchResults(false);
    setSearchResults([]);

    // Fly to the location
    mapRef.current?.flyTo(lat, lng, 15);

    // If authenticated, ask if they want to pin this location
    if (isAuthenticated) {
      Alert.alert(
        'Pin This Location?',
        `Do you want to add a harvest pin at:\n${placeName}?`,
        [
          { text: 'Just View', style: 'cancel' },
          {
            text: 'Add Pin',
            onPress: () => {
              setNewPinCoordinate({ latitude: lat, longitude: lng });
              setEditingPin(null);
              setSearchedPlaceName(placeName);
              setAddPinModalVisible(true);
            },
          },
        ]
      );
    }
  }, [isAuthenticated]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  }, []);

  // ==================== WAYPOINT SEARCH ====================

  const searchWaypointLocation = useCallback(async (query) => {
    if (!query || query.trim().length < 3) {
      setWaypointSearchResults([]);
      setShowWaypointSearchResults(false);
      return;
    }
    setIsWaypointSearching(true);
    try {
      const encoded = encodeURIComponent(query.trim());
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=ph&limit=6&addressdetails=1&viewbox=116.0,4.2,127.5,21.5&bounded=1`;
      const response = await fetch(url, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'BignayApp/1.0' },
      });
      const data = await response.json();
      setWaypointSearchResults(data || []);
      setShowWaypointSearchResults(data && data.length > 0);
    } catch (error) {
      console.warn('[HeatMap] Waypoint search error:', error);
      setWaypointSearchResults([]);
    } finally {
      setIsWaypointSearching(false);
    }
  }, []);

  const handleWaypointSearchChange = useCallback((text) => {
    setWaypointSearchQuery(text);
    if (waypointSearchTimeout.current) clearTimeout(waypointSearchTimeout.current);
    if (text.trim().length < 3) {
      setWaypointSearchResults([]);
      setShowWaypointSearchResults(false);
      return;
    }
    waypointSearchTimeout.current = setTimeout(() => searchWaypointLocation(text), 500);
  }, [searchWaypointLocation]);

  const handleSelectWaypointSearchResult = useCallback((result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const placeName = result.display_name?.split(',').slice(0, 3).join(',').trim() || result.display_name;

    setWaypointSearchQuery('');
    setShowWaypointSearchResults(false);
    setWaypointSearchResults([]);

    const newWp = { lat, lng, label: placeName };
    const updated = [...waypoints, newWp];
    setWaypoints(updated);

    // Fly to the added waypoint
    mapRef.current?.flyTo(lat, lng, 14);

    if (updated.length >= 2) {
      mapRef.current?.showRoute(updated, vehicleType);
    }
  }, [waypoints, vehicleType]);

  const clearWaypointSearch = useCallback(() => {
    setWaypointSearchQuery('');
    setWaypointSearchResults([]);
    setShowWaypointSearchResults(false);
  }, []);

  // ==================== FULLSCREEN MAP ====================

  const toggleMapFullscreen = useCallback(() => {
    setIsMapFullscreen(prev => {
      const goingFullscreen = !prev;
      if (goingFullscreen && waypoints.length >= 2) {
        // When entering fullscreen, re-apply route on the fullscreen map after it mounts
        setTimeout(() => {
          fullscreenMapRef.current?.showRoute(waypoints, vehicleType);
        }, 800);
      }
      if (!goingFullscreen && waypoints.length >= 2) {
        // When exiting fullscreen, re-apply route on the main map
        setTimeout(() => {
          mapRef.current?.showRoute(waypoints, vehicleType);
        }, 300);
      }
      return goingFullscreen;
    });
  }, [waypoints, vehicleType]);

  // Map region: center on user if available
  const mapRegion = useMemo(() => {
    if (userLocation) {
      return { ...userLocation, zoom: 10 };
    }
    return DEFAULT_REGION;
  }, [userLocation]);

  // Filtered pins for list view
  const filteredPins = useMemo(() => {
    if (selectedFilter === 'all') return pins;
    return pins.filter((p) => p.pin_type === selectedFilter);
  }, [pins, selectedFilter]);

  // ==================== RENDER ====================

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Harvest Map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
        contentContainerStyle={isDesktop ? {
          maxWidth: maxContentWidth || 1200,
          width: '100%',
          alignSelf: 'center',
          paddingHorizontal: 24,
        } : undefined}
      >
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: COLORS.primary }]}>
            <Ionicons name="location" size={22} color={COLORS.buttonText} />
            <Text style={styles.statNumber}>{stats?.total_pins || pins.length}</Text>
            <Text style={styles.statLabel}>Total Pins</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#4CAF50' }]}>
            <Ionicons name="leaf" size={22} color={COLORS.buttonText} />
            <Text style={styles.statNumber}>{stats?.by_type?.farm || 0}</Text>
            <Text style={styles.statLabel}>Farms</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FF9800' }]}>
            <Ionicons name="storefront" size={22} color={COLORS.buttonText} />
            <Text style={styles.statNumber}>{stats?.by_type?.market || 0}</Text>
            <Text style={styles.statLabel}>Markets</Text>
          </View>
        </View>

        {/* Filter Chips */}
        <View style={styles.filterSection}>
          <Text style={styles.filterTitle}>Filter by Type</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {PIN_FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter.id}
                style={[
                  styles.filterChip,
                  selectedFilter === filter.id && {
                    backgroundColor: filter.color + '20',
                    borderColor: filter.color,
                  },
                ]}
                onPress={() => setSelectedFilter(filter.id)}
              >
                <Ionicons
                  name={filter.icon}
                  size={16}
                  color={selectedFilter === filter.id ? filter.color : COLORS.textSecondary}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    selectedFilter === filter.id && { color: filter.color, fontWeight: '600' },
                  ]}
                >
                  {filter.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Map */}
        <View style={styles.mapSection}>
          <View style={styles.mapHeader}>
            <Text style={styles.sectionTitle}>Harvest Map</Text>
            <View style={styles.mapActions}>
              <TouchableOpacity
                style={[styles.mapActionBtn, pinMode && styles.mapActionBtnActive]}
                onPress={togglePinMode}
              >
                <Ionicons
                  name="add-circle"
                  size={20}
                  color={pinMode ? '#fff' : COLORS.primary}
                />
                <Text style={[styles.mapActionText, pinMode && { color: '#fff' }]}>
                  {pinMode ? 'Cancel' : 'Add Pin'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mapActionBtn} onPress={handleLocateMe}>
                <Ionicons name="locate" size={20} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mapActionBtn, liveTracking && styles.mapActionBtnActive]}
                onPress={toggleLiveTracking}
              >
                <Ionicons
                  name={liveTracking ? 'navigate' : 'navigate-outline'}
                  size={20}
                  color={liveTracking ? '#fff' : COLORS.primary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mapActionBtn, isMapFullscreen && styles.mapActionBtnActive]}
                onPress={toggleMapFullscreen}
              >
                <Ionicons
                  name={isMapFullscreen ? 'contract' : 'expand'}
                  size={20}
                  color={isMapFullscreen ? '#fff' : COLORS.primary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Location Search */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputRow}>
              <Ionicons name="search" size={18} color={COLORS.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search a location in the Philippines..."
                placeholderTextColor={COLORS.textLight}
                value={searchQuery}
                onChangeText={handleSearchChange}
                returnKeyType="search"
                onSubmitEditing={() => searchLocation(searchQuery)}
              />
              {isSearching && (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 8 }} />
              )}
              {searchQuery.length > 0 && !isSearching && (
                <TouchableOpacity onPress={clearSearch} style={styles.searchClearBtn}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textLight} />
                </TouchableOpacity>
              )}
            </View>
            {showSearchResults && searchResults.length > 0 && (
              <View style={styles.searchResultsList}>
                {searchResults.map((result, index) => {
                  const parts = result.display_name?.split(',') || [];
                  const primary = parts.slice(0, 2).join(',').trim();
                  const secondary = parts.slice(2, 5).join(',').trim();
                  return (
                    <TouchableOpacity
                      key={result.place_id || index}
                      style={[
                        styles.searchResultItem,
                        index < searchResults.length - 1 && styles.searchResultBorder,
                      ]}
                      onPress={() => handleSelectSearchResult(result)}
                    >
                      <Ionicons name="location-outline" size={18} color={COLORS.primary} style={{ marginTop: 2 }} />
                      <View style={styles.searchResultText}>
                        <Text style={styles.searchResultPrimary} numberOfLines={1}>{primary}</Text>
                        {secondary ? (
                          <Text style={styles.searchResultSecondary} numberOfLines={1}>{secondary}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {pinMode && (
            <View style={styles.pinModeBanner}>
              <Ionicons name="information-circle" size={18} color={COLORS.info} />
              <Text style={styles.pinModeBannerText}>
                Tap on the map to drop a pin, or long-press for quick placement
              </Text>
            </View>
          )}

          {/* Live Tracking Panel */}
          {liveTracking && !navigationMode && (
            <View style={styles.trackingPanel}>
              <View style={styles.trackingPanelHeader}>
                <View style={styles.trackingPanelTitleRow}>
                  <View style={styles.trackingPulseDot} />
                  <Text style={styles.trackingPanelTitle}>Live Tracking</Text>
                </View>
                <TouchableOpacity onPress={stopLiveTracking}>
                  <Ionicons name="close-circle" size={22} color={COLORS.textLight} />
                </TouchableOpacity>
              </View>
              <View style={styles.trackingInfoRow}>
                {userLocation && (
                  <Text style={styles.trackingCoordText}>
                    {userLocation.latitude.toFixed(5)}, {userLocation.longitude.toFixed(5)}
                  </Text>
                )}
                {userAccuracy != null && (
                  <Text style={styles.trackingAccuracyText}>
                    Accuracy: ~{Math.round(userAccuracy)}m
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.followModeBtn, followMode && styles.followModeBtnActive]}
                onPress={toggleFollowMode}
              >
                <Ionicons
                  name={followMode ? 'navigate' : 'navigate-outline'}
                  size={16}
                  color={followMode ? '#fff' : COLORS.primary}
                />
                <Text style={[styles.followModeBtnText, followMode && { color: '#fff' }]}>
                  {followMode ? 'Following' : 'Follow Me'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Navigation Panel */}
          {navigationMode && (
            <View style={styles.navigationPanel}>
              <View style={styles.navPanelHeader}>
                <View style={styles.navPanelTitleRow}>
                  <Ionicons name="navigate" size={20} color={COLORS.primary} />
                  <Text style={styles.navPanelTitle}>Navigation</Text>
                </View>
                <TouchableOpacity onPress={handleClearNavigation} style={styles.navCloseBtn}>
                  <Ionicons name="close-circle" size={24} color={COLORS.textLight} />
                </TouchableOpacity>
              </View>

              {/* Vehicle Type Selector */}
              <View style={styles.vehicleTypeRow}>
                {VEHICLE_TYPES.map((vt) => {
                  const isActive = vehicleType === vt.id;
                  return (
                    <TouchableOpacity
                      key={vt.id}
                      style={[styles.vehicleTypeBtn, isActive && styles.vehicleTypeBtnActive]}
                      onPress={() => {
                        setVehicleType(vt.id);
                        // Re-route with new vehicle type if we have enough waypoints
                        if (waypoints.length >= 2) {
                          mapRef.current?.showRoute(waypoints, vt.id);
                        }
                      }}
                    >
                      <Ionicons
                        name={vt.icon}
                        size={18}
                        color={isActive ? '#fff' : COLORS.textSecondary}
                      />
                      <Text style={[styles.vehicleTypeName, isActive && styles.vehicleTypeNameActive]}>
                        {vt.name}
                      </Text>
                      {isActive && (
                        <Text style={styles.vehicleTypeDesc}>{vt.description}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Waypoints List */}
              <View style={styles.waypointsList}>
                {waypoints.map((wp, idx) => {
                  const dotColor = WAYPOINT_COLORS[idx % WAYPOINT_COLORS.length];
                  return (
                    <View key={idx} style={styles.waypointRow}>
                      <View style={styles.waypointDotCol}>
                        <View style={[styles.waypointDot, { backgroundColor: dotColor }]}>
                          <Text style={styles.waypointDotText}>
                            {idx + 1}
                          </Text>
                        </View>
                        {idx < waypoints.length - 1 && <View style={styles.waypointLine} />}
                      </View>
                      <View style={styles.waypointInfo}>
                        <Text style={styles.waypointLabel} numberOfLines={1}>{wp.label}</Text>
                        <Text style={styles.waypointCoord}>
                          {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRemoveWaypoint(idx)}
                        style={styles.waypointRemoveBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              {/* Add Waypoint Button */}
              <View style={styles.navActions}>
                <TouchableOpacity
                  style={styles.addWaypointBtn}
                  onPress={handleAddWaypoint}
                >
                  <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.addWaypointText}>Tap Map</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addWaypointFromPinBtn}
                  onPress={() => {
                    Alert.alert(
                      'Add from Pin',
                      'Select a harvest pin from the list below to add as a waypoint.',
                    );
                  }}
                >
                  <Ionicons name="location-outline" size={18} color={COLORS.info} />
                  <Text style={[styles.addWaypointText, { color: COLORS.info }]}>From Pin</Text>
                </TouchableOpacity>
              </View>

              {/* Waypoint Search */}
              <View style={styles.waypointSearchContainer}>
                <View style={styles.searchInputRow}>
                  <Ionicons name="search" size={16} color={COLORS.textSecondary} style={{ marginLeft: 8, marginRight: 6 }} />
                  <TextInput
                    style={styles.waypointSearchInput}
                    placeholder="Search location to add as waypoint..."
                    placeholderTextColor={COLORS.textLight}
                    value={waypointSearchQuery}
                    onChangeText={handleWaypointSearchChange}
                    returnKeyType="search"
                    onSubmitEditing={() => searchWaypointLocation(waypointSearchQuery)}
                  />
                  {isWaypointSearching && (
                    <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 8 }} />
                  )}
                  {waypointSearchQuery.length > 0 && !isWaypointSearching && (
                    <TouchableOpacity onPress={clearWaypointSearch} style={{ padding: 6 }}>
                      <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
                    </TouchableOpacity>
                  )}
                </View>
                {showWaypointSearchResults && waypointSearchResults.length > 0 && (
                  <View style={styles.waypointSearchResultsList}>
                    {waypointSearchResults.map((result, index) => {
                      const parts = result.display_name?.split(',') || [];
                      const primary = parts.slice(0, 2).join(',').trim();
                      const secondary = parts.slice(2, 4).join(',').trim();
                      return (
                        <TouchableOpacity
                          key={result.place_id || index}
                          style={[
                            styles.waypointSearchResultItem,
                            index < waypointSearchResults.length - 1 && { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
                          ]}
                          onPress={() => handleSelectWaypointSearchResult(result)}
                        >
                          <Ionicons name="navigate-outline" size={16} color={COLORS.primary} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.searchResultPrimary} numberOfLines={1}>{primary}</Text>
                            {secondary ? (
                              <Text style={styles.searchResultSecondary} numberOfLines={1}>{secondary}</Text>
                            ) : null}
                          </View>
                          <Ionicons name="add-circle" size={20} color={COLORS.primary} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Route Info */}
              {routeInfo && (
                <View style={styles.routeInfoBar}>
                  <View style={styles.routeInfoItem}>
                    <Ionicons
                      name={vehicleType === 'driving' ? 'car' : vehicleType === 'cycling' ? 'bicycle' : 'walk'}
                      size={16}
                      color={COLORS.primary}
                    />
                    <Text style={styles.routeInfoValue}>
                      {vehicleType === 'driving' ? 'Car' : vehicleType === 'cycling' ? 'Motorcycle' : 'Walking'}
                    </Text>
                  </View>
                  <View style={styles.routeInfoDivider} />
                  <View style={styles.routeInfoItem}>
                    <Ionicons name="speedometer-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.routeInfoValue}>{routeInfo.distance} km</Text>
                  </View>
                  <View style={styles.routeInfoDivider} />
                  <View style={styles.routeInfoItem}>
                    <Ionicons name="time-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.routeInfoValue}>{routeInfo.duration}</Text>
                  </View>
                  <View style={styles.routeInfoDivider} />
                  <View style={styles.routeInfoItem}>
                    <Ionicons name="flag-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.routeInfoValue}>{routeInfo.waypoints} pts</Text>
                  </View>
                </View>
              )}

              {/* Start / Stop Turn-by-Turn Navigation */}
              {routeInfo && navInstructions.length > 0 && (
                <TouchableOpacity
                  style={[styles.startNavBtn, turnByTurnActive && styles.startNavBtnActive]}
                  onPress={turnByTurnActive ? handleStopTurnByTurn : handleStartTurnByTurn}
                >
                  <Ionicons
                    name={turnByTurnActive ? 'stop-circle' : 'navigate-circle'}
                    size={22}
                    color={turnByTurnActive ? '#fff' : COLORS.primary}
                  />
                  <Text style={[styles.startNavBtnText, turnByTurnActive && { color: '#fff' }]}>
                    {turnByTurnActive ? 'Stop Navigation' : 'Start Navigation'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Turn-by-Turn Instruction Card */}
              {turnByTurnActive && currentStepInfo && (
                <View style={styles.turnByTurnCard}>
                  <View style={styles.turnByTurnHeader}>
                    <View style={styles.turnByTurnIconWrap}>
                      <Ionicons
                        name={getTurnIcon(currentStepInfo.type, currentStepInfo.modifier)}
                        size={26}
                        color="#fff"
                      />
                    </View>
                    <View style={styles.turnByTurnTextWrap}>
                      <Text style={styles.turnByTurnInstruction} numberOfLines={2}>
                        {currentStepInfo.instruction || 'Continue'}
                      </Text>
                      {currentStepInfo.road ? (
                        <Text style={styles.turnByTurnRoad} numberOfLines={1}>
                          {currentStepInfo.road}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.turnByTurnDistWrap}>
                      <Text style={styles.turnByTurnDist}>
                        {formatStepDistance(distanceToNextStep)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.turnByTurnProgress}>
                    <Text style={styles.turnByTurnProgressText}>
                      Step {currentStepIndex + 1} of {navInstructions.length}
                    </Text>
                    <View style={styles.turnByTurnProgressBar}>
                      <View style={[
                        styles.turnByTurnProgressFill,
                        { width: `${((currentStepIndex + 1) / navInstructions.length) * 100}%` }
                      ]} />
                    </View>
                  </View>
                </View>
              )}

              {/* Live Tracking Toggle inside Navigation */}
              <TouchableOpacity
                style={[styles.navTrackingBtn, liveTracking && styles.navTrackingBtnActive]}
                onPress={toggleLiveTracking}
              >
                <View style={styles.navTrackingBtnInner}>
                  {liveTracking && <View style={styles.trackingPulseDotSmall} />}
                  <Ionicons
                    name={liveTracking ? 'navigate' : 'navigate-outline'}
                    size={18}
                    color={liveTracking ? '#fff' : COLORS.primary}
                  />
                  <Text style={[styles.navTrackingBtnText, liveTracking && { color: '#fff' }]}>
                    {liveTracking ? 'Tracking On' : 'Start Tracking'}
                  </Text>
                </View>
                {liveTracking && (
                  <TouchableOpacity
                    style={[styles.followModeSmallBtn, followMode && styles.followModeSmallBtnActive]}
                    onPress={toggleFollowMode}
                  >
                    <Ionicons name={followMode ? 'navigate' : 'navigate-outline'} size={14} color={followMode ? '#fff' : COLORS.primary} />
                    <Text style={[styles.followModeSmallText, followMode && { color: '#fff' }]}>
                      {followMode ? 'Following' : 'Follow'}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {liveTracking && userAccuracy != null && (
                <Text style={styles.navTrackingInfo}>
                  GPS accuracy: ~{Math.round(userAccuracy)}m  |  {userLocation ? `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}` : '...'}
                </Text>
              )}

              {addingWaypoint && (
                <View style={[styles.pinModeBanner, { marginTop: 8 }]}>
                  <Ionicons name="hand-left" size={16} color={COLORS.info} />
                  <Text style={styles.pinModeBannerText}>
                    Tap on the map to add a waypoint
                  </Text>
                  <TouchableOpacity onPress={() => setAddingWaypoint(false)}>
                    <Text style={{ color: COLORS.danger, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <View style={[styles.mapContainer, { height: dynamicStyles.mapHeight }]}>
            <WebMap
              ref={mapRef}
              initialRegion={mapRegion}
              pins={filteredPins}
              userLocation={userLocation}
              onMapTap={handleMapTap}
              onLongPress={handleLongPress}
              onPinTap={handlePinTap}
              onMapReady={handleMapReady}
              onRouteInfo={handleRouteInfo}
              onRouteError={handleRouteError}
              onFollowModeChanged={handleFollowModeChanged}
              onTurnByTurnStarted={handleTurnByTurnStarted}
              onTurnByTurnStopped={handleTurnByTurnStopped}
              onNavStepChanged={handleNavStepChanged}
              onNavStepProgress={handleNavStepProgress}
              onNavArrived={handleNavArrived}
              style={{ height: dynamicStyles.mapHeight }}
            />
          </View>

          {/* OSM Attribution (already in Leaflet, but extra for compliance) */}
          <Text style={styles.attribution}>
            Map data © OpenStreetMap contributors
          </Text>

          {/* Legend */}
          <View style={styles.legend}>
            <Text style={styles.legendTitle}>Legend</Text>
            <View style={styles.legendRow}>
              {PIN_FILTERS.filter((f) => f.id !== 'all').map((f) => (
                <View key={f.id} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: f.color }]} />
                  <Text style={styles.legendText}>{f.name}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.legendNote}>Long-press the map to add a new harvest pin</Text>
          </View>
        </View>

        {/* Pin List */}
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>
            Harvest Locations ({filteredPins.length})
          </Text>
          {filteredPins.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="map-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No harvest pins yet</Text>
              <Text style={styles.emptySubtext}>
                {isAuthenticated
                  ? 'Long-press the map to add the first pin!'
                  : 'Log in to add harvest locations'}
              </Text>
            </View>
          ) : (
            filteredPins.map((pin) => {
              const meta = {
                farm: { icon: 'leaf', color: '#4CAF50' },
                blooming_area: { icon: 'flower', color: '#E91E63' },
                market: { icon: 'storefront', color: '#FF9800' },
                other: { icon: 'location', color: '#2196F3' },
              }[pin.pin_type] || { icon: 'location', color: '#2196F3' };

              return (
                <TouchableOpacity
                  key={pin._id}
                  style={styles.pinCard}
                  onPress={() => {
                    setSelectedPin(pin);
                    setPinDetailModalVisible(true);
                    mapRef.current?.flyTo(pin.latitude, pin.longitude, 14);
                  }}
                >
                  <View style={[styles.pinCardIcon, { backgroundColor: meta.color + '15' }]}>
                    <Ionicons name={meta.icon} size={22} color={meta.color} />
                  </View>
                  <View style={styles.pinCardContent}>
                    <Text style={styles.pinCardName} numberOfLines={1}>
                      {pin.place_name || 'Unnamed Location'}
                    </Text>
                    <Text style={styles.pinCardType}>
                      {(pin.pin_type || 'other').replace('_', ' ')}
                    </Text>
                    {pin.description ? (
                      <Text style={styles.pinCardDesc} numberOfLines={2}>
                        {pin.description}
                      </Text>
                    ) : null}
                  </View>
                  {navigationMode ? (
                    <TouchableOpacity
                      style={styles.addToRouteBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleAddWaypointFromPin(pin);
                      }}
                    >
                      <Ionicons name="add-circle" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color={COLORS.primary} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>About the Harvest Map</Text>
            <Text style={styles.infoText}>
              This interactive map displays Bignay harvest locations shared by the community.
              Long-press or use the "Add Pin" button to mark farms, blooming areas, and markets.
              Map data is provided by OpenStreetMap — free and open-source.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Floating Add Button (mobile) */}
      {isMobile && isAuthenticated && !pinMode && (
        <TouchableOpacity
          style={styles.fab}
          onPress={togglePinMode}
        >
          <Ionicons name="add" size={28} color={COLORS.buttonText} />
        </TouchableOpacity>
      )}

      {/* Modals */}
      <AddPinModal
        visible={addPinModalVisible}
        onClose={() => {
          setAddPinModalVisible(false);
          setEditingPin(null);
          setSearchedPlaceName('');
        }}
        onSubmit={editingPin ? handleUpdatePin : handleCreatePin}
        coordinate={newPinCoordinate}
        initialData={editingPin}
        defaultPlaceName={searchedPlaceName}
        loading={saving}
      />

      <PinDetailModal
        visible={pinDetailModalVisible}
        onClose={() => {
          setPinDetailModalVisible(false);
          setSelectedPin(null);
        }}
        pin={selectedPin}
        currentUserId={user?._id || user?.id}
        onEdit={handleEditPin}
        onDelete={handleDeletePin}
        onNavigate={handleNavigateToPin}
      />

      {/* Fullscreen Map Modal */}
      <Modal
        visible={isMapFullscreen}
        animationType="slide"
        statusBarTranslucent
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setIsMapFullscreen(false)}
      >
        <View style={styles.fullscreenContainer}>
          <WebMap
            ref={fullscreenMapRef}
            initialRegion={mapRegion}
            pins={filteredPins}
            userLocation={userLocation}
            onMapTap={handleMapTap}
            onLongPress={handleLongPress}
            onPinTap={handlePinTap}
            onMapReady={() => {
              // Re-apply route once fullscreen map is ready
              if (waypoints.length >= 2) {
                setTimeout(() => {
                  fullscreenMapRef.current?.showRoute(waypoints, vehicleType);
                }, 300);
              }
              // Re-apply live tracking on fullscreen map
              if (liveTracking && userLocation) {
                setTimeout(() => {
                  fullscreenMapRef.current?.updateUserLocation(
                    userLocation.latitude, userLocation.longitude, userHeading, userAccuracy
                  );
                  fullscreenMapRef.current?.setFollowMode(followMode);
                }, 400);
              }
            }}
            onRouteInfo={handleRouteInfo}
            onRouteError={handleRouteError}
            onFollowModeChanged={handleFollowModeChanged}
            onTurnByTurnStarted={handleTurnByTurnStarted}
            onTurnByTurnStopped={handleTurnByTurnStopped}
            onNavStepChanged={handleNavStepChanged}
            onNavStepProgress={handleNavStepProgress}
            onNavArrived={handleNavArrived}
            style={{ flex: 1 }}
          />
          {/* Exit Fullscreen Button */}
          <TouchableOpacity
            style={styles.fullscreenExitBtn}
            onPress={() => setIsMapFullscreen(false)}
          >
            <Ionicons name="close" size={24} color={COLORS.buttonText} />
          </TouchableOpacity>
          {/* Fullscreen Locate Me */}
          <TouchableOpacity
            style={styles.fullscreenLocateBtn}
            onPress={handleLocateMe}
          >
            <Ionicons name="locate" size={22} color={COLORS.buttonText} />
          </TouchableOpacity>
          {/* Fullscreen Live Tracking */}
          <TouchableOpacity
            style={[styles.fullscreenTrackingBtn, liveTracking && { backgroundColor: COLORS.primary }]}
            onPress={toggleLiveTracking}
          >
            <Ionicons name={liveTracking ? 'navigate' : 'navigate-outline'} size={22} color={COLORS.buttonText} />
          </TouchableOpacity>
          {/* Fullscreen Follow Mode (shown only when tracking) */}
          {liveTracking && (
            <TouchableOpacity
              style={[styles.fullscreenFollowBtn, followMode && { backgroundColor: COLORS.primary }]}
              onPress={toggleFollowMode}
            >
              <Ionicons name={followMode ? 'compass' : 'compass-outline'} size={22} color={COLORS.buttonText} />
            </TouchableOpacity>
          )}
          {/* Fullscreen Turn-by-Turn Instruction Card */}
          {turnByTurnActive && currentStepInfo && (
            <View style={styles.fullscreenTurnByTurnCard}>
              <View style={styles.turnByTurnHeader}>
                <View style={styles.turnByTurnIconWrap}>
                  <Ionicons
                    name={getTurnIcon(currentStepInfo.type, currentStepInfo.modifier)}
                    size={26}
                    color="#fff"
                  />
                </View>
                <View style={styles.turnByTurnTextWrap}>
                  <Text style={styles.turnByTurnInstruction} numberOfLines={2}>
                    {currentStepInfo.instruction || 'Continue'}
                  </Text>
                  {currentStepInfo.road ? (
                    <Text style={styles.turnByTurnRoad} numberOfLines={1}>
                      {currentStepInfo.road}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.turnByTurnDistWrap}>
                  <Text style={styles.turnByTurnDist}>
                    {formatStepDistance(distanceToNextStep)}
                  </Text>
                </View>
              </View>
              <View style={styles.turnByTurnProgress}>
                <Text style={[styles.turnByTurnProgressText, { color: 'rgba(255,255,255,0.7)' }]}>
                  Step {currentStepIndex + 1} of {navInstructions.length}
                </Text>
                <View style={[styles.turnByTurnProgressBar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <View style={[
                    styles.turnByTurnProgressFill,
                    { width: `${((currentStepIndex + 1) / navInstructions.length) * 100}%`, backgroundColor: '#4CAF50' }
                  ]} />
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: 12,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.surface,
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },

  // Filters
  filterSection: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  filterTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: 6,
  },
  filterChipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // Map
  mapSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  mapActions: {
    flexDirection: 'row',
    gap: 8,
  },
  mapActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  mapActionBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  mapActionText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.primary,
  },

  // Location Search
  searchContainer: {
    marginBottom: 10,
    zIndex: 10,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 4,
    height: 44,
  },
  searchIcon: {
    marginLeft: 10,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 8,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  searchClearBtn: {
    padding: 8,
  },
  searchResultsList: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
    maxHeight: 240,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchResultBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  searchResultSecondary: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  pinModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.linkBg,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    gap: 8,
  },
  pinModeBannerText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.info,
  },
  mapContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.surface,
  },
  attribution: {
    fontSize: 10,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 6,
  },

  // Legend
  legend: {
    marginTop: 10,
    padding: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  legendNote: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Pin List
  listSection: {
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 8,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 4,
    textAlign: 'center',
  },
  pinCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    gap: 12,
  },
  pinCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinCardContent: {
    flex: 1,
  },
  pinCardName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  pinCardType: {
    fontSize: 12,
    color: COLORS.textLight,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  pinCardDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },

  // Info Card
  infoCard: {
    flexDirection: 'row',
    margin: 16,
    marginTop: 12,
    padding: 16,
    backgroundColor: COLORS.primaryLight + '15',
    borderRadius: 16,
    gap: 14,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },

  // Navigation Panel
  navigationPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  navPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navPanelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navPanelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  navCloseBtn: {
    padding: 2,
  },
  waypointsList: {
    marginBottom: 10,
  },
  waypointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  waypointDotCol: {
    alignItems: 'center',
    width: 28,
    marginRight: 10,
  },
  waypointDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointDotText: {
    color: COLORS.surface,
    fontSize: 11,
    fontWeight: 'bold',
  },
  waypointLine: {
    width: 2,
    height: 20,
    backgroundColor: COLORS.border,
    marginVertical: 2,
  },
  waypointInfo: {
    flex: 1,
    paddingVertical: 2,
  },
  waypointLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  waypointCoord: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 1,
  },
  waypointRemoveBtn: {
    padding: 6,
  },
  navActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  addWaypointBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    gap: 6,
  },
  addWaypointFromPinBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.info,
    borderStyle: 'dashed',
    gap: 6,
  },
  addWaypointText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  routeInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary + '10',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  routeInfoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  routeInfoDivider: {
    width: 1,
    height: 18,
    backgroundColor: COLORS.border,
  },
  addToRouteBtn: {
    padding: 6,
  },
  waypointSearchContainer: {
    marginTop: 8,
    zIndex: 10,
  },
  waypointSearchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    paddingVertical: 6,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  waypointSearchResultsList: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
    maxHeight: 200,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  waypointSearchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },

  // Vehicle Type Selector
  vehicleTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  vehicleTypeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: 4,
  },
  vehicleTypeBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  vehicleTypeName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  vehicleTypeNameActive: {
    color: COLORS.surface,
  },
  vehicleTypeDesc: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },

  // Fullscreen Modal
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenExitBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 5,
  },
  fullscreenLocateBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 16,
    right: 70,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 5,
  },
  fullscreenRouteInfo: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 12,
    zIndex: 10,
  },
  fullscreenRouteText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.surface,
  },
  fullscreenTrackingBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 16,
    right: 124,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 5,
  },
  fullscreenFollowBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 16,
    right: 178,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 5,
  },

  // Live Tracking Panel
  trackingPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1976D2' + '40',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  trackingPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trackingPanelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackingPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1976D2',
  },
  trackingPulseDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  trackingPanelTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1976D2',
  },
  trackingInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trackingCoordText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  trackingAccuracyText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  followModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    gap: 6,
  },
  followModeBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  followModeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  navTrackingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    marginTop: 8,
  },
  navTrackingBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  navTrackingBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navTrackingBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  followModeSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: 4,
  },
  followModeSmallBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  followModeSmallText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  navTrackingInfo: {
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Start Navigation Button
  startNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
    marginTop: 10,
    gap: 8,
  },
  startNavBtnActive: {
    backgroundColor: '#D32F2F',
    borderColor: '#D32F2F',
  },
  startNavBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Turn-by-Turn Instruction Card
  turnByTurnCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  turnByTurnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  turnByTurnIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  turnByTurnTextWrap: {
    flex: 1,
  },
  turnByTurnInstruction: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 20,
  },
  turnByTurnRoad: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 3,
  },
  turnByTurnDistWrap: {
    minWidth: 65,
    alignItems: 'flex-end',
  },
  turnByTurnDist: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  turnByTurnProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  turnByTurnProgressText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    minWidth: 75,
  },
  turnByTurnProgressBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  turnByTurnProgressFill: {
    height: '100%',
    backgroundColor: '#FFEB3B',
    borderRadius: 2,
  },

  // Fullscreen Turn-by-Turn Card
  fullscreenTurnByTurnCard: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 70,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(46,125,50,0.92)',
    borderRadius: 14,
    padding: 14,
    zIndex: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
});
