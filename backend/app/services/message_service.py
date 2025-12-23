"""Message service for conversation and messaging business logic."""

import logging
from datetime import datetime
from typing import Optional

from app.models import (
    Conversation,
    ConversationParticipant,
    ConversationType,
    ConversationCreate,
    ConversationListItem,
    ConversationPublic,
    ConversationsResponse,
    Message,
    MessageCreate,
    MessagePublic,
    MessageStatus,
    MessageType,
    MessagesResponse,
    ParticipantInfo,
    ParticipantRole,
    User,
    utc_now,
)
from app.services.redis_client import redis_service

logger = logging.getLogger(__name__)


class MessageService:
    """Service for handling messaging operations."""

    # ============== Conversation Management ==============

    async def create_conversation(
        self,
        creator_id: str,
        data: ConversationCreate,
    ) -> Conversation:
        """
        Create a new conversation (1-1 or group).
        
        For DIRECT chats, checks if one already exists between the two users.
        """
        if data.type == ConversationType.DIRECT:
            # For 1-1, ensure exactly 2 participants
            if len(data.participant_ids) != 1:
                raise ValueError("Direct chat requires exactly one other participant")
            
            other_user_id = data.participant_ids[0]
            
            # Check for existing conversation
            existing = await self.get_direct_conversation(creator_id, other_user_id)
            if existing:
                return existing
        
        # Create conversation
        conversation = Conversation(
            type=data.type,
            name=data.name if data.type == ConversationType.GROUP else None,
            avatar_url=data.avatar_url,
            created_by=creator_id if data.type == ConversationType.GROUP else None,
        )
        await conversation.insert()
        
        # Add creator as participant (admin for groups)
        creator_role = ParticipantRole.ADMIN if data.type == ConversationType.GROUP else ParticipantRole.MEMBER
        await self.add_participant(conversation.id, creator_id, creator_role)
        
        # Add other participants
        for user_id in data.participant_ids:
            await self.add_participant(conversation.id, user_id, ParticipantRole.MEMBER)
        
        logger.info(f"Created {data.type} conversation {conversation.id}")
        return conversation

    async def get_direct_conversation(
        self,
        user_id_1: str,
        user_id_2: str,
    ) -> Optional[Conversation]:
        """Find existing direct conversation between two users."""
        # Find conversations where both users are participants
        user1_convs = await ConversationParticipant.find(
            ConversationParticipant.user_id == user_id_1,
            ConversationParticipant.left_at == None,
        ).to_list()
        
        user1_conv_ids = {p.conversation_id for p in user1_convs}
        
        for conv_id in user1_conv_ids:
            # Check if user2 is also in this conversation
            user2_in = await ConversationParticipant.find_one(
                ConversationParticipant.conversation_id == conv_id,
                ConversationParticipant.user_id == user_id_2,
                ConversationParticipant.left_at == None,
            )
            
            if user2_in:
                # Check if it's a DIRECT conversation
                conv = await Conversation.find_one(
                    Conversation.id == conv_id,
                    Conversation.type == ConversationType.DIRECT,
                )
                if conv:
                    return conv
        
        return None

    async def get_conversation(self, conversation_id: str) -> Optional[Conversation]:
        """Get a conversation by ID."""
        return await Conversation.find_one(Conversation.id == conversation_id)

    async def get_user_conversations(
        self,
        user_id: str,
        cursor: Optional[str] = None,
        limit: int = 20,
    ) -> ConversationsResponse:
        """Get all conversations for a user (excludes team chats)."""
        # Get participant records
        query_conditions = [
            ConversationParticipant.user_id == user_id,
            ConversationParticipant.left_at == None,
        ]
        
        participants = await ConversationParticipant.find(*query_conditions).to_list()
        conv_ids = [p.conversation_id for p in participants]
        unread_map = {p.conversation_id: p.unread_count for p in participants}
        
        if not conv_ids:
            return ConversationsResponse(data=[], next_cursor=None, has_more=False)
        
        # Get conversations using $in operator - use _id for raw MongoDB query
        # Exclude team chats (team_id is null or doesn't exist)
        conv_query = {
            "_id": {"$in": conv_ids},
            "$or": [
                {"team_id": None},
                {"team_id": {"$exists": False}},
            ]
        }
        
        if cursor:
            cursor_dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
            conv_query["updated_at"] = {"$lt": cursor_dt}
        
        conversations = await Conversation.find(
            conv_query
        ).sort(-Conversation.updated_at).limit(limit + 1).to_list()
        
        has_more = len(conversations) > limit
        if has_more:
            conversations = conversations[:limit]
        
        next_cursor = None
        if has_more and conversations:
            next_cursor = conversations[-1].updated_at.isoformat()
        
        # Build response
        items = []
        for conv in conversations:
            item = await self._build_conversation_list_item(conv, user_id, unread_map)
            items.append(item)
        
        return ConversationsResponse(
            data=items,
            next_cursor=next_cursor,
            has_more=has_more,
        )

    async def _build_conversation_list_item(
        self,
        conv: Conversation,
        current_user_id: str,
        unread_map: dict[str, int],
    ) -> ConversationListItem:
        """Build a conversation list item for display."""
        name = conv.name
        avatar_url = conv.avatar_url
        
        # For direct chats, get other user's info
        if conv.type == ConversationType.DIRECT:
            other_participant = await ConversationParticipant.find_one(
                ConversationParticipant.conversation_id == conv.id,
                ConversationParticipant.user_id != current_user_id,
                ConversationParticipant.left_at == None,
            )
            if other_participant:
                other_user = await User.find_one(User.id == other_participant.user_id)
                if other_user:
                    name = other_user.username
                    avatar_url = other_user.avatar_url
        
        return ConversationListItem(
            id=conv.id,
            type=conv.type,
            name=name,
            avatar_url=avatar_url,
            last_message_content=conv.last_message_content,
            last_message_at=conv.last_message_at,
            unread_count=unread_map.get(conv.id, 0),
        )

    # ============== Participant Management ==============

    async def add_participant(
        self,
        conversation_id: str,
        user_id: str,
        role: ParticipantRole = ParticipantRole.MEMBER,
    ) -> ConversationParticipant:
        """Add a participant to a conversation."""
        # Check if already a participant
        existing = await ConversationParticipant.find_one(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
        
        if existing:
            if existing.left_at is not None:
                # Rejoin
                existing.left_at = None
                existing.joined_at = utc_now()
                existing.role = role
                await existing.save()
                return existing
            return existing
        
        participant = ConversationParticipant(
            conversation_id=conversation_id,
            user_id=user_id,
            role=role,
        )
        await participant.insert()
        return participant

    async def remove_participant(
        self,
        conversation_id: str,
        user_id: str,
    ) -> bool:
        """Remove a participant from a conversation (soft delete)."""
        participant = await ConversationParticipant.find_one(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
            ConversationParticipant.left_at == None,
        )
        
        if not participant:
            return False
        
        participant.left_at = utc_now()
        await participant.save()
        return True

    async def get_participants(self, conversation_id: str) -> list[ParticipantInfo]:
        """Get all active participants in a conversation."""
        participants = await ConversationParticipant.find(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.left_at == None,
        ).to_list()
        
        result = []
        for p in participants:
            user = await User.find_one(User.id == p.user_id)
            if user:
                # Check online status from Redis
                is_online = False
                try:
                    is_online = await redis_service.is_user_online(p.user_id)
                except Exception:
                    pass  # Redis might not be connected, default to offline
                
                result.append(ParticipantInfo(
                    user_id=p.user_id,
                    username=user.username,
                    avatar_url=user.avatar_url,
                    role=p.role,
                    is_online=is_online,
                ))
        
        return result

    async def is_participant(self, conversation_id: str, user_id: str) -> bool:
        """Check if a user is a participant in a conversation."""
        p = await ConversationParticipant.find_one(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
            ConversationParticipant.left_at == None,
        )
        return p is not None

    # ============== Message Operations ==============

    async def send_message(
        self,
        conversation_id: str,
        sender_id: str,
        data: MessageCreate,
    ) -> Message:
        """Send a message to a conversation."""
        # Verify sender is a participant
        if not await self.is_participant(conversation_id, sender_id):
            raise ValueError("User is not a participant in this conversation")
        
        # Determine message type
        msg_type = MessageType.TEXT
        if data.media:
            msg_type = MessageType.MIXED if data.content else MessageType.IMAGE
            # Check if any video in media
            for m in data.media:
                if m.type == "video":
                    msg_type = MessageType.VIDEO if not data.content else MessageType.MIXED
                    break
        
        # Create message
        message = Message(
            conversation_id=conversation_id,
            sender_id=sender_id,
            content=data.content,
            type=msg_type,
            media=data.media,
            reply_to_message_id=data.reply_to_message_id,
        )
        await message.insert()
        
        # Update conversation
        conv = await Conversation.find_one(Conversation.id == conversation_id)
        if conv:
            conv.last_message_id = message.id
            conv.last_message_content = data.content[:100] if data.content else "[Media]"
            conv.last_message_at = message.created_at
            conv.updated_at = message.created_at
            await conv.save()
        
        # Increment unread count for other participants
        await ConversationParticipant.find(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id != sender_id,
            ConversationParticipant.left_at == None,
        ).update({"$inc": {"unread_count": 1}})
        
        logger.info(f"Message {message.id} sent in conversation {conversation_id}")
        return message

    async def get_messages(
        self,
        conversation_id: str,
        cursor: Optional[str] = None,
        limit: int = 50,
    ) -> MessagesResponse:
        """Get messages in a conversation with cursor pagination."""
        query_conditions = [
            Message.conversation_id == conversation_id,
            Message.deleted_at == None,
        ]
        
        if cursor:
            cursor_dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
            query_conditions.append(Message.created_at < cursor_dt)
        
        messages = await Message.find(
            *query_conditions
        ).sort(-Message.created_at).limit(limit + 1).to_list()
        
        has_more = len(messages) > limit
        if has_more:
            messages = messages[:limit]
        
        next_cursor = None
        if has_more and messages:
            next_cursor = messages[-1].created_at.isoformat()
        
        # Enrich with sender info
        enriched = []
        for msg in messages:
            sender = await User.find_one(User.id == msg.sender_id)
            enriched.append(MessagePublic(
                id=msg.id,
                conversation_id=msg.conversation_id,
                sender_id=msg.sender_id,
                sender_username=sender.username if sender else None,
                sender_avatar=sender.avatar_url if sender else None,
                content=msg.content,
                type=msg.type,
                media=msg.media,
                status=msg.status,
                reply_to_message_id=msg.reply_to_message_id,
                created_at=msg.created_at,
            ))
        
        # Return in chronological order (oldest first)
        enriched.reverse()
        
        return MessagesResponse(
            data=enriched,
            next_cursor=next_cursor,
            has_more=has_more,
        )

    async def mark_conversation_seen(
        self,
        conversation_id: str,
        user_id: str,
        message_id: str,
    ) -> None:
        """Mark a conversation as seen up to a message."""
        participant = await ConversationParticipant.find_one(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
        
        if participant:
            participant.last_seen_message_id = message_id
            participant.unread_count = 0
            await participant.save()
            
            # Update message status to SEEN for messages sent by others
            await Message.find(
                Message.conversation_id == conversation_id,
                Message.sender_id != user_id,
                Message.status != MessageStatus.SEEN,
            ).update({"$set": {"status": MessageStatus.SEEN}})
            
            logger.info(f"User {user_id} marked conversation {conversation_id} as seen")


# Global service instance
message_service = MessageService()
