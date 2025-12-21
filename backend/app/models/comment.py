"""Comment models and schemas."""
import uuid
from datetime import datetime
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field

from .base import utc_now


class Comment(Document):
    """Comment document for MongoDB."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    post_id: str
    author_id: str
    content: str = Field(..., min_length=1, max_length=2000)
    mentions: list[str] = Field(default_factory=list) 
    parent_id: Optional[str] = None 
    reply_to_user_id: Optional[str] = None 
    like_count: int = Field(default=0)
    reply_count: int = Field(default=0) 
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "comments"
        use_state_management = True


class CommentLike(Document):
    """Track comment likes by users."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    comment_id: str
    user_id: str
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "comment_likes"
        use_state_management = True


class CommentCreate(BaseModel):
    """Schema for creating a comment."""
    content: str = Field(..., min_length=1, max_length=2000)
    mentions: list[str] = Field(default_factory=list) 
    parent_id: Optional[str] = None 
    reply_to_user_id: Optional[str] = None 


class CommentAuthor(BaseModel):
    """Author info embedded in comment response."""
    id: str
    username: str
    avatar_url: Optional[str] = None


class CommentPublic(BaseModel):
    """Public comment response schema."""
    id: str
    post_id: str
    author_id: str
    author: CommentAuthor
    content: str
    mentions: list[str] = Field(default_factory=list)
    parent_id: Optional[str] = None
    reply_to_user_id: Optional[str] = None
    reply_to_username: Optional[str] = None 
    like_count: int = 0
    reply_count: int = 0
    is_liked: bool = False
    created_at: datetime


class CommentsResponse(BaseModel):
    """Response for comments with cursor pagination."""
    data: list[CommentPublic]
    next_cursor: Optional[str] = None
    has_more: bool = False
