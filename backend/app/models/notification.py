"""Notification models and schemas."""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field

from .base import utc_now


class NotificationType(str, Enum):
    """Types of notifications supported."""
    POST_LIKED = "post_liked"
    POST_COMMENTED = "post_commented"
    MENTIONED = "mentioned"
    REPLY_THREAD = "reply_thread"
    POST_SHARED = "post_shared"
    # Team notifications
    TEAM_JOIN_REQUEST = "team_join_request"  # Someone requested to join your team
    TEAM_REQUEST_APPROVED = "team_request_approved"  # Your request was approved
    TEAM_REQUEST_REJECTED = "team_request_rejected"  # Your request was rejected
    # Friend notifications
    FRIEND_REQUEST = "friend_request"  # Someone sent you a friend request
    # Report notifications
    REPORT_RESOLVED = "report_resolved"  # Your report was resolved by admin
    # Content moderation notifications
    CONTENT_REMOVED = "content_removed"  # Your content was removed due to report
    CONTENT_WARNING = "content_warning"  # You received a warning for your content


class Notification(Document):
    """Notification document for MongoDB."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    user_id: str  # Recipient of the notification
    actor_id: str  # User who triggered the notification
    type: NotificationType
    post_id: Optional[str] = None  # Related post (if applicable)
    comment_id: Optional[str] = None  # Related comment (if applicable)
    team_id: Optional[str] = None  # Related team (if applicable)
    friendship_id: Optional[str] = None  # Related friendship (if applicable)
    report_id: Optional[str] = None  # Related report (if applicable)
    content: str  # Preview text for the notification
    is_read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "notifications"
        use_state_management = True


class NotificationActor(BaseModel):
    """Actor info embedded in notification response."""
    id: str
    username: str
    avatar_url: Optional[str] = None


class NotificationPublic(BaseModel):
    """Public notification response schema."""
    id: str
    user_id: str
    actor_id: str
    actor: NotificationActor
    type: NotificationType
    post_id: Optional[str] = None
    comment_id: Optional[str] = None
    friendship_id: Optional[str] = None
    team_id: Optional[str] = None
    report_id: Optional[str] = None
    content: str
    is_read: bool
    created_at: datetime


class NotificationsResponse(BaseModel):
    """Response for notifications with cursor pagination."""
    data: list[NotificationPublic]
    next_cursor: Optional[str] = None
    has_more: bool = False
    unread_count: int = 0


class UnreadCountResponse(BaseModel):
    """Response for unread notification count."""
    unread_count: int
