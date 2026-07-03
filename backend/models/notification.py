"""
Notification Model
Stores in-app notifications for users
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from bson import ObjectId


class NotificationType(str, Enum):
    ORDER_PLACED = 'order_placed'
    ORDER_CONFIRMED = 'order_confirmed'
    ORDER_PROCESSING = 'order_processing'
    ORDER_SHIPPED = 'order_shipped'
    ORDER_DELIVERED = 'order_delivered'
    ORDER_CANCELLED = 'order_cancelled'
    ORDER_REFUNDED = 'order_refunded'
    NEW_REVIEW = 'new_review'
    PRODUCT_UPDATE = 'product_update'
    FORUM_POST = 'forum_post'
    SYSTEM = 'system'


# Map notification types to icons for the frontend
NOTIFICATION_ICONS = {
    NotificationType.ORDER_PLACED: 'cart',
    NotificationType.ORDER_CONFIRMED: 'checkmark-circle',
    NotificationType.ORDER_PROCESSING: 'hourglass',
    NotificationType.ORDER_SHIPPED: 'airplane',
    NotificationType.ORDER_DELIVERED: 'checkmark-done-circle',
    NotificationType.ORDER_CANCELLED: 'close-circle',
    NotificationType.ORDER_REFUNDED: 'arrow-undo-circle',
    NotificationType.NEW_REVIEW: 'star',
    NotificationType.PRODUCT_UPDATE: 'cube',
    NotificationType.FORUM_POST: 'newspaper',
    NotificationType.SYSTEM: 'information-circle',
}


@dataclass
class Notification:
    user_id: str
    title: str
    message: str
    type: str = NotificationType.SYSTEM
    icon: str = 'information-circle'
    is_read: bool = False
    data: dict = field(default_factory=dict)  # Extra payload (order_id, product_id, etc.)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    read_at: Optional[datetime] = None
    _id: Optional[ObjectId] = None

    def to_dict(self) -> dict:
        d = {
            'user_id': self.user_id,
            'title': self.title,
            'message': self.message,
            'type': self.type,
            'icon': self.icon,
            'is_read': self.is_read,
            'data': self.data,
            'created_at': self.created_at,
            'read_at': self.read_at,
        }
        if self._id:
            d['_id'] = self._id
        return d

    def to_public_dict(self) -> dict:
        return {
            'id': str(self._id) if self._id else None,
            'user_id': self.user_id,
            'title': self.title,
            'message': self.message,
            'type': self.type,
            'icon': self.icon,
            'is_read': self.is_read,
            'data': self.data,
            'created_at': self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
            'read_at': self.read_at.isoformat() if isinstance(self.read_at, datetime) else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'Notification':
        return cls(
            user_id=data.get('user_id', ''),
            title=data.get('title', ''),
            message=data.get('message', ''),
            type=data.get('type', NotificationType.SYSTEM),
            icon=data.get('icon', 'information-circle'),
            is_read=data.get('is_read', False),
            data=data.get('data', {}),
            created_at=data.get('created_at', datetime.now(timezone.utc)),
            read_at=data.get('read_at'),
            _id=data.get('_id'),
        )
