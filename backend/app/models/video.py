"""Video models and schemas for video processing pipeline."""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field

from .base import utc_now


class VideoStatus(str, Enum):
    """Video processing status."""
    PENDING = "pending"        # Pre-signed URL generated, awaiting upload
    UPLOADING = "uploading"    # Client is uploading to S3
    PROCESSING = "processing"  # Worker is transcoding
    READY = "ready"            # Playback ready
    FAILED = "failed"          # Processing failed


class Video(Document):
    """Video document for MongoDB tracking video processing state."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    user_id: str
    raw_key: str  # S3 key for original video in raw-videos bucket
    status: VideoStatus = Field(default=VideoStatus.PENDING)
    
    # Processing results
    duration: Optional[float] = None  # Video duration in seconds
    resolutions: list[str] = Field(default_factory=list)  # ['480p', '720p', '1080p']
    play_url: Optional[str] = None  # HLS master.m3u8 URL
    thumbnail_url: Optional[str] = None
    
    # Error tracking
    error_message: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=utc_now)
    uploaded_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None
    
    class Settings:
        name = "videos"
        use_state_management = True


class VideoUploadRequest(BaseModel):
    """Request schema for video upload initialization."""
    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str = Field(default="video/mp4")


class VideoUploadResponse(BaseModel):
    """Response schema for video upload initialization."""
    video_id: str
    upload_url: str  # Pre-signed PUT URL
    s3_key: str


class VideoCompleteRequest(BaseModel):
    """Request schema for marking upload complete."""
    pass  # No additional data needed, video_id is in path


class VideoProcessedRequest(BaseModel):
    """Request schema for worker callback after processing."""
    duration: Optional[float] = None
    resolutions: list[str] = Field(default_factory=list)
    play_url: str
    thumbnail_url: str
    success: bool = True
    error_message: Optional[str] = None


class VideoPublic(BaseModel):
    """Public video response schema."""
    id: str
    user_id: str
    status: VideoStatus
    duration: Optional[float] = None
    resolutions: list[str] = []
    play_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    created_at: datetime
    processed_at: Optional[datetime] = None
