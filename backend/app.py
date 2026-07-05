from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from pymongo import MongoClient

from config import BACKEND_DIR, get_settings
from db import PredictionStore
from inference import (
    HeuristicFruitClassifier,
    HeuristicLeafClassifier,
    KerasClassifier,
    NotBignayClassifier,
)
from recommendation import recommend, compute_fruit_analytics, compute_leaf_analytics
from utils_image import (
    decode_data_url,
    decode_image_bytes,
    extract_features,
    resize_for_model,
    safe_json,
    sha256_bytes,
    assess_image_quality,
    enhance_image_for_detection,
    detect_leaf_regions,
    analyze_fruit_color,
    detect_mold_spots,
    detect_fruit_objects,
    classify_single_fruit,
    generate_detection_image,
    encode_image_base64,
)

# Import route blueprints
from routes import auth_bp, users_bp, products_bp, orders_bp, reviews_bp, chatbot_bp
from routes.payments import payments_bp
from routes.analytics import analytics_bp
from routes.training import training_bp
from routes.forum import forum_bp
from routes.heatmap import heatmap_bp
from routes.related_studies import bp as related_studies_bp
from routes.notifications import notifications_bp
from routes.price_prediction import price_prediction_bp
from routes.auth import get_current_user

settings = get_settings()


def _get_allowed_origins() -> list[str]:
    """Build allowed CORS origins from env, with safe deployment defaults."""
    configured = os.getenv("CORS_ALLOWED_ORIGINS", "")
    if configured.strip():
        return [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]

    # Default origins for local development.
    origins = [
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:19006",
        "http://localhost:3000",
        "http://localhost:8081",
        "http://127.0.0.1:19006",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8081",
    ]

    # Auto-detect local network IP so same-WiFi mobile devices are allowed.
    try:
        import socket as _socket
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(('8.8.8.8', 80))
        _local_ip = s.getsockname()[0]
        s.shutdown(_socket.SHUT_RDWR)
        s.close()
        if _local_ip and _local_ip not in ('127.0.0.1',):
            origins.append(f"http://{_local_ip}:5000")
    except OSError as e:
        print(f"[CORS] Could not detect local IP: {e}")

    # Auto-detect ngrok tunnel URL from the frontend .env written by ngrok_tunnel.py
    try:
        _fe_env = BACKEND_DIR.parent / "frontend" / ".env"
        if _fe_env.exists():
            for _line in _fe_env.read_text().splitlines():
                if _line.strip().startswith("EXPO_PUBLIC_API_URL="):
                    _url = _line.split("=", 1)[1].strip().rstrip("/")
                    if _url and _url not in origins:
                        origins.append(_url)
                    break
    except OSError as e:
        print(f"[CORS] Could not read frontend .env: {e}")

    return origins


ALLOWED_ORIGINS = _get_allowed_origins()
print(f"[CORS] Allowed origins: {ALLOWED_ORIGINS}")

FRONTEND_DIR = BACKEND_DIR.parent / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"  # Expo web build output

app = Flask(__name__,
            static_folder=str(FRONTEND_DIST),
            static_url_path='')

# Initialize SocketIO for real-time analytics updates.
# Use cors_allowed_origins="*" because React Native clients (Expo Go)
# may not send an Origin header, causing strict origin checks to fail.
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='threading',
    logger=False,
    engineio_logger=False,
)

# Disable strict slashes to prevent redirects that lose auth headers
app.url_map.strict_slashes = False

# Set max content length to 50MB to handle large image uploads
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB

# Configure CORS
CORS(app, resources={
    r"/*": {
        "origins": ALLOWED_ORIGINS,
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        "allow_headers": ["Content-Type", "Authorization", "Accept", "X-Requested-With", "ngrok-skip-browser-warning"],
        "expose_headers": ["Content-Type", "Authorization"],
        "supports_credentials": False,
        "max_age": 3600
    }
})

@app.after_request
def _add_cors_headers(response):
    """Ensure CORS headers are always present for allowed origins."""
    origin = request.headers.get("Origin", "")
    origin_clean = origin.rstrip("/")
    if origin_clean in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Accept, X-Requested-With, ngrok-skip-browser-warning"
        response.headers["Access-Control-Max-Age"] = "3600"
    return response

@app.errorhandler(Exception)
def _handle_exception(e):
    """Ensure CORS headers are present even on unhandled 500 errors."""
    import traceback
    print(f"[ERROR] Unhandled exception: {e}")
    traceback.print_exc()
    response = jsonify({"error": str(e)})
    response.status_code = 500
    origin = request.headers.get("Origin", "")
    if origin.rstrip("/") in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Accept, X-Requested-With, ngrok-skip-browser-warning"
    return response

@app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
@app.route("/<path:path>", methods=["OPTIONS"])
def handle_options(path):
    """Handle all preflight OPTIONS requests."""
    response = app.make_default_options_response()
    origin = request.headers.get("Origin", "")
    origin_clean = origin.rstrip("/")
    if origin_clean in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Accept, X-Requested-With, ngrok-skip-browser-warning"
        response.headers["Access-Control-Max-Age"] = "3600"
    return response

# Initialize MongoDB collections for new features
def init_database():
    """Initialize MongoDB collections and store in app config"""
    if settings.mongodb_uri:
        try:
            client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
            try:
                db = client[settings.mongodb_db]

                # Store collections in app config for routes to access
                app.config['db_users'] = db['users']
                app.config['db_products'] = db['products']
                app.config['db_orders'] = db['orders']
                app.config['db_reviews'] = db['reviews']

                # Create indexes for better performance
                app.config['db_users'].create_index('email', unique=True)
                app.config['db_products'].create_index([('name', 'text'), ('description', 'text')])
                app.config['db_products'].create_index('category')
                app.config['db_products'].create_index('is_active')
                app.config['db_orders'].create_index('user_id')
                app.config['db_orders'].create_index('status')
                app.config['db_reviews'].create_index('product_id')
                app.config['db_reviews'].create_index('user_id')

                # Forum collection
                app.config['db_forum'] = db['forum']
                app.config['db_forum'].create_index('category')
                app.config['db_forum'].create_index('is_published')
                app.config['db_forum'].create_index([('title', 'text'), ('content', 'text')])

                # Harvest pins collection (Harvest Map)
                app.config['db_harvest_pins'] = db['harvest_pins']
                app.config['db_harvest_pins'].create_index([('latitude', 1), ('longitude', 1)])
                app.config['db_harvest_pins'].create_index('pin_type')
                app.config['db_harvest_pins'].create_index('is_active')
                app.config['db_harvest_pins'].create_index('created_by')

                # Notifications collection
                app.config['db_notifications'] = db['notifications']
                app.config['db_notifications'].create_index('user_id')
                app.config['db_notifications'].create_index('is_read')
                app.config['db_notifications'].create_index([('user_id', 1), ('is_read', 1)])
                app.config['db_notifications'].create_index('created_at')

                print("✓ MongoDB collections initialized successfully")
            finally:
                client.close()
        except Exception as e:
            print(f"✗ Failed to initialize MongoDB: {e}")
            app.config['db_users'] = None
            app.config['db_products'] = None
            app.config['db_orders'] = None
            app.config['db_reviews'] = None
            app.config['db_forum'] = None
            app.config['db_harvest_pins'] = None
            app.config['db_notifications'] = None
    else:
        app.config['db_users'] = None
        app.config['db_products'] = None
        app.config['db_orders'] = None
        app.config['db_reviews'] = None
        app.config['db_forum'] = None
        app.config['db_harvest_pins'] = None
        app.config['db_notifications'] = None
        print("✗ MongoDB URI not configured - marketplace features will be disabled")
# Initialize database
init_database()

# Initialize Cloudinary and verify configuration
def init_cloudinary():
    """Initialize and verify Cloudinary configuration"""
    from utils.cloudinary_helper import is_cloudinary_configured
    if is_cloudinary_configured():
        print("✓ Cloudinary configured successfully")
    else:
        print("✗ Cloudinary not configured - image upload will fail")
        print("  Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env")

init_cloudinary()

# Register route blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(users_bp)
app.register_blueprint(products_bp)
app.register_blueprint(orders_bp)
app.register_blueprint(reviews_bp)
app.register_blueprint(payments_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(training_bp)
app.register_blueprint(forum_bp)
app.register_blueprint(chatbot_bp)
app.register_blueprint(heatmap_bp)
app.register_blueprint(related_studies_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(price_prediction_bp)

# Store socketio instance in app config for routes to access
app.config['socketio'] = socketio

# Set up background scheduler to auto-lift expired suspensions
def init_suspension_scheduler():
    """Start a background thread to periodically check and lift expired suspensions"""
    import threading
    
    def suspension_check_loop():
        import time
        while True:
            time.sleep(60)  # Check every 60 seconds
            try:
                with app.app_context():
                    from routes.users import check_and_lift_expired_suspensions
                    check_and_lift_expired_suspensions()
            except Exception as e:
                print(f"[Scheduler] Suspension check error: {e}")
    
    thread = threading.Thread(target=suspension_check_loop, daemon=True)
    thread.start()
    print("✓ Suspension auto-lift scheduler started (checks every 60s)")

init_suspension_scheduler()

# SocketIO connection events
@socketio.on('connect')
def handle_connect():
    print(f"[SocketIO] Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    print(f"[SocketIO] Client disconnected: {request.sid}")

@socketio.on('join_analytics')
def handle_join_analytics(data):
    """Client joins analytics room for real-time updates"""
    room = data.get('room', 'analytics')
    from flask_socketio import join_room
    join_room(room)
    print(f"[SocketIO] Client {request.sid} joined room: {room}")

@socketio.on('leave_analytics')
def handle_leave_analytics(data):
    """Client leaves analytics room"""
    room = data.get('room', 'analytics')
    from flask_socketio import leave_room
    leave_room(room)

@socketio.on('join_notifications')
def handle_join_notifications(data):
    """Client joins personal notification room"""
    user_id = data.get('user_id')
    if user_id:
        from flask_socketio import join_room
        room = f'user_{user_id}'
        join_room(room)
        print(f"[SocketIO] Client {request.sid} joined notification room: {room}")

@socketio.on('leave_notifications')
def handle_leave_notifications(data):
    """Client leaves personal notification room"""
    user_id = data.get('user_id')
    if user_id:
        from flask_socketio import leave_room
        leave_room(f'user_{user_id}')


def emit_analytics_update(event_type='order_update', data=None):
    """Emit real-time analytics update to connected clients"""
    try:
        socketio.emit('analytics_update', {
            'type': event_type,
            'data': data or {},
            'timestamp': datetime.now(timezone.utc).isoformat()
        }, room='analytics')
    except Exception as e:
        print(f"[SocketIO] Error emitting analytics update: {e}")

# Make emit function accessible to routes
app.config['emit_analytics_update'] = emit_analytics_update

store = PredictionStore(settings.mongodb_uri, settings.mongodb_db, settings.mongodb_collection)

# If you have trained models, drop them in backend/model/ and set FRUIT_MODEL_PATH / LEAF_MODEL_PATH
fruit_model = KerasClassifier(settings.fruit_model_path, classes=["good", "mold", "overripe", "ripe", "unripe"])
leaf_model = KerasClassifier(settings.leaf_model_path, classes=["healthy", "mold"])
not_bignay_model = NotBignayClassifier(settings.not_bignay_model_path)

fruit_fallback = HeuristicFruitClassifier()
leaf_fallback = HeuristicLeafClassifier()

# Confidence threshold for Bignay detection
# Balance between accepting blurry/distant bignay and rejecting non-bignay items
BIGNAY_CONFIDENCE_THRESHOLD = 0.45  # Main threshold for confident detection
MIN_CONFIDENCE_THRESHOLD = 0.30  # Minimum to consider - below this is definitely not bignay
# Very low threshold - image enhancement should help real bignay exceed this
ABSOLUTE_MIN_THRESHOLD = 0.25


def _is_bignay_image(confidence: float, features: Any, image_quality: Any = None) -> dict:
    """
    Determines if the image is likely a Bignay fruit or leaf based on:
    1. Model confidence score
    2. Image features (color analysis)
    3. Image quality assessment
    
    Balances accepting blurry/distant bignay while rejecting non-bignay items.
    Returns a dict with detection status, confidence level, and reason.
    """
    # Build quality context for better feedback
    quality_issues = image_quality.issues if image_quality else []
    quality_recommendations = image_quality.recommendations if image_quality else []
    overall_quality = image_quality.overall_quality if image_quality else "unknown"
    
    # Color-based validation for Bignay (check early to help with non-bignay rejection)
    # Bignay fruits: dark purple/red when ripe, green when unripe
    # Bignay leaves: green
    hsv_mean = features.color_hsv_mean
    h, s, v = hsv_mean
    
    # Define typical Bignay color ranges
    # HSV hue: Red ~0-15 or 165-180; Green ~35-85; Purple/Magenta ~130-165
    is_red_purple = (h <= 20) or (h >= 130)  # Red, purple, magenta range
    is_green = (35 <= h <= 90)  # Green range for unripe or leaves
    is_typical_bignay_color = is_red_purple or is_green
    
    # Detect clearly non-bignay colors (orange, yellow, bright blue, etc.)
    is_orange_yellow = (20 < h < 35) and s > 50  # Orange/yellow fruits
    is_blue_cyan = (90 < h < 130) and s > 40  # Blue/cyan - not bignay
    is_clearly_not_bignay_color = is_orange_yellow or is_blue_cyan
    
    # STEP 1: Absolute minimum threshold - below this is definitely not bignay
    if confidence < ABSOLUTE_MIN_THRESHOLD:
        reason = "The image does not appear to be a Bignay fruit or leaf."
        if quality_issues:
            reason += f" Issues: {', '.join(quality_issues[:2])}."
        else:
            reason += " Model confidence is very low."
        
        return {
            "is_bignay": False,
            "confidence_level": "very_low",
            "reason": reason,
            "quality_issues": quality_issues,
            "quality_recommendations": quality_recommendations
        }
    
    # STEP 2: Color-based rejection for clearly non-bignay colors
    if is_clearly_not_bignay_color and confidence < 0.60:
        # Strong color mismatch + low confidence = not bignay
        return {
            "is_bignay": False,
            "confidence_level": "color_mismatch",
            "reason": "The image color does not match Bignay. Bignay fruits are typically dark purple/red (ripe) or green (unripe).",
            "quality_issues": quality_issues,
            "quality_recommendations": ["Make sure you're scanning a Bignay fruit or leaf"]
        }
    
    # STEP 3: Check if below minimum threshold
    if confidence < MIN_CONFIDENCE_THRESHOLD:
        # Below minimum AND not a typical bignay color = reject
        if not is_typical_bignay_color:
            return {
                "is_bignay": False,
                "confidence_level": "low",
                "reason": "The image does not appear to be a Bignay. Color and confidence do not match expected values.",
                "quality_issues": quality_issues,
                "quality_recommendations": quality_recommendations
            }
        
        # Below minimum but has bignay-like color AND poor image quality = might be bignay
        if overall_quality in ["poor", "acceptable"] and is_typical_bignay_color:
            return {
                "is_bignay": True,
                "confidence_level": "very_low",
                "reason": "Detection confidence is very low, but color profile matches Bignay.",
                "quality_issues": quality_issues,
                "quality_recommendations": quality_recommendations,
                "warning": "Results may be inaccurate. Try capturing a clearer image."
            }
        
        # Below minimum, okay color, good quality = probably not bignay
        return {
            "is_bignay": False,
            "confidence_level": "low",
            "reason": "The image might not be a Bignay fruit or leaf. Please verify.",
            "quality_issues": quality_issues,
            "quality_recommendations": quality_recommendations
        }
    
    # STEP 4: Between MIN and BIGNAY threshold - accept with warnings
    if confidence < BIGNAY_CONFIDENCE_THRESHOLD:
        warning_msg = "Results may be less accurate due to low confidence."
        if quality_issues:
            warning_msg = f"Results may be affected by: {', '.join(quality_issues[:2])}."
        
        return {
            "is_bignay": True,
            "confidence_level": "low",
            "reason": None,
            "quality_issues": quality_issues,
            "quality_recommendations": quality_recommendations,
            "warning": warning_msg
        }
    
    # STEP 5: Above threshold - confident detection
    # Even with good confidence, warn if color is unusual
    if not is_typical_bignay_color and s > 60 and confidence < 0.65:
        return {
            "is_bignay": True,
            "confidence_level": "medium",
            "reason": None,
            "quality_issues": quality_issues,
            "quality_recommendations": ["Color appears unusual - verify if needed"],
            "warning": "Color profile is atypical for Bignay"
        }
    
    # Determine confidence level for good detections
    if confidence >= 0.70:
        confidence_level = "high"
    elif confidence >= 0.55:
        confidence_level = "medium"
    else:
        confidence_level = "low"
    
    return {
        "is_bignay": True,
        "confidence_level": confidence_level,
        "reason": None,
        "quality_issues": quality_issues,
        "quality_recommendations": quality_recommendations if confidence < 0.60 else []
    }


def _ripeness_stage_from_fruit_class(fruit_class: str) -> str | None:
    if fruit_class in {"unripe", "ripe", "overripe"}:
        return fruit_class
    if fruit_class == "good":
        return "ripe"
    return None


def _quality_from_fruit_class(fruit_class: str) -> str | None:
    if fruit_class in {"mold"}:
        return "reject"
    if fruit_class in {"good", "ripe"}:
        return "good"
    if fruit_class in {"unripe", "overripe"}:
        return "ok"
    return None


def _mold_flag_from_image(image_bgr) -> bool:
    """
    Detect mold on Bignay fruit using spot-based detection.
    Looks for white mold spots (high V, low S) and black mold spots (very low V, low S)
    against the dark fruit skin. This is more accurate than the old approach which
    confused dark overripe skin with mold.
    """
    from utils_image import detect_mold_spots
    mold_result = detect_mold_spots(image_bgr)
    return mold_result.mold_detected


@app.get("/")
def serve_index():
    # Serve the Expo web build if it exists, otherwise return API info
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return send_from_directory(str(FRONTEND_DIST), "index.html")
    return jsonify({
        "ok": True,
        "message": "Bignay Backend API is running. Run 'npx expo export --platform web' in frontend/ to enable the web UI.",
        "endpoints": {
            "health": "/health",
            "app_config": "/app-config",
            "predict": "/predict (POST)",
            "api_info": "/api-info",
        },
    })


# SPA catch-all: serve index.html for any path that isn't an API route or static file
# This allows client-side routing (React Navigation) to work properly
@app.errorhandler(404)
def spa_fallback(e):
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        # Only fall back for non-API routes
        if not request.path.startswith(('/api/', '/predict', '/health', '/app-config', '/predictions', '/chat', '/price-predict', '/api-info')):
            return send_from_directory(str(FRONTEND_DIST), "index.html")
    return jsonify({"error": "Not found"}), 404


@app.get("/api-info")
def api_info():
    return jsonify(
        {
            "ok": True,
            "message": "Bignay backend is running.",
            "routes": {
                "ui": "/",
                "health": "/health",
                "app_config": "/app-config",
                "predict": "/predict",
                "predictions": "/predictions",
            },
        }
    )


@app.get("/health")
def health():
    db_status = store.status()
    return jsonify(
        {
            "ok": True,
            "time": datetime.now(timezone.utc).isoformat(),
            "models": {
                "fruit": {"path": str(settings.fruit_model_path), "available": fruit_model.available()},
                "leaf": {"path": str(settings.leaf_model_path), "available": leaf_model.available()},
                "not_bignay": {"path": str(settings.not_bignay_model_path), "available": not_bignay_model.available()},
            },
            "db": {"enabled": db_status.enabled, "ok": db_status.ok, "message": db_status.message},
        }
    )


@app.get("/app-config")
def app_config():
    """Mobile app compatibility config for installed APK clients."""
    return jsonify(
        {
            "ok": True,
            "backend_version": os.getenv("BACKEND_VERSION", "1.0.0"),
            "min_supported_app_version": os.getenv("MIN_SUPPORTED_APP_VERSION", "1.0.0"),
            "force_update_message": os.getenv(
                "FORCE_UPDATE_MESSAGE",
                "A newer app version is required to continue using this service.",
            ),
            "android_store_url": os.getenv("ANDROID_STORE_URL"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    )


# ── Image Quality Check Endpoint (OpenCV) ──────────────────────────────
@app.post("/check-quality")
def check_quality():
    """Pre-analysis image quality assessment using OpenCV.
    Checks blur, brightness, contrast, and subject visibility.
    """
    body: dict[str, Any] = request.get_json(force=True, silent=False)
    if "image" not in body:
        return jsonify({"error": "Missing 'image' field"}), 400

    try:
        data_url = body["image"]
        img_bytes = decode_data_url(data_url)
        image_bgr = decode_image_bytes(img_bytes)
        features = extract_features(image_bgr)
        quality = assess_image_quality(image_bgr, features.mask_coverage)

        # Build structured issues list with actionable recommendations
        issues = []
        for issue_text in quality.issues:
            issue_type = "unknown"
            recommendation = ""
            if "blur" in issue_text.lower() or "sharp" in issue_text.lower():
                issue_type = "blur"
                recommendation = "Hold the device steady and ensure the subject is in focus before capturing."
            elif "dark" in issue_text.lower() or "underexposed" in issue_text.lower():
                issue_type = "dark"
                recommendation = "Increase lighting or move to a brighter area. Avoid shadows on the subject."
            elif "bright" in issue_text.lower() or "overexposed" in issue_text.lower():
                issue_type = "bright"
                recommendation = "Move away from direct light or reduce flash. Try a shaded area."
            elif "contrast" in issue_text.lower():
                issue_type = "low_contrast"
                recommendation = "Place the subject on a contrasting surface for better visibility."
            elif "small" in issue_text.lower() or "subject" in issue_text.lower():
                issue_type = "subject_small"
                recommendation = "Move closer to the subject so it fills more of the frame."
            issues.append({
                "type": issue_type,
                "message": issue_text,
                "recommendation": recommendation,
            })

        return jsonify({
            "overall_quality": quality.overall_quality,
            "blur_score": quality.blur_score,
            "brightness_score": quality.brightness_score,
            "contrast_score": quality.contrast_score,
            "subject_size_score": quality.subject_size_score,
            "issues": issues,
            "recommendations": quality.recommendations,
        })
    except Exception as e:
        return jsonify({"error": f"Quality check failed: {str(e)}"}), 500


@app.post("/predict")
def predict():
    body: dict[str, Any] = request.get_json(force=True, silent=False)
    if "image" not in body:
        return jsonify({"error": "Missing 'image' field"}), 400

    subject = str(body.get("subject", "fruit")).strip().lower()
    if subject not in {"fruit", "leaf"}:
        return jsonify({"error": "Invalid 'subject'. Use 'fruit' or 'leaf'."}), 400

    data_url = body["image"]
    img_bytes = decode_data_url(data_url)
    image_sha256 = sha256_bytes(img_bytes)
    image_bgr = decode_image_bytes(img_bytes)

    # Extract features for quality assessment
    features = extract_features(image_bgr)
    
    # Assess image quality first
    image_quality = assess_image_quality(image_bgr, features.mask_coverage)
    
    # Apply image enhancement for better detection of blurry/distant images
    enhanced_image = enhance_image_for_detection(image_bgr)
    
    mold_heuristic = _mold_flag_from_image(image_bgr)

    # Run advanced color and mold analysis for fruit images
    color_analysis = None
    mold_spot_analysis = None
    leaf_interference = None
    if subject == "fruit":
        color_analysis = analyze_fruit_color(image_bgr)
        mold_spot_analysis = detect_mold_spots(image_bgr)
        leaf_info = detect_leaf_regions(image_bgr)
        if leaf_info["leaf_detected"]:
            leaf_interference = {
                "leaf_coverage": round(leaf_info["leaf_coverage"] * 100, 1),
                "fruit_green_coverage": round(leaf_info.get("fruit_green_coverage", 0) * 100, 1),
                "has_significant_leaves": leaf_info["has_significant_leaves"],
                "has_minor_leaves": leaf_info["has_minor_leaves"],
                "warning": leaf_info["warning"],
            }

    # Model inference on the original image (no enhancement — the model was
    # trained on unmodified images, so feeding altered versions hurts accuracy).
    input_tensor = resize_for_model(image_bgr, 224)

    fruit_pred = None
    leaf_pred = None
    used_enhanced = False

    if subject == "fruit":
        if fruit_model.available():
            fruit_pred = fruit_model.predict(input_tensor)

            # --- Color-based correction ---
            # Only override the model when the color evidence is overwhelming
            # and the model confidence is low.  The trained model is the primary
            # classifier; heuristic overrides with loose thresholds hurt accuracy
            # on images the model has never seen.
            if (color_analysis and color_analysis.confidence > 0.75
                    and fruit_pred.confidence < 0.55):
                model_class = fruit_pred.class_name
                color_stage = color_analysis.stage

                correction_applied = False
                original_prediction = model_class

                # Case 1: Model says unripe but color is overwhelmingly purple/red
                if (model_class in ("unripe", "good") and
                        color_stage == "ripe" and
                        color_analysis.purple_red_pct > 45 and
                        color_analysis.green_pct < 10):
                    from inference import ClassifierResult
                    adjusted_probs = dict(fruit_pred.all_probabilities)
                    adjusted_probs["ripe"] = max(adjusted_probs.get("ripe", 0), 0.65)
                    adjusted_probs["unripe"] = adjusted_probs.get("unripe", 0) * 0.3
                    fruit_pred = ClassifierResult("ripe", 0.65, adjusted_probs)
                    correction_applied = True

                # Case 2: Model says ripe but color is overwhelmingly green
                elif (model_class in ("ripe", "good") and
                      color_stage == "unripe" and
                      color_analysis.green_pct > 55 and
                      color_analysis.purple_red_pct < 5):
                    from inference import ClassifierResult
                    adjusted_probs = dict(fruit_pred.all_probabilities)
                    adjusted_probs["unripe"] = max(adjusted_probs.get("unripe", 0), 0.65)
                    adjusted_probs["ripe"] = adjusted_probs.get("ripe", 0) * 0.3
                    fruit_pred = ClassifierResult("unripe", 0.65, adjusted_probs)
                    correction_applied = True

                # Case 3: Color detects heavy mold but model missed it
                elif (color_stage == "mold" and model_class != "mold" and
                      color_analysis.confidence > 0.80):
                    from inference import ClassifierResult
                    adjusted_probs = dict(fruit_pred.all_probabilities)
                    adjusted_probs["mold"] = max(adjusted_probs.get("mold", 0), 0.65)
                    fruit_pred = ClassifierResult("mold", 0.65, adjusted_probs)
                    correction_applied = True

                if correction_applied and leaf_interference is not None:
                    leaf_interference["correction_applied"] = True
                    leaf_interference["original_prediction"] = original_prediction
                    leaf_interference["corrected_prediction"] = fruit_pred.class_name
                elif correction_applied:
                    leaf_interference = {
                        "leaf_coverage": 0.0,
                        "fruit_green_coverage": 0.0,
                        "has_significant_leaves": False,
                        "has_minor_leaves": False,
                        "warning": None,
                        "correction_applied": True,
                        "original_prediction": original_prediction,
                        "corrected_prediction": fruit_pred.class_name,
                        "correction_reason": "Color analysis contradicted low-confidence model prediction",
                    }

            # --- Mold spot override ---
            # If mold spot detector found significant mold but model didn't flag it
            if (mold_spot_analysis and mold_spot_analysis.mold_detected and
                    mold_spot_analysis.severity in ("moderate", "severe") and
                    fruit_pred.class_name != "mold"):
                mold_heuristic = True  # Ensure mold_present flag is set
        else:
            fruit_pred = fruit_fallback.predict_from_features(features)
    else:
        if leaf_model.available():
            leaf_pred = leaf_model.predict(input_tensor)
        else:
            leaf_pred = leaf_fallback.predict_from_features(features)

    # Build extended response
    fruit_obj: dict[str, Any] | None = None
    leaf_obj: dict[str, Any] | None = None
    analytics: dict[str, Any] | None = None

    if fruit_pred is not None:
        fruit_class = fruit_pred.class_name
        # "good" is not a ripeness stage — remap to "ripe" for primary classification
        # "good" data is preserved in all_probabilities and detailed analysis
        display_class = "ripe" if fruit_class == "good" else fruit_class
        ripeness = _ripeness_stage_from_fruit_class(fruit_class)
        quality = _quality_from_fruit_class(fruit_class)
        all_probs = fruit_pred.all_probabilities or {}

        # Use mold spot detection for more accurate mold_present flag
        mold_from_spots = mold_spot_analysis.mold_detected if mold_spot_analysis else False
        fruit_mold_present = (fruit_class == "mold") or mold_heuristic or mold_from_spots

        fruit_obj = {
            "class": display_class,
            "original_class": fruit_class,
            "confidence": fruit_pred.confidence,
            "ripeness_stage": ripeness,
            "mold_present": fruit_mold_present,
            "quality": quality,
            "all_probabilities": all_probs,
        }
        if leaf_interference:
            fruit_obj["leaf_interference"] = leaf_interference

        # Add color analysis data
        if color_analysis:
            fruit_obj["color_analysis"] = {
                "stage": color_analysis.stage,
                "confidence": color_analysis.confidence,
                "green_pct": color_analysis.green_pct,
                "purple_red_pct": color_analysis.purple_red_pct,
                "dark_pct": color_analysis.dark_pct,
                "white_spot_pct": color_analysis.white_spot_pct,
                "black_spot_pct": color_analysis.black_spot_pct,
                "details": color_analysis.details,
            }

        # Add mold spot analysis data
        if mold_spot_analysis:
            fruit_obj["mold_spot_analysis"] = {
                "mold_detected": mold_spot_analysis.mold_detected,
                "white_mold_pct": mold_spot_analysis.white_mold_pct,
                "black_mold_pct": mold_spot_analysis.black_mold_pct,
                "total_mold_pct": mold_spot_analysis.total_mold_pct,
                "spot_count": mold_spot_analysis.spot_count,
                "severity": mold_spot_analysis.severity,
                "details": mold_spot_analysis.details,
            }

        # NOTE: analytics is computed after fruit detection (below)
        # so that per-fruit distribution can override model probabilities.

    # --- Fruit Object Detection (per-fruit in clusters) ---
    fruit_detection = None
    detection_distribution = None
    if subject == "fruit" and fruit_pred is not None:
        try:
            det = detect_fruit_objects(image_bgr)
            if det["total_detected"] > 0:
                MAX_CLASSIFY = 30
                classifications: dict[int, str] = {}
                per_fruit_list: list[dict[str, Any]] = []

                _ml = fruit_model if fruit_model.available() else None
                for fobj in det["fruits"][:MAX_CLASSIFY]:
                    cls_info = classify_single_fruit(image_bgr, fobj, ml_model=_ml)
                    classifications[fobj.id] = cls_info["classification"]
                    per_fruit_list.append({
                        "id": fobj.id,
                        "bbox": {"x": fobj.bbox[0], "y": fobj.bbox[1],
                                 "w": fobj.bbox[2], "h": fobj.bbox[3]},
                        "center": {"x": fobj.center[0], "y": fobj.center[1]},
                        "radius": fobj.radius,
                        "classification": cls_info["classification"],
                        "confidence": cls_info["confidence"],
                        "color_stage": cls_info["color_stage"],
                    })

                # Annotated image
                ann_img = generate_detection_image(image_bgr, det["fruits"], classifications)
                ann_b64 = encode_image_base64(ann_img, quality=75)

                # Summary counts
                class_counts: dict[str, int] = {}
                for fr in per_fruit_list:
                    c = fr["classification"]
                    class_counts[c] = class_counts.get(c, 0) + 1
                total = len(per_fruit_list)

                fruit_detection = {
                    "total_detected": total,
                    "annotated_image": ann_b64,
                    "fruits": per_fruit_list,
                    "summary": {
                        "ripe": class_counts.get("ripe", 0),
                        "unripe": class_counts.get("unripe", 0),
                        "overripe": class_counts.get("overripe", 0),
                        "mold": class_counts.get("mold", 0),
                        "distribution": {
                            c: round(cnt / total * 100, 1)
                            for c, cnt in class_counts.items()
                        } if total > 0 else {},
                    },
                }
                # Use per-fruit distribution for analytics (more accurate)
                detection_distribution = fruit_detection["summary"]["distribution"]
        except Exception as e:
            print(f"[WARN] Fruit object detection failed: {e}")
            fruit_detection = None

    # Compute analytics AFTER fruit detection so per-fruit data is available
    if fruit_pred is not None:
        analytics = compute_fruit_analytics(
            all_probabilities=fruit_pred.all_probabilities or {},
            mold_present=fruit_mold_present,
            ripeness_stage=ripeness,
            detection_distribution=detection_distribution,
        )
        # Add detection count to analytics for frontend display
        if fruit_detection:
            analytics["fruit_detection_count"] = fruit_detection["total_detected"]

    if leaf_pred is not None:
        leaf_class = leaf_pred.class_name
        all_probs = leaf_pred.all_probabilities or {}
        leaf_obj = {
            "class": leaf_class,
            "confidence": leaf_pred.confidence,
            "mold_present": (leaf_class == "mold") or mold_heuristic,
            "all_probabilities": all_probs,
        }
        # Compute detailed AI analytics for leaf
        analytics = compute_leaf_analytics(
            all_probabilities=all_probs,
            mold_present=(leaf_class == "mold") or mold_heuristic,
        )

    mold_present = bool((fruit_obj and fruit_obj.get("mold_present")) or (leaf_obj and leaf_obj.get("mold_present")))
    ripeness_stage = fruit_obj.get("ripeness_stage") if fruit_obj else None
    quality = fruit_obj.get("quality") if fruit_obj else None

    # Check if the image is actually a Bignay (with image quality context)
    _raw_conf = (fruit_obj or leaf_obj or {}).get("confidence", 0.0)
    try:
        current_confidence = float(_raw_conf)
        if current_confidence != current_confidence or current_confidence == float('inf'):  # NaN / inf guard
            current_confidence = 0.0
    except (TypeError, ValueError):
        current_confidence = 0.0
    current_confidence = max(0.0, min(1.0, current_confidence))
    bignay_detection = _is_bignay_image(current_confidence, features, image_quality)

    # ML-based not-bignay detection (pre-filter using dedicated model)
    not_bignay_check = not_bignay_model.is_bignay(input_tensor)
    if not_bignay_check.get("model_available") and not not_bignay_check.get("is_bignay"):
        # ML model says this is NOT a bignay — override heuristic detection
        bignay_detection["is_bignay"] = False
        bignay_detection["confidence_level"] = "ml_rejected"
        bignay_detection["reason"] = (
            f"The AI model determined this image is not a Bignay fruit or leaf "
            f"({not_bignay_check['not_bignay_probability'] * 100:.0f}% not-bignay confidence)."
        )
        bignay_detection["not_bignay_model"] = not_bignay_check
    elif not_bignay_check.get("model_available"):
        # ML model says this IS bignay — add model info for transparency
        bignay_detection["not_bignay_model"] = not_bignay_check

    # Determine mold confidence for threshold-aware recommendation
    mold_conf = 0.0
    if mold_present:
        all_probs = (fruit_obj or leaf_obj or {}).get("all_probabilities", {})
        mold_conf = all_probs.get("mold", current_confidence if (fruit_obj or leaf_obj or {}).get("class") == "mold" else 0.0)

    rec = recommend(ripeness_stage=ripeness_stage, mold_present=mold_present, quality=quality, mold_confidence=mold_conf)

    # If not detected as Bignay, modify the response accordingly
    if not bignay_detection["is_bignay"]:
        response = {
            "result": "not_bignay",
            "confidence": current_confidence,
            "subject": subject,
            "image_sha256": image_sha256,
            "fruit": None,
            "leaf": None,
            "analytics": None,
            "fruit_detection": None,
            "is_bignay": False,
            "detection": bignay_detection,
            "image_quality": {
                "overall": image_quality.overall_quality,
                "blur_score": image_quality.blur_score,
                "brightness_score": image_quality.brightness_score,
                "contrast_score": image_quality.contrast_score,
                "subject_size_score": image_quality.subject_size_score,
                "issues": image_quality.issues,
                "recommendations": image_quality.recommendations,
            },
            "color": {
                "hsv_mean": features.color_hsv_mean,
                "lab_mean": features.color_lab_mean,
            },
            "size": {
                "px_diameter": features.size_px_diameter,
                "mask_coverage": features.mask_coverage,
            },
            "recommendation": {
                "primary": "Please scan a Bignay fruit or leaf",
                "alternatives": [],
                "reason": bignay_detection["reason"],
                "tips": image_quality.recommendations,
            },
            "debug": {
                "mold_heuristic": mold_heuristic,
                "fruit_model_available": fruit_model.available(),
                "leaf_model_available": leaf_model.available(),
                "not_bignay_model_available": not_bignay_model.available(),
                "detection_reason": bignay_detection["reason"],
                "used_enhanced_image": used_enhanced,
            },
            "time": datetime.now(timezone.utc).isoformat(),
        }
    else:
        # Build recommendation with quality-aware tips
        quality_tips = []
        if leaf_interference and leaf_interference.get("warning"):
            quality_tips.append(leaf_interference["warning"])
        if bignay_detection.get("warning"):
            quality_tips.append(bignay_detection["warning"])
        if image_quality.overall_quality != "good" and image_quality.recommendations:
            quality_tips.extend(image_quality.recommendations[:2])
        
        # Primary result: use display_class (never "good") for fruit
        primary_result = (fruit_obj or leaf_obj or {}).get("class", "unknown")
        
        response = {
            # Backwards-compatible fields used by existing frontend
            "result": primary_result,
            "confidence": current_confidence,
            "is_bignay": True,
            "detection": bignay_detection,

            # Extended fields
            "subject": subject,
            "image_sha256": image_sha256,
            "fruit": fruit_obj,
            "leaf": leaf_obj,
            "analytics": analytics,
            "fruit_detection": fruit_detection,
            "leaf_interference": leaf_interference,
            "image_quality": {
                "overall": image_quality.overall_quality,
                "blur_score": image_quality.blur_score,
                "brightness_score": image_quality.brightness_score,
                "contrast_score": image_quality.contrast_score,
                "subject_size_score": image_quality.subject_size_score,
                "issues": image_quality.issues,
                "recommendations": image_quality.recommendations,
            },
            "color": {
                "hsv_mean": features.color_hsv_mean,
                "lab_mean": features.color_lab_mean,
            },
            "size": {
                "px_diameter": features.size_px_diameter,
                "mask_coverage": features.mask_coverage,
            },
            "recommendation": {
                "primary": rec.primary,
                "alternatives": rec.alternatives,
                "reason": rec.reason,
                "tips": quality_tips,
            },
            "debug": {
                "mold_heuristic": mold_heuristic,
                "fruit_model_available": fruit_model.available(),
                "leaf_model_available": leaf_model.available(),
                "not_bignay_model_available": not_bignay_model.available(),
                "used_enhanced_image": used_enhanced,
                "leaf_interference": leaf_interference,
                "color_analysis_stage": color_analysis.stage if color_analysis else None,
                "mold_spot_severity": mold_spot_analysis.severity if mold_spot_analysis else None,
            },
            "time": datetime.now(timezone.utc).isoformat(),
        }

    user_info = get_current_user(request)

    # Store to MongoDB (metadata by default)
    record = {
        "subject": subject,
        "image_sha256": image_sha256,
        "result": response["result"],
        "confidence": response["confidence"],
        "detection": response.get("detection"),
        "image_quality": response.get("image_quality"),
        "fruit": fruit_obj,
        "leaf": leaf_obj,
        "analytics": analytics,
        "fruit_detection": {
            k: v for k, v in (fruit_detection or {}).items()
            if k != "annotated_image"  # Don't store large base64 in DB
        } if fruit_detection else None,
        "color": response["color"],
        "size": response["size"],
        "recommendation": response["recommendation"],
        "debug": response["debug"],
        "time": response.get("time"),
        "client": {
            "ip": request.remote_addr,
            "user_agent": request.headers.get("User-Agent"),
        },
    }
    if user_info and user_info.get("user_id"):
        record["user_id"] = user_info.get("user_id")
        record["user_role"] = user_info.get("role")
    if settings.store_images_in_db or bool(body.get("store_image")):
        record["image_data_url"] = data_url

    try:
        inserted_id = store.insert_prediction(safe_json(record))
        response["db"] = {"saved": bool(inserted_id), "id": inserted_id}
    except Exception as e:  # pylint: disable=broad-except
        response["db"] = {"saved": False, "error": str(e)}

    return jsonify(safe_json(response))


@app.get("/predictions")
def predictions():
    user_info = get_current_user(request)
    if not user_info:
        return jsonify({"ok": False, "error": "Authentication required"}), 401

    try:
        limit_raw = request.args.get("limit", "50")
        limit = int(limit_raw) if str(limit_raw).lstrip('-').isdigit() else 50
        limit = max(1, min(limit, 200))
    except (ValueError, AttributeError):
        limit = 50

    category = str(request.args.get("category", "")).strip().lower() or None
    start_date_raw = str(request.args.get("start_date", "")).strip()
    end_date_raw = str(request.args.get("end_date", "")).strip()

    start_date = None
    end_date = None
    try:
        if start_date_raw:
            start_date = datetime.fromisoformat(start_date_raw.replace("Z", "+00:00"))
            if start_date.tzinfo is None:
                start_date = start_date.replace(tzinfo=timezone.utc)
        if end_date_raw:
            end_date = datetime.fromisoformat(end_date_raw.replace("Z", "+00:00"))
            if end_date.tzinfo is None:
                end_date = end_date.replace(tzinfo=timezone.utc)
    except ValueError:
        return jsonify({"ok": False, "error": "Invalid date format. Use ISO format."}), 400

    items = store.list_predictions(
        limit=limit,
        user_id=user_info.get("user_id"),
        category=category,
        start_date=start_date,
        end_date=end_date,
    )
    return jsonify({"items": items, "count": len(items)})


@app.delete("/predictions/<prediction_id>")
def delete_prediction(prediction_id):
    user_info = get_current_user(request)
    if not user_info:
        return jsonify({"ok": False, "error": "Authentication required"}), 401

    deleted = store.delete_prediction(prediction_id, user_info.get("user_id"))
    if deleted:
        return jsonify({"ok": True, "message": "Prediction deleted"})
    else:
        return jsonify({"ok": False, "error": "Prediction not found or not authorized"}), 404


@app.post("/predictions/export-pdf")
def export_prediction_pdf():
    """Generate a PDF report for one or two scan predictions (compare mode)."""
    from flask import Response
    from utils.pdf_generator import generate_prediction_report_pdf, is_pdf_generation_available

    user_info = get_current_user(request)
    if not user_info:
        return jsonify({"ok": False, "error": "Authentication required"}), 401

    if not is_pdf_generation_available():
        return jsonify({"ok": False, "error": "PDF generation is not available on this server"}), 503

    body = request.get_json(silent=True) or {}
    prediction = body.get("prediction")
    compare_prediction = body.get("comparePrediction")  # optional

    if not prediction:
        return jsonify({"ok": False, "error": "prediction is required"}), 400

    try:
        pdf_content = generate_prediction_report_pdf(prediction, compare_prediction)
        if not pdf_content:
            return jsonify({"ok": False, "error": "Failed to generate PDF report"}), 500

        subject = (prediction.get("subject") or "scan").lower()
        result = (prediction.get("result") or "report").lower().replace(" ", "_")
        suffix = "_comparison" if compare_prediction else ""
        filename = f"bignay_{subject}_{result}{suffix}.pdf"

        return Response(
            pdf_content,
            mimetype="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "application/pdf",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        print(f"[Predictions] PDF export error: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    import socket as _socket
    def _get_local_ip():
        try:
            s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
            s.settimeout(2)
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
            s.shutdown(_socket.SHUT_RDWR)
            s.close()
            return ip
        except OSError:
            return '127.0.0.1'
    _local_ip = _get_local_ip()
    print("\n" + "="*60)
    print("🍇 BIGNAY BACKEND SERVER")
    print("="*60)
    print(f"\n✓ Server is starting...")
    print(f"  Host: {settings.host}")
    print(f"  Port: {settings.port}")
    print(f"  Debug: {settings.debug}")
    print(f"\n📱 Connect from your devices using:")
    print(f"  • Local:      http://localhost:{settings.port}")
    print(f"  • Network:    http://{_local_ip}:{settings.port}")
    print(f"\n📋 Available endpoints:")
    print(f"  • Health:     /health")
    print(f"  • App Config: /app-config")
    print(f"  • Predict:    /predict")
    print(f"  • Auth:       /api/auth/*")
    print(f"  • Products:   /api/products/*")
    print(f"  • Orders:     /api/orders/*")
    print(f"  • Reviews:    /api/reviews/*")
    print("\n" + "="*60 + "\n")
    
    socketio.run(app, host=settings.host, port=settings.port, debug=settings.debug, allow_unsafe_werkzeug=True)
