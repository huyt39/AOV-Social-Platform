"""RabbitMQ service for video processing and notification events.

Provides async publisher for sending video transcode jobs and notification events to queues.
"""

import json
import logging
from typing import Any, Optional

import aio_pika
from aio_pika import Message, DeliveryMode, ExchangeType

from app.core.config import settings

logger = logging.getLogger(__name__)

# Queue names
VIDEO_TRANSCODE_QUEUE = "video.transcode"

# Exchange names
EVENTS_EXCHANGE = "events"  # For notifications
MESSAGE_EVENTS_EXCHANGE = "message_events"  # For messaging

# Notification routing keys
class NotificationRoutingKey:
    POST_LIKED = "post.liked"
    POST_COMMENTED = "post.commented"
    POST_SHARED = "post.shared"
    COMMENT_MENTIONED = "comment.mentioned"
    COMMENT_REPLIED = "comment.replied"
    # Team routing keys
    TEAM_JOIN_REQUEST = "team.join_request"
    TEAM_REQUEST_APPROVED = "team.request_approved"
    TEAM_REQUEST_REJECTED = "team.request_rejected"

# Message routing keys
class MessageRoutingKey:
    MESSAGE_SENT = "message.sent"
    MESSAGE_DELIVERED = "message.delivered"
    MESSAGE_SEEN = "message.seen"
    TYPING = "message.typing"

# Global connection
_connection: Optional[aio_pika.Connection] = None
_channel: Optional[aio_pika.Channel] = None
_events_exchange: Optional[aio_pika.Exchange] = None
_message_events_exchange: Optional[aio_pika.Exchange] = None


async def get_rabbitmq_connection() -> aio_pika.Connection:
    """Get or create RabbitMQ connection."""
    global _connection
    
    if _connection is None or _connection.is_closed:
        _connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
        logger.info("Connected to RabbitMQ")
        
    return _connection


async def get_rabbitmq_channel() -> aio_pika.Channel:
    """Get or create RabbitMQ channel."""
    global _channel
    
    connection = await get_rabbitmq_connection()
    
    if _channel is None or _channel.is_closed:
        _channel = await connection.channel()
        # Declare the transcode queue
        await _channel.declare_queue(
            VIDEO_TRANSCODE_QUEUE,
            durable=True  # Survive broker restarts
        )
        logger.info(f"Declared queue: {VIDEO_TRANSCODE_QUEUE}")
        
    return _channel


async def get_events_exchange() -> aio_pika.Exchange:
    """Get or create events exchange for notification events."""
    global _events_exchange
    
    if _events_exchange is None:
        channel = await get_rabbitmq_channel()
        _events_exchange = await channel.declare_exchange(
            EVENTS_EXCHANGE,
            ExchangeType.TOPIC,
            durable=True
        )
        logger.info(f"Declared exchange: {EVENTS_EXCHANGE}")
    
    return _events_exchange


async def get_message_events_exchange() -> aio_pika.Exchange:
    """Get or create message events exchange for messaging system."""
    global _message_events_exchange
    
    if _message_events_exchange is None:
        channel = await get_rabbitmq_channel()
        _message_events_exchange = await channel.declare_exchange(
            MESSAGE_EVENTS_EXCHANGE,
            ExchangeType.TOPIC,
            durable=True
        )
        logger.info(f"Declared exchange: {MESSAGE_EVENTS_EXCHANGE}")
    
    return _message_events_exchange


async def close_rabbitmq_connection() -> None:
    """Close RabbitMQ connection."""
    global _connection, _channel, _events_exchange, _message_events_exchange
    
    _events_exchange = None
    _message_events_exchange = None
    
    if _channel and not _channel.is_closed:
        await _channel.close()
        _channel = None
        
    if _connection and not _connection.is_closed:
        await _connection.close()
        _connection = None
        logger.info("RabbitMQ connection closed")


async def publish_transcode_job(video_id: str, raw_key: str) -> bool:
    """
    Publish video transcode job to RabbitMQ queue.
    
    Args:
        video_id: Unique video identifier
        raw_key: S3 key for the raw video file
        
    Returns:
        True if published successfully
    """
    try:
        channel = await get_rabbitmq_channel()
        
        message_body = json.dumps({
            "video_id": video_id,
            "raw_key": raw_key,
            "timestamp": str(import_datetime_now())
        })
        
        message = Message(
            body=message_body.encode(),
            delivery_mode=DeliveryMode.PERSISTENT,  # Survive broker restarts
            content_type="application/json"
        )
        
        await channel.default_exchange.publish(
            message,
            routing_key=VIDEO_TRANSCODE_QUEUE
        )
        
        logger.info(f"Published transcode job for video: {video_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to publish transcode job: {e}")
        return False


async def publish_event(routing_key: str, payload: dict[str, Any]) -> bool:
    """
    Publish notification event to RabbitMQ events exchange.
    
    Args:
        routing_key: Event routing key (e.g., 'post.liked', 'comment.mentioned')
        payload: Event data containing actor_id, user_id, and relevant IDs
        
    Returns:
        True if published successfully
    """
    try:
        exchange = await get_events_exchange()
        
        # Add timestamp to payload
        payload["timestamp"] = str(import_datetime_now())
        
        message_body = json.dumps(payload)
        
        message = Message(
            body=message_body.encode(),
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json"
        )
        
        await exchange.publish(
            message,
            routing_key=routing_key
        )
        
        logger.info(f"Published event {routing_key}: {payload}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to publish event {routing_key}: {e}")
        return False


def import_datetime_now():
    """Helper to get current datetime in UTC with timezone info."""
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


async def publish_message_event(routing_key: str, payload: dict[str, Any]) -> bool:
    """
    Publish message event to RabbitMQ message events exchange.
    
    Args:
        routing_key: Event routing key (e.g., 'message.sent', 'message.seen')
        payload: Event data containing message, conversation, and user IDs
        
    Returns:
        True if published successfully
    """
    try:
        exchange = await get_message_events_exchange()
        
        # Add timestamp to payload
        payload["timestamp"] = str(import_datetime_now())
        
        message_body = json.dumps(payload)
        
        message = Message(
            body=message_body.encode(),
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json"
        )
        
        await exchange.publish(
            message,
            routing_key=routing_key
        )
        
        logger.info(f"Published message event {routing_key}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to publish message event {routing_key}: {e}")
        return False


class RabbitMQService:
    """RabbitMQ service wrapper for dependency injection."""
    
    async def publish_transcode(self, video_id: str, raw_key: str) -> bool:
        """Publish transcode job."""
        return await publish_transcode_job(video_id, raw_key)
    
    async def publish_notification_event(self, routing_key: str, payload: dict[str, Any]) -> bool:
        """Publish notification event."""
        return await publish_event(routing_key, payload)
    
    async def publish_message_event(self, routing_key: str, payload: dict[str, Any]) -> bool:
        """Publish message event."""
        return await publish_message_event(routing_key, payload)
    
    async def close(self) -> None:
        """Close connections."""
        await close_rabbitmq_connection()


# Singleton instance
rabbitmq_service = RabbitMQService()

