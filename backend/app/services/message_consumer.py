"""Message consumer service for processing messaging events from RabbitMQ."""

import asyncio
import json
import logging
from typing import Any, Callable, Optional

import aio_pika
from aio_pika import ExchangeType, IncomingMessage

from app.core.config import settings
from app.services.rabbitmq import (
    get_rabbitmq_channel,
    MESSAGE_EVENTS_EXCHANGE,
    MessageRoutingKey,
)
from app.services.redis_client import redis_service
from app.services.message_service import message_service
from app.models import (
    Conversation,
    ConversationParticipant,
    Message,
    MessageStatus,
    User,
)

logger = logging.getLogger(__name__)

# Queue name for message consumer
MESSAGE_CONSUMER_QUEUE = "message_consumer"


class MessageConsumer:
    """Consumer for message events from RabbitMQ."""
    
    def __init__(self):
        self._running = False
        self._queue: Optional[aio_pika.Queue] = None
    
    async def start(self) -> None:
        """Start consuming message events."""
        if self._running:
            logger.warning("Message consumer already running")
            return
        
        try:
            channel = await get_rabbitmq_channel()
            
            # Declare exchange
            exchange = await channel.declare_exchange(
                MESSAGE_EVENTS_EXCHANGE,
                ExchangeType.TOPIC,
                durable=True
            )
            
            # Declare queue
            self._queue = await channel.declare_queue(
                MESSAGE_CONSUMER_QUEUE,
                durable=True
            )
            
            # Bind to all message routing keys
            await self._queue.bind(exchange, routing_key="message.*")
            
            # Start consuming
            await self._queue.consume(self._process_message)
            
            self._running = True
            logger.info("Message consumer started")
            
        except Exception as e:
            logger.error(f"Failed to start message consumer: {e}")
            raise
    
    async def stop(self) -> None:
        """Stop consuming messages."""
        self._running = False
        if self._queue:
            await self._queue.cancel(MESSAGE_CONSUMER_QUEUE)
        logger.info("Message consumer stopped")
    
    async def _process_message(self, message: IncomingMessage) -> None:
        """Process incoming message event."""
        async with message.process():
            try:
                routing_key = message.routing_key
                payload = json.loads(message.body.decode())
                
                logger.info(f"Processing message event: {routing_key}")
                
                if routing_key == MessageRoutingKey.MESSAGE_SENT:
                    await self._handle_message_sent(payload)
                elif routing_key == MessageRoutingKey.MESSAGE_DELIVERED:
                    await self._handle_message_delivered(payload)
                elif routing_key == MessageRoutingKey.MESSAGE_SEEN:
                    await self._handle_message_seen(payload)
                elif routing_key == MessageRoutingKey.TYPING:
                    await self._handle_typing(payload)
                else:
                    logger.warning(f"Unknown routing key: {routing_key}")
                    
            except Exception as e:
                logger.error(f"Error processing message event: {e}")
    
    async def _handle_message_sent(self, payload: dict[str, Any]) -> None:
        """
        Handle MESSAGE_SENT event.
        
        1. Message already saved by API
        2. Push to recipients via Redis Pub/Sub
        3. Send ACK to sender
        """
        message_id = payload.get("message_id")
        conversation_id = payload.get("conversation_id")
        sender_id = payload.get("sender_id")
        
        if not all([message_id, conversation_id, sender_id]):
            logger.error("Invalid MESSAGE_SENT payload")
            return
        
        # Get message from DB
        msg = await Message.find_one(Message.id == message_id)
        if not msg:
            logger.error(f"Message {message_id} not found")
            return
        
        # Get sender info
        sender = await User.find_one(User.id == sender_id)
        sender_username = sender.username if sender else "Unknown"
        sender_avatar = sender.avatar_url if sender else None
        
        # Build message payload for realtime delivery
        # Use flat structure to match frontend expectations
        message_payload = {
            "type": "NEW_MESSAGE",
            "conversationId": conversation_id,
            "messageId": msg.id,
            "senderId": msg.sender_id,
            "senderUsername": sender_username,
            "senderAvatar": sender_avatar,
            "content": msg.content,
            "messageType": msg.type.value,
            "media": [m.model_dump() for m in msg.media] if msg.media else [],
            "status": msg.status.value,
            "replyToMessageId": msg.reply_to_message_id,
            "createdAt": msg.created_at.isoformat(),
        }
        
        # Get all participants except sender
        participants = await ConversationParticipant.find(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id != sender_id,
            ConversationParticipant.left_at == None,
        ).to_list()
        
        # Push to each recipient via Redis
        for participant in participants:
            user_id = participant.user_id
            
            # Check if user is online
            is_online = await redis_service.is_user_online(user_id)
            
            if is_online:
                # Push via Redis Pub/Sub
                await redis_service.publish_to_user(
                    user_id,
                    "message",
                    message_payload
                )
                logger.info(f"Pushed message to user {user_id}")
        
        # Send ACK to sender
        ack_payload = {
            "type": "MESSAGE_ACK",
            "tempId": payload.get("temp_id"),
            "messageId": message_id,
            "status": "SENT",
        }
        
        is_sender_online = await redis_service.is_user_online(sender_id)
        if is_sender_online:
            await redis_service.publish_to_user(sender_id, "message", ack_payload)
        
        logger.info(f"Processed MESSAGE_SENT for message {message_id}")
    
    async def _handle_message_delivered(self, payload: dict[str, Any]) -> None:
        """Handle MESSAGE_DELIVERED event - update message status."""
        message_id = payload.get("message_id")
        user_id = payload.get("user_id")
        
        if not message_id:
            return
        
        # Update message status
        msg = await Message.find_one(Message.id == message_id)
        if msg and msg.status == MessageStatus.SENT:
            msg.status = MessageStatus.DELIVERED
            await msg.save()
            
            # Notify sender
            sender_online = await redis_service.is_user_online(msg.sender_id)
            if sender_online:
                await redis_service.publish_to_user(
                    msg.sender_id,
                    "message",
                    {
                        "type": "MESSAGE_STATUS",
                        "messageId": message_id,
                        "status": "DELIVERED",
                    }
                )
        
        logger.info(f"Processed MESSAGE_DELIVERED for message {message_id}")
    
    async def _handle_message_seen(self, payload: dict[str, Any]) -> None:
        """Handle MESSAGE_SEEN event - update last seen and notify."""
        conversation_id = payload.get("conversation_id")
        user_id = payload.get("user_id")
        message_id = payload.get("message_id")
        
        if not all([conversation_id, user_id, message_id]):
            return
        
        # Update participant's last seen
        await message_service.mark_conversation_seen(
            conversation_id, user_id, message_id
        )
        
        # Get user info
        user = await User.find_one(User.id == user_id)
        username = user.username if user else "Unknown"
        
        # Notify other participants
        participants = await ConversationParticipant.find(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id != user_id,
            ConversationParticipant.left_at == None,
        ).to_list()
        
        seen_payload = {
            "type": "MESSAGE_SEEN",
            "conversationId": conversation_id,
            "userId": user_id,
            "username": username,
            "lastSeenMessageId": message_id,
        }
        
        for participant in participants:
            is_online = await redis_service.is_user_online(participant.user_id)
            if is_online:
                await redis_service.publish_to_user(
                    participant.user_id,
                    "message",
                    seen_payload
                )
        
        logger.info(f"Processed MESSAGE_SEEN for conversation {conversation_id}")
    
    async def _handle_typing(self, payload: dict[str, Any]) -> None:
        """Handle TYPING event - broadcast to conversation participants."""
        conversation_id = payload.get("conversation_id")
        user_id = payload.get("user_id")
        
        if not all([conversation_id, user_id]):
            return
        
        # Get user info
        user = await User.find_one(User.id == user_id)
        username = user.username if user else "Unknown"
        
        # Broadcast to other participants
        participants = await ConversationParticipant.find(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id != user_id,
            ConversationParticipant.left_at == None,
        ).to_list()
        
        typing_payload = {
            "type": "TYPING",
            "conversationId": conversation_id,
            "userId": user_id,
            "username": username,
        }
        
        for participant in participants:
            is_online = await redis_service.is_user_online(participant.user_id)
            if is_online:
                await redis_service.publish_to_user(
                    participant.user_id,
                    "message",
                    typing_payload
                )
        
        logger.debug(f"Broadcast typing indicator for user {user_id}")


# Global consumer instance
message_consumer = MessageConsumer()
