"""WebSocket endpoint for realtime notifications.

Handles WebSocket connections with JWT authentication,
subscribes to Redis pub/sub for user notifications,
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
from app.models import TokenPayload, User
from app.services.redis_client import redis_service

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
    
    async def send_notification(self, websocket: WebSocket, data: dict):
        """Send notification to a specific WebSocket."""
        try:
            await websocket.send_json(data)
        except Exception as e:
            logger.error(f"Failed to send notification via WebSocket: {e}")


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


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token")
):
    """
    WebSocket endpoint for realtime notifications.
    
    Connect with: ws://host/api/v1/ws?token=<jwt_token>
    
    The server will:
    1. Validate the JWT token
    2. Subscribe to Redis notifications for the user
    3. Forward notifications to the client in realtime
    
    Client receives JSON messages with notification data.
    """
    # Verify token before accepting connection
    user = await verify_websocket_token(token)
    
    if not user:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return
    
    user_id = user.id
    socket_id = await manager.connect(websocket, user_id)
    
    # Create Redis subscription for this user
    pubsub = None
    listener_task = None
    
    try:
        # Subscribe to user's notification channel
        async def notification_callback(data: dict):
            """Called when notification arrives via Redis pub/sub."""
            await manager.send_notification(websocket, data)
        
        pubsub = await redis_service.subscribe_user_notifications(user_id, notification_callback)
        
        # Send welcome message
        await websocket.send_json({
            "type": "connected",
            "message": "Connected to notification stream",
            "user_id": user_id,
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Wait for messages from client (ping/pong, etc.)
                data = await websocket.receive_text()
                
                # Handle client messages (e.g., ping)
                try:
                    message = json.loads(data)
                    if message.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except json.JSONDecodeError:
                    pass
                    
            except WebSocketDisconnect:
                break
                
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
    finally:
        # Cleanup
        if pubsub:
            try:
                await redis_service.unsubscribe(pubsub)
            except Exception as e:
                logger.error(f"Error unsubscribing: {e}")
        
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
