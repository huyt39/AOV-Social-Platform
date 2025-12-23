"""Team models and schemas for the LFG (Looking for Group) feature."""
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional, List

from beanie import Document, Indexed
from pydantic import BaseModel, Field, field_serializer

from .base import RankEnum, GameRoleEnum, utc_now


# ============== ENUMS ==============

class GameMode(str, Enum):
    """Game mode for team matching."""
    RANKED = "RANKED"
    CASUAL = "CASUAL"
    CUSTOM = "CUSTOM"


class JoinRequestStatus(str, Enum):
    """Status of a team join request."""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


# ============== DOCUMENTS ==============

class Team(Document):
    """Team/Room document for LFG feature."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    owner_id: Indexed(str)  # type: ignore
    name: str = Field(..., max_length=100)
    description: str = Field(..., max_length=500)
    rank: RankEnum  # Based on owner's rank
    game_mode: GameMode = GameMode.RANKED
    max_members: int = Field(default=5, ge=2, le=5)
    current_members: int = Field(default=1, ge=1)  # Includes owner
    is_active: bool = True
    conversation_id: Optional[str] = None  # Group chat conversation for team members
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime = Field(default_factory=lambda: utc_now() + timedelta(hours=1))

    class Settings:
        name = "teams"
        use_state_management = True

    @property
    def is_expired(self) -> bool:
        """Check if team has expired."""
        return utc_now() > self.expires_at

    @property
    def is_full(self) -> bool:
        """Check if team is at max capacity."""
        return self.current_members >= self.max_members


class TeamMember(Document):
    """Team membership document."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    team_id: Indexed(str)  # type: ignore
    user_id: Indexed(str)  # type: ignore
    joined_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "team_members"
        use_state_management = True


class TeamJoinRequest(Document):
    """Join request for a team."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    team_id: Indexed(str)  # type: ignore
    user_id: Indexed(str)  # type: ignore
    message: Optional[str] = Field(default=None, max_length=200)
    status: JoinRequestStatus = JoinRequestStatus.PENDING
    created_at: datetime = Field(default_factory=utc_now)
    responded_at: Optional[datetime] = None

    class Settings:
        name = "team_join_requests"
        use_state_management = True


# ============== SCHEMAS ==============

# Team owner/member info for responses
class TeamOwnerInfo(BaseModel):
    """Team owner information for API responses."""
    id: str
    username: str
    avatar_url: Optional[str] = None
    rank: Optional[str] = None
    win_rate: Optional[float] = None


class TeamMemberInfo(BaseModel):
    """Team member information for API responses."""
    id: str
    user_id: str
    username: str
    avatar_url: Optional[str] = None
    rank: Optional[str] = None
    main_role: Optional[str] = None
    win_rate: Optional[float] = None
    joined_at: datetime
    
    @field_serializer('joined_at')
    @classmethod
    def serialize_datetime(cls, dt: datetime) -> str:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()


# Request schemas
class TeamCreate(BaseModel):
    """Schema for creating a new team."""
    name: str = Field(..., min_length=3, max_length=100)
    description: str = Field(..., min_length=10, max_length=500)
    game_mode: GameMode = GameMode.RANKED
    max_members: int = Field(default=5, ge=2, le=5)


class TeamJoinRequestCreate(BaseModel):
    """Schema for creating a join request."""
    message: Optional[str] = Field(default=None, max_length=200)


# Response schemas
class TeamListItem(BaseModel):
    """Team item for list responses."""
    id: str
    name: str
    description: str
    owner: TeamOwnerInfo
    rank: str
    game_mode: str
    max_members: int
    current_members: int
    created_at: datetime
    expires_at: datetime
    
    @field_serializer('created_at', 'expires_at')
    @classmethod
    def serialize_datetime(cls, dt: datetime) -> str:
        """Ensure datetimes are serialized with UTC timezone.
        
        MongoDB stores datetimes as naive UTC, so we need to explicitly
        add the timezone info for proper JavaScript parsing.
        """
        if dt.tzinfo is None:
            # Assume naive datetime is UTC
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()


class TeamDetail(TeamListItem):
    """Full team details with members."""
    members: List[TeamMemberInfo] = []
    is_owner: bool = False
    is_member: bool = False  # True if current user is a member (including owner)
    has_requested: bool = False
    conversation_id: Optional[str] = None  # Group chat conversation ID


class TeamJoinRequestPublic(BaseModel):
    """Join request for API responses."""
    id: str
    team_id: str
    user: TeamOwnerInfo
    message: Optional[str]
    status: str
    created_at: datetime
    
    @field_serializer('created_at')
    @classmethod
    def serialize_datetime(cls, dt: datetime) -> str:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()


class TeamsResponse(BaseModel):
    """Paginated teams list response."""
    data: List[TeamListItem]
    total: int
    page: int
    page_size: int
    has_more: bool


class TeamJoinRequestsResponse(BaseModel):
    """Join requests list response."""
    data: List[TeamJoinRequestPublic]
    count: int
