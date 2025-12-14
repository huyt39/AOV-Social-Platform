"""RabbitMQ service for video processing queue.

Provides async publisher for sending video transcode jobs to the queue.
"""

import json
import logging
from typing import Optional

import aio_pika
from aio_pika import Message, DeliveryMode

from app.core.config import settings

logger = logging.getLogger(__name__)

# Queue names
VIDEO_TRANSCODE_QUEUE = "video.transcode"

# Global connection
_connection: Optional[aio_pika.Connection] = None
_channel: Optional[aio_pika.Channel] = None


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


async def close_rabbitmq_connection() -> None:
    """Close RabbitMQ connection."""
    global _connection, _channel
    
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


def import_datetime_now():
    """Helper to get current datetime."""
    from datetime import datetime
    return datetime.utcnow().isoformat()


class RabbitMQService:
    """RabbitMQ service wrapper for dependency injection."""
    
    async def publish_transcode(self, video_id: str, raw_key: str) -> bool:
        """Publish transcode job."""
        return await publish_transcode_job(video_id, raw_key)
    
    async def close(self) -> None:
        """Close connections."""
        await close_rabbitmq_connection()


# Singleton instance
rabbitmq_service = RabbitMQService()
