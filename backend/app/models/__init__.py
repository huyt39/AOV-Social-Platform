"""
Models package for AOV Social Platform.

This package contains all database models and schemas organized by domain:
- base: Common enums, tokens, and shared types
- user: User models and authentication schemas
- item: Item models (legacy)
- friendship: Friendship/friend request models
- post: Post and feed models
- comment: Comment models
- forum: Forum category, thread, and comment models (for forum feature)
"""

# Base types and enums
from .base import (
    RankEnum,
    GameRoleEnum,
    UserRole,
    Message,
    Token,
    TokenPayload,
    NewPassword,
)

# For backward compatibility, expose RoleEnum as alias to GameRoleEnum
RoleEnum = GameRoleEnum

# User models
from .user import (
    UserBase,
    UserCreate,
    UserRegister,
    ArenaUserRegister,
    ProfileVerificationData,
    UserUpdate,
    UserUpdateMe,
    UpdatePassword,
    User,
    UserPublic,
    UsersPublic,
)

# Item models
from .item import (
    ItemBase,
    ItemCreate,
    ItemUpdate,
    Item,
    ItemPublic,
    ItemsPublic,
)

# Friendship models
from .friendship import (
    FriendshipStatus,
    Friendship,
    FriendRequestResponse,
    FriendshipPublic,
    FriendPublic,
    FriendsListPublic,
    FriendshipStatusResponse,
)

# Post models
from .post import (
    MediaType,
    MediaItem,
    Post,
    PostLike,
    PostCreate,
    PostUpdate,
    PostAuthor,
    SharedPostInfo,
    PostPublic,
    FeedResponse,
    UserPostsResponse,
)

# Comment models
from .comment import (
    Comment,
    CommentLike,
    CommentCreate,
    CommentAuthor,
    CommentPublic,
    CommentsResponse,
)

# Forum models
from .forum import (
    # Enums
    ThreadStatus,
    ForumCommentStatus,
    ReportTargetType,
    ReportStatus,
    # Category
    ForumCategory,
    ForumCategoryCreate,
    ForumCategoryUpdate,
    ForumCategoryPublic,
    ForumCategoriesResponse,
    # Thread
    ForumThreadAuthor,
    ForumThread,
    ForumThreadLike,
    ForumThreadCreate,
    ForumThreadUpdate,
    ForumThreadPublic,
    ForumThreadListItem,
    ForumThreadsResponse,
    # Comment
    ForumCommentAuthor,
    ForumComment,
    ForumCommentLike,
    ForumCommentCreate,
    ForumCommentReply,
    ForumCommentUpdate,
    ForumCommentPublic,
    ForumCommentsResponse,
    # Report
    Report,
    ReportCreate,
    ReportPublic,
    ReportsResponse,
    ReportResolve,
    # Admin
    AdminStats,
)

# Video models
from .video import (
    VideoStatus,
    Video,
    VideoUploadRequest,
    VideoUploadResponse,
    VideoCompleteRequest,
    VideoProcessedRequest,
    VideoPublic,
)

# Reel models
from .reel import (
    Reel,
    ReelView,
    ReelLike,
    ReelCreateRequest,
    ReelPublic,
    ReelViewRequest,
    ReelFeedResponse,
)

# Notification models
from .notification import (
    NotificationType,
    Notification,
    NotificationActor,
    NotificationPublic,
    NotificationsResponse,
    UnreadCountResponse,
)

# Conversation/Messaging models
from .conversation import (
    ConversationType,
    ParticipantRole,
    MessageType,
    MessageStatus,
    MediaAttachment,
    Conversation,
    ConversationParticipant,
    Message,
    ConversationCreate,
    MessageCreate,
    ParticipantInfo,
    MessagePublic,
    ConversationPublic,
    ConversationListItem,
    MessagesResponse,
    ConversationsResponse,
)

# Define __all__ for explicit exports
__all__ = [
    # Base
    "RankEnum",
    "GameRoleEnum", 
    "RoleEnum",
    "UserRole",
    "Message",
    "Token",
    "TokenPayload",
    "NewPassword",
    # User
    "UserBase",
    "UserCreate",
    "UserRegister",
    "ArenaUserRegister",
    "ProfileVerificationData",
    "UserUpdate",
    "UserUpdateMe",
    "UpdatePassword",
    "User",
    "UserPublic",
    "UsersPublic",
    # Item
    "ItemBase",
    "ItemCreate",
    "ItemUpdate",
    "Item",
    "ItemPublic",
    "ItemsPublic",
    # Friendship
    "FriendshipStatus",
    "Friendship",
    "FriendRequestResponse",
    "FriendshipPublic",
    "FriendPublic",
    "FriendsListPublic",
    "FriendshipStatusResponse",
    # Post
    "MediaType",
    "MediaItem",
    "Post",
    "PostLike",
    "PostCreate",
    "PostUpdate",
    "PostAuthor",
    "SharedPostInfo",
    "PostPublic",
    "FeedResponse",
    "UserPostsResponse",
    # Comment
    "Comment",
    "CommentLike",
    "CommentCreate",
    "CommentAuthor",
    "CommentPublic",
    "CommentsResponse",
    # Forum
    "ThreadStatus",
    "ForumCommentStatus",
    "ReportTargetType",
    "ReportStatus",
    "ForumCategory",
    "ForumCategoryCreate",
    "ForumCategoryUpdate",
    "ForumCategoryPublic",
    "ForumCategoriesResponse",
    "ForumThreadAuthor",
    "ForumThread",
    "ForumThreadLike",
    "ForumThreadCreate",
    "ForumThreadUpdate",
    "ForumThreadPublic",
    "ForumThreadListItem",
    "ForumThreadsResponse",
    "ForumCommentAuthor",
    "ForumComment",
    "ForumCommentLike",
    "ForumCommentCreate",
    "ForumCommentReply",
    "ForumCommentUpdate",
    "ForumCommentPublic",
    "ForumCommentsResponse",
    "Report",
    "ReportCreate",
    "ReportPublic",
    "ReportsResponse",
    "ReportResolve",
    "AdminStats",
    # Video
    "VideoStatus",
    "Video",
    "VideoUploadRequest",
    "VideoUploadResponse",
    "VideoCompleteRequest",
    "VideoProcessedRequest",
    "VideoPublic",
    # Reel
    "Reel",
    "ReelView",
    "ReelLike",
    "ReelCreateRequest",
    "ReelPublic",
    "ReelViewRequest",
    "ReelFeedResponse",
    # Notification
    "NotificationType",
    "Notification",
    "NotificationActor",
    "NotificationPublic",
    "NotificationsResponse",
    "UnreadCountResponse",
    # Conversation/Messaging
    "ConversationType",
    "ParticipantRole",
    "MessageType",
    "MessageStatus",
    "MediaAttachment",
    "Conversation",
    "ConversationParticipant",
    "Message",
    "ConversationCreate",
    "MessageCreate",
    "ParticipantInfo",
    "MessagePublic",
    "ConversationPublic",
    "ConversationListItem",
    "MessagesResponse",
    "ConversationsResponse",
]
