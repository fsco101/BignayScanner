"""
Analytics Routes
Handles sales analytics and statistics for users and admin
"""

from __future__ import annotations
from datetime import datetime, timezone, timedelta
from flask import Blueprint, jsonify, request
from bson import ObjectId

from routes.auth import require_auth, require_admin

analytics_bp = Blueprint('analytics', __name__, url_prefix='/api/analytics')


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


def _get_date_range(period: str):
    """
    Get date range based on period filter
    Returns (start_date, end_date, group_by_format)
    """
    now = datetime.now(timezone.utc)
    
    if period == 'weekly':
        # Last 14 days (2 weeks)
        start_date = now - timedelta(days=14)
        group_format = '%Y-%m-%d'  # Daily grouping
    elif period == 'monthly':
        # Last 30 days
        start_date = now - timedelta(days=30)
        group_format = '%Y-%m-%d'  # Daily grouping
    elif period == 'yearly':
        # Last 365 days
        start_date = now - timedelta(days=365)
        group_format = '%Y-%m'  # Monthly grouping
    else:
        # Default to monthly
        start_date = now - timedelta(days=30)
        group_format = '%Y-%m-%d'
    
    return start_date, now, group_format


def _get_period_labels(period: str, start_date: datetime, end_date: datetime):
    """Generate all date labels for the period"""
    labels = []
    current = start_date
    
    if period == 'yearly':
        # Monthly labels
        while current <= end_date:
            labels.append(current.strftime('%Y-%m'))
            # Move to next month
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)
    else:
        # Daily labels
        while current <= end_date:
            labels.append(current.strftime('%Y-%m-%d'))
            current += timedelta(days=1)
    
    return labels


@analytics_bp.route('/user/sales', methods=['GET'])
@require_auth
def get_user_sales_analytics():
    """
    Get sales analytics for the authenticated user (as a seller)
    Query params:
        - period: 'weekly', 'monthly', 'yearly' (default: 'monthly')
    
    Returns:
        - total_sales: Total revenue
        - total_orders: Number of completed orders
        - sales_trend: Array of {date, amount} for line chart
        - product_sales: Array of {product_name, quantity, revenue} for pie chart
    """
    try:
        period = request.args.get('period', 'monthly')
        user_id = request.user_info['user_id']
        
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        start_date, end_date, group_format = _get_date_range(period)
        
        # Build base query for completed orders where user is the seller
        # Orders have items with seller_id
        base_match = {
            'status': {'$in': ['delivered', 'completed']},
            'created_at': {'$gte': start_date, '$lte': end_date},
            'items.seller_id': user_id
        }
        
        # Get total sales and order count
        total_pipeline = [
            {'$match': base_match},
            {'$unwind': '$items'},
            {'$match': {'items.seller_id': user_id}},
            {
                '$group': {
                    '_id': None,
                    'total_sales': {'$sum': '$items.subtotal'},
                    'total_orders': {'$addToSet': '$_id'}
                }
            }
        ]
        
        total_result = list(orders_collection.aggregate(total_pipeline))
        total_sales = total_result[0]['total_sales'] if total_result else 0
        total_orders = len(total_result[0]['total_orders']) if total_result else 0
        
        # Get sales trend data (daily/monthly breakdown)
        if period == 'yearly':
            date_format = {'$dateToString': {'format': '%Y-%m', 'date': '$created_at'}}
        else:
            date_format = {'$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}}
        
        trend_pipeline = [
            {'$match': base_match},
            {'$unwind': '$items'},
            {'$match': {'items.seller_id': user_id}},
            {
                '$group': {
                    '_id': date_format,
                    'amount': {'$sum': '$items.subtotal'},
                    'order_count': {'$sum': 1}
                }
            },
            {'$sort': {'_id': 1}}
        ]
        
        trend_result = list(orders_collection.aggregate(trend_pipeline))
        
        # Fill in missing dates with zero values
        all_labels = _get_period_labels(period, start_date, end_date)
        trend_map = {item['_id']: item['amount'] for item in trend_result}
        
        sales_trend = [
            {
                'date': label,
                'amount': round(trend_map.get(label, 0), 2)
            }
            for label in all_labels
        ]
        
        # Get product breakdown for pie chart (with COGS from order items)
        product_pipeline = [
            {'$match': base_match},
            {'$unwind': '$items'},
            {'$match': {'items.seller_id': user_id}},
            {
                '$group': {
                    '_id': '$items.product_name',
                    'quantity': {'$sum': '$items.quantity'},
                    'revenue': {'$sum': '$items.subtotal'},
                    'total_cogs': {'$sum': {'$multiply': [
                        {'$ifNull': ['$items.cost_price', 0]},
                        '$items.quantity'
                    ]}},
                    'avg_cost_price': {'$avg': {'$ifNull': ['$items.cost_price', 0]}},
                    'product_id': {'$first': '$items.product_id'},
                }
            },
            {'$sort': {'revenue': -1}},
            {'$limit': 10}  # Top 10 products
        ]
        
        product_result = list(orders_collection.aggregate(product_pipeline))
        
        # Enrich product_sales with images; use stored COGS, fallback to product lookup
        products_collection = _get_products_collection()
        product_sales = []
        total_cogs = 0
        for item in product_result:
            product_name = item['_id']
            quantity = item['quantity']
            revenue = round(item['revenue'], 2)
            product_image = None
            item_cogs = round(item.get('total_cogs', 0), 2)
            cost_price = round(item.get('avg_cost_price', 0), 2)
            
            # Fallback: if no COGS stored in order items, look up from product
            if item_cogs == 0 and products_collection is not None:
                product_doc = products_collection.find_one(
                    {'name': product_name, 'seller_id': user_id},
                    {'cost_price': 1, 'images': 1}
                )
                if product_doc:
                    fallback_cost = float(product_doc.get('cost_price', 0))
                    if fallback_cost > 0:
                        cost_price = fallback_cost
                        item_cogs = round(fallback_cost * quantity, 2)
                    images = product_doc.get('images', [])
                    if images:
                        product_image = images[0]
            else:
                # Fetch product image
                if products_collection is not None:
                    product_doc = products_collection.find_one(
                        {'name': product_name, 'seller_id': user_id},
                        {'images': 1}
                    )
                    if product_doc:
                        images = product_doc.get('images', [])
                        if images:
                            product_image = images[0]
            
            total_cogs += item_cogs
            product_sales.append({
                'product_name': product_name,
                'quantity': quantity,
                'revenue': revenue,
                'image': product_image,
                'cost_price': cost_price,
                'cogs': item_cogs,
                'profit': round(revenue - item_cogs, 2),
            })
        
        # Get average order value
        avg_order_value = round(total_sales / total_orders, 2) if total_orders > 0 else 0
        
        # Get total items sold
        items_pipeline = [
            {'$match': base_match},
            {'$unwind': '$items'},
            {'$match': {'items.seller_id': user_id}},
            {
                '$group': {
                    '_id': None,
                    'total_items': {'$sum': '$items.quantity'}
                }
            }
        ]
        items_result = list(orders_collection.aggregate(items_pipeline))
        total_items_sold = items_result[0]['total_items'] if items_result else 0
        
        total_cogs = round(total_cogs, 2)
        gross_profit = round(total_sales - total_cogs, 2)
        
        # Get order count trend (for order volume chart)
        order_trend_pipeline = [
            {'$match': base_match},
            {
                '$group': {
                    '_id': date_format,
                    'count': {'$sum': 1}
                }
            },
            {'$sort': {'_id': 1}}
        ]
        order_trend_result = list(orders_collection.aggregate(order_trend_pipeline))
        order_trend_map = {item['_id']: item['count'] for item in order_trend_result}
        order_trend = [
            {'date': label, 'count': order_trend_map.get(label, 0)}
            for label in all_labels
        ]
        
        # Get cancelled orders count
        cancelled_match = {
            'status': 'cancelled',
            'created_at': {'$gte': start_date, '$lte': end_date},
            'items.seller_id': user_id
        }
        cancelled_orders = len(list(orders_collection.find(cancelled_match, {'_id': 1})))
        
        # Calculate growth rate (compare to previous period)
        period_days = (end_date - start_date).days
        prev_start = start_date - timedelta(days=period_days)
        prev_match = {
            'status': {'$in': ['delivered', 'completed']},
            'created_at': {'$gte': prev_start, '$lt': start_date},
            'items.seller_id': user_id
        }
        prev_pipeline = [
            {'$match': prev_match},
            {'$unwind': '$items'},
            {'$match': {'items.seller_id': user_id}},
            {
                '$group': {
                    '_id': None,
                    'total_sales': {'$sum': '$items.subtotal'}
                }
            }
        ]
        prev_result = list(orders_collection.aggregate(prev_pipeline))
        prev_sales = prev_result[0]['total_sales'] if prev_result else 0
        growth_rate = round(((total_sales - prev_sales) / prev_sales * 100), 1) if prev_sales > 0 else (100.0 if total_sales > 0 else 0)
        
        return jsonify({
            'ok': True,
            'period': period,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'summary': {
                'total_sales': round(total_sales, 2),
                'total_orders': total_orders,
                'avg_order_value': avg_order_value,
                'total_items_sold': total_items_sold,
                'total_cogs': total_cogs,
                'gross_profit': gross_profit,
                'profit_margin': round((gross_profit / total_sales * 100), 1) if total_sales > 0 else 0,
                'cancelled_orders': cancelled_orders,
                'growth_rate': growth_rate
            },
            'sales_trend': sales_trend,
            'order_trend': order_trend,
            'product_sales': product_sales
        })
        
    except Exception as e:
        print(f"[Analytics] Error in user sales: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


@analytics_bp.route('/admin/sales', methods=['GET'])
@require_admin
def get_admin_sales_analytics():
    """
    Get platform-wide sales analytics (admin only)
    Query params:
        - period: 'weekly', 'monthly', 'yearly' (default: 'monthly')
    
    Returns:
        - total_sales: Total platform revenue
        - total_orders: Total number of completed orders
        - total_sellers: Number of unique sellers with sales
        - sales_trend: Array of {date, amount} for line chart
        - product_sales: Array of {product_name, quantity, revenue} for pie chart
        - seller_sales: Array of {seller_name, revenue} for top sellers
    """
    try:
        period = request.args.get('period', 'monthly')
        
        orders_collection = _get_orders_collection()
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        start_date, end_date, group_format = _get_date_range(period)
        
        # Build base query for completed orders
        base_match = {
            'status': {'$in': ['delivered', 'completed']},
            'created_at': {'$gte': start_date, '$lte': end_date}
        }
        
        # Get total sales, order count, and unique sellers
        total_pipeline = [
            {'$match': base_match},
            {'$unwind': '$items'},
            {
                '$group': {
                    '_id': None,
                    'total_sales': {'$sum': '$items.subtotal'},
                    'total_orders': {'$addToSet': '$_id'},
                    'unique_sellers': {'$addToSet': '$items.seller_id'}
                }
            }
        ]
        
        total_result = list(orders_collection.aggregate(total_pipeline))
        total_sales = total_result[0]['total_sales'] if total_result else 0
        total_orders = len(total_result[0]['total_orders']) if total_result else 0
        total_sellers = len(total_result[0]['unique_sellers']) if total_result else 0
        
        # Get sales trend data (daily/monthly breakdown)
        if period == 'yearly':
            date_format = {'$dateToString': {'format': '%Y-%m', 'date': '$created_at'}}
        else:
            date_format = {'$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}}
        
        trend_pipeline = [
            {'$match': base_match},
            {
                '$group': {
                    '_id': date_format,
                    'amount': {'$sum': '$total_amount'},
                    'order_count': {'$sum': 1}
                }
            },
            {'$sort': {'_id': 1}}
        ]
        
        trend_result = list(orders_collection.aggregate(trend_pipeline))
        
        # Fill in missing dates with zero values
        all_labels = _get_period_labels(period, start_date, end_date)
        trend_map = {item['_id']: item['amount'] for item in trend_result}
        
        sales_trend = [
            {
                'date': label,
                'amount': round(trend_map.get(label, 0), 2)
            }
            for label in all_labels
        ]
        
        # Get product breakdown for pie chart (platform-wide, with COGS from order items)
        product_pipeline = [
            {'$match': base_match},
            {'$unwind': '$items'},
            {
                '$group': {
                    '_id': '$items.product_name',
                    'quantity': {'$sum': '$items.quantity'},
                    'revenue': {'$sum': '$items.subtotal'},
                    'total_cogs': {'$sum': {'$multiply': [
                        {'$ifNull': ['$items.cost_price', 0]},
                        '$items.quantity'
                    ]}},
                    'avg_cost_price': {'$avg': {'$ifNull': ['$items.cost_price', 0]}},
                }
            },
            {'$sort': {'revenue': -1}},
            {'$limit': 10}  # Top 10 products
        ]
        
        product_result = list(orders_collection.aggregate(product_pipeline))
        
        # Enrich product_sales with images; use stored COGS, fallback to product lookup
        products_collection = _get_products_collection()
        users_collection = _get_users_collection()
        product_sales = []
        total_cogs = 0
        for item in product_result:
            product_name = item['_id']
            quantity = item['quantity']
            revenue = round(item['revenue'], 2)
            product_image = None
            item_cogs = round(item.get('total_cogs', 0), 2)
            cost_price = round(item.get('avg_cost_price', 0), 2)
            
            # Fallback: if no COGS stored in order items, look up from product
            if item_cogs == 0 and products_collection is not None:
                product_doc = products_collection.find_one(
                    {'name': product_name},
                    {'cost_price': 1, 'images': 1}
                )
                if product_doc:
                    fallback_cost = float(product_doc.get('cost_price', 0))
                    if fallback_cost > 0:
                        cost_price = fallback_cost
                        item_cogs = round(fallback_cost * quantity, 2)
                    images = product_doc.get('images', [])
                    if images:
                        product_image = images[0]
            else:
                # Fetch product image
                if products_collection is not None:
                    product_doc = products_collection.find_one(
                        {'name': product_name},
                        {'images': 1}
                    )
                    if product_doc:
                        images = product_doc.get('images', [])
                        if images:
                            product_image = images[0]
            
            total_cogs += item_cogs
            product_sales.append({
                'product_name': product_name,
                'quantity': quantity,
                'revenue': revenue,
                'image': product_image,
                'cost_price': cost_price,
                'cogs': item_cogs,
                'profit': round(revenue - item_cogs, 2),
            })
        
        # Get top sellers with profile images
        seller_pipeline = [
            {'$match': base_match},
            {'$unwind': '$items'},
            {
                '$group': {
                    '_id': {
                        'seller_id': '$items.seller_id',
                        'seller_name': '$items.seller_name'
                    },
                    'revenue': {'$sum': '$items.subtotal'},
                    'order_count': {'$sum': 1},
                    'items_sold': {'$sum': '$items.quantity'}
                }
            },
            {'$sort': {'revenue': -1}},
            {'$limit': 10}  # Top 10 sellers
        ]
        
        seller_result = list(orders_collection.aggregate(seller_pipeline))
        seller_sales = []
        for item in seller_result:
            seller_id = item['_id']['seller_id']
            seller_name = item['_id']['seller_name'] or 'Unknown'
            seller_email = ''
            seller_image = None
            
            # Look up seller profile image
            if users_collection is not None and seller_id:
                user_doc = users_collection.find_one(
                    {'_id': ObjectId(seller_id)},
                    {'profile_image': 1, 'email': 1}
                )
                if user_doc:
                    seller_image = user_doc.get('profile_image')
                    seller_email = user_doc.get('email', '')
            
            seller_sales.append({
                'seller_id': seller_id,
                'seller_name': seller_name,
                'seller_email': seller_email,
                'seller_image': seller_image,
                'total_sales': round(item['revenue'], 2),
                'order_count': item['order_count'],
                'items_sold': item.get('items_sold', 0),
            })
        
        # Get average order value
        avg_order_value = round(total_sales / total_orders, 2) if total_orders > 0 else 0
        
        # Get total items sold
        items_pipeline = [
            {'$match': base_match},
            {'$unwind': '$items'},
            {
                '$group': {
                    '_id': None,
                    'total_items': {'$sum': '$items.quantity'}
                }
            }
        ]
        items_result = list(orders_collection.aggregate(items_pipeline))
        total_items_sold = items_result[0]['total_items'] if items_result else 0
        
        total_cogs = round(total_cogs, 2)
        gross_profit = round(total_sales - total_cogs, 2)
        
        # Get order count trend
        order_trend_pipeline = [
            {'$match': base_match},
            {
                '$group': {
                    '_id': date_format,
                    'count': {'$sum': 1}
                }
            },
            {'$sort': {'_id': 1}}
        ]
        order_trend_result = list(orders_collection.aggregate(order_trend_pipeline))
        order_trend_map = {item['_id']: item['count'] for item in order_trend_result}
        order_trend = [
            {'date': label, 'count': order_trend_map.get(label, 0)}
            for label in all_labels
        ]
        
        # Get cancelled orders count
        cancelled_count = orders_collection.count_documents({
            'status': 'cancelled',
            'created_at': {'$gte': start_date, '$lte': end_date}
        })
        
        # Calculate growth rate
        period_days = (end_date - start_date).days
        prev_start = start_date - timedelta(days=period_days)
        prev_match = {
            'status': {'$in': ['delivered', 'completed']},
            'created_at': {'$gte': prev_start, '$lt': start_date}
        }
        prev_pipeline = [
            {'$match': prev_match},
            {
                '$group': {
                    '_id': None,
                    'total_sales': {'$sum': '$total_amount'}
                }
            }
        ]
        prev_result = list(orders_collection.aggregate(prev_pipeline))
        prev_sales = prev_result[0]['total_sales'] if prev_result else 0
        growth_rate = round(((total_sales - prev_sales) / prev_sales * 100), 1) if prev_sales > 0 else (100.0 if total_sales > 0 else 0)
        
        # Get payment method breakdown
        payment_pipeline = [
            {'$match': base_match},
            {
                '$group': {
                    '_id': '$payment_method',
                    'count': {'$sum': 1},
                    'amount': {'$sum': '$total_amount'}
                }
            }
        ]
        
        payment_result = list(orders_collection.aggregate(payment_pipeline))
        payment_breakdown = [
            {
                'method': item['_id'] or 'unknown',
                'count': item['count'],
                'total': round(item['amount'], 2)
            }
            for item in payment_result
        ]
        
        return jsonify({
            'ok': True,
            'period': period,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'summary': {
                'total_sales': round(total_sales, 2),
                'total_orders': total_orders,
                'total_sellers': total_sellers,
                'avg_order_value': avg_order_value,
                'total_items_sold': total_items_sold,
                'total_cogs': total_cogs,
                'gross_profit': gross_profit,
                'profit_margin': round((gross_profit / total_sales * 100), 1) if total_sales > 0 else 0,
                'cancelled_orders': cancelled_count,
                'growth_rate': growth_rate
            },
            'sales_trend': sales_trend,
            'order_trend': order_trend,
            'product_sales': product_sales,
            'seller_sales': seller_sales,
            'payment_breakdown': payment_breakdown
        })
        
    except Exception as e:
        print(f"[Analytics] Error in admin sales: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


@analytics_bp.route('/user/orders-summary', methods=['GET'])
@require_auth
def get_user_orders_summary():
    """
    Get order summary for user as buyer
    Returns counts of orders by status
    """
    try:
        user_id = request.user_info['user_id']
        orders_collection = _get_orders_collection()
        
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Count orders by status
        pipeline = [
            {'$match': {'user_id': user_id}},
            {
                '$group': {
                    '_id': '$status',
                    'count': {'$sum': 1}
                }
            }
        ]
        
        result = list(orders_collection.aggregate(pipeline))
        
        status_counts = {item['_id']: item['count'] for item in result}
        
        return jsonify({
            'ok': True,
            'orders_summary': {
                'pending': status_counts.get('pending', 0),
                'confirmed': status_counts.get('confirmed', 0),
                'processing': status_counts.get('processing', 0),
                'shipped': status_counts.get('shipped', 0),
                'delivered': status_counts.get('delivered', 0),
                'cancelled': status_counts.get('cancelled', 0),
                'total': sum(status_counts.values())
            }
        })
        
    except Exception as e:
        print(f"[Analytics] Error in user orders summary: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


@analytics_bp.route('/admin/overview', methods=['GET'])
@require_admin
def get_admin_overview():
    """
    Get admin dashboard overview statistics
    """
    try:
        orders_collection = _get_orders_collection()
        products_collection = _get_products_collection()
        
        from flask import current_app
        users_collection = current_app.config.get('db_users')
        
        if any(c is None for c in [orders_collection, products_collection, users_collection]):
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        # Today's date range
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow = today + timedelta(days=1)
        
        # This month's date range
        month_start = today.replace(day=1)
        
        # Total users
        total_users = users_collection.count_documents({})
        
        # Total products
        total_products = products_collection.count_documents({'is_active': True})
        
        # Total orders
        total_orders = orders_collection.count_documents({})
        
        # Today's orders
        today_orders = orders_collection.count_documents({
            'created_at': {'$gte': today, '$lt': tomorrow}
        })
        
        # Today's revenue
        today_revenue_pipeline = [
            {
                '$match': {
                    'status': {'$in': ['delivered', 'completed']},
                    'created_at': {'$gte': today, '$lt': tomorrow}
                }
            },
            {
                '$group': {
                    '_id': None,
                    'revenue': {'$sum': '$total_amount'}
                }
            }
        ]
        today_revenue_result = list(orders_collection.aggregate(today_revenue_pipeline))
        today_revenue = today_revenue_result[0]['revenue'] if today_revenue_result else 0
        
        # This month's revenue
        month_revenue_pipeline = [
            {
                '$match': {
                    'status': {'$in': ['delivered', 'completed']},
                    'created_at': {'$gte': month_start, '$lt': tomorrow}
                }
            },
            {
                '$group': {
                    '_id': None,
                    'revenue': {'$sum': '$total_amount'}
                }
            }
        ]
        month_revenue_result = list(orders_collection.aggregate(month_revenue_pipeline))
        month_revenue = month_revenue_result[0]['revenue'] if month_revenue_result else 0
        
        # Pending orders count
        pending_orders = orders_collection.count_documents({
            'status': {'$in': ['pending', 'confirmed', 'processing']}
        })
        
        return jsonify({
            'ok': True,
            'overview': {
                'total_users': total_users,
                'total_products': total_products,
                'total_orders': total_orders,
                'today_orders': today_orders,
                'today_revenue': round(today_revenue, 2),
                'month_revenue': round(month_revenue, 2),
                'pending_orders': pending_orders
            }
        })
        
    except Exception as e:
        print(f"[Analytics] Error in admin overview: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


@analytics_bp.route('/admin/seller/<seller_id>/sales', methods=['GET'])
@require_admin
def get_seller_individual_analytics(seller_id: str):
    """
    Get sales analytics for a specific seller (admin view)
    Query params:
        - period: 'weekly', 'monthly', 'yearly' (default: 'monthly')
    """
    try:
        period = request.args.get('period', 'monthly')
        
        orders_collection = _get_orders_collection()
        products_collection = _get_products_collection()
        users_collection = _get_users_collection()
        
        if orders_collection is None:
            return jsonify({'ok': False, 'error': 'Database not available'}), 503
        
        start_date, end_date, group_format = _get_date_range(period)
        
        # Get seller info
        seller_info = {}
        if users_collection is not None:
            user_doc = users_collection.find_one(
                {'_id': ObjectId(seller_id)},
                {'first_name': 1, 'last_name': 1, 'email': 1, 'profile_image': 1}
            )
            if user_doc:
                seller_info = {
                    'name': f"{user_doc.get('first_name', '')} {user_doc.get('last_name', '')}".strip(),
                    'email': user_doc.get('email', ''),
                    'profile_image': user_doc.get('profile_image'),
                }
        
        base_match = {
            'status': {'$in': ['delivered', 'completed']},
            'created_at': {'$gte': start_date, '$lte': end_date},
            'items.seller_id': seller_id
        }
        
        # Total sales
        total_pipeline = [
            {'$match': base_match},
            {'$unwind': '$items'},
            {'$match': {'items.seller_id': seller_id}},
            {
                '$group': {
                    '_id': None,
                    'total_sales': {'$sum': '$items.subtotal'},
                    'total_orders': {'$addToSet': '$_id'},
                    'total_items': {'$sum': '$items.quantity'}
                }
            }
        ]
        total_result = list(orders_collection.aggregate(total_pipeline))
        total_sales = total_result[0]['total_sales'] if total_result else 0
        total_orders = len(total_result[0]['total_orders']) if total_result else 0
        total_items_sold = total_result[0]['total_items'] if total_result else 0
        
        # Sales trend
        if period == 'yearly':
            date_format = {'$dateToString': {'format': '%Y-%m', 'date': '$created_at'}}
        else:
            date_format = {'$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}}
        
        trend_pipeline = [
            {'$match': base_match},
            {'$unwind': '$items'},
            {'$match': {'items.seller_id': seller_id}},
            {
                '$group': {
                    '_id': date_format,
                    'amount': {'$sum': '$items.subtotal'}
                }
            },
            {'$sort': {'_id': 1}}
        ]
        trend_result = list(orders_collection.aggregate(trend_pipeline))
        all_labels = _get_period_labels(period, start_date, end_date)
        trend_map = {item['_id']: item['amount'] for item in trend_result}
        sales_trend = [
            {'date': label, 'amount': round(trend_map.get(label, 0), 2)}
            for label in all_labels
        ]
        
        # Product breakdown with images and COGS
        product_pipeline = [
            {'$match': base_match},
            {'$unwind': '$items'},
            {'$match': {'items.seller_id': seller_id}},
            {
                '$group': {
                    '_id': '$items.product_name',
                    'quantity': {'$sum': '$items.quantity'},
                    'revenue': {'$sum': '$items.subtotal'}
                }
            },
            {'$sort': {'revenue': -1}},
            {'$limit': 10}
        ]
        product_result = list(orders_collection.aggregate(product_pipeline))
        
        product_sales = []
        total_cogs = 0
        for item in product_result:
            product_name = item['_id']
            quantity = item['quantity']
            revenue = round(item['revenue'], 2)
            product_image = None
            cost_price = 0
            
            if products_collection is not None:
                product_doc = products_collection.find_one(
                    {'name': product_name, 'seller_id': seller_id},
                    {'cost_price': 1, 'images': 1}
                )
                if product_doc:
                    cost_price = float(product_doc.get('cost_price', 0))
                    images = product_doc.get('images', [])
                    if images:
                        product_image = images[0]
            
            item_cogs = round(cost_price * quantity, 2) if cost_price > 0 else 0
            total_cogs += item_cogs
            product_sales.append({
                'product_name': product_name,
                'quantity': quantity,
                'revenue': revenue,
                'image': product_image,
                'cost_price': cost_price,
                'cogs': item_cogs,
                'profit': round(revenue - item_cogs, 2),
            })
        
        total_cogs = round(total_cogs, 2)
        gross_profit = round(total_sales - total_cogs, 2)
        avg_order_value = round(total_sales / total_orders, 2) if total_orders > 0 else 0
        
        # Growth rate
        period_days = (end_date - start_date).days
        prev_start = start_date - timedelta(days=period_days)
        prev_match = {
            'status': {'$in': ['delivered', 'completed']},
            'created_at': {'$gte': prev_start, '$lt': start_date},
            'items.seller_id': seller_id
        }
        prev_pipeline = [
            {'$match': prev_match},
            {'$unwind': '$items'},
            {'$match': {'items.seller_id': seller_id}},
            {'$group': {'_id': None, 'total_sales': {'$sum': '$items.subtotal'}}}
        ]
        prev_result = list(orders_collection.aggregate(prev_pipeline))
        prev_sales = prev_result[0]['total_sales'] if prev_result else 0
        growth_rate = round(((total_sales - prev_sales) / prev_sales * 100), 1) if prev_sales > 0 else (100.0 if total_sales > 0 else 0)
        
        return jsonify({
            'ok': True,
            'seller_info': seller_info,
            'period': period,
            'summary': {
                'total_sales': round(total_sales, 2),
                'total_orders': total_orders,
                'avg_order_value': avg_order_value,
                'total_items_sold': total_items_sold,
                'total_cogs': total_cogs,
                'gross_profit': gross_profit,
                'profit_margin': round((gross_profit / total_sales * 100), 1) if total_sales > 0 else 0,
                'growth_rate': growth_rate
            },
            'sales_trend': sales_trend,
            'product_sales': product_sales
        })
        
    except Exception as e:
        print(f"[Analytics] Error in seller analytics: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


@analytics_bp.route('/export/pdf', methods=['GET'])
@require_auth
def export_analytics_pdf():
    """Export sales analytics report as PDF for any classification/period."""
    try:
        from utils.pdf_generator import is_pdf_generation_available
        if not is_pdf_generation_available():
            return jsonify({'ok': False, 'error': 'PDF generation not available'}), 503

        from reportlab.lib import colors as rl_colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch, mm
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image as RLImage
        from io import BytesIO
        from flask import Response
        from pathlib import Path

        period = request.args.get('period', 'monthly')
        report_type = request.args.get('type', 'user')  # user or admin
        user_id = request.user_info['user_id']

        orders_collection = _get_orders_collection()
        products_collection = _get_products_collection()
        users_collection = _get_users_collection()
        if any(c is None for c in [orders_collection, products_collection]):
            return jsonify({'ok': False, 'error': 'Database not available'}), 503

        start_date, end_date, group_format = _get_date_range(period)

        # Build query based on type
        if report_type == 'admin' and request.user_info.get('role') == 'admin':
            match = {'status': 'delivered', 'delivered_at': {'$gte': start_date, '$lte': end_date}}
            report_title = 'Platform Sales Report (Admin)'
        else:
            match = {'status': 'delivered', 'delivered_at': {'$gte': start_date, '$lte': end_date}, 'items.seller_id': user_id}
            report_title = 'My Sales Report'

        orders = list(orders_collection.find(match).sort('delivered_at', -1))

        # Compute stats
        total_sales = 0
        total_orders = len(orders)
        product_map = {}
        for order in orders:
            for item in order.get('items', []):
                if report_type != 'admin' and item.get('seller_id') != user_id:
                    continue
                subtotal = float(item.get('subtotal', 0))
                total_sales += subtotal
                pid = item.get('product_id', 'unknown')
                if pid not in product_map:
                    product_map[pid] = {'name': item.get('product_name', 'Unknown'), 'revenue': 0, 'qty': 0}
                product_map[pid]['revenue'] += subtotal
                product_map[pid]['qty'] += int(item.get('quantity', 0))

        product_list = sorted(product_map.values(), key=lambda x: x['revenue'], reverse=True)

        # ── Time-series revenue by period bucket ─────────────────────────────────────────
        from collections import OrderedDict
        from datetime import timedelta

        ts_buckets = OrderedDict()  # ordered label → revenue float

        if period == 'weekly':
            for i in range(7):
                d = start_date + timedelta(days=i)
                ts_buckets[d.strftime('%a ') + str(d.day)] = 0.0
            def _ts_key(dt):
                return dt.strftime('%a ') + str(dt.day)
        elif period == 'monthly':
            # Daily buckets with "Mon DD" format for 30 days
            for i in range(31):
                d = start_date + timedelta(days=i)
                if d > end_date:
                    break
                lbl = d.strftime('%b %d')
                ts_buckets[lbl] = 0.0
            def _ts_key(dt):
                return dt.strftime('%b %d')
        else:  # yearly
            _m, _y = start_date.month, start_date.year
            for _ in range(13):
                lbl = datetime(_y, _m, 1).strftime("%b %y")
                if lbl not in ts_buckets:
                    ts_buckets[lbl] = 0.0
                _m += 1
                if _m > 12:
                    _m = 1; _y += 1
            def _ts_key(dt):
                return dt.strftime("%b %y")

        for order in orders:
            delivered = order.get('delivered_at')
            if not isinstance(delivered, datetime):
                continue
            key = _ts_key(delivered)
            if key in ts_buckets:
                rev = sum(
                    float(item.get('subtotal', 0))
                    for item in order.get('items', [])
                    if report_type == 'admin' or item.get('seller_id') == user_id
                )
                ts_buckets[key] += rev

        ts_labels = list(ts_buckets.keys())
        ts_values = list(ts_buckets.values())

        # Generate PDF
        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40)
        story = []
        styles = getSampleStyleSheet()

        brand_green = rl_colors.HexColor('#2E7D32')
        light_green = rl_colors.HexColor('#E8F5E9')

        title_style = ParagraphStyle('ReportTitle', parent=styles['Heading1'], fontSize=22, textColor=brand_green, spaceAfter=6)
        subtitle_style = ParagraphStyle('ReportSub', parent=styles['Normal'], fontSize=11, textColor=rl_colors.HexColor('#757575'), spaceAfter=16)
        section_style = ParagraphStyle('Section', parent=styles['Heading2'], fontSize=14, textColor=brand_green, spaceBefore=16, spaceAfter=8)

        from datetime import timezone as tz, timedelta as td
        PHT = tz(td(hours=8))
        now_pht = datetime.now(PHT)

        period_labels = {'weekly': 'Last 14 Days', 'monthly': 'Last 30 Days', 'yearly': 'Last 12 Months'}

        # Add logo header
        logo_path = Path(__file__).parent.parent / 'assets' / 'bignay-logo.png'
        if logo_path.exists():
            try:
                logo = RLImage(str(logo_path), width=50, height=50)
                header_table = Table(
                    [[logo, Paragraph(report_title, title_style)]],
                    colWidths=[60, None]
                )
                header_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('LEFTPADDING', (0, 0), (0, 0), 0),
                    ('RIGHTPADDING', (0, 0), (0, 0), 8),
                    ('LEFTPADDING', (1, 0), (1, 0), 0),
                ]))
                story.append(header_table)
            except Exception:
                story.append(Paragraph(report_title, title_style))
        else:
            story.append(Paragraph(report_title, title_style))

        story.append(Paragraph(f"Period: {period_labels.get(period, period)} &nbsp;|&nbsp; Generated: {now_pht.strftime('%B %d, %Y %I:%M %p')} PHT", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=1, color=brand_green, spaceAfter=12))

        # Summary
        story.append(Paragraph("Summary", section_style))
        summary_data = [
            ['Metric', 'Value'],
            ['Total Revenue', f"₱{total_sales:,.2f}"],
            ['Total Orders (Delivered)', str(total_orders)],
            ['Avg. Order Value', f"₱{(total_sales / total_orders if total_orders else 0):,.2f}"],
            ['Products Sold', str(len(product_list))],
        ]
        t = Table(summary_data, colWidths=[240, 240])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), brand_green),
            ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, light_green]),
            ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#E0E0E0')),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 16))

        # ──── Helper: build a bar chart Drawing using low-level shapes ──────────────────
        def _bar_chart_drawing(labels, values, chart_title,
                               page_w=480, h=160,
                               bar_hex='#2E7D32', grid_hex='#E0E0E0',
                               text_hex='#757575'):
            from reportlab.graphics.shapes import Drawing, Rect, String, Line
            from reportlab.lib import colors as rc

            d = Drawing(page_w, h)
            if not values or max(values, default=0) == 0:
                d.add(String(page_w / 2, h / 2, '(no data for this period)',
                             fontSize=9, textAnchor='middle', fillColor=rc.HexColor(text_hex)))
                return d

            pad_l, pad_r, pad_t, pad_b = 58, 12, 24, 36
            cw = page_w - pad_l - pad_r
            ch = h - pad_t - pad_b
            n = len(labels)
            max_v = max(values)
            slot_w = cw / n
            bar_w = slot_w * 0.55

            # Title
            d.add(String(pad_l + cw / 2, h - pad_t + 6, chart_title,
                         fontSize=9, textAnchor='middle',
                         fillColor=rc.HexColor('#424242'), fontName='Helvetica-Bold'))

            # Y-axis ticks & grid
            tick_count = 5
            for ti in range(tick_count + 1):
                yv = max_v * ti / tick_count
                yp = pad_b + ch * ti / tick_count
                dash = [] if ti == 0 else [2, 2]
                d.add(Line(pad_l, yp, pad_l + cw, yp,
                           strokeColor=rc.HexColor(grid_hex), strokeWidth=0.5))
                d.add(String(pad_l - 4, yp - 4,
                             f'₱{yv:,.0f}',
                             fontSize=6.5, textAnchor='end',
                             fillColor=rc.HexColor(text_hex)))

            # Y axis border line
            d.add(Line(pad_l, pad_b, pad_l, pad_b + ch,
                       strokeColor=rc.HexColor('#BDBDBD'), strokeWidth=0.8))

            # Bars
            for i, (lbl, val) in enumerate(zip(labels, values)):
                xc = pad_l + slot_w * i + (slot_w - bar_w) / 2
                bh = (val / max_v) * ch if max_v > 0 else 0
                # Bar fill: highlight top bar
                fill = rc.HexColor('#1B5E20') if val == max_v else rc.HexColor(bar_hex)
                d.add(Rect(xc, pad_b, bar_w, max(bh, 1),
                           fillColor=fill, strokeWidth=0))
                # X-axis label
                d.add(String(xc + bar_w / 2, pad_b - 14, lbl,
                             fontSize=6.5, textAnchor='middle',
                             fillColor=rc.HexColor('#424242')))
                # Value above bar (only if bar tall enough)
                if bh > 12:
                    d.add(String(xc + bar_w / 2, pad_b + bh + 2,
                                 f'₱{val:,.0f}',
                                 fontSize=5.5, textAnchor='middle',
                                 fillColor=rc.HexColor('#1B5E20')))
            return d

        # ──── Sales Trend Chart ───────────────────────────────────────────────────
        period_chart_titles = {
            'weekly': 'Revenue by Day (Last 14 Days)',
            'monthly': 'Revenue by Week (Last 30 Days)',
            'yearly': 'Revenue by Month (Last 12 Months)',
        }
        if any(v > 0 for v in ts_values):
            story.append(Paragraph('Sales Trend', section_style))
            trend_drawing = _bar_chart_drawing(
                ts_labels, ts_values,
                period_chart_titles.get(period, 'Revenue Over Time'),
            )
            story.append(trend_drawing)
            story.append(Spacer(1, 10))

        # ──── Data Interpretation Text ───────────────────────────────────────────────
        interp_style = ParagraphStyle('Interp', parent=styles['Normal'], fontSize=9,
                                       textColor=rl_colors.HexColor('#424242'),
                                       leftIndent=8, spaceBefore=2, spaceAfter=4,
                                       leading=14)
        story.append(Paragraph('<b>Data Interpretation</b>', section_style))

        bullet = '•'
        interp_lines = []
        period_label = {'weekly': '7 days', 'monthly': '30 days', 'yearly': '12 months'}.get(period, period)
        interp_lines.append(f'{bullet} Total revenue for the last {period_label}: <b>₱{total_sales:,.2f}</b> across {total_orders} completed order(s).')

        if total_orders > 0:
            aov = total_sales / total_orders
            interp_lines.append(f'{bullet} Average order value: <b>₱{aov:,.2f}</b>.'
                                 + (' This suggests buyers tend to place smaller, frequent purchases.' if aov < 300
                                    else ' This indicates high-value bulk or premium purchases.'))

        if product_list:
            best = product_list[0]
            interp_lines.append(f'{bullet} Top product by revenue: <b>{best["name"]}</b> '
                                 f'(₱{best["revenue"]:,.2f}, {best["qty"]} unit(s) sold).')
            if len(product_list) > 1:
                low_prod = product_list[-1]
                interp_lines.append(f'{bullet} Lowest-performing listed product: <b>{low_prod["name"]}</b> '
                                    f'(₱{low_prod["revenue"]:,.2f}).')

        if ts_values and any(v > 0 for v in ts_values):
            max_idx = ts_values.index(max(ts_values))
            min_idx = ts_values.index(min(v for v in ts_values if v > 0) if any(v > 0 for v in ts_values) else ts_values[0])
            interp_lines.append(f'{bullet} Peak sales period: <b>{ts_labels[max_idx]}</b> '
                                 f'(₱{ts_values[max_idx]:,.2f}). '
                                 + (f'Lowest-activity period: <b>{ts_labels[min_idx]}</b> ({chr(8369)}{ts_values[min_idx]:,.2f}).' if min_idx != max_idx else ''))
            non_zero = [v for v in ts_values if v > 0]
            if len(non_zero) >= 2:
                avg_ts = sum(non_zero) / len(non_zero)
                last_v = ts_values[-1]
                pct = ((last_v - avg_ts) / avg_ts * 100) if avg_ts else 0
                direction = 'above' if pct >= 0 else 'below'
                interp_lines.append(f'{bullet} The most recent period is <b>{abs(pct):.1f}%</b> {direction} the period average (₱{avg_ts:,.2f}).')

        for line in interp_lines:
            story.append(Paragraph(line, interp_style))

        story.append(Spacer(1, 14))

        # ──── Product Breakdown Table ────────────────────────────────────────────────
        if product_list:
            story.append(Paragraph('Product Breakdown', section_style))
            prod_rows = [['#', 'Product', 'Qty Sold', 'Revenue']]
            for i, p in enumerate(product_list[:20], 1):
                prod_rows.append([str(i), p['name'], str(p['qty']), f'₱{p["revenue"]:,.2f}'])
            pt = Table(prod_rows, colWidths=[30, 230, 80, 140])
            pt.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), brand_green),
                ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (0, 0), (0, -1), 'CENTER'),
                ('ALIGN', (2, 0), (2, -1), 'CENTER'),
                ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, light_green]),
                ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#E0E0E0')),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ]))
            story.append(pt)
            story.append(Spacer(1, 14))

            # Product Revenue Bar Chart (top 10)
            top10 = product_list[:10]
            if len(top10) > 1:
                story.append(Paragraph('Product Revenue Comparison (Top 10)', section_style))
                short_labels = [
                    (p['name'][:14] + '…') if len(p['name']) > 14 else p['name']
                    for p in top10
                ]
                prod_revenues = [p['revenue'] for p in top10]
                prod_drawing = _bar_chart_drawing(
                    short_labels, prod_revenues,
                    'Revenue per Product',
                    bar_hex='#388E3C',
                )
                story.append(prod_drawing)
                story.append(Spacer(1, 10))

        story.append(Spacer(1, 20))
        story.append(Paragraph(
            f'<i>Bignay Marketplace Analytics — Confidential</i>',
            ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8,
                           textColor=rl_colors.HexColor('#9E9E9E'), alignment=TA_CENTER)))

        doc.build(story)
        pdf_content = buf.getvalue()
        buf.close()

        filename = f"sales_report_{period}_{now_pht.strftime('%Y%m%d')}.pdf"
        return Response(
            pdf_content,
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Type': 'application/pdf',
                'Cache-Control': 'no-cache',
            }
        )

    except Exception as e:
        print(f"[Analytics] PDF export error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({'ok': False, 'error': str(e)}), 500
