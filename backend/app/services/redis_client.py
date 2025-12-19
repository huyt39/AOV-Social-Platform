"""Redis service for notification system.

Provides async Redis client for:
- Online state tracking (user:{userId}:sockets set)
- Pub/Sub for notification routing (notification:user:{userId})
- Connection lifecycle management
"""

import asyncio
import json
import logging
from typing import Any, Callable, Optional

import redis.asyncio as redis
from redis.asyncio.client import PubSub

from app.core.config import settings

logger = logging.getLogger(__name__)


class RedisService:
    """Redis service for notification routing and online state management."""
    
    def __init__(self):
        self._client: Optional[redis.Redis] = None
        self._pubsub: Optional[PubSub] = None
        self._listener_task: Optional[asyncio.Task] = None
    
    async def connect(self) -> None:
        """Connect to Redis server."""
        if self._client is None:
            self._client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=10.0,  # 10 second timeout for initial connection
                # Note: socket_timeout intentionally not set for PubSub compatibility
                # PubSub needs to wait indefinitely for messages
                health_check_interval=30,  # Send PING every 30 seconds to keep connection alive
            )
            # Test connection
            await self._client.ping()
            logger.info("Connected to Redis")
    
    async def disconnect(self) -> None:
        """Disconnect from Redis server."""
        # Stop listener task if running
        if self._listener_task and not self._listener_task.done():
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None
        
        # Close pubsub
        if self._pubsub:
            await self._pubsub.close()
            self._pubsub = None
        
        # Close client
        if self._client:
            await self._client.close()
            self._client = None
            logger.info("Disconnected from Redis")
    
    @property
    def client(self) -> redis.Redis:
        """Get Redis client, raise error if not connected."""
        if self._client is None:
            raise RuntimeError("Redis not connected. Call connect() first.")
        return self._client
    
    # ==================== Online State Management ====================
    
    async def add_socket(self, user_id: str, socket_id: str) -> None:
        """Add socket ID to user's active connections set."""
        key = f"user:{user_id}:sockets"
        await self.client.sadd(key, socket_id)
        # Set TTL of 24 hours as safety net
        await self.client.expire(key, 86400)
        logger.debug(f"Added socket {socket_id} for user {user_id}")
    
    async def remove_socket(self, user_id: str, socket_id: str) -> None:
        """Remove socket ID from user's active connections set."""
        key = f"user:{user_id}:sockets"
        await self.client.srem(key, socket_id)
        # Clean up key if no more sockets
        count = await self.client.scard(key)
        if count == 0:
            await self.client.delete(key)
        logger.debug(f"Removed socket {socket_id} for user {user_id}")
    
    async def get_user_sockets(self, user_id: str) -> set[str]:
        """Get all active socket IDs for a user."""
        key = f"user:{user_id}:sockets"
        return await self.client.smembers(key)
    
    async def is_user_online(self, user_id: str) -> bool:
        """Check if user has any active connections."""
        key = f"user:{user_id}:sockets"
        count = await self.client.scard(key)
        return count > 0
    
    # ==================== Pub/Sub for Notifications ====================
    
    async def publish_notification(self, user_id: str, payload: dict[str, Any]) -> int:
        """
        Publish notification to user's channel.
        
        Args:
            user_id: Target user ID
            payload: Notification data to send
            
        Returns:
            Number of subscribers that received the message
        """
        channel = f"notification:user:{user_id}"
        message = json.dumps(payload)
        count = await self.client.publish(channel, message)
        logger.debug(f"Published notification to {channel}, {count} receivers")
        return count
    
    async def publish_to_user(
        self, 
        user_id: str, 
        channel_type: str, 
        payload: dict[str, Any]
    ) -> int:
        """
        Publish to a user's specific channel.
        
        Args:
            user_id: Target user ID
            channel_type: Channel type ("notification" or "message")
            payload: Data to send
            
        Returns:
            Number of subscribers that received the message
        """
        channel = f"{channel_type}:user:{user_id}"
        message = json.dumps(payload)
        count = await self.client.publish(channel, message)
        logger.debug(f"Published to {channel}, {count} receivers")
        return count
    
    async def subscribe_user_notifications(
        self, 
        user_id: str, 
        callback: Callable[[dict[str, Any]], Any]
    ) -> PubSub:
        """
        Subscribe to notifications for a specific user.
        
        Args:
            user_id: User ID to subscribe to
            callback: Async function to call with each notification
            
        Returns:
            PubSub object for managing subscription
        """
        pubsub = self.client.pubsub()
        channel = f"notification:user:{user_id}"
        await pubsub.subscribe(channel)
        logger.debug(f"Subscribed to {channel}")
        
        async def listener():
            retry_count = 0
            max_retries = 10
            base_delay = 1  # seconds
            
            while retry_count < max_retries:
                try:
                    async for message in pubsub.listen():
                        # Reset retry count on successful message
                        retry_count = 0
                        if message["type"] == "message":
                            try:
                                data = json.loads(message["data"])
                                await callback(data)
                            except json.JSONDecodeError:
                                logger.error(f"Invalid JSON in notification: {message['data']}")
                            except Exception as e:
                                logger.error(f"Error in notification callback: {e}")
                except asyncio.CancelledError:
                    logger.debug(f"Listener cancelled for {channel}")
                    break
                except Exception as e:
                    retry_count += 1
                    delay = min(base_delay * (2 ** retry_count), 30)  # Max 30 seconds
                    logger.warning(f"Notification listener error (attempt {retry_count}): {e}. Retrying in {delay}s...")
                    await asyncio.sleep(delay)
                    
                    # Try to resubscribe
                    try:
                        await pubsub.subscribe(channel)
                        logger.info(f"Resubscribed to {channel}")
                    except Exception as resub_error:
                        logger.error(f"Failed to resubscribe: {resub_error}")
            
            if retry_count >= max_retries:
                logger.error(f"Max retries reached for {channel}, listener stopped")
        
        # Start listener in background
        asyncio.create_task(listener())
        
        return pubsub
    
    async def subscribe_all_notifications(
        self, 
        callback: Callable[[str, dict[str, Any]], Any]
    ) -> PubSub:
        """
        Subscribe to all user notification channels using pattern subscribe.
        Used by notification consumer service.
        
        Args:
            callback: Async function called with (user_id, payload) for each notification
            
        Returns:
            PubSub object for managing subscription
        """
        if self._pubsub:
            await self._pubsub.close()
        
        self._pubsub = self.client.pubsub()
        pattern = "notification:user:*"
        await self._pubsub.psubscribe(pattern)
        logger.info(f"Subscribed to pattern {pattern}")
        
        async def listener():
            retry_count = 0
            max_retries = 10
            base_delay = 1  # seconds
            
            while retry_count < max_retries:
                try:
                    async for message in self._pubsub.listen():
                        # Reset retry count on successful message
                        retry_count = 0
                        if message["type"] == "pmessage":
                            try:
                                channel = message["channel"]
                                # Extract user_id from channel: notification:user:{user_id}
                                user_id = channel.split(":")[-1]
                                data = json.loads(message["data"])
                                await callback(user_id, data)
                            except json.JSONDecodeError:
                                logger.error(f"Invalid JSON in notification: {message['data']}")
                            except Exception as e:
                                logger.error(f"Error in notification callback: {e}")
                except asyncio.CancelledError:
                    logger.debug("Pattern listener cancelled")
                    break
                except Exception as e:
                    retry_count += 1
                    delay = min(base_delay * (2 ** retry_count), 30)  # Max 30 seconds
                    logger.warning(f"Pattern listener error (attempt {retry_count}): {e}. Retrying in {delay}s...")
                    await asyncio.sleep(delay)
                    
                    # Try to resubscribe
                    try:
                        await self._pubsub.psubscribe(pattern)
                        logger.info(f"Resubscribed to pattern {pattern}")
                    except Exception as resub_error:
                        logger.error(f"Failed to resubscribe to pattern: {resub_error}")
            
            if retry_count >= max_retries:
                logger.error(f"Max retries reached for pattern {pattern}, listener stopped")
        
        self._listener_task = asyncio.create_task(listener())
        
        return self._pubsub
    
    async def unsubscribe(self, pubsub: PubSub) -> None:
        """Unsubscribe and close a PubSub connection."""
        await pubsub.unsubscribe()
        await pubsub.close()


# Singleton instance
redis_service = RedisService()
