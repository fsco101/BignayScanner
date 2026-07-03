"""
Payments Routes
Handles payment processing, wallet management, and PayMongo integration
"""

from flask import Blueprint, request, jsonify, g, current_app
from datetime import datetime, timezone
from bson import ObjectId
from functools import wraps
import jwt
import hmac
import hashlib

from config import get_settings
from models.user import User
from models.order import Order, OrderItem
from models.notification import NotificationType
from utils.paymongo_helper import paymongo_helper
from utils.email_service import get_email_service

payments_bp = Blueprint('payments', __name__, url_prefix='/api/payments')

ALLOWED_ONLINE_METHODS = {'gcash', 'grab_pay'}


def get_users_collection():
    """Get users collection from app config"""
    return current_app.config.get('db_users')


def get_orders_collection():
    """Get orders collection from app config"""
    return current_app.config.get('db_orders')


def _is_paymongo_test_mode_valid(settings):
    if not getattr(settings, 'paymongo_test_mode_only', True):
        return True
    secret_key = settings.paymongo_secret_key or ''
    public_key = settings.paymongo_public_key or ''
    return secret_key.startswith('sk_test_') and public_key.startswith('pk_test_')


def _verify_webhook_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False

    try:
        parts = {}
        for piece in signature_header.split(','):
            if '=' not in piece:
                continue
            k, v = piece.split('=', 1)
            parts[k.strip()] = v.strip()

        timestamp = parts.get('t')
        expected_signature = parts.get('v1')
        if not timestamp or not expected_signature:
            return False

        signed_payload = f"{timestamp}.{raw_body.decode('utf-8')}"
        computed = hmac.new(
            secret.encode('utf-8'),
            signed_payload.encode('utf-8'),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(computed, expected_signature)
    except Exception:
        return False


def _mark_order_paid_by_checkout_id(checkout_id: str) -> bool:
    orders_collection = get_orders_collection()
    if orders_collection is None:
        return False

    order_doc = orders_collection.find_one({'paymongo_checkout_id': checkout_id})
    if not order_doc:
        return False

    if order_doc.get('payment_status') == 'paid':
        return True

    verify_result = paymongo_helper.get_checkout_session(checkout_id)
    if not verify_result.get('ok'):
        return False

    if verify_result.get('status') != 'paid':
        return False

    orders_collection.update_one(
        {'_id': order_doc['_id']},
        {
            '$set': {
                'payment_status': 'paid',
                'paid_at': datetime.now(timezone.utc),
                'paymongo_payment_intent_id': verify_result.get('payment_intent_id'),
                'status': 'confirmed',
                'updated_at': datetime.now(timezone.utc),
            }
        }
    )

    # Now that payment is confirmed, handle deferred order confirmation
    # tasks: stock updates, email, and notifications.
    _confirm_paid_order(order_doc)

    return True


def _confirm_paid_order(order_doc: dict):
    """
    Run deferred order-confirmation side effects for online-payment orders
    that were created without confirming (stock, email, notifications).
    Called once payment is verified as 'paid'.
    """
    try:
        order_id = str(order_doc['_id'])
        order_number = order_id[-6:].upper()
        user_id = order_doc.get('user_id', '')
        user_name = order_doc.get('user_name', '')
        total_amount = float(order_doc.get('total_amount', 0))
        items_raw = order_doc.get('items', [])

        # ── 1. Decrement stock ──
        products_collection = _get_products_collection_from_db()
        if products_collection is not None:
            for item in items_raw:
                try:
                    products_collection.update_one(
                        {'_id': ObjectId(item['product_id'])},
                        {
                            '$inc': {
                                'stock': -int(item.get('quantity', 0)),
                                'sales_count': int(item.get('quantity', 0)),
                            },
                            '$set': {'updated_at': datetime.now(timezone.utc)},
                        }
                    )
                except Exception as stock_err:
                    print(f"[Payments] Stock update error for product {item.get('product_id')}: {stock_err}")

        # ── 2. Send confirmation email ──
        try:
            order_obj = Order.from_dict(order_doc)
            order_obj._id = order_id
            # Reflect the confirmed status in the email
            order_obj.payment_status = 'paid'
            order_obj.status = 'confirmed'
            email_service = get_email_service()
            email_service.send_order_receipt(order_obj.to_public_dict(), status_changed=False)
        except Exception as email_err:
            print(f"[Payments] Confirmation email error for order {order_id}: {email_err}")

        # ── 3. Emit real-time analytics update ──
        try:
            emit_fn = current_app.config.get('emit_analytics_update')
            if emit_fn:
                emit_fn('new_order', {
                    'order_id': order_id,
                    'total_amount': total_amount,
                })
        except Exception as ws_err:
            print(f"[Payments] SocketIO emit error: {ws_err}")

        # ── 4. In-app notifications ──
        try:
            from routes.notifications import create_notification, create_notification_for_admins

            # Notify buyer
            create_notification(
                user_id=user_id,
                title='Payment Confirmed',
                message=f'Your payment for order #{order_number} has been confirmed! Total: ₱{total_amount:,.2f}',
                notif_type=NotificationType.ORDER_PLACED,
                data={'order_id': order_id},
            )
            # Notify seller(s)
            seller_ids = list(set(
                item.get('seller_id') for item in items_raw if item.get('seller_id')
            ))
            for sid in seller_ids:
                create_notification(
                    user_id=sid,
                    title='New Paid Order',
                    message=f'Order #{order_number} from {user_name} has been paid.',
                    notif_type=NotificationType.ORDER_PLACED,
                    data={'order_id': order_id},
                )
            # Notify admins
            create_notification_for_admins(
                title='New Paid Order',
                message=f'Order #{order_number} by {user_name} paid. Total: ₱{total_amount:,.2f}',
                notif_type=NotificationType.ORDER_PLACED,
                data={'order_id': order_id},
            )
        except Exception as notif_err:
            print(f"[Payments] Notification error for order {order_id}: {notif_err}")

    except Exception as e:
        print(f"[Payments] _confirm_paid_order error: {e}")


def _get_products_collection_from_db():
    """Get products collection via current_app (for use outside request context when possible)."""
    try:
        return current_app.config.get('db_products')
    except Exception:
        return None


def _mark_order_paid_by_reference_number(reference_number: str) -> bool:
    orders_collection = get_orders_collection()
    if orders_collection is None or not reference_number:
        return False

    order_doc = None
    try:
        order_doc = orders_collection.find_one({'_id': ObjectId(reference_number)})
    except Exception:
        order_doc = orders_collection.find_one({'order_number': reference_number})

    if not order_doc:
        return False

    checkout_id = order_doc.get('paymongo_checkout_id')
    if not checkout_id:
        return False

    return _mark_order_paid_by_checkout_id(checkout_id)


def _extract_checkout_ids_from_event_payload(payload: dict) -> list[str]:
    """Extract candidate checkout session IDs from various PayMongo webhook payload shapes."""
    candidates = []
    attrs = payload.get('data', {}).get('attributes', {}) or {}
    event_data = attrs.get('data', {}) or {}
    event_attrs = event_data.get('attributes', {}) or {}

    for raw in [
        event_data.get('id'),
        event_data.get('checkout_session_id'),
        event_attrs.get('checkout_session_id'),
        (event_attrs.get('checkout_session') or {}).get('id') if isinstance(event_attrs.get('checkout_session'), dict) else None,
        (event_attrs.get('checkout_session') or {}).get('data', {}).get('id') if isinstance(event_attrs.get('checkout_session'), dict) else None,
    ]:
        if raw and isinstance(raw, str):
            candidates.append(raw)

    for included in payload.get('included', []) or []:
        if not isinstance(included, dict):
            continue
        inc_id = included.get('id')
        inc_type = included.get('type')
        if inc_id and isinstance(inc_id, str) and inc_type == 'checkout_session':
            candidates.append(inc_id)

    # Keep insertion order while removing duplicates
    deduped = []
    seen = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        deduped.append(candidate)
    return deduped


def get_wallet_topups_collection():
    """Get or create wallet_topups collection"""
    # Access the MongoDB client through the users collection
    users = get_users_collection()
    if users is not None:
        return users.database['wallet_topups']
    return None


def get_token_from_header():
    """Extract token from Authorization header"""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header.split(' ')[1]
    return None


def require_auth(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = get_token_from_header()
        if not token:
            return jsonify({'ok': False, 'error': 'No token provided'}), 401
        
        try:
            settings = get_settings()
            
            # Try JWT decode first
            try:
                payload = jwt.decode(token, settings.jwt_secret, algorithms=['HS256'])
                user_id = payload.get('user_id')
            except jwt.InvalidTokenError:
                # Fallback to simple token verification from auth routes
                from routes.auth import verify_token
                token_data = verify_token(token)
                if not token_data:
                    return jsonify({'ok': False, 'error': 'Invalid token'}), 401
                user_id = token_data.get('user_id')
            
            users_collection = get_users_collection()
            if users_collection is None:
                return jsonify({'ok': False, 'error': 'Database not available'}), 503
            
            user_doc = users_collection.find_one({'_id': ObjectId(user_id)})
            
            if not user_doc:
                return jsonify({'ok': False, 'error': 'User not found'}), 401
            
            g.current_user = User.from_dict(user_doc)
            g.current_user_id = str(user_doc['_id'])
            
        except jwt.ExpiredSignatureError:
            return jsonify({'ok': False, 'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'ok': False, 'error': 'Invalid token'}), 401
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 401
        
        return f(*args, **kwargs)
    return decorated


# ============================================
# WALLET ENDPOINTS
# ============================================

@payments_bp.route('/wallet/balance', methods=['GET'])
@require_auth
def get_wallet_balance():
    """Get current user's wallet balance"""
    try:
        user = g.current_user
        return jsonify({
            'ok': True,
            'balance': user.wallet_balance,
            'formatted_balance': f"₱{user.wallet_balance:,.2f}",
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@payments_bp.route('/wallet/topup', methods=['POST'])
@require_auth
def create_topup():
    """Create a wallet top-up via PayMongo"""
    try:
        data = request.get_json()
        amount = float(data.get('amount', 0))
        
        if amount < 100:
            return jsonify({'ok': False, 'error': 'Minimum top-up amount is ₱100'}), 400
        if amount > 50000:
            return jsonify({'ok': False, 'error': 'Maximum top-up amount is ₱50,000'}), 400
        
        user = g.current_user
        
        # Create PayMongo checkout session for top-up
        # Use app deep link or web URL for redirects
        base_url = request.host_url.rstrip('/')
        success_url = f"{base_url}/api/payments/wallet/topup/success"
        cancel_url = f"{base_url}/api/payments/wallet/topup/cancel"
        
        result = paymongo_helper.create_checkout_session(
            amount=amount,
            description=f"Wallet Top-up",
            order_id=f"TOPUP-{g.current_user_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            customer_email=user.email,
            customer_name=f"{user.first_name} {user.last_name}",
            success_url=success_url,
            cancel_url=cancel_url,
        )
        
        if result['ok']:
            # Store pending top-up in database
            topups_collection = get_wallet_topups_collection()
            if topups_collection is None:
                return jsonify({'ok': False, 'error': 'Database not available'}), 503
            
            topup_doc = {
                'user_id': g.current_user_id,
                'amount': amount,
                'checkout_id': result['checkout_id'],
                'status': 'pending',
                'created_at': datetime.now(timezone.utc),
            }
            topups_collection.insert_one(topup_doc)
            
            return jsonify({
                'ok': True,
                'checkout_url': result['checkout_url'],
                'checkout_id': result['checkout_id'],
            })
        else:
            return jsonify({'ok': False, 'error': result.get('error', 'Failed to create checkout')}), 400
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@payments_bp.route('/wallet/topup/verify', methods=['POST'])
@require_auth
def verify_topup():
    """Verify a top-up payment"""
    try:
        data = request.get_json()
        checkout_id = data.get('checkout_id')
        
        if not checkout_id:
            return jsonify({'ok': False, 'error': 'Checkout ID required'}), 400
        
        topups_collection = get_wallet_topups_collection()
        users_collection = get_users_collection()
        
        if topups_collection is None or users_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Find the pending top-up
        topup = topups_collection.find_one({
            'checkout_id': checkout_id,
            'user_id': g.current_user_id,
        })
        
        if not topup:
            return jsonify({'ok': False, 'error': 'Top-up not found'}), 404
        
        if topup['status'] == 'completed':
            return jsonify({
                'ok': True,
                'message': 'Top-up already processed',
                'status': 'completed',
            })
        
        # Check payment status with PayMongo
        result = paymongo_helper.get_checkout_session(checkout_id)
        
        if not result['ok']:
            return jsonify({'ok': False, 'error': result.get('error', 'Failed to verify payment')}), 400
        
        payment_status = result['status']
        
        if payment_status == 'paid':
            # Update user's wallet balance
            users_collection.update_one(
                {'_id': ObjectId(g.current_user_id)},
                {
                    '$inc': {'wallet_balance': topup['amount']},
                    '$set': {'updated_at': datetime.now(timezone.utc)},
                }
            )
            
            # Mark top-up as completed
            topups_collection.update_one(
                {'_id': topup['_id']},
                {
                    '$set': {
                        'status': 'completed',
                        'paid_at': datetime.now(timezone.utc),
                        'payment_intent_id': result.get('payment_intent_id'),
                    }
                }
            )
            
            # Get updated balance
            updated_user = users_collection.find_one({'_id': ObjectId(g.current_user_id)})
            new_balance = updated_user.get('wallet_balance', 0)
            
            return jsonify({
                'ok': True,
                'message': 'Top-up successful!',
                'status': 'completed',
                'amount_added': topup['amount'],
                'new_balance': new_balance,
            })
        elif payment_status == 'expired':
            topups_collection.update_one(
                {'_id': topup['_id']},
                {'$set': {'status': 'expired'}}
            )
            return jsonify({'ok': False, 'error': 'Payment session expired', 'status': 'expired'}), 400
        else:
            return jsonify({
                'ok': True,
                'message': 'Payment pending',
                'status': payment_status,
            })
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@payments_bp.route('/wallet/transactions', methods=['GET'])
@require_auth
def get_wallet_transactions():
    """Get user's wallet transaction history"""
    try:
        topups_collection = get_wallet_topups_collection()
        orders_collection = get_orders_collection()
        
        if topups_collection is None or orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        skip = (page - 1) * limit
        
        # Get top-ups
        topups = list(topups_collection.find(
            {'user_id': g.current_user_id, 'status': 'completed'}
        ).sort('paid_at', -1))
        
        # Get wallet payments (orders paid with wallet)
        wallet_orders = list(orders_collection.find({
            'user_id': g.current_user_id,
            'payment_method': 'wallet',
            'payment_status': 'paid',
        }).sort('paid_at', -1))
        
        # Combine and format transactions
        transactions = []
        
        for topup in topups:
            transactions.append({
                'type': 'topup',
                'amount': topup['amount'],
                'description': 'Wallet Top-up',
                'date': topup.get('paid_at', topup.get('created_at')).isoformat() if topup.get('paid_at') or topup.get('created_at') else None,
                'status': 'completed',
            })
        
        for order in wallet_orders:
            transactions.append({
                'type': 'payment',
                'amount': -order['total_amount'],  # Negative for payments
                'description': f"Order #{str(order['_id'])[-6:].upper()}",
                'date': order.get('paid_at', order.get('created_at')).isoformat() if order.get('paid_at') or order.get('created_at') else None,
                'status': 'completed',
                'order_id': str(order['_id']),
            })
        
        # Sort by date
        transactions.sort(key=lambda x: x['date'] if x['date'] else '', reverse=True)
        
        # Paginate
        total = len(transactions)
        transactions = transactions[skip:skip + limit]
        
        return jsonify({
            'ok': True,
            'transactions': transactions,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': (total + limit - 1) // limit,
            }
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ============================================
# ORDER PAYMENT ENDPOINTS
# ============================================

@payments_bp.route('/order/pay/wallet', methods=['POST'])
@require_auth
def pay_with_wallet():
    """Pay for an order using wallet balance"""
    try:
        data = request.get_json()
        order_id = data.get('order_id')
        
        if not order_id:
            return jsonify({'ok': False, 'error': 'Order ID required'}), 400
        
        orders_collection = get_orders_collection()
        users_collection = get_users_collection()
        
        if orders_collection is None or users_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Get the order
        order_doc = orders_collection.find_one({
            '_id': ObjectId(order_id),
            'user_id': g.current_user_id,
        })
        
        if not order_doc:
            return jsonify({'ok': False, 'error': 'Order not found'}), 404
        
        if order_doc.get('payment_status') == 'paid':
            return jsonify({'ok': False, 'error': 'Order already paid'}), 400
        
        # Check wallet balance
        user = g.current_user
        order_total = order_doc['total_amount']
        
        if user.wallet_balance < order_total:
            return jsonify({
                'ok': False,
                'error': 'Insufficient wallet balance',
                'required': order_total,
                'available': user.wallet_balance,
            }), 400
        
        # Deduct from wallet and update order
        users_collection.update_one(
            {'_id': ObjectId(g.current_user_id)},
            {
                '$inc': {'wallet_balance': -order_total},
                '$set': {'updated_at': datetime.now(timezone.utc)},
            }
        )
        
        orders_collection.update_one(
            {'_id': ObjectId(order_id)},
            {
                '$set': {
                    'payment_status': 'paid',
                    'payment_method': 'wallet',
                    'paid_at': datetime.now(timezone.utc),
                    'updated_at': datetime.now(timezone.utc),
                    'status': 'confirmed',
                }
            }
        )
        
        # Get updated balance
        updated_user = users_collection.find_one({'_id': ObjectId(g.current_user_id)})
        new_balance = updated_user.get('wallet_balance', 0)
        
        return jsonify({
            'ok': True,
            'message': 'Payment successful!',
            'amount_paid': order_total,
            'new_balance': new_balance,
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@payments_bp.route('/order/pay/online', methods=['POST'])
@require_auth
def pay_online():
    """Create online payment session for an order via PayMongo"""
    try:
        data = request.get_json(silent=True) or {}
        order_id = data.get('order_id')
        method_type = (data.get('payment_method_type') or 'gcash').strip().lower()
        
        if not order_id:
            return jsonify({'ok': False, 'error': 'Order ID required'}), 400

        if method_type not in ALLOWED_ONLINE_METHODS:
            return jsonify({'ok': False, 'error': 'Invalid payment method. Use gcash or grab_pay only.'}), 400

        settings = get_settings()
        if not _is_paymongo_test_mode_valid(settings):
            return jsonify({'ok': False, 'error': 'Test mode only is enabled. Configure sk_test_ key.'}), 400
        
        orders_collection = get_orders_collection()
        
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Get the order
        order_doc = orders_collection.find_one({
            '_id': ObjectId(order_id),
            'user_id': g.current_user_id,
        })
        
        if not order_doc:
            return jsonify({'ok': False, 'error': 'Order not found'}), 404
        
        if order_doc.get('payment_status') == 'paid':
            return jsonify({'ok': False, 'error': 'Order already paid'}), 400
        
        user = g.current_user
        order = Order.from_dict(order_doc)

        # Billing info: prefer what the frontend sent (from the checkout form),
        # fall back to user account info.
        billing_name  = (data.get('billing_name')  or f"{user.first_name} {user.last_name}").strip()
        billing_email = (data.get('billing_email') or user.email or '').strip()
        billing_phone = (data.get('billing_phone') or getattr(user, 'phone', '') or '').strip()

        billing_address_line = (data.get('billing_address') or '').strip()
        billing_city         = (data.get('billing_city')    or '').strip()
        billing_province     = (data.get('billing_province') or '').strip()
        billing_postal_code  = (data.get('billing_postal_code') or '').strip()

        billing_address_dict = None
        if billing_address_line or billing_city or billing_province:
            billing_address_dict = {
                'line1':       billing_address_line,
                'city':        billing_city,
                'state':       billing_province,
                'country':     'PH',
                'postal_code': billing_postal_code,
            }

        # Build line items for checkout
        line_items = []
        for item in order.items:
            line_items.append({
                "currency": "PHP",
                "amount": int(item.subtotal * 100),  # Convert to centavos
                "name": item.product_name,
                "quantity": item.quantity,
            })
        
        # Create PayMongo checkout session
        # Build redirect URLs.  Prefer the backend redirect callback page
        # which renders a branded interstitial and then deep-links back into
        # the mobile app.  The frontend can still override with a direct
        # deep-link URL if it wants (e.g. for Expo Go compatibility).
        redirect_base = (data.get('redirect_url') or '').strip()
        if redirect_base:
            # Frontend-supplied deep link (e.g. exp://... or bignay://...)
            redirect_base = redirect_base.split('?')[0].rstrip('/')
            success_url = f"{redirect_base}?order_id={order_id}&status=success&method={method_type}"
            cancel_url = f"{redirect_base}?order_id={order_id}&status=cancelled&method={method_type}"
        else:
            # Use backend HTML redirect page (works universally)
            scheme = 'https' if request.is_secure or request.headers.get('X-Forwarded-Proto') == 'https' else 'http'
            host = request.headers.get('X-Forwarded-Host') or request.headers.get('Host') or request.host
            base = f"{scheme}://{host}/api/payments/redirect/callback"
            success_url = f"{base}?order_id={order_id}&status=success&method={method_type}"
            cancel_url = f"{base}?order_id={order_id}&status=cancelled&method={method_type}"
        
        result = paymongo_helper.create_checkout_session(
            amount=order.total_amount,
            description=f"Order from Bignay Marketplace",
            order_id=order_id,
            customer_email=billing_email,
            customer_name=billing_name,
            customer_phone=billing_phone,
            billing_address=billing_address_dict,
            success_url=success_url,
            cancel_url=cancel_url,
            line_items=line_items,
            payment_method_types=[method_type],
        )
        
        if result['ok']:
            # Update order with checkout info
            orders_collection.update_one(
                {'_id': ObjectId(order_id)},
                {
                    '$set': {
                        'paymongo_checkout_id': result['checkout_id'],
                        'paymongo_payment_method_type': method_type,
                        'payment_method': 'online_payment',
                        'updated_at': datetime.now(timezone.utc),
                    }
                }
            )
            
            return jsonify({
                'ok': True,
                'checkout_url': result['checkout_url'],
                'checkout_id': result['checkout_id'],
                'payment_method_type': method_type,
            })
        else:
            return jsonify({'ok': False, 'error': result.get('error', 'Failed to create checkout')}), 400
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@payments_bp.route('/order/<order_id>/payment-status', methods=['GET'])
@require_auth
def get_order_payment_status(order_id):
    """Lightweight DB-only check of order payment status (used for polling).

    This does NOT call PayMongo.  The webhook is the sole authority that
    flips payment_status to 'paid'.  The frontend polls this endpoint
    after the user returns from the PayMongo checkout redirect.
    """
    try:
        orders_collection = get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503

        order_doc = orders_collection.find_one(
            {'_id': ObjectId(order_id), 'user_id': g.current_user_id},
            {'payment_status': 1, 'status': 1, 'paid_at': 1, 'updated_at': 1},
        )
        if not order_doc:
            return jsonify({'ok': False, 'error': 'Order not found'}), 404

        return jsonify({
            'ok': True,
            'payment_status': order_doc.get('payment_status', 'pending'),
            'order_status': order_doc.get('status', 'pending'),
            'paid_at': order_doc['paid_at'].isoformat() if order_doc.get('paid_at') else None,
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@payments_bp.route('/order/verify', methods=['POST'])
@require_auth
def verify_order_payment():
    """Verify order payment status.

    Primary path:  return the DB status (set by webhook).
    Fallback:      if the webhook has not arrived within 30 seconds but
                   PayMongo confirms the checkout is paid, mark the order
                   as paid here so the user is not left hanging.
    """
    try:
        data = request.get_json(silent=True) or {}
        order_id = data.get('order_id')
        
        if not order_id:
            return jsonify({'ok': False, 'error': 'Order ID required'}), 400
        
        orders_collection = get_orders_collection()
        
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Get the order
        order_doc = orders_collection.find_one({
            '_id': ObjectId(order_id),
            'user_id': g.current_user_id,
        })
        
        if not order_doc:
            return jsonify({'ok': False, 'error': 'Order not found'}), 404
        
        if order_doc.get('payment_status') == 'paid':
            return jsonify({
                'ok': True,
                'message': 'Payment confirmed by webhook.',
                'status': 'paid',
            })
        
        checkout_id = order_doc.get('paymongo_checkout_id')
        if not checkout_id:
            return jsonify({'ok': False, 'error': 'No payment session found'}), 400
        
        # Check payment status with PayMongo
        result = paymongo_helper.get_checkout_session(checkout_id)
        
        if not result['ok']:
            return jsonify({'ok': False, 'error': result.get('error', 'Failed to verify payment')}), 400
        
        payment_status = result['status']
        
        if payment_status == 'paid':
            # Re-read DB in case webhook just arrived between our reads.
            refreshed = orders_collection.find_one({'_id': ObjectId(order_id), 'user_id': g.current_user_id})
            if refreshed and refreshed.get('payment_status') == 'paid':
                return jsonify({
                    'ok': True,
                    'message': 'Payment confirmed by webhook.',
                    'status': 'paid',
                })

            # PayMongo API confirms payment is paid.
            # Mark the order as paid immediately — the webhook is a
            # redundancy mechanism, not a gatekeeper.
            _mark_order_paid_by_checkout_id(checkout_id)
            return jsonify({
                'ok': True,
                'message': 'Payment confirmed (fallback verification).',
                'status': 'paid',
            })
        elif payment_status == 'expired':
            return jsonify({'ok': False, 'error': 'Payment session expired', 'status': 'expired'}), 400
        else:
            return jsonify({
                'ok': True,
                'message': 'Payment pending',
                'status': payment_status,
            })
            
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ============================================
# PAYMENT REDIRECT CALLBACK (HTML page)
# ============================================

@payments_bp.route('/redirect/callback', methods=['GET'])
def payment_redirect_callback():
    """
    Intermediate HTML redirect page for PayMongo payment callbacks.

    PayMongo redirects here after the user completes or cancels payment
    in GCash / GrabPay.  This page then redirects the mobile app back
    via its deep-link scheme (bignay://payment-callback?...).

    Query params forwarded:
        order_id  – The order that was being paid.
        status    – 'success' or 'cancelled'.
        method    – 'gcash' or 'grab_pay'.
    """
    order_id = request.args.get('order_id', '')
    status = request.args.get('status', 'success')
    method = request.args.get('method', 'gcash')

    settings = get_settings()
    app_scheme = (settings.paymongo_app_scheme or 'bignay').strip()
    deep_link = f"{app_scheme}://payment-callback?order_id={order_id}&status={status}&method={method}"

    # Determine theme colours based on payment method
    if method == 'grab_pay':
        bg_color = '#00B14F'
        method_label = 'GrabPay'
        icon_svg = (
            '<svg width="48" height="48" viewBox="0 0 48 48" fill="none">'
            '<circle cx="24" cy="24" r="24" fill="white"/>'
            '<text x="24" y="32" text-anchor="middle" font-size="26" '
            'font-weight="bold" fill="#00B14F">G</text></svg>'
        )
    else:
        bg_color = '#007DFE'
        method_label = 'GCash'
        icon_svg = (
            '<svg width="48" height="48" viewBox="0 0 48 48" fill="none">'
            '<circle cx="24" cy="24" r="24" fill="white"/>'
            '<text x="24" y="32" text-anchor="middle" font-size="26" '
            'font-weight="bold" fill="#007DFE">G</text></svg>'
        )

    if status == 'success':
        title = 'Payment Successful!'
        message = f'Your {method_label} payment has been processed. Redirecting to the app…'
        status_icon = '✓'
    else:
        title = 'Payment Cancelled'
        message = f'Your {method_label} payment was cancelled. Redirecting to the app…'
        status_icon = '✗'

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{title}</title>
<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        min-height:100vh;display:flex;align-items:center;justify-content:center;
        background:{bg_color};color:#fff;text-align:center;padding:24px}}
  .card{{background:#fff;border-radius:20px;padding:40px 32px;max-width:400px;width:100%;
         box-shadow:0 8px 32px rgba(0,0,0,.15);color:#333}}
  .icon{{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;
         justify-content:center;margin:0 auto 20px;font-size:36px;font-weight:bold;
         background:{'#E8F5E9' if status=='success' else '#FFF3E0'};
         color:{'#2E7D32' if status=='success' else '#E65100'}}}
  h1{{font-size:22px;margin-bottom:12px;color:#333}}
  p{{font-size:14px;color:#666;margin-bottom:24px;line-height:1.5}}
  .btn{{display:inline-block;padding:14px 32px;border-radius:12px;font-size:16px;
        font-weight:600;text-decoration:none;color:#fff;background:{bg_color};
        transition:transform .15s}}
  .btn:hover{{transform:scale(1.02)}}
  .loader{{width:20px;height:20px;border:3px solid #ddd;border-top-color:{bg_color};
           border-radius:50%;animation:spin .8s linear infinite;margin:16px auto 0}}
  @keyframes spin{{to{{transform:rotate(360deg)}}}}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">{status_icon}</div>
    <h1>{title}</h1>
    <p>{message}</p>
    <a class="btn" href="{deep_link}">Open Bignay App</a>
    <div class="loader"></div>
  </div>
  <script>setTimeout(function(){{window.location.href="{deep_link}";}},1500);</script>
</body>
</html>"""
    return html, 200, {'Content-Type': 'text/html; charset=utf-8'}


@payments_bp.route('/webhook/paymongo', methods=['POST'])
def paymongo_webhook():
    """PayMongo webhook endpoint - confirms payment status and marks order as paid."""
    try:
        settings = get_settings()
        raw_body = request.get_data() or b''

        # Optional signature verification when webhook secret is configured.
        if settings.paymongo_webhook_secret:
            signature_header = (
                request.headers.get('Paymongo-Signature')
                or request.headers.get('paymongo-signature')
                or ''
            )
            if not _verify_webhook_signature(raw_body, signature_header, settings.paymongo_webhook_secret):
                return jsonify({'ok': False, 'error': 'Invalid webhook signature'}), 401

        payload = request.get_json(silent=True) or {}
        event_type = payload.get('data', {}).get('attributes', {}).get('type', '')
        event_data = payload.get('data', {}).get('attributes', {}).get('data', {})
        resource_id = event_data.get('id')
        resource_type = event_data.get('type')

        handled = False
        action = 'ignored'

        # ── checkout_session.payment.paid ──
        # The primary event: user completed checkout via GCash/GrabPay.
        if event_type == 'checkout_session.payment.paid':
            checkout_ids = _extract_checkout_ids_from_event_payload(payload)
            for checkout_id in checkout_ids:
                if _mark_order_paid_by_checkout_id(checkout_id):
                    handled = True
                    action = 'mark_paid'
                    break

            if not handled:
                # Fallback: resolve by reference number if present in payload
                event_attrs = event_data.get('attributes', {}) if isinstance(event_data, dict) else {}
                reference_number = (
                    event_attrs.get('reference_number')
                    or (event_attrs.get('checkout_session') or {}).get('reference_number')
                    if isinstance(event_attrs.get('checkout_session'), dict)
                    else None
                )
                if reference_number and _mark_order_paid_by_reference_number(reference_number):
                    handled = True
                    action = 'mark_paid_by_reference'

            if not handled:
                action = 'order_not_found'

        # ── payment.paid ──
        # Generic payment success; look up order by payment intent or checkout id.
        elif event_type == 'payment.paid':
            payment_attrs = event_data.get('attributes', {})
            pi_id = payment_attrs.get('payment_intent_id') or ''
            # Try to find order by payment intent first, then by checkout_id
            orders_collection = get_orders_collection()
            if orders_collection and pi_id:
                order_doc = orders_collection.find_one({'paymongo_payment_intent_id': pi_id})
                if order_doc and order_doc.get('payment_status') != 'paid':
                    checkout_id = order_doc.get('paymongo_checkout_id')
                    if checkout_id:
                        handled = _mark_order_paid_by_checkout_id(checkout_id)
                        action = 'mark_paid' if handled else 'verify_failed'
            if not handled:
                action = 'no_matching_order'

        # ── link.payment.paid ──
        # Payment link completed (if used). Same logic as payment.paid.
        elif event_type == 'link.payment.paid':
            action = 'link_paid_ack'
            handled = True  # acknowledge; no order lookup needed for links

        # ── payment.failed ──
        # Payment attempt failed. Mark order payment_status as 'failed'.
        elif event_type == 'payment.failed':
            orders_collection = get_orders_collection()
            payment_attrs = event_data.get('attributes', {})
            pi_id = payment_attrs.get('payment_intent_id') or ''
            if orders_collection and pi_id:
                result = orders_collection.update_one(
                    {'paymongo_payment_intent_id': pi_id, 'payment_status': {'$ne': 'paid'}},
                    {'$set': {'payment_status': 'failed', 'updated_at': datetime.now(timezone.utc)}}
                )
                handled = result.modified_count > 0
            action = 'mark_failed' if handled else 'no_matching_order'

        # ── payment.refunded / payment.refund.updated ──
        # Refund events. Mark order payment_status as 'refunded'.
        elif event_type in {'payment.refunded', 'payment.refund.updated'}:
            orders_collection = get_orders_collection()
            payment_attrs = event_data.get('attributes', {})
            pi_id = payment_attrs.get('payment_intent_id') or ''
            if orders_collection and pi_id:
                result = orders_collection.update_one(
                    {'paymongo_payment_intent_id': pi_id},
                    {'$set': {
                        'payment_status': 'refunded',
                        'status': 'refunded',
                        'updated_at': datetime.now(timezone.utc),
                    }}
                )
                handled = result.modified_count > 0
            action = 'mark_refunded' if handled else 'no_matching_order'

        return jsonify({'ok': True, 'handled': handled, 'event_type': event_type, 'action': action})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ============================================
# WEBHOOK MANAGEMENT ENDPOINTS (Admin only)
# ============================================

def require_admin(f):
    """Decorator to require admin role"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = get_token_from_header()
        if not token:
            return jsonify({'ok': False, 'error': 'No token provided'}), 401
        try:
            settings = get_settings()
            try:
                payload = jwt.decode(token, settings.jwt_secret, algorithms=['HS256'])
                user_id = payload.get('user_id')
                role = payload.get('role', 'user')
            except jwt.InvalidTokenError:
                from routes.auth import verify_token
                token_data = verify_token(token)
                if not token_data:
                    return jsonify({'ok': False, 'error': 'Invalid token'}), 401
                user_id = token_data.get('user_id')
                role = token_data.get('role', 'user')
            if role != 'admin':
                return jsonify({'ok': False, 'error': 'Admin access required'}), 403
            users_collection = get_users_collection()
            if users_collection is None:
                return jsonify({'ok': False, 'error': 'Database not available'}), 503
            user_doc = users_collection.find_one({'_id': ObjectId(user_id)})
            if not user_doc:
                return jsonify({'ok': False, 'error': 'User not found'}), 401
            g.current_user = User.from_dict(user_doc)
            g.current_user_id = str(user_doc['_id'])
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 401
        return f(*args, **kwargs)
    return decorated


@payments_bp.route('/webhook/register', methods=['POST'])
@require_admin
def register_paymongo_webhook():
    """
    Register the app's webhook URL with PayMongo (admin only).
    Automatically uses the current server's host to build the webhook URL,
    or accepts a custom URL in the request body.

    Body (optional):
        url  – Override the auto-detected webhook URL.

    Returns the PayMongo webhook object including the `secret_key` that
    should be saved as PAYMONGO_WEBHOOK_SECRET in your .env file.
    """
    try:
        data = request.get_json(silent=True) or {}
        # Build default URL from request host if not provided
        base_url = data.get('url')
        if not base_url:
            scheme = 'https' if request.is_secure or request.headers.get('X-Forwarded-Proto') == 'https' else 'http'
            host = request.headers.get('X-Forwarded-Host') or request.headers.get('Host') or request.host
            base_url = f"{scheme}://{host}/api/payments/webhook/paymongo"

        events = data.get('events')  # None → use defaults
        result = paymongo_helper.register_webhook(base_url, events)

        if result['ok']:
            secret = result.get('secret_key', '')
            return jsonify({
                'ok': True,
                'webhook': result,
                'instruction': (
                    f"Webhook registered successfully! "
                    f"Save this secret in your .env as: PAYMONGO_WEBHOOK_SECRET={secret}"
                    if secret else
                    "Webhook registered. Check PayMongo dashboard for the signing secret."
                ),
            })
        else:
            return jsonify({'ok': False, 'error': result.get('error', 'Registration failed')}), 400
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@payments_bp.route('/webhook/list', methods=['GET'])
@require_admin
def list_paymongo_webhooks():
    """List all webhooks registered with PayMongo (admin only)."""
    try:
        result = paymongo_helper.list_webhooks()
        if result['ok']:
            return jsonify(result)
        else:
            return jsonify({'ok': False, 'error': result.get('error')}), 400
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@payments_bp.route('/webhook/<webhook_id>/enable', methods=['POST'])
@require_admin
def enable_paymongo_webhook(webhook_id):
    """Enable a disabled PayMongo webhook (admin only)."""
    try:
        result = paymongo_helper.enable_webhook(webhook_id)
        return jsonify(result) if result['ok'] else (jsonify({'ok': False, 'error': result.get('error')}), 400)
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@payments_bp.route('/webhook/<webhook_id>/disable', methods=['POST'])
@require_admin
def disable_paymongo_webhook(webhook_id):
    """Disable an active PayMongo webhook (admin only)."""
    try:
        result = paymongo_helper.disable_webhook(webhook_id)
        return jsonify(result) if result['ok'] else (jsonify({'ok': False, 'error': result.get('error')}), 400)
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@payments_bp.route('/webhook/<webhook_id>', methods=['DELETE'])
@require_admin
def delete_paymongo_webhook(webhook_id):
    """Delete a registered PayMongo webhook (admin only)."""
    try:
        result = paymongo_helper.delete_webhook(webhook_id)
        return jsonify(result) if result['ok'] else (jsonify({'ok': False, 'error': result.get('error')}), 400)
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ============================================
# PAYMONGO CONFIG ENDPOINT
# ============================================

@payments_bp.route('/config', methods=['GET'])
def get_payment_config():
    """Get PayMongo public configuration"""
    try:
        settings = get_settings()
        enabled = bool(settings.paymongo_secret_key and settings.paymongo_public_key)
        if enabled and not _is_paymongo_test_mode_valid(settings):
            enabled = False

        return jsonify({
            'ok': True,
            'public_key': settings.paymongo_public_key,
            'enabled': enabled,
            'test_mode_only': bool(settings.paymongo_test_mode_only),
            'supported_methods': ['gcash', 'grab_pay'],
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
