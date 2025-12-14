"""Friendship models and schemas."""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field

from .base import RankEnum


class FriendshipStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


# Friendship model for MongoDB
class Friendship(Document):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    requester_id: str  # Người gửi lời mời
    addressee_id: str  # Người nhận lời mời
    status: FriendshipStatus = FriendshipStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "friendships"
        use_state_management = True


# Friendship request/response schemas
class FriendRequestResponse(BaseModel):
    accept: bool


class FriendshipPublic(BaseModel):
    id: str
    requester_id: str
    addressee_id: str
    status: FriendshipStatus
    created_at: datetime


class FriendPublic(BaseModel):
    id: str
    username: str
    avatar_url: Optional[str] = None
    rank: Optional[RankEnum] = None
    level: Optional[int] = None


class FriendsListPublic(BaseModel):
    data: list[FriendPublic]
    count: int


class FriendshipStatusResponse(BaseModel):
    """Response for friendship status check"""
    status: Optional[str] = None  # None, PENDING, ACCEPTED
    is_friend: bool = False
    friendship_id: Optional[str] = None
    is_requester: bool = False  # True if current user sent the request
