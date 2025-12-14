"""User models and schemas."""
import uuid
from datetime import datetime
from typing import Optional

from beanie import Document, Indexed
from pydantic import BaseModel, EmailStr, Field

from .base import RankEnum, GameRoleEnum, UserRole


# Shared properties
class UserBase(BaseModel):
    email: Indexed(EmailStr, unique=True) = Field(..., max_length=255)  # type: ignore
    username: Indexed(str, unique=True) = Field(..., max_length=50)  # type: ignore
    is_active: bool = True
    is_superuser: bool = False
    full_name: Optional[str] = Field(default=None, max_length=255)
    
    # User role for RBAC
    role: UserRole = UserRole.USER

    # Game profile fields
    rank: Optional[RankEnum] = None
    main_role: Optional[GameRoleEnum] = None
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
    main_role: GameRoleEnum

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
    role: Optional[UserRole] = None
    rank: Optional[RankEnum] = None
    main_role: Optional[GameRoleEnum] = None
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
