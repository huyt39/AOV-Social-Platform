"""Friendship routes for friend feature."""

import logging
from datetime import datetime
from typing import Any

from beanie.operators import Or, And
from fastapi import APIRouter, HTTPException

from app.api.deps import CurrentUser
from app.models import (
    Friendship,
    FriendshipStatus,
    FriendPublic,
    FriendRequestResponse,
    FriendshipPublic,
    FriendshipStatusResponse,
    FriendsListPublic,
    User,
    utc_now,
    Notification,
    NotificationType,
)
from app.services.redis_client import redis_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/friends", tags=["friends"])


@router.post("/request/{user_id}")
async def send_friend_request(
    user_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Send a friend request to another user.
    """
    # Can't friend yourself
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Không thể kết bạn với chính mình")

    # Check if target user exists
    target_user = await User.find_one(User.id == user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại")

    # Check if friendship already exists (in either direction)
    existing = await Friendship.find_one(
        Or(
            And(Friendship.requester_id == current_user.id, Friendship.addressee_id == user_id),
            And(Friendship.requester_id == user_id, Friendship.addressee_id == current_user.id),
        )
    )

    if existing:
        if existing.status == FriendshipStatus.ACCEPTED:
            raise HTTPException(status_code=400, detail="Đã là bạn bè")
        elif existing.status == FriendshipStatus.PENDING:
            if existing.requester_id == current_user.id:
                raise HTTPException(status_code=400, detail="Đã gửi lời mời kết bạn")
            else:
                # Auto-accept if the other person already sent a request
                existing.status = FriendshipStatus.ACCEPTED
                existing.updated_at = utc_now()
                await existing.save()
                return {
                    "success": True,
                    "message": "Đã chấp nhận lời mời kết bạn",
                    "friendship_id": existing.id,
                }
        elif existing.status == FriendshipStatus.REJECTED:
            # Allow re-sending after rejection
            existing.requester_id = current_user.id
            existing.addressee_id = user_id
            existing.status = FriendshipStatus.PENDING
            existing.updated_at = utc_now()
            await existing.save()
            return {
                "success": True,
                "message": "Đã gửi lại lời mời kết bạn",
                "friendship_id": existing.id,
            }

    # Create new friendship request
    friendship = Friendship(
        requester_id=current_user.id,
        addressee_id=user_id,
        status=FriendshipStatus.PENDING,
    )
    await friendship.insert()

    # Create notification for the addressee
    notification = Notification(
        user_id=user_id,
        actor_id=current_user.id,
        type=NotificationType.FRIEND_REQUEST,
        friendship_id=friendship.id,
        content=f"{current_user.username} đã gửi lời mời kết bạn",
    )
    await notification.insert()

    logger.info(f"Friend request sent: {current_user.username} -> {target_user.username}")

    return {
        "success": True,
        "message": "Đã gửi lời mời kết bạn",
        "friendship_id": friendship.id,
    }


@router.post("/respond/{friendship_id}")
async def respond_to_friend_request(
    friendship_id: str,
    response: FriendRequestResponse,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Accept or reject a friend request.
    """
    friendship = await Friendship.find_one(Friendship.id == friendship_id)
    
    if not friendship:
        raise HTTPException(status_code=404, detail="Lời mời không tồn tại")

    # Only the addressee can respond
    if friendship.addressee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Không có quyền phản hồi lời mời này")

    if friendship.status != FriendshipStatus.PENDING:
        raise HTTPException(status_code=400, detail="Lời mời đã được xử lý")

    friendship.status = FriendshipStatus.ACCEPTED if response.accept else FriendshipStatus.REJECTED
    friendship.updated_at = utc_now()
    await friendship.save()

    action = "chấp nhận" if response.accept else "từ chối"
    logger.info(f"Friend request {action}: {friendship_id}")

    return {
        "success": True,
        "message": f"Đã {action} lời mời kết bạn",
        "status": friendship.status.value,
    }


@router.get("")
async def get_friends_list(
    current_user: CurrentUser,
) -> FriendsListPublic:
    """
    Get list of friends for the current user.
    """
    # Find all accepted friendships
    friendships = await Friendship.find(
        Friendship.status == FriendshipStatus.ACCEPTED,
        Or(
            Friendship.requester_id == current_user.id,
            Friendship.addressee_id == current_user.id,
        ),
    ).to_list()

    # Get friend IDs (the other person in each friendship)
    friend_ids = []
    for f in friendships:
        if f.requester_id == current_user.id:
            friend_ids.append(f.addressee_id)
        else:
            friend_ids.append(f.requester_id)

    # Get friend user data
    friends_data = []
    for friend_id in friend_ids:
        user = await User.find_one(User.id == friend_id)
        if user:
            friends_data.append(FriendPublic(
                id=user.id,
                username=user.username,
                avatar_url=user.avatar_url,
                rank=user.rank,
                level=user.level,
            ))

    return FriendsListPublic(data=friends_data, count=len(friends_data))


@router.get("/pending")
async def get_pending_requests(
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Get pending friend requests (received by current user).
    """
    friendships = await Friendship.find(
        Friendship.addressee_id == current_user.id,
        Friendship.status == FriendshipStatus.PENDING,
    ).to_list()

    requests = []
    for f in friendships:
        requester = await User.find_one(User.id == f.requester_id)
        if requester:
            requests.append({
                "friendship_id": f.id,
                "requester": FriendPublic(
                    id=requester.id,
                    username=requester.username,
                    avatar_url=requester.avatar_url,
                    rank=requester.rank,
                    level=requester.level,
                ).model_dump(),
                "created_at": f.created_at.isoformat(),
            })

    return {
        "success": True,
        "data": requests,
        "count": len(requests),
    }


@router.get("/sent")
async def get_sent_requests(
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Get friend requests sent by current user (pending).
    """
    friendships = await Friendship.find(
        Friendship.requester_id == current_user.id,
        Friendship.status == FriendshipStatus.PENDING,
    ).to_list()

    requests = []
    for f in friendships:
        addressee = await User.find_one(User.id == f.addressee_id)
        if addressee:
            requests.append({
                "friendship_id": f.id,
                "addressee": FriendPublic(
                    id=addressee.id,
                    username=addressee.username,
                    avatar_url=addressee.avatar_url,
                    rank=addressee.rank,
                    level=addressee.level,
                ).model_dump(),
                "created_at": f.created_at.isoformat(),
            })

    return {
        "success": True,
        "data": requests,
        "count": len(requests),
    }


@router.delete("/{user_id}")
async def remove_friend(
    user_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Remove a friend or cancel a pending friend request.
    """
    friendship = await Friendship.find_one(
        Or(
            And(Friendship.requester_id == current_user.id, Friendship.addressee_id == user_id),
            And(Friendship.requester_id == user_id, Friendship.addressee_id == current_user.id),
        )
    )

    if not friendship:
        raise HTTPException(status_code=404, detail="Không tìm thấy mối quan hệ bạn bè")

    await friendship.delete()

    logger.info(f"Friendship removed: {current_user.id} <-> {user_id}")

    return {
        "success": True,
        "message": "Đã hủy kết bạn",
    }


@router.get("/count")
async def get_friend_count(
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Get the number of friends for the current user.
    """
    count = await Friendship.find(
        Friendship.status == FriendshipStatus.ACCEPTED,
        Or(
            Friendship.requester_id == current_user.id,
            Friendship.addressee_id == current_user.id,
        ),
    ).count()

    return {
        "success": True,
        "count": count,
    }


@router.get("/count/{user_id}")
async def get_user_friend_count(
    user_id: str,
) -> dict[str, Any]:
    """
    Get the number of friends for a specific user (public).
    """
    count = await Friendship.find(
        Friendship.status == FriendshipStatus.ACCEPTED,
        Or(
            Friendship.requester_id == user_id,
            Friendship.addressee_id == user_id,
        ),
    ).count()

    return {
        "success": True,
        "count": count,
    }


@router.get("/online")
async def get_online_friends(
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Get list of all friends sorted by online status and last activity.
    Online friends are shown first, then sorted by last_active_at (most recent first).
    """
    # Find all accepted friendships
    friendships = await Friendship.find(
        Friendship.status == FriendshipStatus.ACCEPTED,
        Or(
            Friendship.requester_id == current_user.id,
            Friendship.addressee_id == current_user.id,
        ),
    ).to_list()

    # Get friend IDs
    friend_ids = []
    for f in friendships:
        if f.requester_id == current_user.id:
            friend_ids.append(f.addressee_id)
        else:
            friend_ids.append(f.requester_id)

    # Get all friends with their online status
    all_friends = []
    for friend_id in friend_ids:
        try:
            user = await User.find_one(User.id == friend_id)
            if user:
                is_online = await redis_service.is_user_online(friend_id)
                all_friends.append({
                    "id": user.id,
                    "username": user.username,
                    "avatar_url": user.avatar_url,
                    "rank": user.rank.value if user.rank else None,
                    "level": user.level,
                    "is_online": is_online,
                    "last_active_at": user.last_active_at.isoformat() if user.last_active_at else None,
                })
        except Exception as e:
            logger.warning(f"Failed to get friend data for {friend_id}: {e}")
            continue

    # Sort: online users first, then by last_active_at (most recent first)
    def sort_key(friend):
        # Online users get priority (0 = online, 1 = offline)
        online_priority = 0 if friend["is_online"] else 1
        # For last_active_at, use datetime.min if None (put users with no activity last)
        last_active = friend["last_active_at"] or ""
        # Negate for descending order (most recent first)
        return (online_priority, last_active == "", last_active)
    
    # Sort with online first, then by last_active_at descending
    all_friends.sort(key=lambda f: (
        0 if f["is_online"] else 1,
        f["last_active_at"] is None,
        -(datetime.fromisoformat(f["last_active_at"]).timestamp() if f["last_active_at"] else 0)
    ))

    return {
        "success": True,
        "data": all_friends,
        "count": len(all_friends),
    }


@router.get("/status/{user_id}")
async def get_friendship_status(
    user_id: str,
    current_user: CurrentUser,
) -> FriendshipStatusResponse:
    """
    Check friendship status between current user and another user.
    Returns status (None, PENDING, ACCEPTED) and who sent the request.
    """
    if user_id == current_user.id:
        return FriendshipStatusResponse(
            status=None,
            is_friend=False,
            friendship_id=None,
            is_requester=False,
        )

    friendship = await Friendship.find_one(
        Or(
            And(Friendship.requester_id == current_user.id, Friendship.addressee_id == user_id),
            And(Friendship.requester_id == user_id, Friendship.addressee_id == current_user.id),
        )
    )

    if not friendship:
        return FriendshipStatusResponse(
            status=None,
            is_friend=False,
            friendship_id=None,
            is_requester=False,
        )

    return FriendshipStatusResponse(
        status=friendship.status.value,
        is_friend=friendship.status == FriendshipStatus.ACCEPTED,
        friendship_id=friendship.id,
        is_requester=friendship.requester_id == current_user.id,
    )


@router.get("/suggestions")
async def get_friend_suggestions(
    current_user: CurrentUser,
    limit: int = 10,
) -> dict[str, Any]:
    """
    Get AI-powered friend suggestions for the current user.
    
    Uses hybrid recommendation algorithm combining:
    - Collaborative Filtering (45%): Mutual friends via Adamic-Adar Index
    - Content-Based Filtering (35%): Similar post likes
    - Rank Proximity (20%): Similar game ranks
    
    Query Parameters:
    - limit: Number of suggestions to return (default 10, max 50)
    
    Returns:
    - List of suggested users with scores, sorted by relevance
    """
    from app.services.recommendation_service import get_friend_suggestions as get_suggestions
    
    # Validate limit
    limit = max(1, min(limit, 50))
    
    try:
        suggestions = await get_suggestions(current_user.id, limit=limit)
        
        logger.info(f"Returned {len(suggestions)} friend suggestions for user {current_user.id}")
        
        return {
            "success": True,
            "data": suggestions,
            "count": len(suggestions),
        }
    except Exception as e:
        logger.error(f"Failed to get friend suggestions for {current_user.id}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Không thể lấy gợi ý kết bạn. Vui lòng thử lại sau."
        )
