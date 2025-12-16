"""WebSocket endpoint for realtime notifications and messaging.

Handles WebSocket connections with JWT authentication,
subscribes to Redis pub/sub for user notifications and messages,
and delivers notifications in realtime.
"""

import asyncio
import json
import logging
import uuid
from typing import Optional

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError

from app.core import security
from app.core.config import settings
from app.models import TokenPayload, User, MessageCreate, MediaAttachment
from app.services.redis_client import redis_service
from app.services.message_service import message_service
from app.services.rabbitmq import publish_message_event, MessageRoutingKey

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """Manages WebSocket connections and Redis subscriptions."""
    
    def __init__(self):
        # Map user_id -> set of active websockets
        self.active_connections: dict[str, set[WebSocket]] = {}
        # Map socket_id -> (user_id, websocket)
        self.socket_info: dict[str, tuple[str, WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str) -> str:
        """Accept connection and register in Redis."""
        await websocket.accept()
        
        # Generate unique socket ID
        socket_id = str(uuid.uuid4())
        
        # Add to local tracking
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        self.socket_info[socket_id] = (user_id, websocket)
        
        # Register in Redis
        try:
            await redis_service.add_socket(user_id, socket_id)
        except Exception as e:
            logger.error(f"Failed to register socket in Redis: {e}")
        
        logger.info(f"WebSocket connected: user={user_id}, socket={socket_id}")
        return socket_id
    
    async def disconnect(self, websocket: WebSocket, user_id: str, socket_id: str):
        """Remove connection from tracking and Redis."""
        # Remove from local tracking
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        
        if socket_id in self.socket_info:
            del self.socket_info[socket_id]
        
        # Remove from Redis
        try:
            await redis_service.remove_socket(user_id, socket_id)
        except Exception as e:
            logger.error(f"Failed to remove socket from Redis: {e}")
        
        logger.info(f"WebSocket disconnected: user={user_id}, socket={socket_id}")
    
    async def send_message(self, websocket: WebSocket, data: dict):
        """Send message to a specific WebSocket."""
        try:
            await websocket.send_json(data)
        except Exception as e:
            logger.error(f"Failed to send message via WebSocket: {e}")


# Global connection manager
manager = ConnectionManager()


async def verify_websocket_token(token: str) -> Optional[User]:
    """Verify JWT token and return user."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError) as e:
        logger.warning(f"Invalid WebSocket token: {e}")
        return None
    
    # Find user by ID
    user = await User.get(token_data.sub)
    
    if not user or not user.is_active:
        return None
    
    return user


async def handle_client_message(user_id: str, websocket: WebSocket, message: dict):
    """Handle incoming message from client."""
    msg_type = message.get("type")
    
    if msg_type == "ping":
        await websocket.send_json({"type": "pong"})
    
    elif msg_type == "SEND_MESSAGE":
        # Handle sending a message via WebSocket
        conversation_id = message.get("conversationId")
        content = message.get("content")
        media = message.get("media", [])
        temp_id = message.get("tempId")
        
        if not conversation_id or (not content and not media):
            await websocket.send_json({
                "type": "ERROR",
                "message": "Invalid message: missing conversationId or content/media"
            })
            return
        
        try:
            # Build media attachments
            media_attachments = [
                MediaAttachment(**m) if isinstance(m, dict) else m
                for m in media
            ]
            
            # Send message via service
            msg = await message_service.send_message(
                conversation_id=conversation_id,
                sender_id=user_id,
                data=MessageCreate(
                    content=content,
                    media=media_attachments,
                    reply_to_message_id=message.get("replyToMessageId"),
                ),
            )
            
            # Publish to RabbitMQ for delivery to other participants
            await publish_message_event(
                MessageRoutingKey.MESSAGE_SENT,
                {
                    "message_id": msg.id,
                    "conversation_id": conversation_id,
                    "sender_id": user_id,
                    "temp_id": temp_id,
                }
            )
            
            # Send ACK immediately to sender
            await websocket.send_json({
                "type": "MESSAGE_ACK",
                "tempId": temp_id,
                "messageId": msg.id,
                "status": "SENT",
            })
            
        except ValueError as e:
            await websocket.send_json({
                "type": "ERROR",
                "message": str(e)
            })
        except Exception as e:
            logger.error(f"Error sending message: {e}")
            await websocket.send_json({
                "type": "ERROR",
                "message": "Failed to send message"
            })
    
    elif msg_type == "TYPING":
        # Broadcast typing indicator
        conversation_id = message.get("conversationId")
        if conversation_id:
            await publish_message_event(
                MessageRoutingKey.TYPING,
                {
                    "conversation_id": conversation_id,
                    "user_id": user_id,
                }
            )
    
    elif msg_type == "MARK_SEEN":
        # Mark messages as seen
        conversation_id = message.get("conversationId")
        message_id = message.get("messageId")
        
        if conversation_id and message_id:
            await message_service.mark_conversation_seen(
                conversation_id=conversation_id,
                user_id=user_id,
                message_id=message_id,
            )
            
            # Publish seen event
            await publish_message_event(
                MessageRoutingKey.MESSAGE_SEEN,
                {
                    "conversation_id": conversation_id,
                    "user_id": user_id,
                    "message_id": message_id,
                }
            )


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token")
):
    """
    WebSocket endpoint for realtime notifications and messaging.
    
    Connect with: ws://host/api/v1/ws?token=<jwt_token>
    
    The server will:
    1. Validate the JWT token
    2. Subscribe to Redis notifications and messages for the user
    3. Forward notifications/messages to the client in realtime
    4. Handle client messages (SEND_MESSAGE, TYPING, MARK_SEEN)
    """
    # Verify token before accepting connection
    user = await verify_websocket_token(token)
    
    if not user:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return
    
    user_id = user.id
    socket_id = await manager.connect(websocket, user_id)
    
    # Create Redis subscriptions for this user
    notification_pubsub = None
    message_pubsub = None
    
    try:
        # Callback for notifications
        async def notification_callback(data: dict):
            await manager.send_message(websocket, data)
        
        # Callback for messages
        async def message_callback(data: dict):
            await manager.send_message(websocket, data)
        
        # Subscribe to notification channel
        notification_pubsub = await redis_service.subscribe_user_notifications(
            user_id, notification_callback
        )
        
        # Subscribe to message channel
        message_pubsub = redis_service.client.pubsub()
        message_channel = f"message:user:{user_id}"
        await message_pubsub.subscribe(message_channel)
        
        # Start message listener
        async def message_listener():
            try:
                async for msg in message_pubsub.listen():
                    if msg["type"] == "message":
                        try:
                            data = json.loads(msg["data"])
                            await message_callback(data)
                        except json.JSONDecodeError:
                            pass
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"Message listener error: {e}")
        
        message_listener_task = asyncio.create_task(message_listener())
        
        # Send welcome message
        await websocket.send_json({
            "type": "connected",
            "message": "Connected to notification and message stream",
            "user_id": user_id,
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                data = await websocket.receive_text()
                
                try:
                    message = json.loads(data)
                    await handle_client_message(user_id, websocket, message)
                except json.JSONDecodeError:
                    pass
                    
            except WebSocketDisconnect:
                break
                
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
    finally:
        # Cleanup
        if notification_pubsub:
            try:
                await redis_service.unsubscribe(notification_pubsub)
            except Exception as e:
                logger.error(f"Error unsubscribing notifications: {e}")
        
        if message_pubsub:
            try:
                await message_pubsub.unsubscribe()
                await message_pubsub.close()
            except Exception as e:
                logger.error(f"Error unsubscribing messages: {e}")
        
        await manager.disconnect(websocket, user_id, socket_id)


@router.get("/ws/health")
async def websocket_health():
    """Health check for WebSocket service."""
    try:
        # Check Redis connection
        is_redis_connected = redis_service._client is not None
        
        return {
            "status": "ok",
            "redis_connected": is_redis_connected,
            "active_connections": sum(
                len(sockets) for sockets in manager.active_connections.values()
            ),
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
        }
