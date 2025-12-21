"""Messages API routes for conversations and messaging."""

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser
from app.models import (
    Conversation,
    ConversationCreate,
    ConversationListItem,
    ConversationParticipant,
    ConversationPublic,
    ConversationsResponse,
    ConversationType,
    Friendship,
    FriendshipStatus,
    Message,
    MessageCreate,
    MessagePublic,
    MessagesResponse,
    ParticipantInfo,
    ParticipantRole,
    User,
)
from app.services.message_service import message_service
from app.services.rabbitmq import publish_message_event, MessageRoutingKey

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/messages", tags=["messages"])


# ============== Search Users ==============

@router.get("/search/users")
async def search_users_for_messaging(
    current_user: CurrentUser,
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(default=10, ge=1, le=20),
) -> dict[str, Any]:
    """
    Search users by username to start a conversation.
    Only returns friends (users with ACCEPTED friendship status).
    """
    import re
    
    # First, get all friend IDs for the current user
    friendships = await Friendship.find(
        {
            "$or": [
                {"requester_id": current_user.id},
                {"addressee_id": current_user.id},
            ],
            "status": FriendshipStatus.ACCEPTED.value,
        }
    ).to_list()
    
    # Extract friend user IDs
    friend_ids = []
    for friendship in friendships:
        if friendship.requester_id == current_user.id:
            friend_ids.append(friendship.addressee_id)
        else:
            friend_ids.append(friendship.requester_id)
    
    # If no friends, return empty list
    if not friend_ids:
        return {
            "success": True,
            "data": []
        }
    
    # Case-insensitive regex pattern
    escaped_query = re.escape(q)
    
    # Search only among friends
    users = await User.find(
        {
            "username": {"$regex": escaped_query, "$options": "i"},
            "id": {"$in": friend_ids},
            "is_active": True,
        }
    ).limit(limit).to_list()
    
    results = []
    for user in users:
        results.append({
            "id": user.id,
            "username": user.username,
            "avatar_url": user.avatar_url,
        })
    
    return {
        "success": True,
        "data": results
    }


# ============== Conversation Endpoints ==============

@router.post("/conversations")
async def create_conversation(
    data: ConversationCreate,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Create a new conversation.
    
    For DIRECT (1-1) chats, returns existing conversation if one exists.
    """
    try:
        conversation = await message_service.create_conversation(
            creator_id=current_user.id,
            data=data,
        )
        
        return {
            "success": True,
            "message": "Conversation created",
            "data": {
                "id": conversation.id,
                "type": conversation.type.value,
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/conversations")
async def get_conversations(
    current_user: CurrentUser,
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
) -> ConversationsResponse:
    """Get all conversations for the current user."""
    return await message_service.get_user_conversations(
        user_id=current_user.id,
        cursor=cursor,
        limit=limit,
    )


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    current_user: CurrentUser,
) -> ConversationPublic:
    """Get a specific conversation with participants."""
    # Verify user is participant
    if not await message_service.is_participant(conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a participant")
    
    conversation = await message_service.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Get participants
    participants = await message_service.get_participants(conversation_id)
    
    # Get participant's unread count
    participant = await ConversationParticipant.find_one(
        ConversationParticipant.conversation_id == conversation_id,
        ConversationParticipant.user_id == current_user.id,
    )
    unread_count = participant.unread_count if participant else 0
    
    # Get last message if exists
    last_message = None
    if conversation.last_message_id:
        msg = await Message.find_one(Message.id == conversation.last_message_id)
        if msg:
            sender = await User.find_one(User.id == msg.sender_id)
            last_message = MessagePublic(
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
            )
    
    # Build name and avatar for DIRECT chats
    name = conversation.name
    avatar_url = conversation.avatar_url
    
    if conversation.type == ConversationType.DIRECT:
        for p in participants:
            if p.user_id != current_user.id:
                name = p.username
                avatar_url = p.avatar_url
                break
    
    return ConversationPublic(
        id=conversation.id,
        type=conversation.type,
        name=name,
        avatar_url=avatar_url,
        participants=participants,
        last_message=last_message,
        unread_count=unread_count,
        updated_at=conversation.updated_at,
    )


# ============== Message Endpoints ==============

@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    current_user: CurrentUser,
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
) -> MessagesResponse:
    """Get messages in a conversation with pagination."""
    # Verify user is participant
    if not await message_service.is_participant(conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a participant")
    
    return await message_service.get_messages(
        conversation_id=conversation_id,
        cursor=cursor,
        limit=limit,
    )


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    data: MessageCreate,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Send a message to a conversation.
    
    This is the REST API fallback. Prefer WebSocket for realtime.
    """
    # Verify user is participant
    if not await message_service.is_participant(conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a participant")
    
    try:
        message = await message_service.send_message(
            conversation_id=conversation_id,
            sender_id=current_user.id,
            data=data,
        )
        
        # Publish to RabbitMQ for realtime delivery
        await publish_message_event(
            MessageRoutingKey.MESSAGE_SENT,
            {
                "message_id": message.id,
                "conversation_id": conversation_id,
                "sender_id": current_user.id,
            }
        )
        
        # Get sender info for response
        sender = await User.find_one(User.id == current_user.id)
        
        return {
            "success": True,
            "message": "Message sent",
            "data": MessagePublic(
                id=message.id,
                conversation_id=message.conversation_id,
                sender_id=message.sender_id,
                sender_username=sender.username if sender else None,
                sender_avatar=sender.avatar_url if sender else None,
                content=message.content,
                type=message.type,
                media=message.media,
                status=message.status,
                reply_to_message_id=message.reply_to_message_id,
                created_at=message.created_at,
            ).model_dump()
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/conversations/{conversation_id}/seen")
async def mark_conversation_seen(
    conversation_id: str,
    current_user: CurrentUser,
    message_id: str = Query(..., description="Last seen message ID"),
) -> dict[str, Any]:
    """Mark a conversation as seen up to a specific message."""
    # Verify user is participant
    if not await message_service.is_participant(conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a participant")
    
    await message_service.mark_conversation_seen(
        conversation_id=conversation_id,
        user_id=current_user.id,
        message_id=message_id,
    )
    
    # Publish seen event
    await publish_message_event(
        MessageRoutingKey.MESSAGE_SEEN,
        {
            "conversation_id": conversation_id,
            "user_id": current_user.id,
            "message_id": message_id,
        }
    )
    
    return {
        "success": True,
        "message": "Marked as seen",
    }


# ============== Participant Endpoints ==============

@router.post("/conversations/{conversation_id}/participants")
async def add_participants(
    conversation_id: str,
    current_user: CurrentUser,
    user_ids: list[str] = Query(..., description="User IDs to add"),
) -> dict[str, Any]:
    """Add participants to a group conversation."""
    # Get conversation
    conversation = await message_service.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if conversation.type != ConversationType.GROUP:
        raise HTTPException(status_code=400, detail="Can only add participants to group chats")
    
    # Verify current user is admin
    participant = await ConversationParticipant.find_one(
        ConversationParticipant.conversation_id == conversation_id,
        ConversationParticipant.user_id == current_user.id,
        ConversationParticipant.left_at == None,
    )
    
    if not participant or participant.role != ParticipantRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can add participants")
    
    # Add participants
    added = []
    for user_id in user_ids:
        await message_service.add_participant(conversation_id, user_id)
        added.append(user_id)
    
    return {
        "success": True,
        "message": f"Added {len(added)} participants",
        "data": {"added": added}
    }


@router.delete("/conversations/{conversation_id}/participants/{user_id}")
async def remove_participant(
    conversation_id: str,
    user_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Remove a participant from a group conversation."""
    # Get conversation
    conversation = await message_service.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if conversation.type != ConversationType.GROUP:
        raise HTTPException(status_code=400, detail="Can only remove participants from group chats")
    
    # Allow self-removal or admin removal
    if user_id != current_user.id:
        participant = await ConversationParticipant.find_one(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == current_user.id,
            ConversationParticipant.left_at == None,
        )
        
        if not participant or participant.role != ParticipantRole.ADMIN:
            raise HTTPException(status_code=403, detail="Only admins can remove other participants")
    
    success = await message_service.remove_participant(conversation_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Participant not found")
    
    return {
        "success": True,
        "message": "Participant removed",
    }


# ============== Direct Message Helper ==============

@router.post("/direct/{user_id}")
async def get_or_create_direct_conversation(
    user_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Get or create a direct conversation with a user.
    
    Convenience endpoint for starting a 1-1 chat.
    """
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    
    # Check user exists
    other_user = await User.find_one(User.id == user_id)
    if not other_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    conversation = await message_service.create_conversation(
        creator_id=current_user.id,
        data=ConversationCreate(
            type=ConversationType.DIRECT,
            participant_ids=[user_id],
        ),
    )
    
    return {
        "success": True,
        "data": {
            "id": conversation.id,
            "type": conversation.type.value,
            "name": other_user.username,
            "avatar_url": other_user.avatar_url,
        }
    }
