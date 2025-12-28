"""Forum models and schemas for the forum feature."""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field

from .base import RankEnum, utc_now


# ============== FORUM ENUMS ==============

class ThreadStatus(str, Enum):
    """Status of a forum thread."""
    ACTIVE = "ACTIVE"
    LOCKED = "LOCKED"  # No new comments allowed
    HIDDEN = "HIDDEN"  # Hidden from public view


class ForumCommentStatus(str, Enum):
    """Status of a forum comment."""
    ACTIVE = "ACTIVE"
    HIDDEN = "HIDDEN"  # Hidden due to violation
    DELETED = "DELETED"  # Soft deleted


class ReportTargetType(str, Enum):
    """Type of content being reported."""
    THREAD = "THREAD"
    COMMENT = "COMMENT"
    USER = "USER"
    POST = "POST"  # Feed posts


class ReportStatus(str, Enum):
    """Status of a report."""
    PENDING = "PENDING"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"


# ============== FORUM CATEGORY ==============

class ForumCategory(Document):
    """Forum category/section document for MongoDB."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = Field(default=None, max_length=50)  # Icon name or emoji
    thread_count: int = Field(default=0)
    is_active: bool = Field(default=True)
    display_order: int = Field(default=0)  # For sorting categories
    created_by_id: str
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "forum_categories"
        use_state_management = True


class ForumCategoryCreate(BaseModel):
    """Schema for creating a forum category."""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = Field(default=None, max_length=50)
    display_order: int = Field(default=0)


class ForumCategoryUpdate(BaseModel):
    """Schema for updating a forum category."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = Field(default=None, max_length=50)
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class ForumCategoryPublic(BaseModel):
    """Public category response schema."""
    id: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    thread_count: int = 0
    display_order: int = 0
    created_at: datetime


class ForumCategoriesResponse(BaseModel):
    """Response for category list."""
    data: list[ForumCategoryPublic]
    count: int


# ============== FORUM THREAD ==============

class ForumThreadAuthor(BaseModel):
    """Author info embedded in thread response."""
    id: str
    username: str
    avatar_url: Optional[str] = None
    rank: Optional[RankEnum] = None
    level: Optional[int] = None


class ForumThread(Document):
    """Forum thread document for MongoDB."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1, max_length=10000)
    author_id: str
    category_id: str
    status: ThreadStatus = ThreadStatus.ACTIVE
    # Media support (images)
    media_urls: list[str] = Field(default_factory=list)
    # Stats
    view_count: int = Field(default=0)
    comment_count: int = Field(default=0)
    like_count: int = Field(default=0)
    # Timestamps
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    last_activity_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "forum_threads"
        use_state_management = True


class ForumThreadLike(Document):
    """Track thread likes by users."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    thread_id: str
    user_id: str
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "forum_thread_likes"
        use_state_management = True


class ForumThreadCreate(BaseModel):
    """Schema for creating a forum thread."""
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1, max_length=10000)
    media_urls: list[str] = Field(default_factory=list)


class ForumThreadUpdate(BaseModel):
    """Schema for updating a forum thread."""
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    content: Optional[str] = Field(default=None, min_length=1, max_length=10000)
    media_urls: Optional[list[str]] = None


class ForumThreadPublic(BaseModel):
    """Public thread response schema."""
    id: str
    title: str
    content: str
    author_id: str
    author: ForumThreadAuthor
    category_id: str
    category_name: Optional[str] = None
    status: ThreadStatus
    media_urls: list[str] = Field(default_factory=list)
    view_count: int = 0
    comment_count: int = 0
    like_count: int = 0
    is_liked: bool = False
    created_at: datetime
    updated_at: datetime
    last_activity_at: datetime


class ForumThreadListItem(BaseModel):
    """Thread item for list view (lighter than full detail)."""
    id: str
    title: str
    content_preview: str  # First 200 chars
    author: ForumThreadAuthor
    category_id: str
    status: ThreadStatus
    view_count: int = 0
    comment_count: int = 0
    like_count: int = 0
    created_at: datetime
    last_activity_at: datetime


class ForumThreadsResponse(BaseModel):
    """Response for thread list with pagination."""
    data: list[ForumThreadListItem]
    next_cursor: Optional[str] = None
    has_more: bool = False


# ============== FORUM COMMENT ==============

class ForumCommentAuthor(BaseModel):
    """Author info embedded in forum comment response."""
    id: str
    username: str
    avatar_url: Optional[str] = None
    rank: Optional[RankEnum] = None


class ForumComment(Document):
    """
    Forum comment document for MongoDB.
    
    All comments are flat (same level). When replying to another comment,
    we store reference to the quoted comment and preview of its content.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    thread_id: str
    author_id: str
    content: str = Field(..., min_length=1, max_length=5000)
    # Reference to quoted comment (null for direct comments on thread)
    parent_id: Optional[str] = None
    # Depth is always 0 (flat structure)
    depth: int = Field(default=0)
    # For displaying "Reply to @username"
    reply_to_user_id: Optional[str] = None
    # Preview of quoted comment content (first 200 chars)
    quoted_content: Optional[str] = Field(default=None, max_length=250)
    # Media support
    media_urls: list[str] = Field(default_factory=list)
    # Stats
    like_count: int = Field(default=0)
    reply_count: int = Field(default=0)  # Legacy, not used in flat structure
    # Status
    status: ForumCommentStatus = ForumCommentStatus.ACTIVE
    # Timestamps
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "forum_comments"
        use_state_management = True


class ForumCommentLike(Document):
    """Track forum comment likes by users."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    comment_id: str
    user_id: str
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "forum_comment_likes"
        use_state_management = True


class ForumCommentCreate(BaseModel):
    """Schema for creating a forum comment."""
    content: str = Field(..., min_length=1, max_length=5000)
    media_urls: list[str] = Field(default_factory=list)


class ForumCommentReply(BaseModel):
    """Schema for replying to a comment."""
    content: str = Field(..., min_length=1, max_length=5000)
    media_urls: list[str] = Field(default_factory=list)


class ForumCommentUpdate(BaseModel):
    """Schema for updating a forum comment."""
    content: Optional[str] = Field(default=None, min_length=1, max_length=5000)


class ForumCommentPublic(BaseModel):
    """Public forum comment response schema."""
    id: str
    thread_id: str
    author_id: str
    author: ForumCommentAuthor
    content: str
    parent_id: Optional[str] = None
    depth: int = 0
    reply_to_user_id: Optional[str] = None
    reply_to_username: Optional[str] = None
    quoted_content: Optional[str] = None  # Preview of quoted comment
    media_urls: list[str] = Field(default_factory=list)
    like_count: int = 0
    reply_count: int = 0
    is_liked: bool = False
    status: ForumCommentStatus
    created_at: datetime
    # Removed nested replies - all comments are flat now


class ForumCommentsResponse(BaseModel):
    """Response for forum comments with pagination."""
    data: list[ForumCommentPublic]
    next_cursor: Optional[str] = None
    has_more: bool = False


# ============== REPORT ==============

class Report(Document):
    """Report document for content moderation."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    reporter_id: str
    target_type: ReportTargetType
    target_id: str  # ID of the reported content (thread, comment, or user)
    reason: str = Field(..., min_length=10, max_length=1000)
    status: ReportStatus = ReportStatus.PENDING
    # Resolution info
    moderator_id: Optional[str] = None
    moderator_note: Optional[str] = Field(default=None, max_length=500)
    resolved_at: Optional[datetime] = None
    # Timestamps
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "reports"
        use_state_management = True


class ReportCreate(BaseModel):
    """Schema for creating a report."""
    target_type: ReportTargetType
    target_id: str
    reason: str = Field(..., min_length=10, max_length=1000)


class ReportPublic(BaseModel):
    """Public report response schema."""
    id: str
    reporter_id: str
    reporter_username: Optional[str] = None
    target_type: ReportTargetType
    target_id: str
    target_preview: Optional[str] = None  # Preview of reported content
    thread_id: Optional[str] = None  # Thread ID for COMMENT reports (for navigation)
    reason: str
    status: ReportStatus
    moderator_id: Optional[str] = None
    moderator_note: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime


class ReportsResponse(BaseModel):
    """Response for report list."""
    data: list[ReportPublic]
    count: int
    pending_count: int = 0


class ReportAction(str, Enum):
    """Action to take when resolving a report."""
    IGNORE = "IGNORE"           # Dismiss - no action taken
    HIDE_CONTENT = "HIDE_CONTENT"     # Hide the reported content
    DELETE_CONTENT = "DELETE_CONTENT"  # Delete the reported content (soft delete)
    WARN_USER = "WARN_USER"       # Warn the content author


class ReportResolve(BaseModel):
    """Schema for resolving a report."""
    status: ReportStatus  # RESOLVED or DISMISSED
    action: Optional[ReportAction] = ReportAction.IGNORE  # Action to take
    moderator_note: Optional[str] = Field(default=None, max_length=500)


# ============== ADMIN STATS ==============

class AdminStats(BaseModel):
    """Admin dashboard statistics."""
    total_users: int = 0
    users_by_role: dict[str, int] = Field(default_factory=dict)
    total_categories: int = 0
    total_threads: int = 0
    total_forum_comments: int = 0
    pending_reports: int = 0
    # Recent activity
    new_users_today: int = 0
    new_threads_today: int = 0
    new_comments_today: int = 0
