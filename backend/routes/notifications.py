"""
Notifications Routes
Handles in-app notification CRUD and real-time delivery
"""

from __future__ import annotations
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from bson import ObjectId

from models.notification import Notification, NotificationType, NOTIFICATION_ICONS
from routes.auth import require_auth, require_admin

notifications_bp = Blueprint('notifications', __name__, url_prefix='/api/notifications')


def _get_notifications_collection():
    from flask import current_app
    return current_app.config.get('db_notifications')


def _get_users_collection():
    from flask import current_app
    return current_app.config.get('db_users')


def create_notification(user_id, title, message, notif_type=NotificationType.SYSTEM, data=None):
    """
    Create a notification and emit it via SocketIO in real-time.
    Can be called from any route.
    Returns the created notification dict or None on failure.
    """
    from flask import current_app
    try:
        notifications = current_app.config.get('db_notifications')
        if notifications is None:
            print("[Notifications] Collection not available")
            return None

        icon = NOTIFICATION_ICONS.get(notif_type, 'information-circle')
        notification = Notification(
            user_id=str(user_id),
            title=title,
            message=message,
            type=notif_type if isinstance(notif_type, str) else notif_type.value,
            icon=icon,
            data=data or {},
        )

        result = notifications.insert_one(notification.to_dict())
        notification._id = result.inserted_id

        notif_public = notification.to_public_dict()

        # Emit real-time notification via SocketIO to the user's personal room
        try:
            socketio = current_app.config.get('socketio')
            if socketio:
                socketio.emit('new_notification', notif_public, room=f'user_{user_id}')
        except Exception as ws_err:
            print(f"[Notifications] SocketIO emit error: {ws_err}")

        return notif_public
    except Exception as e:
        print(f"[Notifications] Error creating notification: {e}")
        return None


def create_notification_for_admins(title, message, notif_type=NotificationType.SYSTEM, data=None):
    """Create notification for all admin users."""
    from flask import current_app
    try:
        users = current_app.config.get('db_users')
        if users is None:
            return
        admins = users.find({'role': 'admin'}, {'_id': 1})
        for admin in admins:
            create_notification(str(admin['_id']), title, message, notif_type, data)
    except Exception as e:
        print(f"[Notifications] Error creating admin notifications: {e}")


def create_notification_for_all_users(title, message, notif_type=NotificationType.SYSTEM, data=None):
    """Create notification for ALL registered users."""
    from flask import current_app
    try:
        users = current_app.config.get('db_users')
        if users is None:
            return
        all_users = users.find({}, {'_id': 1})
        for u in all_users:
            create_notification(str(u['_id']), title, message, notif_type, data)
    except Exception as e:
        print(f"[Notifications] Error creating notifications for all users: {e}")


@notifications_bp.route('/', methods=['GET'])
@require_auth
def get_notifications():
    """Get current user's notifications (paginated)"""
    try:
        notifications = _get_notifications_collection()
        if notifications is None:
            return jsonify({'ok': False, 'error': 'Service unavailable'}), 503

        user_id = request.user_info['user_id']

        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        unread_only = request.args.get('unread_only', 'false').lower() == 'true'

        query = {'user_id': user_id}
        if unread_only:
            query['is_read'] = False

        total = notifications.count_documents(query)
        docs = list(
            notifications.find(query)
            .sort('created_at', -1)
            .skip((page - 1) * limit)
            .limit(limit)
        )

        items = []
        for doc in docs:
            n = Notification.from_dict(doc)
            items.append(n.to_public_dict())

        return jsonify({
            'ok': True,
            'notifications': items,
            'total': total,
            'page': page,
            'pages': max(1, -(-total // limit)),
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@notifications_bp.route('/unread-count', methods=['GET'])
@require_auth
def get_unread_count():
    """Get count of unread notifications"""
    try:
        notifications = _get_notifications_collection()
        if notifications is None:
            return jsonify({'ok': False, 'error': 'Service unavailable'}), 503

        user_id = request.user_info['user_id']

        count = notifications.count_documents({'user_id': user_id, 'is_read': False})
        return jsonify({'ok': True, 'count': count})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@notifications_bp.route('/<notification_id>/read', methods=['PUT'])
@require_auth
def mark_as_read(notification_id):
    """Mark a single notification as read"""
    try:
        notifications = _get_notifications_collection()
        if notifications is None:
            return jsonify({'ok': False, 'error': 'Service unavailable'}), 503

        user_id = request.user_info['user_id']

        result = notifications.update_one(
            {'_id': ObjectId(notification_id), 'user_id': user_id},
            {'$set': {'is_read': True, 'read_at': datetime.now(timezone.utc)}}
        )

        if result.matched_count == 0:
            return jsonify({'ok': False, 'error': 'Notification not found'}), 404

        return jsonify({'ok': True, 'message': 'Notification marked as read'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@notifications_bp.route('/read-all', methods=['PUT'])
@require_auth
def mark_all_as_read():
    """Mark all notifications as read"""
    try:
        notifications = _get_notifications_collection()
        if notifications is None:
            return jsonify({'ok': False, 'error': 'Service unavailable'}), 503

        user_id = request.user_info['user_id']

        now = datetime.now(timezone.utc)
        result = notifications.update_many(
            {'user_id': user_id, 'is_read': False},
            {'$set': {'is_read': True, 'read_at': now}}
        )

        # Emit updated count via SocketIO
        try:
            from flask import current_app
            socketio = current_app.config.get('socketio')
            if socketio:
                socketio.emit('notification_count', {'count': 0}, room=f'user_{user_id}')
        except Exception:
            pass

        return jsonify({
            'ok': True,
            'message': f'{result.modified_count} notifications marked as read'
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@notifications_bp.route('/<notification_id>', methods=['DELETE'])
@require_auth
def delete_notification(notification_id):
    """Delete a single notification"""
    try:
        notifications = _get_notifications_collection()
        if notifications is None:
            return jsonify({'ok': False, 'error': 'Service unavailable'}), 503

        user_id = request.user_info['user_id']

        result = notifications.delete_one(
            {'_id': ObjectId(notification_id), 'user_id': user_id}
        )

        if result.deleted_count == 0:
            return jsonify({'ok': False, 'error': 'Notification not found'}), 404

        return jsonify({'ok': True, 'message': 'Notification deleted'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@notifications_bp.route('/clear-all', methods=['DELETE'])
@require_auth
def clear_all_notifications():
    """Delete all notifications for current user"""
    try:
        notifications = _get_notifications_collection()
        if notifications is None:
            return jsonify({'ok': False, 'error': 'Service unavailable'}), 503

        user_id = request.user_info['user_id']

        result = notifications.delete_many({'user_id': user_id})

        return jsonify({
            'ok': True,
            'message': f'{result.deleted_count} notifications cleared'
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@notifications_bp.route('/bulk-delete', methods=['POST'])
@require_auth
def bulk_delete_notifications():
    """Delete multiple notifications by IDs"""
    try:
        data = request.get_json()
        if not data or 'ids' not in data:
            return jsonify({'ok': False, 'error': 'No IDs provided'}), 400

        notifications = _get_notifications_collection()
        if notifications is None:
            return jsonify({'ok': False, 'error': 'Service unavailable'}), 503

        user_id = request.user_info['user_id']

        obj_ids = [ObjectId(nid) for nid in data['ids']]
        result = notifications.delete_many({
            '_id': {'$in': obj_ids},
            'user_id': user_id
        })

        # Return current unread count
        remaining_unread = notifications.count_documents({'user_id': user_id, 'is_read': False})

        return jsonify({
            'ok': True,
            'message': f'{result.deleted_count} notifications deleted',
            'deleted_count': result.deleted_count,
            'unread_count': remaining_unread
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@notifications_bp.route('/delete-read', methods=['DELETE'])
@require_auth
def delete_read_notifications():
    """Delete all read notifications for current user"""
    try:
        notifications = _get_notifications_collection()
        if notifications is None:
            return jsonify({'ok': False, 'error': 'Service unavailable'}), 503

        user_id = request.user_info['user_id']

        result = notifications.delete_many({'user_id': user_id, 'is_read': True})

        return jsonify({
            'ok': True,
            'message': f'{result.deleted_count} read notifications deleted'
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
