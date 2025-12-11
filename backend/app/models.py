import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document, Indexed, Link
from pydantic import BaseModel, EmailStr, Field


# Game Enums
class RankEnum(str, Enum):
    BRONZE = "BRONZE"
    SILVER = "SILVER"
    GOLD = "GOLD"
    PLATINUM = "PLATINUM"
    DIAMOND = "DIAMOND"
    VETERAN = "VETERAN"
    MASTER = "MASTER"
    CONQUEROR = "CONQUEROR"


class RoleEnum(str, Enum):
    TOP = "TOP"
    JUNGLE = "JUNGLE"
    MID = "MID"
    AD = "AD"
    SUPPORT = "SUPPORT"


class FriendshipStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


# Shared properties
class UserBase(BaseModel):
    email: Indexed(EmailStr, unique=True) = Field(..., max_length=255)  # type: ignore
    username: Indexed(str, unique=True) = Field(..., max_length=50)  # type: ignore
    is_active: bool = True
    is_superuser: bool = False
    full_name: Optional[str] = Field(default=None, max_length=255)

    # Game profile fields
    rank: Optional[RankEnum] = None
    main_role: Optional[RoleEnum] = None
    level: Optional[int] = None
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    profile_screenshot_url: Optional[str] = Field(default=None, max_length=500)
    profile_verified: bool = False
    profile_verified_at: Optional[datetime] = None

    # Stats
    win_rate: Optional[float] = None
    total_matches: Optional[int] = None
    credibility_score: Optional[int] = None


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=40)


class UserRegister(BaseModel):
    email: EmailStr = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=40)
    full_name: Optional[str] = Field(default=None, max_length=255)


# Arena User Registration (for game platform)
class ArenaUserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=40)
    main_role: RoleEnum

    # From verified profile
    rank: RankEnum
    level: int
    win_rate: float
    total_matches: int
    credibility_score: int
    profile_screenshot_url: str


# Profile Verification Response
class ProfileVerificationData(BaseModel):
    level: int
    rank: str
    total_matches: int
    win_rate: float
    credibility_score: int
    verified_at: str
    screenshot_url: str


# Properties to receive via API on update, all are optional
class UserUpdate(BaseModel):
    email: Optional[EmailStr] = Field(default=None, max_length=255)
    username: Optional[str] = Field(default=None, max_length=50)
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None
    full_name: Optional[str] = Field(default=None, max_length=255)
    rank: Optional[RankEnum] = None
    main_role: Optional[RoleEnum] = None
    level: Optional[int] = None
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    profile_screenshot_url: Optional[str] = Field(default=None, max_length=500)
    profile_verified: Optional[bool] = None
    profile_verified_at: Optional[datetime] = None
    win_rate: Optional[float] = None
    total_matches: Optional[int] = None
    credibility_score: Optional[int] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=40)


class UserUpdateMe(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[EmailStr] = Field(default=None, max_length=255)


class UpdatePassword(BaseModel):
    current_password: str = Field(..., min_length=8, max_length=40)
    new_password: str = Field(..., min_length=8, max_length=40)


# Database model for MongoDB
class User(Document, UserBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    hashed_password: str

    class Settings:
        name = "users"  # MongoDB collection name
        use_state_management = True


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: str


class UsersPublic(BaseModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=255)


# Database model for MongoDB
class Item(Document, ItemBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    owner_id: str
    owner: Optional[Link[User]] = None

    class Settings:
        name = "items"  # MongoDB collection name
        use_state_management = True


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: str
    owner_id: str


class ItemsPublic(BaseModel):
    data: list[ItemPublic]
    count: int


# Generic message
class Message(BaseModel):
    message: str


# JSON payload containing access token
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(BaseModel):
    sub: Optional[str] = None


class NewPassword(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=40)


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
