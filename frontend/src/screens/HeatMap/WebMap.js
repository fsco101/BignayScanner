/**
 * WebMap Component
 * Renders an OpenStreetMap (Leaflet) map inside a WebView for Expo Go / native platforms.
 * Also works on web using an iframe / dangerouslySetInnerHTML approach.
 *
 * This avoids the need for react-native-maps (which requires native builds)
 * and works seamlessly on Expo Go, Android, iOS, and Web.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

// Build the Leaflet HTML content
const buildLeafletHTML = (initialRegion, pins, userLocation) => {
  const center = initialRegion
    ? `[${initialRegion.latitude}, ${initialRegion.longitude}]`
    : '[14.5, 121.0]';
  const zoom = initialRegion?.zoom || 8;

  const pinTypeColors = {
    farm: '#4CAF50',
    blooming_area: '#E91E63',
    market: '#FF9800',
    other: '#2196F3',
  };

  const pinTypeIcons = {
    farm: '🌿',
    blooming_area: '🌸',
    market: '🏪',
    other: '📍',
  };

  const markersJS = (pins || [])
    .map(
      (pin) => `
      (function() {
        var color = ${JSON.stringify(pinTypeColors)}['${pin.pin_type}'] || '#2196F3';
        var icon = ${JSON.stringify(pinTypeIcons)}['${pin.pin_type}'] || '📍';
        var placeName = ${JSON.stringify(pin.place_name || 'Harvest Pin')};
        var marker = L.marker([${pin.latitude}, ${pin.longitude}], {
          icon: L.divIcon({
            html: '<div style="display:flex;flex-direction:column;align-items:center;"><div style="background:' + color + ';width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">' + icon + '</div><div style="background:rgba(255,255,255,0.92);color:#333;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;margin-top:2px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 3px rgba(0,0,0,0.15);text-align:center;font-family:sans-serif;">' + placeName + '</div></div>',
            iconSize: [32, 48],
            iconAnchor: [16, 16],
            className: 'custom-marker'
          })
        }).addTo(map);
        marker.bindTooltip(placeName, { permanent: false, direction: 'top', offset: [0, -20] });
        var popupContent = '<div style="min-width:180px;font-family:sans-serif;">';
        popupContent += '<strong style="font-size:14px;">${pin.place_name || 'Harvest Pin'}</strong><br/>';
        popupContent += '<span style="color:#666;font-size:12px;text-transform:capitalize;">${pin.pin_type ? pin.pin_type.replace('_', ' ') : ''}</span><br/>';
        ${pin.description ? `popupContent += '<p style="font-size:12px;margin:6px 0;">${pin.description.replace(/'/g, "\\'")}</p>';` : ''}
        ${pin.contact_person ? `popupContent += '<span style="font-size:11px;color:#888;">Contact: ${pin.contact_person.replace(/'/g, "\\'")}</span><br/>';` : ''}
        ${pin.contact_details ? `popupContent += '<span style="font-size:11px;color:#888;">${pin.contact_details.replace(/'/g, "\\'")}</span><br/>';` : ''}
        popupContent += '<span style="font-size:10px;color:#aaa;">${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}</span>';
        popupContent += '</div>';
        marker.bindPopup(popupContent);
        marker.pinData = ${JSON.stringify(JSON.stringify(pin))};
        marker.on('click', function() {
          sendToParent(JSON.stringify({type:'pinTap', pin: ${JSON.stringify(JSON.stringify(pin))}}));
        });
      })();
    `
    )
    .join('\n');

  const userMarkerJS = userLocation
    ? `
    L.marker([${userLocation.latitude}, ${userLocation.longitude}], {
      icon: L.divIcon({
        html: '<div style="background:#1976D2;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        className: 'user-marker'
      })
    }).addTo(map).bindPopup('<strong>You are here</strong>');
  `
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css" />
  <script src="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map-container { width: 100%; height: 100%; overflow: hidden; position: relative; }
    #map { width: 100%; height: 100%; transform-origin: center center; }
    #map.nav-rotating {
      position: absolute; width: 142%; height: 142%; top: -21%; left: -21%;
    }
    .custom-marker { background: none !important; border: none !important; }
    .user-marker { background: none !important; border: none !important; }
    .leaflet-control-attribution { font-size: 10px !important; }
    .crosshair { 
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 1000; pointer-events: none; font-size: 24px; opacity: 0;
      transition: opacity 0.2s;
    }
    .crosshair.visible { opacity: 0.6; }
    .leaflet-routing-container { display: none !important; }
    /* Live position tracking marker */
    .live-marker { background: none !important; border: none !important; }
    .live-pos-wrapper { position: relative; width: 40px; height: 40px; }
    .live-pos-heading {
      position: absolute; top: 0; left: 0; width: 40px; height: 40px;
      clip-path: polygon(50% 0%, 20% 50%, 50% 40%, 80% 50%);
      background: rgba(25,118,210,0.35); transition: transform 0.3s ease;
    }
    .live-pos-dot {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 16px; height: 16px; border-radius: 50%;
      background: #1976D2; border: 3px solid white;
      box-shadow: 0 0 8px rgba(25,118,210,0.6);
    }
    .live-pos-pulse {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 16px; height: 16px; border-radius: 50%;
      background: rgba(25,118,210,0.3);
      animation: livePulse 2s ease-out infinite;
    }
    .live-accuracy-circle {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      border-radius: 50%; background: rgba(25,118,210,0.08);
      border: 1px solid rgba(25,118,210,0.2);
    }
    @keyframes livePulse {
      0% { width: 16px; height: 16px; opacity: 1; }
      100% { width: 48px; height: 48px; opacity: 0; }
    }
    .route-info-overlay {
      position: absolute; bottom: 10px; left: 10px; right: 10px; z-index: 1000;
      background: rgba(255,255,255,0.95); border-radius: 12px; padding: 12px 16px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.15); font-family: sans-serif;
    }
    .route-info-overlay .route-summary { display: flex; align-items: center; gap: 12px; }
    .route-info-overlay .route-stat { text-align: center; }
    .route-info-overlay .route-stat .value { font-size: 18px; font-weight: bold; color: #2E7D32; }
    .route-info-overlay .route-stat .label { font-size: 11px; color: #666; }
    .waypoint-marker { background: none !important; border: none !important; }
    /* Turn-by-turn navigation overlay */
    .nav-instruction-overlay {
      position: absolute; top: 10px; left: 10px; right: 10px; z-index: 1000;
      background: rgba(46,125,50,0.95); border-radius: 14px; padding: 14px 16px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25); font-family: sans-serif; color: white;
      display: none;
    }
    .nav-instruction-overlay .nav-inst-main {
      display: flex; align-items: center; gap: 12px;
    }
    .nav-instruction-overlay .nav-inst-icon {
      font-size: 28px; min-width: 36px; text-align: center;
    }
    .nav-instruction-overlay .nav-inst-text {
      flex: 1; font-size: 15px; font-weight: 600; line-height: 1.3;
    }
    .nav-instruction-overlay .nav-inst-dist {
      font-size: 20px; font-weight: bold; min-width: 70px; text-align: right;
    }
    .nav-instruction-overlay .nav-inst-road {
      font-size: 12px; color: rgba(255,255,255,0.8); margin-top: 6px; padding-left: 48px;
    }
    .nav-step-highlight { background: none !important; border: none !important; }
  </style>
</head>
<body>
  <div id="map-container">
    <div id="map"></div>
  </div>
  <div class="crosshair" id="crosshair">➕</div>
  <script>
    // Universal message sender — works in both native WebView and web iframe
    function sendToParent(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(msg);
      } else {
        try { if (window.parent !== window) window.parent.postMessage(msg, '*'); } catch(e) {}
      }
    }

    var map = L.map('map', {
      center: ${center},
      zoom: ${zoom},
      zoomControl: true,
      attributionControl: true,
    });

    // OpenStreetMap tiles (free, no API key needed)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Existing pins/markers
    ${markersJS}

    // User location
    ${userMarkerJS}

    // Long press (contextmenu) to create new pin
    var longPressTimer = null;
    var longPressCoord = null;

    map.on('mousedown', function(e) {
      longPressCoord = e.latlng;
      longPressTimer = setTimeout(function() {
        if (longPressCoord) {
          sendToParent(JSON.stringify({
            type: 'longPress',
            latitude: longPressCoord.lat,
            longitude: longPressCoord.lng
          }));
        }
      }, 600);
    });

    map.on('mouseup', function() { clearTimeout(longPressTimer); longPressCoord = null; });
    map.on('mousemove', function() { clearTimeout(longPressTimer); longPressCoord = null; });

    // Touch events for mobile long press
    map.on('touchstart', function(e) {
      if (e.originalEvent.touches.length === 1) {
        var touch = e.originalEvent.touches[0];
        longPressCoord = map.containerPointToLatLng(L.point(touch.clientX, touch.clientY));
        longPressTimer = setTimeout(function() {
          if (longPressCoord) {
            sendToParent(JSON.stringify({
              type: 'longPress',
              latitude: longPressCoord.lat,
              longitude: longPressCoord.lng
            }));
          }
        }, 600);
      }
    });
    map.on('touchend', function() { clearTimeout(longPressTimer); longPressCoord = null; });
    map.on('touchmove', function() { clearTimeout(longPressTimer); longPressCoord = null; });

    // Tap (click) support to drop pin
    map.on('click', function(e) {
      sendToParent(JSON.stringify({
        type: 'mapTap',
        latitude: e.latlng.lat,
        longitude: e.latlng.lng
      }));
    });

    // Enable pin mode toggle from RN
    var pinMode = false;
    var crosshairEl = document.getElementById('crosshair');
    window.setPinMode = function(enabled) {
      pinMode = enabled;
      crosshairEl.className = 'crosshair' + (enabled ? ' visible' : '');
    };

    // ========== LIVE POSITION TRACKING ==========
    var liveMarker = null;
    var liveAccuracyCircle = null;
    var followMode = false;
    var lastHeading = 0;

    window.updateUserLocation = function(lat, lng, heading, accuracy) {
      var latLng = L.latLng(lat, lng);
      lastHeading = (heading !== null && heading !== undefined && !isNaN(heading)) ? heading : lastHeading;

      if (!liveMarker) {
        // Create the live position marker
        liveMarker = L.marker(latLng, {
          icon: L.divIcon({
            html: '<div class="live-pos-wrapper">' +
              '<div class="live-pos-heading" id="live-heading" style="transform: rotate(' + lastHeading + 'deg);"></div>' +
              '<div class="live-pos-pulse"></div>' +
              '<div class="live-pos-dot"></div>' +
              '</div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            className: 'live-marker'
          }),
          zIndexOffset: 1000,
          interactive: false
        }).addTo(map);

        // Create accuracy circle
        var radius = Math.min(accuracy || 30, 200);
        liveAccuracyCircle = L.circle(latLng, {
          radius: radius,
          color: 'rgba(25,118,210,0.3)',
          fillColor: 'rgba(25,118,210,0.08)',
          fillOpacity: 1,
          weight: 1,
          interactive: false
        }).addTo(map);
      } else {
        // Smoothly update position
        liveMarker.setLatLng(latLng);
        if (liveAccuracyCircle) {
          liveAccuracyCircle.setLatLng(latLng);
          var radius = Math.min(accuracy || 30, 200);
          liveAccuracyCircle.setRadius(radius);
        }
        // Update heading arrow
        var headingEl = document.getElementById('live-heading');
        if (headingEl) {
          headingEl.style.transform = 'rotate(' + lastHeading + 'deg)';
        }
      }

      // Follow mode: keep map centered on user
      if (followMode) {
        map.panTo(latLng, { animate: true, duration: 0.5 });
      }
    };

    window.setFollowMode = function(enabled) {
      followMode = !!enabled;
    };

    window.clearLiveTracking = function() {
      if (liveMarker) {
        map.removeLayer(liveMarker);
        liveMarker = null;
      }
      if (liveAccuracyCircle) {
        map.removeLayer(liveAccuracyCircle);
        liveAccuracyCircle = null;
      }
      followMode = false;
    };

    // When user manually drags the map, disable follow mode
    map.on('dragstart', function() {
      if (followMode) {
        followMode = false;
        sendToParent(JSON.stringify({ type: 'followModeChanged', enabled: false }));
      }
    });

    // ========== TURN-BY-TURN NAVIGATION ==========
    var turnByTurnActive = false;
    var navInstructions = [];
    var currentStepIndex = 0;
    var routeCoordinates = []; // full route polyline coords
    var stepHighlightLayer = null;
    var navInstructionEl = null;

    // Map OSRM modifier/type to turn icons
    function getTurnIcon(type, modifier) {
      if (type === 'depart') return '🚀';
      if (type === 'arrive') return '🏁';
      if (type === 'roundabout' || type === 'rotary') return '🔄';
      if (type === 'fork') return modifier === 'left' ? '↙️' : '↗️';
      if (type === 'merge') return '↗️';
      if (type === 'end of road') return modifier === 'left' ? '⬅️' : '➡️';
      if (modifier === 'left') return '⬅️';
      if (modifier === 'right') return '➡️';
      if (modifier === 'slight left') return '↖️';
      if (modifier === 'slight right') return '↗️';
      if (modifier === 'sharp left') return '↩️';
      if (modifier === 'sharp right') return '↪️';
      if (modifier === 'uturn') return '🔃';
      if (modifier === 'straight' || type === 'continue') return '⬆️';
      return '⬆️';
    }

    function formatStepDistance(meters) {
      if (meters < 1000) return Math.round(meters) + ' m';
      return (meters / 1000).toFixed(1) + ' km';
    }

    function showNavInstruction(step) {
      if (!navInstructionEl) {
        navInstructionEl = document.createElement('div');
        navInstructionEl.className = 'nav-instruction-overlay';
        document.body.appendChild(navInstructionEl);
      }
      var icon = getTurnIcon(step.type, step.modifier);
      var dist = formatStepDistance(step.distance);
      navInstructionEl.innerHTML =
        '<div class="nav-inst-main">' +
          '<div class="nav-inst-icon">' + icon + '</div>' +
          '<div class="nav-inst-text">' + (step.instruction || 'Continue') + '</div>' +
          '<div class="nav-inst-dist">' + dist + '</div>' +
        '</div>' +
        (step.road ? '<div class="nav-inst-road">' + step.road + '</div>' : '');
      navInstructionEl.style.display = 'block';
    }

    function hideNavInstruction() {
      if (navInstructionEl) navInstructionEl.style.display = 'none';
    }

    function highlightCurrentStep(step) {
      if (stepHighlightLayer) { map.removeLayer(stepHighlightLayer); stepHighlightLayer = null; }
      if (!step || !step.coords || step.coords.length < 2) return;
      stepHighlightLayer = L.polyline(step.coords, {
        color: '#FFEB3B', weight: 8, opacity: 0.8
      }).addTo(map);
    }

    window.startTurnByTurn = function() {
      if (navInstructions.length === 0) return;
      turnByTurnActive = true;
      currentStepIndex = 0;
      var step = navInstructions[0];
      showNavInstruction(step);
      highlightCurrentStep(step);
      // Enable follow mode, zoom in & start map rotation
      followMode = true;
      enableMapRotation();
      if (liveMarker) {
        var ll = liveMarker.getLatLng();
        map.setView(ll, 18, { animate: true });
      }
      sendToParent(JSON.stringify({ type: 'turnByTurnStarted', totalSteps: navInstructions.length }));
    };

    window.stopTurnByTurn = function() {
      turnByTurnActive = false;
      currentStepIndex = 0;
      navInstructions = [];
      routeCoordinates = [];
      hideNavInstruction();
      if (stepHighlightLayer) { map.removeLayer(stepHighlightLayer); stepHighlightLayer = null; }
      disableMapRotation();
      sendToParent(JSON.stringify({ type: 'turnByTurnStopped' }));
    };

    // Called from updateUserLocation when turn-by-turn is active
    function checkStepAdvance(userLat, userLng) {
      if (!turnByTurnActive || navInstructions.length === 0) return;
      var step = navInstructions[currentStepIndex];
      if (!step) return;

      // Distance from user to step waypoint (end of step)
      var dLat = userLat - step.lat;
      var dLng = userLng - step.lng;
      var distMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111320;

      // Update distance remaining display
      if (navInstructionEl) {
        var distEl = navInstructionEl.querySelector('.nav-inst-dist');
        if (distEl) distEl.textContent = formatStepDistance(Math.max(0, distMeters));
      }

      // Send progress to RN
      sendToParent(JSON.stringify({
        type: 'navStepProgress',
        stepIndex: currentStepIndex,
        distanceToStep: Math.round(distMeters),
        totalSteps: navInstructions.length
      }));

      // Advance if within threshold
      var threshold = 30; // meters
      if (distMeters < threshold) {
        currentStepIndex++;
        if (currentStepIndex >= navInstructions.length) {
          // Arrived!
          hideNavInstruction();
          if (stepHighlightLayer) { map.removeLayer(stepHighlightLayer); stepHighlightLayer = null; }
          turnByTurnActive = false;
          sendToParent(JSON.stringify({ type: 'navArrived' }));
          return;
        }
        var nextStep = navInstructions[currentStepIndex];
        showNavInstruction(nextStep);
        highlightCurrentStep(nextStep);
        sendToParent(JSON.stringify({
          type: 'navStepChanged',
          stepIndex: currentStepIndex,
          instruction: nextStep.instruction,
          distance: nextStep.distance,
          road: nextStep.road || '',
          type_: nextStep.type,
          modifier: nextStep.modifier || ''
        }));
      }
    }

    // ========== MAP ROTATION FOR NAVIGATION ==========
    var isNavRotating = false;
    var targetBearing = 0;
    var currentVisualBearing = 0;
    var bearingAnimFrame = null;

    function normalizeAngle(a) { return ((a % 360) + 360) % 360; }

    function shortestAngleDiff(from, to) {
      var diff = normalizeAngle(to) - normalizeAngle(from);
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      return diff;
    }

    function applyBearingTransform(bearing) {
      var mapEl = document.getElementById('map');
      if (mapEl) mapEl.style.transform = 'rotate(' + (-bearing) + 'deg)';
      var ctrl = document.querySelector('.leaflet-control-container');
      if (ctrl) ctrl.style.transform = 'rotate(' + bearing + 'deg)';
    }

    function animateBearing() {
      var diff = shortestAngleDiff(currentVisualBearing, targetBearing);
      if (Math.abs(diff) < 0.3) {
        currentVisualBearing = targetBearing;
        applyBearingTransform(currentVisualBearing);
        bearingAnimFrame = null;
        return;
      }
      currentVisualBearing = normalizeAngle(currentVisualBearing + diff * 0.12);
      applyBearingTransform(currentVisualBearing);
      bearingAnimFrame = requestAnimationFrame(animateBearing);
    }

    function enableMapRotation() {
      isNavRotating = true;
      targetBearing = 0;
      currentVisualBearing = 0;
      var mapEl = document.getElementById('map');
      mapEl.classList.add('nav-rotating');
      setTimeout(function() { map.invalidateSize(); }, 200);
    }

    function disableMapRotation() {
      isNavRotating = false;
      if (bearingAnimFrame) { cancelAnimationFrame(bearingAnimFrame); bearingAnimFrame = null; }
      targetBearing = 0;
      currentVisualBearing = 0;
      var mapEl = document.getElementById('map');
      mapEl.classList.remove('nav-rotating');
      mapEl.style.transform = '';
      var ctrl = document.querySelector('.leaflet-control-container');
      if (ctrl) { ctrl.style.transform = ''; }
      setTimeout(function() { map.invalidateSize(); }, 200);
    }

    function updateMapBearing(heading) {
      if (!isNavRotating) return;
      targetBearing = heading;
      if (!bearingAnimFrame) animateBearing();
    }

    // Patch updateUserLocation to also check step advance and rotate map
    var _origUpdateUserLocation = window.updateUserLocation;
    window.updateUserLocation = function(lat, lng, heading, accuracy) {
      _origUpdateUserLocation(lat, lng, heading, accuracy);
      if (turnByTurnActive) {
        checkStepAdvance(lat, lng);
        // Rotate map to user's heading for heading-up navigation view
        if (heading !== null && heading !== undefined && !isNaN(heading)) {
          updateMapBearing(heading);
        }
      }
    };

    // ========== ROUTING / NAVIGATION ==========
    var routingControl = null;
    var waypointMarkers = [];
    var routeInfoEl = null;

    // Waypoint color palette – each location gets a distinct color
    var WAYPOINT_COLORS = [
      '#1976D2', '#D32F2F', '#FF9800', '#9C27B0', '#00BCD4',
      '#795548', '#E91E63', '#3F51B5', '#009688', '#FF5722',
      '#607D8B', '#8BC34A'
    ];

    window.showRoute = function(waypoints, profile) {
      // Clear previous route
      window.clearRoute();

      if (!waypoints || waypoints.length < 2) return;

      // Resolve OSRM profile (driving | cycling | foot)
      var osrmProfile = profile || 'driving';

      // Use FOSSGIS OSRM servers — each profile has a dedicated server
      // with proper road/path restrictions and accurate travel time estimation
      var osrmServiceUrls = {
        driving: 'https://routing.openstreetmap.de/routed-car/route/v1',
        cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1',
        foot:    'https://routing.openstreetmap.de/routed-foot/route/v1'
      };
      var serviceUrl = osrmServiceUrls[osrmProfile] || osrmServiceUrls.driving;

      // Add numbered waypoint markers with unique colors
      waypoints.forEach(function(wp, idx) {
        var color = WAYPOINT_COLORS[idx % WAYPOINT_COLORS.length];
        var label = (idx + 1).toString();
        var marker = L.marker([wp.lat, wp.lng], {
          icon: L.divIcon({
            html: '<div style="background:' + color + ';width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:13px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);font-family:sans-serif;">' + label + '</div>',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            className: 'waypoint-marker'
          }),
          interactive: false
        }).addTo(map);
        waypointMarkers.push(marker);
      });

      // Route line color per vehicle type
      var routeColors = {
        driving: { main: '#2E7D32', glow: '#4CAF50' },
        cycling: { main: '#E65100', glow: '#FF9800' },
        foot:    { main: '#1565C0', glow: '#42A5F5' }
      };
      var rc = routeColors[osrmProfile] || routeColors.driving;

      // Create routing control with selected vehicle profile
      var latlngs = waypoints.map(function(wp) { return L.latLng(wp.lat, wp.lng); });
      routingControl = L.Routing.control({
        waypoints: latlngs,
        routeWhileDragging: false,
        addWaypoints: false,
        draggableWaypoints: false,
        show: false,
        createMarker: function() { return null; },
        lineOptions: {
          styles: [
            { color: rc.main, opacity: 0.85, weight: 6 },
            { color: rc.glow, opacity: 0.5, weight: 10 }
          ],
          addWaypoints: false
        },
        router: L.Routing.osrmv1({
          serviceUrl: serviceUrl,
          profile: osrmProfile
        })
      }).addTo(map);

      // Vehicle mode labels & icons for display
      var modeLabels = { driving: 'Driving', cycling: 'Motorcycle', foot: 'Walking' };
      var modeIcons  = { driving: '🚗', cycling: '🏍️', foot: '🚶' };
      var modeLabel = modeLabels[osrmProfile] || 'Driving';
      var modeIcon  = modeIcons[osrmProfile]  || '🚗';

      routingControl.on('routesfound', function(e) {
        var route = e.routes[0];
        var distKm = (route.summary.totalDistance / 1000).toFixed(1);
        var durMin = Math.round(route.summary.totalTime / 60);
        var durText = durMin >= 60 ? Math.floor(durMin / 60) + 'h ' + (durMin % 60) + 'min' : durMin + ' min';

        // Extract turn-by-turn instructions from OSRM response
        navInstructions = [];
        routeCoordinates = route.coordinates || [];
        if (route.instructions && route.instructions.length > 0) {
          route.instructions.forEach(function(inst, idx) {
            var stepCoords = [];
            if (routeCoordinates.length > 0 && inst.index !== undefined) {
              var endIdx = (idx + 1 < route.instructions.length) ? route.instructions[idx + 1].index : routeCoordinates.length - 1;
              for (var ci = inst.index; ci <= endIdx && ci < routeCoordinates.length; ci++) {
                stepCoords.push(routeCoordinates[ci]);
              }
            }
            navInstructions.push({
              instruction: inst.text || '',
              distance: inst.distance || 0,
              time: inst.time || 0,
              road: inst.road || '',
              type: inst.type || '',
              modifier: inst.modifier || '',
              lat: stepCoords.length > 0 ? stepCoords[stepCoords.length - 1].lat : (inst.latLng ? inst.latLng.lat : 0),
              lng: stepCoords.length > 0 ? stepCoords[stepCoords.length - 1].lng : (inst.latLng ? inst.latLng.lng : 0),
              coords: stepCoords,
              index: idx
            });
          });
        }

        // Show route info overlay
        if (!routeInfoEl) {
          routeInfoEl = document.createElement('div');
          routeInfoEl.className = 'route-info-overlay';
          document.body.appendChild(routeInfoEl);
        }
        routeInfoEl.innerHTML = '<div class="route-summary">' +
          '<div class="route-stat"><div class="value">' + modeIcon + '</div><div class="label">' + modeLabel + '</div></div>' +
          '<div style="width:1px;height:30px;background:#ddd;"></div>' +
          '<div class="route-stat"><div class="value">' + distKm + ' km</div><div class="label">Distance</div></div>' +
          '<div style="width:1px;height:30px;background:#ddd;"></div>' +
          '<div class="route-stat"><div class="value">' + durText + '</div><div class="label">Est. Time</div></div>' +
          '<div style="width:1px;height:30px;background:#ddd;"></div>' +
          '<div class="route-stat"><div class="value">' + waypoints.length + '</div><div class="label">Waypoints</div></div>' +
          '</div>';
        routeInfoEl.style.display = 'block';

        // Send route info + instructions back to RN
        var instructionsSummary = navInstructions.map(function(inst) {
          return {
            instruction: inst.instruction,
            distance: inst.distance,
            time: inst.time,
            road: inst.road,
            type: inst.type,
            modifier: inst.modifier,
            index: inst.index
          };
        });
        sendToParent(JSON.stringify({
          type: 'routeInfo',
          distance: distKm,
          duration: durText,
          durationMinutes: durMin,
          waypoints: waypoints.length,
          profile: osrmProfile,
          modeLabel: modeLabel,
          instructions: instructionsSummary
        }));

        // Fit map to route bounds
        map.fitBounds(L.latLngBounds(latlngs).pad(0.15));
      });

      var routeErrorMsgs = {
        driving: 'Could not calculate driving route. Some waypoints may not be reachable by road.',
        cycling: 'Could not calculate motorcycle route. Some roads may be restricted (e.g. expressways). Try a different route or switch to Car mode.',
        foot:    'Could not calculate walking route. Some waypoints may not be reachable on foot. Try a shorter distance or switch to another mode.'
      };

      routingControl.on('routingerror', function(e) {
        sendToParent(JSON.stringify({
          type: 'routeError',
          message: routeErrorMsgs[osrmProfile] || routeErrorMsgs.driving
        }));
      });
    };

    window.clearRoute = function() {
      // Also stop turn-by-turn if active
      if (turnByTurnActive) window.stopTurnByTurn();
      if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
      }
      waypointMarkers.forEach(function(m) { map.removeLayer(m); });
      waypointMarkers = [];
      if (routeInfoEl) {
        routeInfoEl.style.display = 'none';
      }
      navInstructions = [];
      routeCoordinates = [];
    };

    // Central message dispatcher (called from message events AND injectJavaScript)
    window.dispatchMessage = function(jsonStr) {
      try {
        var data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        if (data.type === 'setPinMode') {
          window.setPinMode(data.enabled);
        } else if (data.type === 'addMarker') {
          var pin = data.pin;
          var color = ${JSON.stringify(pinTypeColors)}[pin.pin_type] || '#2196F3';
          var icon = ${JSON.stringify(pinTypeIcons)}[pin.pin_type] || '📍';
          var pinName = pin.place_name || 'New Pin';
          var marker = L.marker([pin.latitude, pin.longitude], {
            icon: L.divIcon({
              html: '<div style="display:flex;flex-direction:column;align-items:center;"><div style="background:' + color + ';width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">' + icon + '</div><div style="background:rgba(255,255,255,0.92);color:#333;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;margin-top:2px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 3px rgba(0,0,0,0.15);text-align:center;font-family:sans-serif;">' + pinName + '</div></div>',
              iconSize: [32, 48],
              iconAnchor: [16, 16],
              className: 'custom-marker'
            })
          }).addTo(map);
          marker.bindTooltip(pinName, { permanent: false, direction: 'top', offset: [0, -20] });
          var popupContent = '<strong>' + pinName + '</strong><br/>' +
            '<span style="color:#666;text-transform:capitalize;">' + (pin.pin_type || '').replace('_', ' ') + '</span>';
          if (pin.description) popupContent += '<p>' + pin.description + '</p>';
          marker.bindPopup(popupContent);
        } else if (data.type === 'flyTo') {
          map.flyTo([data.latitude, data.longitude], data.zoom || 14);
        } else if (data.type === 'showRoute') {
          window.showRoute(data.waypoints, data.profile);
        } else if (data.type === 'clearRoute') {
          window.clearRoute();
        } else if (data.type === 'updateUserLocation') {
          window.updateUserLocation(data.latitude, data.longitude, data.heading, data.accuracy);
        } else if (data.type === 'setFollowMode') {
          window.setFollowMode(data.enabled);
        } else if (data.type === 'clearLiveTracking') {
          window.clearLiveTracking();
        } else if (data.type === 'startTurnByTurn') {
          window.startTurnByTurn();
        } else if (data.type === 'stopTurnByTurn') {
          window.stopTurnByTurn();
        }
      } catch(e) {}
    };

    // Handle messages from React Native (window for iOS/web, document for Android WebView)
    function onExternalMessage(event) {
      try { window.dispatchMessage(event.data); } catch(e) {}
    }
    window.addEventListener('message', onExternalMessage);
    document.addEventListener('message', onExternalMessage);

    // Notify RN that map is ready
    setTimeout(function() {
      sendToParent(JSON.stringify({type: 'mapReady'}));
    }, 500);
  </script>
</body>
</html>`;
};

// ==================== NATIVE (WebView-based) MAP ====================
let WebViewComponent = null;

const NativeWebMap = React.forwardRef(({
  initialRegion,
  pins,
  userLocation,
  onMapTap,
  onLongPress,
  onPinTap,
  onMapReady,
  onRouteInfo,
  onRouteError,
  onFollowModeChanged,
  onTurnByTurnStarted,
  onTurnByTurnStopped,
  onNavStepChanged,
  onNavStepProgress,
  onNavArrived,
  style,
}, ref) => {
  const webViewRef = useRef(null);
  const [WebView, setWebView] = useState(null);

  useEffect(() => {
    // Dynamically import WebView to avoid issues if not installed
    const loadWebView = async () => {
      try {
        if (!WebViewComponent) {
          const module = await import('react-native-webview');
          WebViewComponent = module.default || module.WebView;
        }
        setWebView(() => WebViewComponent);
      } catch (e) {
        console.warn('[WebMap] react-native-webview not available:', e.message);
      }
    };
    loadWebView();
  }, []);

  const html = buildLeafletHTML(initialRegion, pins, userLocation);

  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case 'mapTap':
          onMapTap?.({ latitude: data.latitude, longitude: data.longitude });
          break;
        case 'longPress':
          onLongPress?.({ latitude: data.latitude, longitude: data.longitude });
          break;
        case 'pinTap':
          onPinTap?.(JSON.parse(data.pin));
          break;
        case 'mapReady':
          onMapReady?.();
          break;
        case 'routeInfo':
          onRouteInfo?.(data);
          break;
        case 'routeError':
          onRouteError?.(data.message);
          break;
        case 'followModeChanged':
          onFollowModeChanged?.(data.enabled);
          break;
        case 'turnByTurnStarted':
          onTurnByTurnStarted?.(data);
          break;
        case 'turnByTurnStopped':
          onTurnByTurnStopped?.();
          break;
        case 'navStepChanged':
          onNavStepChanged?.(data);
          break;
        case 'navStepProgress':
          onNavStepProgress?.(data);
          break;
        case 'navArrived':
          onNavArrived?.();
          break;
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, [onMapTap, onLongPress, onPinTap, onMapReady, onRouteInfo, onRouteError, onFollowModeChanged, onTurnByTurnStarted, onTurnByTurnStopped, onNavStepChanged, onNavStepProgress, onNavArrived]);

  // Helper: send commands to WebView via injectJavaScript (more reliable than postMessage on Android)
  const sendToMap = (data) => {
    const json = JSON.stringify(data);
    webViewRef.current?.injectJavaScript(`window.dispatchMessage(${JSON.stringify(json)});true;`);
  };

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    addMarker: (pin) => sendToMap({ type: 'addMarker', pin }),
    flyTo: (latitude, longitude, zoom) => sendToMap({ type: 'flyTo', latitude, longitude, zoom }),
    setPinMode: (enabled) => sendToMap({ type: 'setPinMode', enabled }),
    showRoute: (waypoints, profile) => sendToMap({ type: 'showRoute', waypoints, profile }),
    clearRoute: () => sendToMap({ type: 'clearRoute' }),
    updateUserLocation: (latitude, longitude, heading, accuracy) => sendToMap({ type: 'updateUserLocation', latitude, longitude, heading, accuracy }),
    setFollowMode: (enabled) => sendToMap({ type: 'setFollowMode', enabled }),
    clearLiveTracking: () => sendToMap({ type: 'clearLiveTracking' }),
    startTurnByTurn: () => sendToMap({ type: 'startTurnByTurn' }),
    stopTurnByTurn: () => sendToMap({ type: 'stopTurnByTurn' }),
  }));

  if (!WebView) {
    return (
      <View style={[styles.mapContainer, style, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={{ padding: 20 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.mapContainer, style]}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        mixedContentMode="always"
        allowsInlineMediaPlayback
      />
    </View>
  );
});

// ==================== WEB MAP (iframe / dangerouslySetInnerHTML) ====================
const WebPlatformMap = React.forwardRef(({
  initialRegion,
  pins,
  userLocation,
  onMapTap,
  onLongPress,
  onPinTap,
  onMapReady,
  onRouteInfo,
  onRouteError,
  onFollowModeChanged,
  onTurnByTurnStarted,
  onTurnByTurnStopped,
  onNavStepChanged,
  onNavStepProgress,
  onNavArrived,
  style,
}, ref) => {
  const iframeRef = useRef(null);
  const containerRef = useRef(null);

  const html = buildLeafletHTML(initialRegion, pins, userLocation);

  useEffect(() => {
    // Listen for messages from the iframe
    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'mapTap':
            onMapTap?.({ latitude: data.latitude, longitude: data.longitude });
            break;
          case 'longPress':
            onLongPress?.({ latitude: data.latitude, longitude: data.longitude });
            break;
          case 'pinTap':
            onPinTap?.(JSON.parse(data.pin));
            break;
          case 'mapReady':
            onMapReady?.();
            break;
          case 'routeInfo':
            onRouteInfo?.(data);
            break;
          case 'routeError':
            onRouteError?.(data.message);
            break;
          case 'followModeChanged':
            onFollowModeChanged?.(data.enabled);
            break;
          case 'turnByTurnStarted':
            onTurnByTurnStarted?.(data);
            break;
          case 'turnByTurnStopped':
            onTurnByTurnStopped?.();
            break;
          case 'navStepChanged':
            onNavStepChanged?.(data);
            break;
          case 'navStepProgress':
            onNavStepProgress?.(data);
            break;
          case 'navArrived':
            onNavArrived?.();
            break;
        }
      } catch (e) {
        // Ignore
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMapTap, onLongPress, onPinTap, onMapReady, onRouteInfo, onRouteError, onFollowModeChanged, onTurnByTurnStarted, onTurnByTurnStopped, onNavStepChanged, onNavStepProgress, onNavArrived]);

  // Override postMessage for iframe so Leaflet's ReactNativeWebView.postMessage works
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      const onLoad = () => {
        try {
          // Inject a shim so the Leaflet code's ReactNativeWebView.postMessage works in iframe
          const iframeWindow = iframe.contentWindow;
          iframeWindow.ReactNativeWebView = {
            postMessage: (msg) => {
              window.postMessage(msg, '*');
            },
          };
        } catch (e) {
          // Cross-origin issues, ignore
        }
      };
      iframe.addEventListener('load', onLoad);
      return () => iframe.removeEventListener('load', onLoad);
    }
  }, []);

  React.useImperativeHandle(ref, () => ({
    addMarker: (pin) => {
      try {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'addMarker', pin }), '*');
      } catch (e) {}
    },
    flyTo: (latitude, longitude, zoom) => {
      try {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'flyTo', latitude, longitude, zoom }), '*');
      } catch (e) {}
    },
    setPinMode: (enabled) => {
      try {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'setPinMode', enabled }), '*');
      } catch (e) {}
    },
    showRoute: (waypoints, profile) => {
      try {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'showRoute', waypoints, profile }), '*');
      } catch (e) {}
    },
    clearRoute: () => {
      try {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'clearRoute' }), '*');
      } catch (e) {}
    },
    updateUserLocation: (latitude, longitude, heading, accuracy) => {
      try {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'updateUserLocation', latitude, longitude, heading, accuracy }), '*');
      } catch (e) {}
    },
    setFollowMode: (enabled) => {
      try {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'setFollowMode', enabled }), '*');
      } catch (e) {}
    },
    clearLiveTracking: () => {
      try {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'clearLiveTracking' }), '*');
      } catch (e) {}
    },
    startTurnByTurn: () => {
      try {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'startTurnByTurn' }), '*');
      } catch (e) {}
    },
    stopTurnByTurn: () => {
      try {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'stopTurnByTurn' }), '*');
      } catch (e) {}
    },
  }));

  // Use srcdoc for the iframe to avoid cross-origin issues
  return (
    <View ref={containerRef} style={[styles.mapContainer, style]}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: 16,
        }}
        title="Harvest Map"
        sandbox="allow-scripts allow-same-origin"
      />
    </View>
  );
});

// ==================== CROSS-PLATFORM EXPORT ====================
const WebMap = React.forwardRef((props, ref) => {
  if (Platform.OS === 'web') {
    return <WebPlatformMap ref={ref} {...props} />;
  }
  return <NativeWebMap ref={ref} {...props} />;
});

WebMap.displayName = 'WebMap';

export default WebMap;

const styles = StyleSheet.create({
  mapContainer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 16,
  },
  webview: {
    flex: 1,
  },
});
