"""Notification consumer service.

Consumes notification events from RabbitMQ, saves to database,
and routes to online users via Redis Pub/Sub.
"""

import asyncio
import json
import logging
from typing import Any, Optional

import aio_pika
from aio_pika import ExchangeType, Message
from aio_pika.abc import AbstractIncomingMessage

from app.core.config import settings
from app.models import Notification, NotificationType, User
from app.services.redis_client import redis_service
from app.services.rabbitmq import EVENTS_EXCHANGE, get_rabbitmq_connection

logger = logging.getLogger(__name__)

# Queue name for notification consumer
NOTIFICATION_QUEUE = "notification-service.queue"

# Routing key to notification type mapping
ROUTING_KEY_TO_TYPE = {
    "post.liked": NotificationType.POST_LIKED,
    "post.commented": NotificationType.POST_COMMENTED,
    "post.shared": NotificationType.POST_SHARED,
    "comment.mentioned": NotificationType.MENTIONED,
    "comment.replied": NotificationType.REPLY_THREAD,
}


class NotificationConsumer:
    """Consumer service for notification events from RabbitMQ."""
    
    def __init__(self):
        self._connection: Optional[aio_pika.Connection] = None
        self._channel: Optional[aio_pika.Channel] = None
        self._queue: Optional[aio_pika.Queue] = None
        self._consumer_tag: Optional[str] = None
        self._running = False
    
    async def start(self) -> None:
        """Start consuming notification events from RabbitMQ."""
        if self._running:
            logger.warning("Notification consumer already running")
            return
        
        try:
            # Get connection (reuse existing)
            self._connection = await get_rabbitmq_connection()
            
            # Create dedicated channel for consumer
            self._channel = await self._connection.channel()
            await self._channel.set_qos(prefetch_count=10)  # Control concurrency
            
            # Declare exchange
            exchange = await self._channel.declare_exchange(
                EVENTS_EXCHANGE,
                ExchangeType.TOPIC,
                durable=True
            )
            
            # Declare queue
            self._queue = await self._channel.declare_queue(
                NOTIFICATION_QUEUE,
                durable=True
            )
            
            # Bind queue to exchange with routing patterns
            routing_patterns = [
                "post.*",      # post.liked, post.commented, post.shared
                "comment.*",   # comment.mentioned, comment.replied
            ]
            for pattern in routing_patterns:
                await self._queue.bind(exchange, routing_key=pattern)
                logger.info(f"Bound queue to pattern: {pattern}")
            
            # Start consuming
            self._consumer_tag = await self._queue.consume(self._process_message)
            self._running = True
            
            logger.info(f"Notification consumer started, queue: {NOTIFICATION_QUEUE}")
            
        except Exception as e:
            logger.error(f"Failed to start notification consumer: {e}")
            raise
    
    async def stop(self) -> None:
        """Stop consuming and cleanup."""
        if not self._running:
            return
        
        self._running = False
        
        try:
            if self._queue and self._consumer_tag:
                await self._queue.cancel(self._consumer_tag)
                logger.info("Notification consumer stopped")
        except Exception as e:
            logger.error(f"Error stopping consumer: {e}")
        
        # Note: Don't close connection here as it's shared with publisher
        self._channel = None
        self._queue = None
        self._consumer_tag = None
    
    async def _process_message(self, message: AbstractIncomingMessage) -> None:
        """Process a notification event message."""
        async with message.process():
            try:
                # Parse message
                body = json.loads(message.body.decode())
                routing_key = message.routing_key
                
                logger.debug(f"Processing event {routing_key}: {body}")
                
                # Get notification type
                notification_type = ROUTING_KEY_TO_TYPE.get(routing_key)
                if not notification_type:
                    logger.warning(f"Unknown routing key: {routing_key}")
                    return
                
                # Extract fields
                actor_id = body.get("actor_id")
                user_id = body.get("user_id")  # Recipient
                post_id = body.get("post_id")
                comment_id = body.get("comment_id")
                
                if not actor_id or not user_id:
                    logger.warning(f"Missing required fields in event: {body}")
                    return
                
                # Don't notify user about their own actions
                if actor_id == user_id:
                    logger.debug("Skipping self-notification")
                    return
                
                # Get actor info for content preview
                actor = await User.find_one(User.id == actor_id)
                actor_username = actor.username if actor else "Someone"
                
                # Generate notification content based on type
                content = self._generate_content(notification_type, actor_username)
                
                # Save notification to database
                notification = Notification(
                    user_id=user_id,
                    actor_id=actor_id,
                    type=notification_type,
                    post_id=post_id,
                    comment_id=comment_id,
                    content=content,
                )
                await notification.insert()
                
                logger.info(f"Saved notification: {notification.id} ({notification_type.value})")
                
                # Check if user is online and publish to Redis
                is_online = await redis_service.is_user_online(user_id)
                
                if is_online:
                    # Prepare notification payload for realtime delivery
                    payload = {
                        "id": notification.id,
                        "type": notification_type.value,
                        "actor_id": actor_id,
                        "actor_username": actor_username,
                        "actor_avatar": actor.avatar_url if actor else None,
                        "content": content,
                        "post_id": post_id,
                        "comment_id": comment_id,
                        "created_at": notification.created_at.isoformat(),
                        "is_read": False,
                    }
                    
                    await redis_service.publish_notification(user_id, payload)
                    logger.debug(f"Published realtime notification to user {user_id}")
                else:
                    logger.debug(f"User {user_id} is offline, notification saved to DB only")
                
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON in message: {e}")
            except Exception as e:
                logger.error(f"Error processing notification event: {e}", exc_info=True)
    
    def _generate_content(self, notification_type: NotificationType, actor_username: str) -> str:
        """Generate notification content text based on type."""
        content_map = {
            NotificationType.POST_LIKED: f"{actor_username} đã thích bài viết của bạn",
            NotificationType.POST_COMMENTED: f"{actor_username} đã bình luận bài viết của bạn",
            NotificationType.POST_SHARED: f"{actor_username} đã chia sẻ bài viết của bạn",
            NotificationType.MENTIONED: f"{actor_username} đã nhắc đến bạn trong một bình luận",
            NotificationType.REPLY_THREAD: f"{actor_username} đã trả lời bình luận của bạn",
        }
        return content_map.get(notification_type, f"{actor_username} đã tương tác với bạn")


# Singleton instance
notification_consumer = NotificationConsumer()
