"""Reel models for short-form video content."""
import uuid
from datetime import datetime
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field


class Reel(Document):
    """Reel document for short-form videos (similar to TikTok/Instagram Reels)."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    user_id: str
    video_id: str  # Reference to Video document
    
    # Content
    caption: Optional[str] = None
    music_name: Optional[str] = None
    music_artist: Optional[str] = None
    
    # URLs (denormalized from Video for faster access)
    video_url: str  # HLS or direct video URL
    thumbnail_url: str
    duration: float  # in seconds
    
    # Engagement metrics
    views_count: int = 0
    likes_count: int = 0
    comments_count: int = 0
    shares_count: int = 0
    
    # Status
    is_active: bool = True
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "reels"
        use_state_management = True


class ReelView(Document):
    """Track which reels a user has viewed."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    user_id: str
    reel_id: str
    viewed_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Engagement
    watched_duration: Optional[float] = None  # seconds watched
    completed: bool = False  # watched to end
    
    class Settings:
        name = "reel_views"
        use_state_management = True
        indexes = [
            [("user_id", 1), ("reel_id", 1)],  # Composite index for quick lookup
            [("user_id", 1), ("viewed_at", -1)],  # For recent views
        ]


class ReelLike(Document):
    """Track reel likes."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    user_id: str
    reel_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "reel_likes"
        use_state_management = True
        indexes = [
            [("user_id", 1), ("reel_id", 1)],  # Unique like per user per reel
            [("reel_id", 1), ("created_at", -1)],
        ]


class ReelCreateRequest(BaseModel):
    """Request schema for creating a reel."""
    video_id: str
    caption: Optional[str] = Field(None, max_length=500)
    music_name: Optional[str] = Field(None, max_length=100)
    music_artist: Optional[str] = Field(None, max_length=100)


class ReelPublic(BaseModel):
    """Public reel response schema."""
    id: str
    user_id: str
    username: Optional[str] = None
    user_avatar: Optional[str] = None
    
    video_url: str
    thumbnail_url: str
    duration: float
    
    caption: Optional[str] = None
    music_name: Optional[str] = None
    music_artist: Optional[str] = None
    
    views_count: int
    likes_count: int
    comments_count: int
    shares_count: int
    
    is_liked: bool = False  # Whether current user liked it
    
    created_at: datetime


class ReelViewRequest(BaseModel):
    """Request to mark a reel as viewed."""
    watched_duration: Optional[float] = None
    completed: bool = False


class ReelFeedResponse(BaseModel):
    """Response for reel feed. Backend auto-resamples when all reels are viewed."""
    reels: list[ReelPublic]
    has_more: bool

