"""Post models and schemas."""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field

from .base import RankEnum, utc_now


class MediaType(str, Enum):
    """Media types supported in posts."""
    IMAGE = "image"
    VIDEO = "video"


class MediaItem(BaseModel):
    """Media item embedded in a post."""
    url: str = Field(..., max_length=1000)
    type: MediaType
    thumbnail_url: Optional[str] = Field(default=None, max_length=1000)


class Post(Document):
    """Post document for MongoDB."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    author_id: str
    content: str = Field(default="", max_length=5000) 
    media: list[MediaItem] = Field(default_factory=list)
    like_count: int = Field(default=0)
    comment_count: int = Field(default=0)
    share_count: int = Field(default=0)
    shared_post_id: Optional[str] = None  
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "posts"
        use_state_management = True


class PostLike(Document):
    """Track post likes by users."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    post_id: str
    user_id: str
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "post_likes"
        use_state_management = True


class PostCreate(BaseModel):
    """Schema for creating a post."""
    content: str = Field(default="", max_length=5000) 
    media: list[MediaItem] = Field(default_factory=list)
    shared_post_id: Optional[str] = None  


class PostUpdate(BaseModel):
    """Schema for updating a post."""
    content: Optional[str] = Field(default=None, min_length=1, max_length=5000)


class PostAuthor(BaseModel):
    """Author info embedded in post response."""
    id: str
    username: str
    avatar_url: Optional[str] = None
    rank: Optional[RankEnum] = None
    level: Optional[int] = None


class RecentLiker(BaseModel):
    """Simplified user info for recent likers display."""
    id: str
    username: str
    avatar_url: Optional[str] = None


class SharedPostInfo(BaseModel):
    """Info about the original shared post."""
    id: str
    author: PostAuthor
    content: str
    media: list[MediaItem]
    created_at: datetime


class PostPublic(BaseModel):
    """Public post response schema."""
    id: str
    author_id: str
    author: PostAuthor
    content: str
    media: list[MediaItem]
    like_count: int = 0
    comment_count: int = 0
    share_count: int = 0
    is_liked: bool = False  
    shared_post: Optional[SharedPostInfo] = None
    recent_likers: list[RecentLiker] = []  # First 3 users who liked
    created_at: datetime


class FeedResponse(BaseModel):
    """Feed response with cursor pagination."""
    data: list[PostPublic]
    next_cursor: Optional[str] = None  # ISO datetime string
    has_more: bool = False


class UserPostsResponse(BaseModel):
    """Response for user's posts with cursor pagination."""
    data: list[PostPublic]
    next_cursor: Optional[str] = None
    has_more: bool = False
