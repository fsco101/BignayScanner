"""
Authentication Routes
Handles login, registration, token management, email verification, and password reset
"""

from __future__ import annotations
from datetime import datetime, timezone, timedelta
from flask import Blueprint, jsonify, request
import secrets
import hashlib
import random
import string
import requests

from models.user import User, UserRole
from utils.validators import (
    validate_email, 
    validate_password, 
    validate_required_fields,
    validate_name,
    validate_phone
)
from utils.firebase_admin import verify_id_token, is_firebase_admin_configured

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Simple token storage (in production, use Redis or database)
_active_tokens = {}

# Verification code storage: { email: { code, expires_at, purpose, user_data? } }
_verification_codes = {}


def _generate_token(user_id: str, role: str) -> str:
    """Generate a simple auth token"""
    token = secrets.token_urlsafe(32)
    _active_tokens[token] = {
        'user_id': user_id,
        'role': role,
        'created_at': datetime.now(timezone.utc),
        'expires_at': datetime.now(timezone.utc) + timedelta(days=7)
    }
    return token


def verify_token(token: str) -> dict | None:
    """Verify token and return user info"""
    if not token:
        return None
    
    # Remove 'Bearer ' prefix if present
    if token.startswith('Bearer '):
        token = token[7:]
    
    token_data = _active_tokens.get(token)
    if not token_data:
        return None
    
    if datetime.now(timezone.utc) > token_data['expires_at']:
        del _active_tokens[token]
        return None
    
    return token_data


def get_current_user(request) -> dict | None:
    """Get current user from request authorization header or query param"""
    # First try Authorization header
    auth_header = request.headers.get('Authorization')
    if auth_header:
        return verify_token(auth_header)
    
    # Fallback to query parameter (for PDF downloads in web browser)
    token = request.args.get('token')
    if token:
        return verify_token(token)
    
    return None


def require_auth(f):
    """Decorator to require authentication"""
    from functools import wraps
    
    @wraps(f)
    def decorated(*args, **kwargs):
        user_info = get_current_user(request)
        if not user_info:
            return jsonify({'ok': False, 'error': 'Authentication required'}), 401
        request.user_info = user_info
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    """Decorator to require admin role"""
    from functools import wraps
    
    @wraps(f)
    def decorated(*args, **kwargs):
        user_info = get_current_user(request)
        if not user_info:
            return jsonify({'ok': False, 'error': 'Authentication required'}), 401
        if user_info.get('role') != 'admin':
            return jsonify({'ok': False, 'error': 'Admin access required'}), 403
        request.user_info = user_info
        return f(*args, **kwargs)
    return decorated


def _get_users_collection():
    """Get MongoDB users collection"""
    from flask import current_app
    return current_app.config.get('db_users')


def _generate_verification_code():
    """Generate a 6-digit verification code"""
    return ''.join(random.choices(string.digits, k=6))


def _cleanup_expired_codes():
    """Remove expired verification codes"""
    now = datetime.now(timezone.utc)
    expired = [email for email, data in _verification_codes.items() if now > data['expires_at']]
    for email in expired:
        del _verification_codes[email]


def _verify_google_access_token(access_token: str) -> dict | None:
    """Verify Google access token and return trusted user claims."""
    if not access_token:
        return None

    try:
        response = requests.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=10,
        )
        if not response.ok:
            return None

        user_info = response.json()
        if not user_info.get('sub') or not user_info.get('email'):
            return None

        return user_info
    except Exception:
        return None


@auth_bp.route('/check-email', methods=['POST'])
def check_email():
    """
    Check if an email is already registered.
    Used during registration step 1 to give early feedback.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400

        email = (data.get('email') or '').strip().lower()
        if not email:
            return jsonify({'ok': False, 'error': 'Email is required'}), 400

        users_collection = _get_users_collection()
        if users_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503

        existing_user = users_collection.find_one({'email': email})
        if existing_user:
            return jsonify({'ok': False, 'exists': True, 'error': 'An account with this email already exists'}), 409

        return jsonify({'ok': True, 'exists': False}), 200
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@auth_bp.route('/send-verification', methods=['POST'])
def send_verification():
    """
    Send email verification code during registration.
    Validates all registration fields first, then sends code.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        # Validate required fields
        required = ['email', 'password', 'first_name', 'last_name']
        is_valid, missing = validate_required_fields(data, required)
        if not is_valid:
            return jsonify({'ok': False, 'errors': missing}), 400
        
        # Validate email
        email = data.get('email', '').strip().lower()
        is_valid, error = validate_email(email)
        if not is_valid:
            return jsonify({'ok': False, 'error': error}), 400
        
        # Validate password
        password = data.get('password', '')
        is_valid, errors = validate_password(password)
        if not is_valid:
            return jsonify({'ok': False, 'errors': errors}), 400
        
        # Validate names
        first_name = data.get('first_name', '').strip()
        is_valid, error = validate_name(first_name, 'First Name')
        if not is_valid:
            return jsonify({'ok': False, 'error': error}), 400
        
        last_name = data.get('last_name', '').strip()
        is_valid, error = validate_name(last_name, 'Last Name')
        if not is_valid:
            return jsonify({'ok': False, 'error': error}), 400
        
        # Validate phone if provided
        phone = data.get('phone', '').strip()
        if phone:
            is_valid, error = validate_phone(phone)
            if not is_valid:
                return jsonify({'ok': False, 'error': error}), 400
        
        # Check if user already exists
        users_collection = _get_users_collection()
        if users_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        existing_user = users_collection.find_one({'email': email})
        if existing_user:
            return jsonify({'ok': False, 'error': 'An account with this email already exists'}), 409
        
        # Rate limit: don't allow resend within 60 seconds
        _cleanup_expired_codes()
        existing_code = _verification_codes.get(email)
        if existing_code:
            time_left = (existing_code['expires_at'] - datetime.now(timezone.utc)).total_seconds()
            if time_left > 540:  # within first 60 seconds of 10 min window
                return jsonify({'ok': False, 'error': 'Please wait before requesting another code'}), 429
        
        # Generate and store verification code
        code = _generate_verification_code()
        _verification_codes[email] = {
            'code': code,
            'expires_at': datetime.now(timezone.utc) + timedelta(minutes=10),
            'purpose': 'verify',
            'user_data': {
                'email': email,
                'password': password,
                'first_name': first_name,
                'last_name': last_name,
                'phone': phone or None,
                'address': data.get('address', '').strip() or None,
                'city': data.get('city', '').strip() or None,
                'province': data.get('province', '').strip() or None,
                'postal_code': data.get('postal_code', '').strip() or None,
                'google_id': data.get('google_id', '').strip() or None,
                'firebase_uid': data.get('firebase_uid', '').strip() or None,
                'auth_provider': data.get('auth_provider', 'local').strip(),
                'profile_image': data.get('profile_image', '').strip() or None,
            }
        }
        
        # Send verification email
        from utils.email_service import get_email_service
        email_service = get_email_service()
        sent = email_service.send_verification_code(email, code, purpose='verify')
        
        if not sent:
            return jsonify({'ok': False, 'error': 'Failed to send verification email. Please check your email address and try again.'}), 500
        
        return jsonify({
            'ok': True,
            'message': 'Verification code sent to your email',
        }), 200
    
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Failed to send verification: {str(e)}'}), 500


@auth_bp.route('/verify-code', methods=['POST'])
def verify_code_and_register():
    """
    Verify the email code and complete registration.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip().lower()
        code = data.get('code', '').strip()
        
        if not email or not code:
            return jsonify({'ok': False, 'error': 'Email and verification code are required'}), 400
        
        # Check stored verification code
        _cleanup_expired_codes()
        stored = _verification_codes.get(email)
        
        if not stored:
            return jsonify({'ok': False, 'error': 'Verification code expired or not found. Please request a new code.'}), 400
        
        if stored['purpose'] != 'verify':
            return jsonify({'ok': False, 'error': 'Invalid verification attempt'}), 400
        
        if stored['code'] != code:
            return jsonify({'ok': False, 'error': 'Invalid verification code. Please check and try again.'}), 400
        
        # Code is valid — create user
        user_data = stored['user_data']
        users_collection = _get_users_collection()
        if users_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Double check user doesn't already exist
        existing_user = users_collection.find_one({'email': email})
        if existing_user:
            del _verification_codes[email]
            return jsonify({'ok': False, 'error': 'An account with this email already exists'}), 409
        
        # Create new user
        google_id = user_data.get('google_id')
        firebase_uid = user_data.get('firebase_uid')
        auth_provider = user_data.get('auth_provider', 'local')
        profile_image = user_data.get('profile_image')
        
        user = User(
            email=user_data['email'],
            password_hash=User.hash_password(user_data['password']),
            first_name=user_data['first_name'],
            last_name=user_data['last_name'],
            role=UserRole.USER,
            phone=user_data.get('phone'),
            address=user_data.get('address'),
            city=user_data.get('city'),
            province=user_data.get('province'),
            postal_code=user_data.get('postal_code'),
            google_id=google_id,
            firebase_uid=firebase_uid,
            auth_provider=auth_provider,
            profile_image=profile_image,
            is_verified=True,
        )
        
        # Save to database
        result = users_collection.insert_one(user.to_dict(include_password=True))
        user._id = str(result.inserted_id)
        
        # Clean up verification code
        del _verification_codes[email]
        
        # Generate token
        token = _generate_token(user._id, user.role.value)
        
        return jsonify({
            'ok': True,
            'message': 'Email verified and registration successful',
            'token': token,
            'user': user.to_public_dict()
        }), 201
    
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Verification failed: {str(e)}'}), 500


@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """
    Send a password reset verification code to the user's email.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip().lower()
        if not email:
            return jsonify({'ok': False, 'error': 'Email is required'}), 400
        
        # Validate email format
        is_valid, error = validate_email(email)
        if not is_valid:
            return jsonify({'ok': False, 'error': error}), 400
        
        # Check if user exists
        users_collection = _get_users_collection()
        if users_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        user_doc = users_collection.find_one({'email': email})
        if not user_doc:
            # Don't reveal whether user exists for security
            return jsonify({'ok': True, 'message': 'If an account with this email exists, a reset code has been sent.'}), 200
        
        # Check if it's a Google/Firebase-only user (no password)
        if user_doc.get('auth_provider', 'local') != 'local' and not user_doc.get('password_hash'):
            return jsonify({'ok': False, 'error': 'This account uses Google sign-in. Please use Google to log in.'}), 400
        
        # Rate limit
        _cleanup_expired_codes()
        reset_key = f"reset_{email}"
        existing_code = _verification_codes.get(reset_key)
        if existing_code:
            time_left = (existing_code['expires_at'] - datetime.now(timezone.utc)).total_seconds()
            if time_left > 540:
                return jsonify({'ok': False, 'error': 'Please wait before requesting another code'}), 429
        
        # Generate and store reset code
        code = _generate_verification_code()
        _verification_codes[reset_key] = {
            'code': code,
            'expires_at': datetime.now(timezone.utc) + timedelta(minutes=10),
            'purpose': 'reset',
            'email': email,
        }
        
        # Send reset email
        from utils.email_service import get_email_service
        email_service = get_email_service()
        sent = email_service.send_verification_code(email, code, purpose='reset')
        
        if not sent:
            return jsonify({'ok': False, 'error': 'Failed to send reset email. Please try again later.'}), 500
        
        return jsonify({
            'ok': True,
            'message': 'Password reset code sent to your email',
        }), 200
    
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Failed to send reset code: {str(e)}'}), 500


@auth_bp.route('/verify-reset-code', methods=['POST'])
def verify_reset_code():
    """
    Verify the password reset code (without resetting yet).
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip().lower()
        code = data.get('code', '').strip()
        
        if not email or not code:
            return jsonify({'ok': False, 'error': 'Email and code are required'}), 400
        
        _cleanup_expired_codes()
        reset_key = f"reset_{email}"
        stored = _verification_codes.get(reset_key)
        
        if not stored:
            return jsonify({'ok': False, 'error': 'Reset code expired or not found. Please request a new code.'}), 400
        
        if stored['purpose'] != 'reset':
            return jsonify({'ok': False, 'error': 'Invalid reset attempt'}), 400
        
        if stored['code'] != code:
            return jsonify({'ok': False, 'error': 'Invalid reset code. Please check and try again.'}), 400
        
        # Code is valid — mark as verified (keep it for reset-password step)
        stored['verified'] = True
        
        return jsonify({
            'ok': True,
            'message': 'Code verified successfully',
        }), 200
    
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Verification failed: {str(e)}'}), 500


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """
    Reset password after code verification.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip().lower()
        code = data.get('code', '').strip()
        new_password = data.get('new_password', '')
        
        if not email or not code or not new_password:
            return jsonify({'ok': False, 'error': 'Email, code, and new password are required'}), 400
        
        # Validate new password
        is_valid, errors = validate_password(new_password)
        if not is_valid:
            return jsonify({'ok': False, 'errors': errors}), 400
        
        # Verify code again
        _cleanup_expired_codes()
        reset_key = f"reset_{email}"
        stored = _verification_codes.get(reset_key)
        
        if not stored:
            return jsonify({'ok': False, 'error': 'Reset code expired. Please request a new code.'}), 400
        
        if stored['code'] != code:
            return jsonify({'ok': False, 'error': 'Invalid reset code'}), 400
        
        # Update password in database
        users_collection = _get_users_collection()
        if users_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        user_doc = users_collection.find_one({'email': email})
        if not user_doc:
            return jsonify({'ok': False, 'error': 'User not found'}), 404
        
        new_hash = User.hash_password(new_password)
        users_collection.update_one(
            {'_id': user_doc['_id']},
            {'$set': {
                'password_hash': new_hash,
                'updated_at': datetime.now(timezone.utc)
            }}
        )
        
        # Clean up
        del _verification_codes[reset_key]
        
        return jsonify({
            'ok': True,
            'message': 'Password reset successfully. You can now log in with your new password.',
        }), 200
    
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Password reset failed: {str(e)}'}), 500


@auth_bp.route('/register', methods=['POST'])
def register():
    """
    Register a new user (legacy endpoint - still functional for backward compatibility)
    Required fields: email, password, first_name, last_name
    Optional fields: phone, address, city, province, postal_code
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        # Validate required fields
        required = ['email', 'password', 'first_name', 'last_name']
        is_valid, missing = validate_required_fields(data, required)
        if not is_valid:
            return jsonify({'ok': False, 'errors': missing}), 400
        
        # Validate email
        email = data.get('email', '').strip().lower()
        is_valid, error = validate_email(email)
        if not is_valid:
            return jsonify({'ok': False, 'error': error}), 400
        
        # Validate password
        password = data.get('password', '')
        is_valid, errors = validate_password(password)
        if not is_valid:
            return jsonify({'ok': False, 'errors': errors}), 400
        
        # Validate names
        first_name = data.get('first_name', '').strip()
        is_valid, error = validate_name(first_name, 'First Name')
        if not is_valid:
            return jsonify({'ok': False, 'error': error}), 400
        
        last_name = data.get('last_name', '').strip()
        is_valid, error = validate_name(last_name, 'Last Name')
        if not is_valid:
            return jsonify({'ok': False, 'error': error}), 400
        
        # Validate phone if provided
        phone = data.get('phone', '').strip()
        if phone:
            is_valid, error = validate_phone(phone)
            if not is_valid:
                return jsonify({'ok': False, 'error': error}), 400
        
        # Check if user already exists
        users_collection = _get_users_collection()
        if users_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        existing_user = users_collection.find_one({'email': email})
        if existing_user:
            return jsonify({'ok': False, 'error': 'An account with this email already exists'}), 409
        
        # Check for Google/Firebase linking data
        google_id = data.get('google_id', '').strip()
        firebase_uid = data.get('firebase_uid', '').strip()
        auth_provider = 'local'
        profile_image = data.get('profile_image', '').strip() or None
        is_verified = False
        
        if google_id or firebase_uid:
            auth_provider = 'google' if google_id else f"firebase:{data.get('provider', 'google.com')}"
            is_verified = True  # Google/Firebase users are already email-verified
        
        # Create new user
        user = User(
            email=email,
            password_hash=User.hash_password(password),
            first_name=first_name,
            last_name=last_name,
            role=UserRole.USER,
            phone=phone or None,
            address=data.get('address', '').strip() or None,
            city=data.get('city', '').strip() or None,
            province=data.get('province', '').strip() or None,
            postal_code=data.get('postal_code', '').strip() or None,
            google_id=google_id or None,
            firebase_uid=firebase_uid or None,
            auth_provider=auth_provider,
            profile_image=profile_image,
            is_verified=is_verified,
        )
        
        # Save to database
        result = users_collection.insert_one(user.to_dict(include_password=True))
        user._id = str(result.inserted_id)
        
        # Generate token
        token = _generate_token(user._id, user.role.value)
        
        return jsonify({
            'ok': True,
            'message': 'Registration successful',
            'token': token,
            'user': user.to_public_dict()
        }), 201
    
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Registration failed: {str(e)}'}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Login with email and password
    Returns auth token and user info
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        
        if not email or not password:
            return jsonify({'ok': False, 'error': 'Email and password are required'}), 400
        
        # Find user
        users_collection = _get_users_collection()
        if users_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        user_doc = users_collection.find_one({'email': email})
        if not user_doc:
            return jsonify({'ok': False, 'error': 'Invalid email or password'}), 401
        
        # Verify password
        if not User.verify_password(password, user_doc.get('password_hash', '')):
            return jsonify({'ok': False, 'error': 'Invalid email or password'}), 401
        
        # Check if user is active
        if not user_doc.get('is_active', True):
            return jsonify({'ok': False, 'error': 'Your account has been deactivated'}), 403
        
        # Check if user is suspended
        if user_doc.get('is_suspended'):
            suspension_end = user_doc.get('suspension_end')
            suspension_reason = user_doc.get('suspension_reason', 'Violation of community guidelines')
            
            # Check if suspension has expired
            if suspension_end:
                if isinstance(suspension_end, str):
                    suspension_end = datetime.fromisoformat(suspension_end.replace('Z', '+00:00'))
                # Ensure timezone-aware for comparison (MongoDB returns naive datetimes)
                if isinstance(suspension_end, datetime) and suspension_end.tzinfo is None:
                    suspension_end = suspension_end.replace(tzinfo=timezone.utc)
                
                if datetime.now(timezone.utc) > suspension_end:
                    # Suspension has expired, automatically lift it
                    users_collection.update_one(
                        {'_id': user_doc['_id']},
                        {'$set': {
                            'is_suspended': False,
                            'suspension_type': None,
                            'suspension_reason': None,
                            'suspension_start': None,
                            'suspension_end': None,
                            'suspended_by': None,
                            'updated_at': datetime.now(timezone.utc)
                        }}
                    )
                else:
                    # Still suspended
                    end_date_str = suspension_end.strftime('%B %d, %Y at %I:%M %p UTC')
                    return jsonify({
                        'ok': False, 
                        'error': f'Your account is suspended until {end_date_str}',
                        'suspension': {
                            'reason': suspension_reason,
                            'end': suspension_end.isoformat(),
                            'is_permanent': False
                        }
                    }), 403
            else:
                # Permanent suspension
                return jsonify({
                    'ok': False, 
                    'error': 'Your account has been permanently suspended',
                    'suspension': {
                        'reason': suspension_reason,
                        'end': None,
                        'is_permanent': True
                    }
                }), 403
        
        # Create user object
        user = User.from_dict(user_doc)
        user._id = str(user_doc['_id'])
        
        # Update last login
        users_collection.update_one(
            {'_id': user_doc['_id']},
            {'$set': {'last_login': datetime.now(timezone.utc)}}
        )
        
        # Generate token
        token = _generate_token(user._id, user.role.value if isinstance(user.role, UserRole) else user.role)
        
        return jsonify({
            'ok': True,
            'message': 'Login successful',
            'token': token,
            'user': user.to_public_dict()
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Login failed: {str(e)}'}), 500


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Logout and invalidate token"""
    auth_header = request.headers.get('Authorization')
    if auth_header:
        token = auth_header.replace('Bearer ', '')
        if token in _active_tokens:
            del _active_tokens[token]
    
    return jsonify({'ok': True, 'message': 'Logged out successfully'})


@auth_bp.route('/google', methods=['POST'])
def google_login():
    """
    Login or register with Google OAuth
    Expects: google_id, email, first_name, last_name, profile_image, access_token
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        google_id = data.get('google_id', '').strip()
        email = data.get('email', '').strip().lower()
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        profile_image = data.get('profile_image', '').strip()
        access_token = data.get('access_token', '').strip()
        
        if not google_id or not email:
            return jsonify({'ok': False, 'error': 'Google ID and email are required'}), 400

        if not access_token:
            return jsonify({'ok': False, 'error': 'Google access token is required'}), 400

        verified_user = _verify_google_access_token(access_token)
        if not verified_user:
            return jsonify({'ok': False, 'error': 'Invalid Google access token'}), 401

        verified_google_id = verified_user.get('sub', '').strip()
        verified_email = verified_user.get('email', '').strip().lower()

        if google_id != verified_google_id:
            return jsonify({'ok': False, 'error': 'Google ID does not match token'}), 401

        if email != verified_email:
            return jsonify({'ok': False, 'error': 'Email does not match token'}), 401

        first_name = first_name or (verified_user.get('given_name', '').strip())
        last_name = last_name or (verified_user.get('family_name', '').strip())
        profile_image = profile_image or (verified_user.get('picture', '').strip())
        
        users_collection = _get_users_collection()
        if users_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Try to find existing user by google_id or email
        user_doc = users_collection.find_one({
            '$or': [
                {'google_id': google_id},
                {'email': email}
            ]
        })
        
        if user_doc:
            # Existing user - update google_id if needed and login
            update_fields = {
                'last_login': datetime.now(timezone.utc),
                'updated_at': datetime.now(timezone.utc)
            }
            
            # Update google_id if user registered with email but now using Google
            if not user_doc.get('google_id'):
                update_fields['google_id'] = google_id
                update_fields['auth_provider'] = 'google'
            
            # Update profile image if provided and not already set
            if profile_image and not user_doc.get('profile_image'):
                update_fields['profile_image'] = profile_image
            
            users_collection.update_one(
                {'_id': user_doc['_id']},
                {'$set': update_fields}
            )
            
            # Check if user is active
            if not user_doc.get('is_active', True):
                return jsonify({'ok': False, 'error': 'Your account has been deactivated'}), 403
            
            # Check if user is suspended
            if user_doc.get('is_suspended'):
                suspension_end = user_doc.get('suspension_end')
                suspension_reason = user_doc.get('suspension_reason', 'Violation of community guidelines')
                
                # Check if suspension has expired
                if suspension_end:
                    if isinstance(suspension_end, str):
                        suspension_end = datetime.fromisoformat(suspension_end.replace('Z', '+00:00'))
                    # Ensure timezone-aware for comparison (MongoDB returns naive datetimes)
                    if isinstance(suspension_end, datetime) and suspension_end.tzinfo is None:
                        suspension_end = suspension_end.replace(tzinfo=timezone.utc)
                    
                    if datetime.now(timezone.utc) > suspension_end:
                        # Suspension has expired, automatically lift it
                        users_collection.update_one(
                            {'_id': user_doc['_id']},
                            {'$set': {
                                'is_suspended': False,
                                'suspension_type': None,
                                'suspension_reason': None,
                                'suspension_start': None,
                                'suspension_end': None,
                                'suspended_by': None,
                                'updated_at': datetime.now(timezone.utc)
                            }}
                        )
                    else:
                        # Still suspended
                        end_date_str = suspension_end.strftime('%B %d, %Y at %I:%M %p UTC')
                        return jsonify({
                            'ok': False, 
                            'error': f'Your account is suspended until {end_date_str}',
                            'suspension': {
                                'reason': suspension_reason,
                                'end': suspension_end.isoformat(),
                                'is_permanent': False
                            }
                        }), 403
                else:
                    # Permanent suspension
                    return jsonify({
                        'ok': False, 
                        'error': 'Your account has been permanently suspended',
                        'suspension': {
                            'reason': suspension_reason,
                            'end': None,
                            'is_permanent': True
                        }
                    }), 403
            
            user = User.from_dict(user_doc)
            user._id = str(user_doc['_id'])
            
        else:
            # User not found - redirect to registration
            return jsonify({
                'ok': False,
                'needsRegistration': True,
                'googleData': {
                    'email': email,
                    'firstName': first_name or email.split('@')[0],
                    'lastName': last_name or '',
                    'profileImage': profile_image or '',
                    'googleId': google_id,
                    'provider': 'google',
                },
                'error': 'No account found with this email. Please complete registration.'
            }), 404
        
        # Generate token
        token = _generate_token(
            user._id, 
            user.role.value if isinstance(user.role, UserRole) else user.role
        )
        
        return jsonify({
            'ok': True,
            'message': 'Google login successful',
            'token': token,
            'user': user.to_public_dict()
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Google login failed: {str(e)}'}), 500


@auth_bp.route('/verify', methods=['GET'])
def verify():
    """Verify current token and return user info"""
    user_info = get_current_user(request)
    if not user_info:
        return jsonify({'ok': False, 'error': 'Invalid or expired token'}), 401
    
    # Get full user info from database
    users_collection = _get_users_collection()
    if users_collection is None:
        return jsonify({'ok': False, 'error': 'Database not available'}), 503
    
    from bson import ObjectId
    try:
        user_doc = users_collection.find_one({'_id': ObjectId(user_info['user_id'])})
        if not user_doc:
            return jsonify({'ok': False, 'error': 'User not found'}), 404
        
        user = User.from_dict(user_doc)
        user._id = str(user_doc['_id'])
        
        return jsonify({
            'ok': True,
            'user': user.to_public_dict()
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@auth_bp.route('/change-password', methods=['POST'])
@require_auth
def change_password():
    """Change user password"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')
        
        if not current_password or not new_password:
            return jsonify({'ok': False, 'error': 'Current and new passwords are required'}), 400
        
        # Validate new password
        is_valid, errors = validate_password(new_password)
        if not is_valid:
            return jsonify({'ok': False, 'errors': errors}), 400
        
        # Get user
        users_collection = _get_users_collection()
        from bson import ObjectId
        user_doc = users_collection.find_one({'_id': ObjectId(request.user_info['user_id'])})
        
        if not user_doc:
            return jsonify({'ok': False, 'error': 'User not found'}), 404
        
        # Verify current password
        if not User.verify_password(current_password, user_doc.get('password_hash', '')):
            return jsonify({'ok': False, 'error': 'Current password is incorrect'}), 401
        
        # Update password
        new_hash = User.hash_password(new_password)
        users_collection.update_one(
            {'_id': user_doc['_id']},
            {'$set': {
                'password_hash': new_hash,
                'updated_at': datetime.now(timezone.utc)
            }}
        )
        
        return jsonify({'ok': True, 'message': 'Password changed successfully'})
    
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Failed to change password: {str(e)}'}), 500


# Helper function to create admin user (call once during setup)
def create_admin_user(email: str, password: str, first_name: str, last_name: str):
    """Create an admin user - for setup purposes"""
    from flask import current_app
    users_collection = current_app.config.get('db_users')
    
    if users_collection is None:
        return None, "Database not available"
    
    # Check if admin already exists
    existing = users_collection.find_one({'email': email})
    if existing:
        return None, "User already exists"
    
    user = User(
        email=email,
        password_hash=User.hash_password(password),
        first_name=first_name,
        last_name=last_name,
        role=UserRole.ADMIN,
        is_verified=True,
    )
    
    result = users_collection.insert_one(user.to_dict(include_password=True))
    user._id = str(result.inserted_id)
    
    return user, None


@auth_bp.route('/firebase', methods=['POST'])
def firebase_login():
    """
    Login or register with Firebase Authentication
    Supports Google, Email/Password, and other Firebase providers
    Expects: firebaseUid, email, idToken, provider, and optionally firstName, lastName, profileImage
    Also accepts googleAccessToken for fallback verification when Firebase Admin SDK is not configured
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        firebase_uid = data.get('firebaseUid', '').strip()
        email = data.get('email', '').strip().lower()
        id_token = data.get('idToken', '').strip()
        provider = data.get('provider', 'unknown').strip()
        first_name = data.get('firstName', '').strip()
        last_name = data.get('lastName', '').strip()
        profile_image = data.get('profileImage', '').strip()
        google_access_token = data.get('googleAccessToken', '').strip()
        
        if not firebase_uid or not email:
            return jsonify({'ok': False, 'error': 'Firebase UID and email are required'}), 400

        if not id_token and not google_access_token:
            return jsonify({'ok': False, 'error': 'Firebase ID token or Google access token is required'}), 400

        # Try Firebase Admin SDK verification first
        verified = False
        normalized_provider = provider or 'unknown'
        
        if id_token and is_firebase_admin_configured():
            decoded_token = verify_id_token(id_token)
            if decoded_token:
                token_uid = decoded_token.get('uid') or decoded_token.get('sub')
                if token_uid != firebase_uid:
                    return jsonify({'ok': False, 'error': 'Firebase UID does not match token'}), 401

                token_email = (decoded_token.get('email') or '').strip().lower()
                if token_email and token_email != email:
                    return jsonify({'ok': False, 'error': 'Email does not match token'}), 401

                token_provider = ((decoded_token.get('firebase') or {}).get('sign_in_provider') or '').strip()
                if provider and provider != 'unknown' and token_provider and provider != token_provider:
                    return jsonify({'ok': False, 'error': 'Provider does not match token'}), 401

                normalized_provider = token_provider or provider or 'unknown'
                verified = True
        
        # Fallback: verify Google access token directly if Firebase Admin failed or not configured
        if not verified and google_access_token and provider in ('google.com', 'unknown'):
            google_user_info = _verify_google_access_token(google_access_token)
            if google_user_info:
                google_email = (google_user_info.get('email') or '').strip().lower()
                if google_email and google_email == email:
                    # Google token is valid and email matches
                    verified = True
                    normalized_provider = 'google.com'
                    # Fill in name/image from Google if not provided
                    if not first_name:
                        first_name = google_user_info.get('given_name', '')
                    if not last_name:
                        last_name = google_user_info.get('family_name', '')
                    if not profile_image:
                        profile_image = google_user_info.get('picture', '')
                else:
                    return jsonify({'ok': False, 'error': 'Google email does not match'}), 401
            else:
                return jsonify({'ok': False, 'error': 'Invalid Google access token'}), 401
        
        if not verified:
            # Neither Firebase Admin SDK nor Google fallback could verify
            if not is_firebase_admin_configured():
                return jsonify({'ok': False, 'error': 'Firebase Admin SDK is not configured and no Google access token provided for fallback verification'}), 503
            return jsonify({'ok': False, 'error': 'Invalid or expired Firebase ID token'}), 401
        
        users_collection = _get_users_collection()
        if users_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Try to find existing user by firebase_uid or email
        user_doc = users_collection.find_one({
            '$or': [
                {'firebase_uid': firebase_uid},
                {'email': email}
            ]
        })
        
        if user_doc:
            # Existing user - update firebase_uid if needed and login
            update_fields = {
                'last_login': datetime.now(timezone.utc),
                'updated_at': datetime.now(timezone.utc)
            }
            
            # Update firebase_uid if user registered differently
            if not user_doc.get('firebase_uid'):
                update_fields['firebase_uid'] = firebase_uid
                update_fields['auth_provider'] = f'firebase:{normalized_provider}'
            
            # Update profile image if provided and not already set
            if profile_image and not user_doc.get('profile_image'):
                update_fields['profile_image'] = profile_image
            
            users_collection.update_one(
                {'_id': user_doc['_id']},
                {'$set': update_fields}
            )
            
            # Check if user is active
            if not user_doc.get('is_active', True):
                return jsonify({'ok': False, 'error': 'Your account has been deactivated'}), 403
            
            # Check if user is suspended
            if user_doc.get('is_suspended'):
                suspension_end = user_doc.get('suspension_end')
                suspension_reason = user_doc.get('suspension_reason', 'Violation of community guidelines')
                
                # Check if suspension has expired
                if suspension_end:
                    if isinstance(suspension_end, str):
                        suspension_end = datetime.fromisoformat(suspension_end.replace('Z', '+00:00'))
                    # Ensure timezone-aware for comparison (MongoDB returns naive datetimes)
                    if isinstance(suspension_end, datetime) and suspension_end.tzinfo is None:
                        suspension_end = suspension_end.replace(tzinfo=timezone.utc)
                    
                    if datetime.now(timezone.utc) > suspension_end:
                        # Suspension has expired, automatically lift it
                        users_collection.update_one(
                            {'_id': user_doc['_id']},
                            {'$set': {
                                'is_suspended': False,
                                'suspension_type': None,
                                'suspension_reason': None,
                                'suspension_start': None,
                                'suspension_end': None,
                                'suspended_by': None,
                                'updated_at': datetime.now(timezone.utc)
                            }}
                        )
                    else:
                        # Still suspended
                        end_date_str = suspension_end.strftime('%B %d, %Y at %I:%M %p UTC')
                        return jsonify({
                            'ok': False, 
                            'error': f'Your account is suspended until {end_date_str}',
                            'suspension': {
                                'reason': suspension_reason,
                                'end': suspension_end.isoformat(),
                                'is_permanent': False
                            }
                        }), 403
                else:
                    # Permanent suspension
                    return jsonify({
                        'ok': False, 
                        'error': 'Your account has been permanently suspended',
                        'suspension': {
                            'reason': suspension_reason,
                            'end': None,
                            'is_permanent': True
                        }
                    }), 403
            
            user = User.from_dict(user_doc)
            user._id = str(user_doc['_id'])
            is_new_user = False
        else:
            # User not found - redirect to registration
            return jsonify({
                'ok': False,
                'needsRegistration': True,
                'googleData': {
                    'email': email,
                    'firstName': first_name or email.split('@')[0],
                    'lastName': last_name or '',
                    'profileImage': profile_image or '',
                    'firebaseUid': firebase_uid,
                    'provider': normalized_provider,
                },
                'error': 'No account found with this email. Please complete registration.'
            }), 404
        
        # Generate token
        token = _generate_token(
            user._id, 
            user.role.value if isinstance(user.role, UserRole) else user.role
        )
        
        return jsonify({
            'ok': True,
            'message': 'Firebase login successful',
            'token': token,
            'user': user.to_public_dict(),
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Firebase login failed: {str(e)}'}), 500
