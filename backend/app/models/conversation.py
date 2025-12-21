"""Conversation and Message models for the messaging system."""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field

from .base import utc_now


# ============== Enums ==============

class ConversationType(str, Enum):
    """Type of conversation."""
    DIRECT = "DIRECT"  # 1-1 chat
    GROUP = "GROUP"    # Group chat


class ParticipantRole(str, Enum):
    """Role of participant in conversation."""
    MEMBER = "MEMBER"
    ADMIN = "ADMIN"


class MessageType(str, Enum):
    """Type of message content."""
    TEXT = "TEXT"
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    MIXED = "MIXED"  # Text + media


class MessageStatus(str, Enum):
    """Delivery status of message."""
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    SEEN = "SEEN"


# ============== Embedded Models ==============

class MediaAttachment(BaseModel):
    """Media attachment in a message."""
    url: str
    type: str  # "image" | "video"
    thumbnail_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None  # For videos, in seconds


# ============== Document Models ==============

class Conversation(Document):
    """Conversation document - represents a chat (1-1 or group)."""
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: ConversationType
    name: Optional[str] = None  # For group chats
    avatar_url: Optional[str] = None  # Group avatar
    created_by: Optional[str] = None  # User ID who created (for groups)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)  # Last activity
    last_message_id: Optional[str] = None  # For quick preview
    last_message_content: Optional[str] = None  # Preview text
    last_message_at: Optional[datetime] = None

    class Settings:
        name = "conversations"
        indexes = [
            "created_at",
            "updated_at",
        ]


class ConversationParticipant(Document):
    """Participant in a conversation."""
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    user_id: str
    role: ParticipantRole = ParticipantRole.MEMBER
    last_seen_message_id: Optional[str] = None
    unread_count: int = 0
    muted: bool = False
    joined_at: datetime = Field(default_factory=utc_now)
    left_at: Optional[datetime] = None  # Null if still in conversation

    class Settings:
        name = "conversation_participants"
        indexes = [
            "conversation_id",
            "user_id",
            [("conversation_id", 1), ("user_id", 1)],  # Compound index
        ]


class Message(Document):
    """Message in a conversation."""
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    sender_id: str
    content: Optional[str] = None  # Text content
    type: MessageType = MessageType.TEXT
    media: list[MediaAttachment] = Field(default_factory=list)
    status: MessageStatus = MessageStatus.SENT
    reply_to_message_id: Optional[str] = None  # For reply threads
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: Optional[datetime] = None  # For edited messages
    deleted_at: Optional[datetime] = None  # Soft delete

    class Settings:
        name = "messages"
        indexes = [
            "conversation_id",
            "sender_id",
            "created_at",
            [("conversation_id", 1), ("created_at", -1)],  # For pagination
        ]


# ============== Pydantic Schemas ==============

class ConversationCreate(BaseModel):
    """Schema for creating a conversation."""
    type: ConversationType
    participant_ids: list[str]  # User IDs to add
    name: Optional[str] = None  # Required for GROUP
    avatar_url: Optional[str] = None


class MessageCreate(BaseModel):
    """Schema for sending a message."""
    content: Optional[str] = None
    media: list[MediaAttachment] = Field(default_factory=list)
    reply_to_message_id: Optional[str] = None
    
    def model_post_init(self, _):
        # At least one of content or media must be provided
        if not self.content and not self.media:
            raise ValueError("Message must have content or media")


class ParticipantInfo(BaseModel):
    """Participant info for API responses."""
    user_id: str
    username: str
    avatar_url: Optional[str] = None
    role: ParticipantRole
    is_online: bool = False


class MessagePublic(BaseModel):
    """Public message representation."""
    id: str
    conversation_id: str
    sender_id: str
    sender_username: Optional[str] = None
    sender_avatar: Optional[str] = None
    content: Optional[str] = None
    type: MessageType
    media: list[MediaAttachment]
    status: MessageStatus
    reply_to_message_id: Optional[str] = None
    created_at: datetime


class ConversationPublic(BaseModel):
    """Public conversation representation."""
    id: str
    type: ConversationType
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    participants: list[ParticipantInfo] = Field(default_factory=list)
    last_message: Optional[MessagePublic] = None
    unread_count: int = 0
    updated_at: datetime


class ConversationListItem(BaseModel):
    """Conversation list item for quick display."""
    id: str
    type: ConversationType
    name: Optional[str] = None  # For GROUP or other user's name for DIRECT
    avatar_url: Optional[str] = None
    last_message_content: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0


class MessagesResponse(BaseModel):
    """Paginated messages response."""
    data: list[MessagePublic]
    next_cursor: Optional[str] = None
    has_more: bool = False


class ConversationsResponse(BaseModel):
    """Paginated conversations response."""
    data: list[ConversationListItem]
    next_cursor: Optional[str] = None
    has_more: bool = False
