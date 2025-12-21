"""Teams/LFG (Looking for Group) routes."""

import logging
from datetime import datetime, timezone
from typing import Optional

from beanie.operators import And, Or, GTE, LTE
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import CurrentUser
from app.models import (
    User,
    RankEnum,
    Team,
    TeamMember,
    TeamJoinRequest,
    JoinRequestStatus,
    GameMode,
    TeamCreate,
    TeamJoinRequestCreate,
    TeamOwnerInfo,
    TeamMemberInfo,
    TeamListItem,
    TeamDetail,
    TeamJoinRequestPublic,
    TeamsResponse,
    TeamJoinRequestsResponse,
    utc_now,
    ensure_utc,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/teams", tags=["teams"])


# ============== HELPER FUNCTIONS ==============

async def get_owner_info(user_id: str) -> Optional[TeamOwnerInfo]:
    """Get owner information for a team."""
    user = await User.get(user_id)
    if not user:
        return None
    return TeamOwnerInfo(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        rank=user.rank.value if user.rank else None,
        win_rate=user.win_rate,
    )


async def get_team_members_info(team_id: str) -> list[TeamMemberInfo]:
    """Get all members of a team with their user info."""
    members = await TeamMember.find(TeamMember.team_id == team_id).to_list()
    result = []
    for member in members:
        user = await User.get(member.user_id)
        if user:
            result.append(TeamMemberInfo(
                id=member.id,
                user_id=user.id,
                username=user.username,
                avatar_url=user.avatar_url,
                rank=user.rank.value if user.rank else None,
                main_role=user.main_role.value if user.main_role else None,
                win_rate=user.win_rate,
                joined_at=member.joined_at,
            ))
    return result


async def build_team_list_item(team: Team) -> TeamListItem:
    """Build TeamListItem from Team document."""
    owner = await get_owner_info(team.owner_id)
    return TeamListItem(
        id=team.id,
        name=team.name,
        description=team.description,
        owner=owner,
        rank=team.rank.value if team.rank else "BRONZE",
        game_mode=team.game_mode.value,
        max_members=team.max_members,
        current_members=team.current_members,
        created_at=team.created_at,
        expires_at=team.expires_at,
    )


# ============== ENDPOINTS ==============

@router.get("", response_model=TeamsResponse)
async def list_teams(
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    rank: Optional[RankEnum] = Query(None, description="Filter by owner rank"),
    game_mode: Optional[GameMode] = Query(None, description="Filter by game mode"),
):
    """
    List active teams with pagination and filters.
    Only shows teams that are not expired and not full.
    """
    now = utc_now()
    
    # Build query filters
    filters = [
        Team.is_active == True,
        Team.expires_at > now,  # Not expired
    ]
    
    if rank:
        filters.append(Team.rank == rank)
    if game_mode:
        filters.append(Team.game_mode == game_mode)
    
    # Get total count
    total = await Team.find(*filters).count()
    
    # Get paginated results
    skip = (page - 1) * page_size
    teams = await Team.find(*filters).sort(-Team.created_at).skip(skip).limit(page_size).to_list()
    
    # Build response items
    items = []
    for team in teams:
        item = await build_team_list_item(team)
        items.append(item)
    
    return TeamsResponse(
        data=items,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(skip + len(teams)) < total,
    )


@router.post("", response_model=TeamListItem)
async def create_team(
    team_data: TeamCreate,
    current_user: CurrentUser,
):
    """
    Create a new team. User becomes the owner.
    Only one active team per user allowed.
    """
    now = utc_now()
    
    # Check if user already has an active, non-expired team
    existing = await Team.find_one(And(
        Team.owner_id == current_user.id,
        Team.is_active == True,
        Team.expires_at > now,
    ))
    if existing:
        raise HTTPException(
            status_code=400,
            detail="You already have an active team. Please close it before creating a new one.",
        )
    
    # Create team with owner's rank
    team = Team(
        owner_id=current_user.id,
        name=team_data.name,
        description=team_data.description,
        rank=current_user.rank or RankEnum.BRONZE,
        game_mode=team_data.game_mode,
        max_members=team_data.max_members,
        current_members=1,
    )
    await team.insert()
    
    # Add owner as first member
    owner_member = TeamMember(
        team_id=team.id,
        user_id=current_user.id,
    )
    await owner_member.insert()
    
    logger.info(f"User {current_user.id} created team {team.id}")
    
    return await build_team_list_item(team)


@router.get("/my-team", response_model=Optional[TeamDetail])
async def get_my_team(current_user: CurrentUser):
    """
    Get current user's active team (if they own one).
    """
    now = utc_now()
    team = await Team.find_one(And(
        Team.owner_id == current_user.id,
        Team.is_active == True,
        Team.expires_at > now,
    ))
    
    if not team:
        return None
    
    owner = await get_owner_info(team.owner_id)
    members = await get_team_members_info(team.id)
    
    return TeamDetail(
        id=team.id,
        name=team.name,
        description=team.description,
        owner=owner,
        rank=team.rank.value if team.rank else "BRONZE",
        game_mode=team.game_mode.value,
        max_members=team.max_members,
        current_members=team.current_members,
        created_at=team.created_at,
        expires_at=team.expires_at,
        members=members,
        is_owner=True,
        has_requested=False,
    )


@router.get("/{team_id}", response_model=TeamDetail)
async def get_team_detail(
    team_id: str,
    current_user: CurrentUser,
):
    """
    Get detailed information about a team including members.
    """
    team = await Team.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    owner = await get_owner_info(team.owner_id)
    members = await get_team_members_info(team.id)
    
    # Check if current user has a pending request
    has_requested = False
    existing_request = await TeamJoinRequest.find_one(And(
        TeamJoinRequest.team_id == team_id,
        TeamJoinRequest.user_id == current_user.id,
        TeamJoinRequest.status == JoinRequestStatus.PENDING,
    ))
    if existing_request:
        has_requested = True
    
    # Check if current user is a member of this team
    is_member = any(m.user_id == current_user.id for m in members)
    
    return TeamDetail(
        id=team.id,
        name=team.name,
        description=team.description,
        owner=owner,
        rank=team.rank.value if team.rank else "BRONZE",
        game_mode=team.game_mode.value,
        max_members=team.max_members,
        current_members=team.current_members,
        created_at=team.created_at,
        expires_at=team.expires_at,
        members=members,
        is_owner=team.owner_id == current_user.id,
        is_member=is_member,
        has_requested=has_requested,
    )


@router.delete("/{team_id}")
async def delete_team(
    team_id: str,
    current_user: CurrentUser,
):
    """
    Delete/close a team. Only the owner can do this.
    """
    team = await Team.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the team owner can delete the team")
    
    # Mark team as inactive instead of deleting
    team.is_active = False
    team.updated_at = utc_now()
    await team.save()
    
    logger.info(f"User {current_user.id} closed team {team_id}")
    
    return {"message": "Team closed successfully"}


@router.post("/{team_id}/join")
async def request_join_team(
    team_id: str,
    request_data: TeamJoinRequestCreate,
    current_user: CurrentUser,
):
    """
    Request to join a team.
    """
    now = utc_now()
    team = await Team.get(team_id)
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if not team.is_active or ensure_utc(team.expires_at) < now:
        raise HTTPException(status_code=400, detail="Team is no longer active")
    
    if team.is_full:
        raise HTTPException(status_code=400, detail="Team is full")
    
    if team.owner_id == current_user.id:
        raise HTTPException(status_code=400, detail="You are the owner of this team")
    
    # Check if already a member
    existing_member = await TeamMember.find_one(And(
        TeamMember.team_id == team_id,
        TeamMember.user_id == current_user.id,
    ))
    if existing_member:
        raise HTTPException(status_code=400, detail="You are already a member of this team")
    
    # Check for existing pending request
    existing_request = await TeamJoinRequest.find_one(And(
        TeamJoinRequest.team_id == team_id,
        TeamJoinRequest.user_id == current_user.id,
        TeamJoinRequest.status == JoinRequestStatus.PENDING,
    ))
    if existing_request:
        raise HTTPException(status_code=400, detail="You already have a pending request for this team")
    
    # Create join request
    join_request = TeamJoinRequest(
        team_id=team_id,
        user_id=current_user.id,
        message=request_data.message,
    )
    await join_request.insert()
    
    # Notify team owner about the join request
    from app.services.rabbitmq import publish_event, NotificationRoutingKey
    await publish_event(
        routing_key=NotificationRoutingKey.TEAM_JOIN_REQUEST,
        payload={
            "actor_id": current_user.id,
            "user_id": team.owner_id,  # Notify the team owner
            "team_id": team_id,
        }
    )
    
    logger.info(f"User {current_user.id} requested to join team {team_id}")
    
    return {"message": "Join request sent successfully"}


@router.get("/{team_id}/requests", response_model=TeamJoinRequestsResponse)
async def get_team_requests(
    team_id: str,
    current_user: CurrentUser,
):
    """
    Get all pending join requests for a team. Owner only.
    """
    team = await Team.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the team owner can view requests")
    
    requests = await TeamJoinRequest.find(And(
        TeamJoinRequest.team_id == team_id,
        TeamJoinRequest.status == JoinRequestStatus.PENDING,
    )).sort(-TeamJoinRequest.created_at).to_list()
    
    items = []
    for req in requests:
        user = await get_owner_info(req.user_id)
        if user:
            items.append(TeamJoinRequestPublic(
                id=req.id,
                team_id=req.team_id,
                user=user,
                message=req.message,
                status=req.status.value,
                created_at=req.created_at,
            ))
    
    return TeamJoinRequestsResponse(data=items, count=len(items))


@router.post("/{team_id}/requests/{request_id}/approve")
async def approve_join_request(
    team_id: str,
    request_id: str,
    current_user: CurrentUser,
):
    """
    Approve a join request. Owner only.
    """
    team = await Team.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the team owner can approve requests")
    
    if team.is_full:
        raise HTTPException(status_code=400, detail="Team is full")
    
    join_request = await TeamJoinRequest.get(request_id)
    if not join_request or join_request.team_id != team_id:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if join_request.status != JoinRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request has already been processed")
    
    # Update request status
    join_request.status = JoinRequestStatus.APPROVED
    join_request.responded_at = utc_now()
    await join_request.save()
    
    # Add user as member
    new_member = TeamMember(
        team_id=team_id,
        user_id=join_request.user_id,
    )
    await new_member.insert()
    
    # Update team member count
    team.current_members += 1
    team.updated_at = utc_now()
    await team.save()
    
    # Notify the requester that they were approved
    from app.services.rabbitmq import publish_event, NotificationRoutingKey
    await publish_event(
        routing_key=NotificationRoutingKey.TEAM_REQUEST_APPROVED,
        payload={
            "actor_id": current_user.id,  # Team owner
            "user_id": join_request.user_id,  # Notify the requester
            "team_id": team_id,
        }
    )
    
    logger.info(f"User {join_request.user_id} approved to join team {team_id}")
    
    return {"message": "Request approved successfully"}


@router.post("/{team_id}/requests/{request_id}/reject")
async def reject_join_request(
    team_id: str,
    request_id: str,
    current_user: CurrentUser,
):
    """
    Reject a join request. Owner only.
    """
    team = await Team.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the team owner can reject requests")
    
    join_request = await TeamJoinRequest.get(request_id)
    if not join_request or join_request.team_id != team_id:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if join_request.status != JoinRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request has already been processed")
    
    # Update request status
    join_request.status = JoinRequestStatus.REJECTED
    join_request.responded_at = utc_now()
    await join_request.save()
    
    # Notify the requester that they were rejected
    from app.services.rabbitmq import publish_event, NotificationRoutingKey
    await publish_event(
        routing_key=NotificationRoutingKey.TEAM_REQUEST_REJECTED,
        payload={
            "actor_id": current_user.id,  # Team owner
            "user_id": join_request.user_id,  # Notify the requester
            "team_id": team_id,
        }
    )
    
    logger.info(f"User {join_request.user_id} rejected from team {team_id}")
    
    return {"message": "Request rejected"}


@router.delete("/{team_id}/members/{user_id}")
async def remove_member(
    team_id: str,
    user_id: str,
    current_user: CurrentUser,
):
    """
    Remove a member from the team. Owner only.
    """
    team = await Team.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the team owner can remove members")
    
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself. Use delete team instead.")
    
    member = await TeamMember.find_one(And(
        TeamMember.team_id == team_id,
        TeamMember.user_id == user_id,
    ))
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    await member.delete()
    
    # Update team member count
    team.current_members = max(1, team.current_members - 1)
    team.updated_at = utc_now()
    await team.save()
    
    logger.info(f"User {user_id} removed from team {team_id}")
    
    return {"message": "Member removed successfully"}


@router.post("/{team_id}/leave")
async def leave_team(
    team_id: str,
    current_user: CurrentUser,
):
    """
    Leave a team. The owner cannot leave (must delete team instead).
    """
    team = await Team.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.owner_id == current_user.id:
        raise HTTPException(status_code=400, detail="Owner cannot leave. Delete the team instead.")
    
    member = await TeamMember.find_one(And(
        TeamMember.team_id == team_id,
        TeamMember.user_id == current_user.id,
    ))
    if not member:
        raise HTTPException(status_code=400, detail="You are not a member of this team")
    
    await member.delete()
    
    # Update team member count
    team.current_members = max(1, team.current_members - 1)
    team.updated_at = utc_now()
    await team.save()
    
    logger.info(f"User {current_user.id} left team {team_id}")
    
    return {"message": "You have left the team"}
