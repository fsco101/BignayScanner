"""
Orders Routes
Handles checkout and order management
"""

from __future__ import annotations
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, Response
from bson import ObjectId

from models.order import Order, OrderItem, OrderStatus
from models.product import Product
from models.notification import NotificationType
from routes.auth import require_auth, require_admin, get_current_user
from routes.notifications import create_notification, create_notification_for_admins
from utils.validators import validate_required_fields
from utils.email_service import get_email_service
from utils.pdf_generator import generate_order_receipt_pdf, is_pdf_generation_available

orders_bp = Blueprint('orders', __name__, url_prefix='/api/orders')


def _get_orders_collection():
    """Get MongoDB orders collection"""
    from flask import current_app
    return current_app.config.get('db_orders')


def _get_products_collection():
    """Get MongoDB products collection"""
    from flask import current_app
    return current_app.config.get('db_products')


def _get_users_collection():
    """Get MongoDB users collection"""
    from flask import current_app
    return current_app.config.get('db_users')


@orders_bp.route('/checkout', methods=['POST'])
@require_auth
def checkout():
    """
    Create a new order (checkout)
    Expects: items (array of {product_id, quantity}), shipping info
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        # Validate required fields
        required = ['items', 'shipping_address', 'shipping_city', 'shipping_phone']
        is_valid, missing = validate_required_fields(data, required)
        if not is_valid:
            return jsonify({'ok': False, 'errors': missing}), 400
        
        items_data = data.get('items', [])
        if not items_data:
            return jsonify({'ok': False, 'error': 'Cart is empty'}), 400
        
        products_collection = _get_products_collection()
        users_collection = _get_users_collection()
        orders_collection = _get_orders_collection()
        
        if any(c is None for c in [products_collection, users_collection, orders_collection]):
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Get user info
        user_doc = users_collection.find_one({'_id': ObjectId(request.user_info['user_id'])})
        if not user_doc:
            return jsonify({'ok': False, 'error': 'User not found'}), 404
        
        user_name = f"{user_doc.get('first_name', '')} {user_doc.get('last_name', '')}".strip()
        
        # Validate items and check stock
        order_items = []
        total_amount = 0
        stock_updates = []
        
        for item in items_data:
            product_id = item.get('product_id')
            quantity = int(item.get('quantity', 1))
            
            if quantity < 1:
                return jsonify({'ok': False, 'error': 'Quantity must be at least 1'}), 400
            
            # Get product
            product_doc = products_collection.find_one({'_id': ObjectId(product_id), 'is_active': True})
            if not product_doc:
                return jsonify({'ok': False, 'error': f'Product not found: {product_id}'}), 404
            
            # Check stock
            if product_doc.get('stock', 0) < quantity:
                return jsonify({
                    'ok': False, 
                    'error': f"Not enough stock for {product_doc['name']}. Available: {product_doc.get('stock', 0)}"
                }), 400
            
            # Calculate subtotal
            unit_price = float(product_doc.get('price', 0))
            subtotal = unit_price * quantity
            total_amount += subtotal
            
            # Capture COGS and unit info at time of purchase
            cost_price = float(product_doc.get('cost_price', 0))
            sold_by = product_doc.get('sold_by', 'piece')
            unit = product_doc.get('unit', 'per item')
            
            # Create order item
            order_item = OrderItem(
                product_id=str(product_doc['_id']),
                product_name=product_doc.get('name', ''),
                product_image=product_doc.get('images', [''])[0] if product_doc.get('images') else '',
                quantity=quantity,
                unit_price=unit_price,
                subtotal=subtotal,
                seller_id=product_doc.get('seller_id', ''),
                seller_name=product_doc.get('seller_name', ''),
                cost_price=cost_price,
                sold_by=sold_by,
                unit=unit,
            )
            order_items.append(order_item)
            
            # Prepare stock update
            stock_updates.append({
                'product_id': ObjectId(product_id),
                'quantity': quantity
            })
        
        # Create order
        order = Order(
            user_id=request.user_info['user_id'],
            user_email=user_doc.get('email', ''),
            user_name=user_name,
            items=order_items,
            total_amount=total_amount,
            status=OrderStatus.PENDING,
            shipping_address=data.get('shipping_address', '').strip(),
            shipping_city=data.get('shipping_city', '').strip(),
            shipping_province=data.get('shipping_province', '').strip(),
            shipping_postal_code=data.get('shipping_postal_code', '').strip(),
            shipping_phone=data.get('shipping_phone', '').strip(),
            billing_name=data.get('billing_name', '').strip(),
            billing_email=data.get('billing_email', '').strip(),
            billing_phone=data.get('billing_phone', '').strip(),
            billing_address=data.get('billing_address', '').strip(),
            billing_city=data.get('billing_city', '').strip(),
            billing_province=data.get('billing_province', '').strip(),
            billing_postal_code=data.get('billing_postal_code', '').strip(),
            payment_method=data.get('payment_method', 'cash_on_delivery'),
            notes=data.get('notes', '').strip(),
        )
        
        # Insert order
        result = orders_collection.insert_one(order.to_dict())
        order._id = str(result.inserted_id)
        
        # For online payments, the order is created in 'pending' state
        # and awaits PayMongo payment confirmation before confirming.
        # Defer stock updates, emails, and notifications until payment
        # is verified (handled by _confirm_paid_order helper).
        is_online_payment = data.get('payment_method') in ('online', 'online_payment')

        if not is_online_payment:
            # Update stock for each product (COD orders confirm immediately)
            for update in stock_updates:
                products_collection.update_one(
                    {'_id': update['product_id']},
                    {
                        '$inc': {
                            'stock': -update['quantity'],
                            'sales_count': update['quantity']
                        },
                        '$set': {'updated_at': datetime.now(timezone.utc)}
                    }
                )
            
            # Send order confirmation email with PDF receipt
            try:
                email_service = get_email_service()
                email_service.send_order_receipt(order.to_public_dict(), status_changed=False)
            except Exception as email_error:
                print(f"[Orders] Failed to send confirmation email: {email_error}")
            
            # Emit real-time analytics update via SocketIO
            try:
                from flask import current_app
                emit_fn = current_app.config.get('emit_analytics_update')
                if emit_fn:
                    emit_fn('new_order', {
                        'order_id': str(order._id) if hasattr(order, '_id') else '',
                        'total_amount': order.total_amount,
                    })
            except Exception as ws_err:
                print(f"[Orders] SocketIO emit error: {ws_err}")
            
            # Create in-app notifications
            try:
                order_number = str(order._id)[-6:].upper() if order._id else 'N/A'
                # Build items summary with unit info
                items_summary_parts = []
                for oi in order_items[:3]:  # Show up to 3 items
                    qty_label = f"{oi.quantity} {'kg' if oi.sold_by == 'kg' else 'pc' if oi.quantity == 1 else 'pcs'}"
                    items_summary_parts.append(f"{oi.product_name} ({qty_label})")
                items_summary = ', '.join(items_summary_parts)
                if len(order_items) > 3:
                    items_summary += f' +{len(order_items) - 3} more'
                
                # Notify buyer
                create_notification(
                    user_id=request.user_info['user_id'],
                    title='Order Placed',
                    message=f'Your order #{order_number} has been placed! Items: {items_summary}. Total: ₱{order.total_amount:,.2f}',
                    notif_type=NotificationType.ORDER_PLACED,
                    data={'order_id': str(order._id)}
                )
                # Notify seller(s)
                seller_ids = list(set(item.seller_id for item in order_items if item.seller_id))
                for sid in seller_ids:
                    seller_items = [oi for oi in order_items if oi.seller_id == sid]
                    seller_parts = []
                    for oi in seller_items[:3]:
                        qty_label = f"{oi.quantity} {'kg' if oi.sold_by == 'kg' else 'pc' if oi.quantity == 1 else 'pcs'}"
                        seller_parts.append(f"{oi.product_name} ({qty_label})")
                    seller_summary = ', '.join(seller_parts)
                    if len(seller_items) > 3:
                        seller_summary += f' +{len(seller_items) - 3} more'
                    create_notification(
                        user_id=sid,
                        title='New Order Received',
                        message=f'New order #{order_number} from {order.user_name}: {seller_summary}',
                        notif_type=NotificationType.ORDER_PLACED,
                        data={'order_id': str(order._id)}
                    )
                # Notify admins
                create_notification_for_admins(
                    title='New Order',
                    message=f'New order #{order_number} placed by {order.user_name}. Total: ₱{order.total_amount:,.2f}',
                    notif_type=NotificationType.ORDER_PLACED,
                    data={'order_id': str(order._id)}
                )
            except Exception as notif_err:
                print(f"[Orders] Notification error: {notif_err}")
        else:
            print(f"[Orders] Online payment order {order._id} created – awaiting PayMongo payment before confirming.")
        
        return jsonify({
            'ok': True,
            'message': 'Order placed successfully',
            'order': order.to_public_dict()
        }), 201
    
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Checkout failed: {str(e)}'}), 500


@orders_bp.route('/', methods=['GET'])
@orders_bp.route('', methods=['GET'])  # Also handle without trailing slash to avoid redirect
@require_auth
def get_my_orders():
    """Get current user's orders"""
    try:
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Pagination
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        skip = (page - 1) * limit
        
        # Filter by status
        status = request.args.get('status')
        
        query = {'user_id': request.user_info['user_id']}
        if status:
            query['status'] = status
        
        cursor = orders_collection.find(query).skip(skip).limit(limit).sort('created_at', -1)
        total = orders_collection.count_documents(query)
        
        orders = []
        for doc in cursor:
            order = Order.from_dict(doc)
            order._id = str(doc['_id'])
            orders.append(order.to_public_dict())
        
        return jsonify({
            'ok': True,
            'orders': orders,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': (total + limit - 1) // limit
            }
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@orders_bp.route('/<order_id>', methods=['GET'])
@require_auth
def get_order(order_id: str):
    """Get single order by ID"""
    try:
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        order_doc = orders_collection.find_one({'_id': ObjectId(order_id)})
        if not order_doc:
            return jsonify({'ok': False, 'error': 'Order not found'}), 404
        
        # Check ownership (unless admin)
        if (order_doc.get('user_id') != request.user_info['user_id'] and 
            request.user_info.get('role') != 'admin'):
            return jsonify({'ok': False, 'error': 'Access denied'}), 403
        
        order = Order.from_dict(order_doc)
        order._id = str(order_doc['_id'])
        
        return jsonify({
            'ok': True,
            'order': order.to_public_dict()
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@orders_bp.route('/<order_id>/receipt', methods=['GET'])
@require_auth
def download_order_receipt(order_id: str):
    """
    Download PDF receipt for an order
    Returns a PDF file that can be downloaded or printed
    """
    try:
        if not is_pdf_generation_available():
            return jsonify({'ok': False, 'error': 'PDF generation is not available on this server'}), 503
        
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        order_doc = orders_collection.find_one({'_id': ObjectId(order_id)})
        if not order_doc:
            return jsonify({'ok': False, 'error': 'Order not found'}), 404
        
        # Check ownership (unless admin)
        if (order_doc.get('user_id') != request.user_info['user_id'] and 
            request.user_info.get('role') != 'admin'):
            return jsonify({'ok': False, 'error': 'Access denied'}), 403
        
        order = Order.from_dict(order_doc)
        order._id = str(order_doc['_id'])
        order_data = order.to_public_dict()
        
        # Generate PDF
        pdf_content = generate_order_receipt_pdf(order_data)
        if not pdf_content:
            return jsonify({'ok': False, 'error': 'Failed to generate PDF receipt'}), 500
        
        # Get order number for filename
        order_number = order_data.get('order_number', order_id)
        filename = f"order_{order_number}_receipt.pdf"
        
        # Return PDF as downloadable file
        return Response(
            pdf_content,
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Type': 'application/pdf',
                'Cache-Control': 'no-cache'
            }
        )
    
    except Exception as e:
        print(f"[Orders] PDF download error: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


@orders_bp.route('/<order_id>/receipt/preview', methods=['GET'])
@require_auth
def preview_order_receipt(order_id: str):
    """
    Preview PDF receipt for an order (opens in browser)
    Returns a PDF file that opens inline in the browser
    """
    try:
        if not is_pdf_generation_available():
            return jsonify({'ok': False, 'error': 'PDF generation is not available on this server'}), 503
        
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        order_doc = orders_collection.find_one({'_id': ObjectId(order_id)})
        if not order_doc:
            return jsonify({'ok': False, 'error': 'Order not found'}), 404
        
        # Check ownership (unless admin)
        if (order_doc.get('user_id') != request.user_info['user_id'] and 
            request.user_info.get('role') != 'admin'):
            return jsonify({'ok': False, 'error': 'Access denied'}), 403
        
        order = Order.from_dict(order_doc)
        order._id = str(order_doc['_id'])
        order_data = order.to_public_dict()
        
        # Generate PDF
        pdf_content = generate_order_receipt_pdf(order_data)
        if not pdf_content:
            return jsonify({'ok': False, 'error': 'Failed to generate PDF receipt'}), 500
        
        # Return PDF for inline viewing
        return Response(
            pdf_content,
            mimetype='application/pdf',
            headers={
                'Content-Disposition': 'inline',
                'Content-Type': 'application/pdf',
                'Cache-Control': 'no-cache'
            }
        )
    
    except Exception as e:
        print(f"[Orders] PDF preview error: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


@orders_bp.route('/<order_id>/cancel', methods=['POST'])
@require_auth
def cancel_order(order_id: str):
    """Cancel an order (only if pending or processing, not shipped/delivered)"""
    try:
        data = request.get_json() or {}
        reason = data.get('reason', '').strip()
        
        orders_collection = _get_orders_collection()
        products_collection = _get_products_collection()
        
        if any(c is None for c in [orders_collection, products_collection]):
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        order_doc = orders_collection.find_one({'_id': ObjectId(order_id)})
        if not order_doc:
            return jsonify({'ok': False, 'error': 'Order not found'}), 404
        
        # Check ownership
        if order_doc.get('user_id') != request.user_info['user_id']:
            return jsonify({'ok': False, 'error': 'Access denied'}), 403
        
        # Can only cancel pending or processing orders (not shipped or delivered)
        if order_doc.get('status') not in ['pending', 'processing']:
            return jsonify({'ok': False, 'error': 'Only pending or processing orders can be cancelled. Shipped or delivered orders cannot be cancelled.'}), 400
        
        # Restore stock
        for item in order_doc.get('items', []):
            products_collection.update_one(
                {'_id': ObjectId(item['product_id'])},
                {
                    '$inc': {
                        'stock': item['quantity'],
                        'sales_count': -item['quantity']
                    }
                }
            )
        
        # Update order status
        update_data = {
            'status': OrderStatus.CANCELLED.value,
            'updated_at': datetime.now(timezone.utc),
        }
        if reason:
            update_data['cancel_reason'] = reason
        
        orders_collection.update_one(
            {'_id': ObjectId(order_id)},
            {'$set': update_data}
        )
        
        # Send cancellation notification email to seller(s)
        if reason:
            try:
                email_service = get_email_service()
                if email_service.enabled:
                    # Get unique seller emails from order items
                    users_collection = _get_users_collection()
                    seller_ids = list(set(item.get('seller_id', '') for item in order_doc.get('items', []) if item.get('seller_id')))
                    
                    buyer_name = order_doc.get('user_name', 'A customer')
                    order_number = order_doc.get('order_number', str(order_doc['_id'])[-6:].upper())
                    
                    for seller_id in seller_ids:
                        if not seller_id:
                            continue
                        seller_doc = users_collection.find_one({'_id': ObjectId(seller_id)})
                        if seller_doc and seller_doc.get('email'):
                            seller_email = seller_doc['email']
                            subject = f'Order #{order_number} Cancelled by Buyer'
                            html_body = f'''
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                <div style="background-color: #D32F2F; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                                    <h2 style="margin: 0;">Order Cancelled</h2>
                                </div>
                                <div style="padding: 20px; border: 1px solid #E0E0E0; border-top: none; border-radius: 0 0 8px 8px;">
                                    <p>Hello,</p>
                                    <p>Order <strong>#{order_number}</strong> has been cancelled by <strong>{buyer_name}</strong>.</p>
                                    <div style="background-color: #FFF3E0; padding: 15px; border-radius: 8px; margin: 15px 0;">
                                        <p style="margin: 0; font-weight: bold; color: #E65100;">Cancellation Reason:</p>
                                        <p style="margin: 8px 0 0 0; color: #333;">{reason}</p>
                                    </div>
                                    <p style="color: #757575; font-size: 14px;">Stock has been automatically restored for the cancelled items.</p>
                                    <p style="color: #757575; font-size: 12px;">— Bignay Marketplace</p>
                                </div>
                            </div>
                            '''
                            email_service.send_email(seller_email, subject, html_body)
                            print(f"[Orders] Cancellation email sent to seller {seller_email}")
            except Exception as email_error:
                print(f"[Orders] Failed to send cancellation email: {email_error}")
        
        # Emit real-time analytics update via SocketIO
        try:
            from flask import current_app
            emit_fn = current_app.config.get('emit_analytics_update')
            if emit_fn:
                emit_fn('order_cancelled', {'order_id': order_id})
        except Exception as ws_err:
            print(f"[Orders] SocketIO emit error: {ws_err}")
        
        # Create in-app notifications for cancellation
        try:
            order_number = order_doc.get('order_number', str(order_doc['_id'])[-8:].upper())
            buyer_name = order_doc.get('user_name', 'A customer')
            # Notify sellers
            seller_ids_notif = list(set(item.get('seller_id', '') for item in order_doc.get('items', []) if item.get('seller_id')))
            for sid in seller_ids_notif:
                create_notification(
                    user_id=sid,
                    title='Order Cancelled',
                    message=f'Order #{order_number} has been cancelled by {buyer_name}.' + (f' Reason: {reason}' if reason else ''),
                    notif_type=NotificationType.ORDER_CANCELLED,
                    data={'order_id': order_id}
                )
            # Notify admins
            create_notification_for_admins(
                title='Order Cancelled',
                message=f'Order #{order_number} cancelled by {buyer_name}.',
                notif_type=NotificationType.ORDER_CANCELLED,
                data={'order_id': order_id}
            )
        except Exception as notif_err:
            print(f"[Orders] Notification error: {notif_err}")
        
        return jsonify({
            'ok': True,
            'message': 'Order cancelled successfully'
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@orders_bp.route('/<order_id>/confirm-delivery', methods=['POST'])
@require_auth
def confirm_delivery(order_id: str):
    """User confirms order delivery (only for shipped orders)"""
    try:
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        order_doc = orders_collection.find_one({'_id': ObjectId(order_id)})
        if not order_doc:
            return jsonify({'ok': False, 'error': 'Order not found'}), 404
        
        # Check ownership
        if order_doc.get('user_id') != request.user_info['user_id']:
            return jsonify({'ok': False, 'error': 'Access denied'}), 403
        
        # Can only confirm delivery for shipped orders
        if order_doc.get('status') != 'shipped':
            return jsonify({'ok': False, 'error': 'Only shipped orders can be marked as delivered'}), 400
        
        # Update order status to delivered
        update_data = {
            'status': OrderStatus.DELIVERED.value if hasattr(OrderStatus, 'DELIVERED') else 'delivered',
            'updated_at': datetime.now(timezone.utc),
            'delivered_at': datetime.now(timezone.utc),
            'payment_status': 'paid',
        }
        
        orders_collection.update_one(
            {'_id': ObjectId(order_id)},
            {'$set': update_data}
        )
        
        # Send delivery confirmation email to admin/seller
        try:
            email_service = get_email_service()
            if email_service.enabled:
                users_collection = _get_users_collection()
                buyer_name = order_doc.get('user_name', 'A customer')
                order_number = order_doc.get('order_number', str(order_doc['_id'])[-8:].upper())
                
                # Notify sellers
                seller_ids = list(set(item.get('seller_id', '') for item in order_doc.get('items', []) if item.get('seller_id')))
                for seller_id in seller_ids:
                    if not seller_id:
                        continue
                    seller_doc = users_collection.find_one({'_id': ObjectId(seller_id)})
                    if seller_doc and seller_doc.get('email'):
                        seller_email = seller_doc['email']
                        subject = f'Order #{order_number} Delivered - Confirmed by Buyer'
                        total = order_doc.get('total_amount', 0)
                        html_body = f'''
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background-color: #4CAF50; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                                <h2 style="margin: 0;">Order Delivered</h2>
                            </div>
                            <div style="padding: 20px; border: 1px solid #E0E0E0; border-top: none; border-radius: 0 0 8px 8px;">
                                <p>Hello,</p>
                                <p>Great news! Order <strong>#{order_number}</strong> has been confirmed as delivered by <strong>{buyer_name}</strong>.</p>
                                <div style="background-color: #E8F5E9; padding: 15px; border-radius: 8px; margin: 15px 0;">
                                    <p style="margin: 0; font-weight: bold; color: #2E7D32;">Order Total: ₱{total:,.2f}</p>
                                    <p style="margin: 8px 0 0 0; color: #333;">Payment has been marked as completed.</p>
                                </div>
                                <p style="color: #757575; font-size: 12px;">— Bignay Marketplace</p>
                            </div>
                        </div>
                        '''
                        email_service.send_email(seller_email, subject, html_body)
                        print(f"[Orders] Delivery confirmation email sent to seller {seller_email}")
                
                # Also notify admin(s)
                admin_docs = users_collection.find({'role': 'admin'})
                for admin_doc in admin_docs:
                    if admin_doc.get('email'):
                        admin_email = admin_doc['email']
                        subject = f'Order #{order_number} Delivered - Confirmed by Buyer'
                        total = order_doc.get('total_amount', 0)
                        html_body = f'''
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background-color: #4CAF50; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                                <h2 style="margin: 0;">Delivery Confirmed</h2>
                            </div>
                            <div style="padding: 20px; border: 1px solid #E0E0E0; border-top: none; border-radius: 0 0 8px 8px;">
                                <p>Order <strong>#{order_number}</strong> confirmed delivered by <strong>{buyer_name}</strong>.</p>
                                <p>Total: <strong>₱{total:,.2f}</strong> — Payment marked as paid.</p>
                                <p style="color: #757575; font-size: 12px;">— Bignay Marketplace</p>
                            </div>
                        </div>
                        '''
                        email_service.send_email(admin_email, subject, html_body)
        except Exception as email_error:
            print(f"[Orders] Failed to send delivery confirmation email: {email_error}")
        
        # Emit real-time analytics update via SocketIO
        try:
            from flask import current_app
            emit_fn = current_app.config.get('emit_analytics_update')
            if emit_fn:
                emit_fn('order_delivered', {
                    'order_id': order_id,
                    'total_amount': order_doc.get('total_amount', 0),
                })
        except Exception as ws_err:
            print(f"[Orders] SocketIO emit error: {ws_err}")
        
        # Create in-app notifications for delivery
        try:
            order_number = order_doc.get('order_number', str(order_doc['_id'])[-8:].upper())
            buyer_name = order_doc.get('user_name', 'A customer')
            total = order_doc.get('total_amount', 0)
            # Notify sellers
            seller_ids_notif = list(set(item.get('seller_id', '') for item in order_doc.get('items', []) if item.get('seller_id')))
            for sid in seller_ids_notif:
                create_notification(
                    user_id=sid,
                    title='Order Delivered',
                    message=f'Order #{order_number} has been confirmed delivered by {buyer_name}. Payment: ₱{total:,.2f}',
                    notif_type=NotificationType.ORDER_DELIVERED,
                    data={'order_id': order_id}
                )
            # Notify admins
            create_notification_for_admins(
                title='Order Delivered',
                message=f'Order #{order_number} delivered. Total: ₱{total:,.2f}',
                notif_type=NotificationType.ORDER_DELIVERED,
                data={'order_id': order_id}
            )
        except Exception as notif_err:
            print(f"[Orders] Notification error: {notif_err}")
        
        return jsonify({
            'ok': True,
            'message': 'Order marked as delivered successfully'
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# Admin routes

@orders_bp.route('/admin/all', methods=['GET'])
@require_admin
def admin_list_orders():
    """List all orders (admin only)"""
    try:
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Pagination
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        skip = (page - 1) * limit
        
        # Filters
        status = request.args.get('status')
        user_id = request.args.get('user_id')
        
        query = {}
        if status:
            query['status'] = status
        if user_id:
            query['user_id'] = user_id
        
        cursor = orders_collection.find(query).skip(skip).limit(limit).sort('created_at', -1)
        total = orders_collection.count_documents(query)
        
        # Batch-fetch user avatars for all orders
        order_docs = list(cursor)
        user_ids = list({doc.get('user_id') for doc in order_docs if doc.get('user_id')})
        user_avatars = {}
        if user_ids:
            users_collection = _get_users_collection()
            if users_collection is not None:
                user_cursor = users_collection.find(
                    {'_id': {'$in': [ObjectId(uid) for uid in user_ids]}},
                    {'_id': 1, 'profile_image': 1}
                )
                for u in user_cursor:
                    user_avatars[str(u['_id'])] = u.get('profile_image', '')
        
        orders = []
        for doc in order_docs:
            order = Order.from_dict(doc)
            order._id = str(doc['_id'])
            order_data = order.to_public_dict()
            order_data['user_avatar'] = user_avatars.get(order_data.get('user_id', ''), '')
            orders.append(order_data)
        
        return jsonify({
            'ok': True,
            'orders': orders,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': (total + limit - 1) // limit
            }
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@orders_bp.route('/admin/<order_id>/status', methods=['PUT'])
@require_admin
def update_order_status(order_id: str):
    """Update order status (admin only)"""
    try:
        data = request.get_json()
        if not data or 'status' not in data:
            return jsonify({'ok': False, 'error': 'Status required'}), 400
        
        new_status = data['status']
        valid_statuses = [s.value for s in OrderStatus]
        if new_status not in valid_statuses:
            return jsonify({'ok': False, 'error': f'Invalid status. Must be one of: {valid_statuses}'}), 400
        
        # Admin cannot set delivered status - only buyers can confirm delivery
        if new_status == 'delivered':
            return jsonify({'ok': False, 'error': 'Delivered status can only be set by the buyer through order confirmation'}), 400
        
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        update_data = {
            'status': new_status,
            'updated_at': datetime.now(timezone.utc)
        }
        
        if new_status == 'delivered':
            update_data['delivered_at'] = datetime.now(timezone.utc)
            update_data['payment_status'] = 'paid'
        
        result = orders_collection.update_one(
            {'_id': ObjectId(order_id)},
            {'$set': update_data}
        )
        
        if result.matched_count == 0:
            return jsonify({'ok': False, 'error': 'Order not found'}), 404
        
        # Send status change email with PDF receipt
        try:
            order_doc = orders_collection.find_one({'_id': ObjectId(order_id)})
            if order_doc:
                order = Order.from_dict(order_doc)
                order._id = str(order_doc['_id'])
                
                order_data = order.to_public_dict()
                print(f"[Orders] Sending status update email for order {order_id} to {order_data.get('user_email')}")
                
                email_service = get_email_service()
                if email_service.enabled:
                    email_sent = email_service.send_order_receipt(order_data, status_changed=True)
                    if email_sent:
                        print(f"[Orders] Status change email sent successfully for order {order_id}")
                    else:
                        print(f"[Orders] Failed to send status change email for order {order_id}")
                else:
                    print(f"[Orders] Email service is disabled - skipping status change email")
        except Exception as email_error:
            print(f"[Orders] Failed to send status change email: {email_error}")
            import traceback
            traceback.print_exc()
        
        # Emit real-time analytics update via SocketIO
        try:
            from flask import current_app
            emit_fn = current_app.config.get('emit_analytics_update')
            if emit_fn:
                emit_fn('order_status_change', {
                    'order_id': order_id,
                    'new_status': new_status,
                })
        except Exception as ws_err:
            print(f"[Orders] SocketIO emit error: {ws_err}")
        
        # Create in-app notification for status change
        try:
            order_doc = orders_collection.find_one({'_id': ObjectId(order_id)})
            if order_doc:
                order_number = order_doc.get('order_number', str(order_doc['_id'])[-8:].upper())
                buyer_id = order_doc.get('user_id')
                status_labels = {
                    'confirmed': ('Order Confirmed', NotificationType.ORDER_CONFIRMED),
                    'processing': ('Order Processing', NotificationType.ORDER_PROCESSING),
                    'shipped': ('Order Shipped', NotificationType.ORDER_SHIPPED),
                    'ready_for_pickup': ('Order Ready for Pickup', NotificationType.ORDER_SHIPPED),
                    'cancelled': ('Order Cancelled', NotificationType.ORDER_CANCELLED),
                    'refunded': ('Order Refunded', NotificationType.ORDER_REFUNDED),
                }
                label, ntype = status_labels.get(new_status, (f'Order {new_status.title()}', NotificationType.SYSTEM))
                if buyer_id:
                    create_notification(
                        user_id=buyer_id,
                        title=label,
                        message=f'Your order #{order_number} has been updated to: {new_status.replace("_", " ").title()}',
                        notif_type=ntype,
                        data={'order_id': order_id, 'new_status': new_status}
                    )
        except Exception as notif_err:
            print(f"[Orders] Notification error: {notif_err}")
        
        return jsonify({
            'ok': True,
            'message': f'Order status updated to {new_status}'
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@orders_bp.route('/admin/stats', methods=['GET'])
@require_admin
def get_order_stats():
    """Get order statistics (admin only)"""
    try:
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Count by status
        stats = {}
        for status in OrderStatus:
            stats[status.value] = orders_collection.count_documents({'status': status.value})
        
        # Total revenue (from delivered orders)
        pipeline = [
            {'$match': {'status': 'delivered'}},
            {'$group': {'_id': None, 'total': {'$sum': '$total_amount'}}}
        ]
        revenue_result = list(orders_collection.aggregate(pipeline))
        total_revenue = revenue_result[0]['total'] if revenue_result else 0
        
        # Total orders
        total_orders = orders_collection.count_documents({})
        
        return jsonify({
            'ok': True,
            'stats': {
                'by_status': stats,
                'total_orders': total_orders,
                'total_revenue': total_revenue
            }
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@orders_bp.route('/<order_id>', methods=['DELETE'])
@require_auth
def delete_order(order_id: str):
    """Delete an order (only for delivered or cancelled orders)"""
    try:
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        order = orders_collection.find_one({'_id': ObjectId(order_id)})
        if not order:
            return jsonify({'ok': False, 'error': 'Order not found'}), 404
        
        # Check ownership (unless admin)
        user_id = request.user_info['user_id']
        is_admin = request.user_info.get('role') == 'admin'
        
        if order['user_id'] != user_id and not is_admin:
            return jsonify({'ok': False, 'error': 'Unauthorized'}), 403
        
        # Only allow deletion of delivered or cancelled orders
        if order['status'] not in ['delivered', 'cancelled']:
            return jsonify({
                'ok': False, 
                'error': 'Can only delete delivered or cancelled orders'
            }), 400
        
        result = orders_collection.delete_one({'_id': ObjectId(order_id)})
        
        if result.deleted_count == 0:
            return jsonify({'ok': False, 'error': 'Failed to delete order'}), 500
        
        return jsonify({
            'ok': True,
            'message': 'Order deleted successfully'
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@orders_bp.route('/bulk-delete', methods=['POST'])
@require_auth
def bulk_delete_orders():
    """Delete multiple orders (only for delivered or cancelled orders)"""
    try:
        data = request.get_json()
        if not data or 'order_ids' not in data:
            return jsonify({'ok': False, 'error': 'Order IDs required'}), 400
        
        order_ids = data['order_ids']
        if not isinstance(order_ids, list) or len(order_ids) == 0:
            return jsonify({'ok': False, 'error': 'Invalid order IDs'}), 400
        
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        user_id = request.user_info['user_id']
        is_admin = request.user_info.get('role') == 'admin'
        
        # Convert to ObjectIds
        object_ids = [ObjectId(oid) for oid in order_ids]
        
        # Build query - only delete delivered/cancelled orders owned by user (or all if admin)
        query = {
            '_id': {'$in': object_ids},
            'status': {'$in': ['delivered', 'cancelled']}
        }
        if not is_admin:
            query['user_id'] = user_id
        
        result = orders_collection.delete_many(query)
        
        return jsonify({
            'ok': True,
            'message': f'Deleted {result.deleted_count} order(s)',
            'deleted_count': result.deleted_count
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
    
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ──────────────────────────────────────────────────────────────────────────────
#  Seller Order Management Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@orders_bp.route('/seller/my-orders', methods=['GET'])
@require_auth
def seller_list_orders():
    """
    List orders that contain at least one item sold by the current user.
    Seller can only see orders for their own products.
    Query params: status, page, limit, search
    """
    try:
        seller_id = request.user_info['user_id']
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503

        page = max(1, int(request.args.get('page', 1)))
        limit = min(50, max(1, int(request.args.get('limit', 20))))
        skip = (page - 1) * limit
        status_filter = request.args.get('status', '').strip()
        search_q = request.args.get('search', '').strip()

        query: dict = {'items.seller_id': seller_id}
        if status_filter and status_filter != 'all':
            query['status'] = status_filter
        if search_q:
            query['$or'] = [
                {'order_number': {'$regex': search_q, '$options': 'i'}},
                {'user_name': {'$regex': search_q, '$options': 'i'}},
            ]

        total = orders_collection.count_documents(query)
        cursor = orders_collection.find(query).skip(skip).limit(limit).sort('created_at', -1)
        order_docs = list(cursor)

        orders = []
        for doc in order_docs:
            order = Order.from_dict(doc)
            order._id = str(doc['_id'])
            d = order.to_public_dict()
            # Filter items to only this seller's items
            d['seller_items'] = [
                item for item in d.get('items', [])
                if item.get('seller_id') == seller_id
            ]
            d['seller_subtotal'] = sum(
                item.get('subtotal', 0) for item in d['seller_items']
            )
            orders.append(d)

        return jsonify({
            'ok': True,
            'orders': orders,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': max(1, (total + limit - 1) // limit),
            },
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@orders_bp.route('/seller/<order_id>', methods=['GET'])
@require_auth
def seller_get_order(order_id: str):
    """Get a single order (seller perspective — must own at least 1 item)."""
    try:
        seller_id = request.user_info['user_id']
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503

        doc = orders_collection.find_one({
            '_id': ObjectId(order_id),
            'items.seller_id': seller_id,
        })
        if not doc:
            return jsonify({'ok': False, 'error': 'Order not found or access denied'}), 404

        order = Order.from_dict(doc)
        order._id = str(doc['_id'])
        d = order.to_public_dict()
        d['seller_items'] = [i for i in d.get('items', []) if i.get('seller_id') == seller_id]
        d['seller_subtotal'] = sum(i.get('subtotal', 0) for i in d['seller_items'])
        return jsonify({'ok': True, 'order': d})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@orders_bp.route('/seller/<order_id>/status', methods=['PUT'])
@require_auth
def seller_update_order_status(order_id: str):
    """
    Let a seller advance the order status:
      pending → processing → shipped → ready_for_pickup
    Sellers cannot set: delivered, cancelled, refunded.
    The full order status is only updated when ALL seller items have progressed.
    """
    try:
        seller_id = request.user_info['user_id']
        data = request.get_json() or {}
        new_status = data.get('status', '').strip()

        seller_allowed = {'processing', 'shipped', 'ready_for_pickup'}
        if new_status not in seller_allowed:
            return jsonify({
                'ok': False,
                'error': f"Sellers may only set status to: {', '.join(sorted(seller_allowed))}",
            }), 400

        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503

        doc = orders_collection.find_one({
            '_id': ObjectId(order_id),
            'items.seller_id': seller_id,
        })
        if not doc:
            return jsonify({'ok': False, 'error': 'Order not found or access denied'}), 404

        current_status = doc.get('status', 'pending')
        if current_status in ('delivered', 'cancelled', 'refunded'):
            return jsonify({'ok': False, 'error': 'Cannot update a finalised order'}), 400

        orders_collection.update_one(
            {'_id': ObjectId(order_id)},
            {'$set': {
                'status': new_status,
                'updated_at': datetime.now(timezone.utc),
            }},
        )

        return jsonify({
            'ok': True,
            'message': f'Order status updated to {new_status}',
            'order_id': order_id,
            'new_status': new_status,
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# Helper to check if user purchased a product
def user_purchased_product(user_id: str, product_id: str) -> bool:
    """Check if a user has purchased a specific product"""
    from flask import current_app
    orders_collection = current_app.config.get('db_orders')
    
    if orders_collection is None:
        return False
    
    # Check for delivered orders containing this product
    order = orders_collection.find_one({
        'user_id': user_id,
        'status': 'delivered',
        'items.product_id': product_id
    })
    
    return order is not None
