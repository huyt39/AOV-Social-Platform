"""Base models and shared types."""
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


class GameRoleEnum(str, Enum):
    """Game position/role enum (renamed from RoleEnum to avoid confusion with UserRole)."""
    TOP = "TOP"
    JUNGLE = "JUNGLE"
    MID = "MID"
    AD = "AD"
    SUPPORT = "SUPPORT"


class UserRole(str, Enum):
    """User permission roles for RBAC."""
    GUEST = "GUEST"
    USER = "USER"
    MODERATOR = "MODERATOR"
    ADMIN = "ADMIN"


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
