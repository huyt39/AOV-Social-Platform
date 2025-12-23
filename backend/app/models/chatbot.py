"""Chatbot models and schemas."""
import uuid
from datetime import datetime
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field

from .base import utc_now


# Chat message schema
class ChatMessage(BaseModel):
    """Single chat message."""
    role: str = Field(..., description="Role of the message sender: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    timestamp: datetime = Field(default_factory=utc_now)


# Champion suggestion in response
class ChampionSuggestion(BaseModel):
    """Champion suggestion in chatbot response."""
    ten_tuong: str = Field(..., description="Tên tướng")
    ly_do: str = Field(..., description="Lý do gợi ý tướng này")
    cach_choi_tom_tat: Optional[str] = Field(default=None, description="Tóm tắt cách chơi")


# Chat request schema
class ChatRequest(BaseModel):
    """Request schema for chatbot."""
    message: str = Field(..., description="User message", min_length=1, max_length=1000)
    conversation_id: Optional[str] = Field(default=None, description="Conversation ID for context")


# Chat response schema
class ChatResponse(BaseModel):
    """Response schema for chatbot."""
    message: str = Field(..., description="Assistant response message")
    suggestions: list[ChampionSuggestion] = Field(default_factory=list, description="Champion suggestions")
    sources: list[str] = Field(default_factory=list, description="Source champion names used in RAG")
    conversation_id: str = Field(..., description="Conversation ID")


# Conversation history document
class ConversationMessage(BaseModel):
    """Single message in conversation history."""
    role: str
    content: str
    timestamp: datetime = Field(default_factory=utc_now)


class ChatbotConversation(Document):
    """Conversation history document for MongoDB."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    user_id: str = Field(..., description="User ID")
    messages: list[ConversationMessage] = Field(default_factory=list, description="Conversation messages")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "chatbot_conversations"
        use_state_management = True


# Public schemas
class ConversationPublic(BaseModel):
    """Public schema for conversation."""
    id: str
    user_id: str
    messages: list[ConversationMessage]
    created_at: datetime
    updated_at: datetime
