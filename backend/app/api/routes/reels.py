"""Reels routes for short-form video content."""
import logging
import random
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser
from app.models import (
    Reel,
    ReelView,
    ReelLike,
    ReelCreateRequest,
    ReelPublic,
    ReelViewRequest,
    ReelFeedResponse,
    User,
    Video,
    VideoStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reels", tags=["reels"])

# Sample AOV gameplay videos to show when no user reels exist
SAMPLE_REELS = [
    {
        "id": "sample-reel-1",
        "user_id": "system",
        "username": "AOV Official",
        "video_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/256844940/movie480_vp9.webm",
        "thumbnail_url": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1649080/capsule_616x353.jpg",
        "duration": 30,
        "caption": "Highlight gameplay AOV - Chiến thuật đội hình hoàn hảo! 🎮⚔️",
        "music_name": "Epic Battle Theme",
        "music_artist": "AOV OST",
        "views_count": 12500,
        "likes_count": 850,
        "comments_count": 45,
        "shares_count": 23,
    },
    {
        "id": "sample-reel-2",
        "user_id": "system",
        "username": "ProGamer",
        "video_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/256844941/movie480_vp9.webm",
        "thumbnail_url": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1649080/ss_56b22fbb5c4baf71cbf4a1a3699f3d1a3e35cd76.1920x1080.jpg",
        "duration": 25,
        "caption": "Combo skill siêu đỉnh! Bạn đã thử chưa? 🔥💪",
        "music_name": "Victory March",
        "music_artist": "AOV",
        "views_count": 8900,
        "likes_count": 620,
        "comments_count": 32,
        "shares_count": 15,
    },
    {
        "id": "sample-reel-3",
        "user_id": "system",
        "username": "MasterRank",
        "video_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/256844942/movie480_vp9.webm",
        "thumbnail_url": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1649080/ss_93bf87e6d0e20ff0c0b11e9a4c12e62d8c1b7949.1920x1080.jpg",
        "duration": 35,
        "caption": "Hướng dẫn Farm nhanh lên cấp cho tân thủ 📈✨",
        "music_name": "Power Up",
        "music_artist": "Game Music",
        "views_count": 15200,
        "likes_count": 1100,
        "comments_count": 67,
        "shares_count": 38,
    },
]



@router.post("", response_model=ReelPublic)
async def create_reel(
    reel_data: ReelCreateRequest,
    current_user: CurrentUser,
) -> Any:
    """
    Create a new reel from an uploaded video.
    """
    # Verify video exists and belongs to user
    video = await Video.find_one(Video.id == reel_data.video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    if video.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to use this video")
    
    if video.status != VideoStatus.READY:
        raise HTTPException(status_code=400, detail="Video is not ready yet")
    
    # Create reel
    reel = Reel(
        user_id=current_user.id,
        video_id=reel_data.video_id,
        caption=reel_data.caption,
        music_name=reel_data.music_name,
        music_artist=reel_data.music_artist,
        video_url=video.play_url or "",
        thumbnail_url=video.thumbnail_url or "",
        duration=video.duration or 0,
    )
    
    await reel.insert()
    
    logger.info(f"Reel created: {reel.id} by user {current_user.id}")
    
    return ReelPublic(
        id=reel.id,
        user_id=reel.user_id,
        username=current_user.username,
        user_avatar=None,
        video_url=reel.video_url,
        thumbnail_url=reel.thumbnail_url,
        duration=reel.duration,
        caption=reel.caption,
        music_name=reel.music_name,
        music_artist=reel.music_artist,
        views_count=reel.views_count,
        likes_count=reel.likes_count,
        comments_count=reel.comments_count,
        shares_count=reel.shares_count,
        is_liked=False,
        created_at=reel.created_at,
    )


@router.get("/feed", response_model=ReelFeedResponse)
async def get_reel_feed(
    current_user: CurrentUser,
    limit: int = Query(default=10, le=50),
) -> Any:
    """
    Get random reels feed, excluding already viewed reels.
    Returns reels that user hasn't seen yet.
    """
    # Get IDs of reels already viewed by user
    viewed_reels = await ReelView.find(
        ReelView.user_id == current_user.id
    ).to_list()
    viewed_reel_ids = [view.reel_id for view in viewed_reels]
    
    logger.info(f"User {current_user.id} has viewed {len(viewed_reel_ids)} reels")
    
    # Query for reels not yet viewed
    query = Reel.find(Reel.is_active == True)
    if viewed_reel_ids:
        query = query.find(Reel.id.nin(viewed_reel_ids))  # type: ignore
    
    all_unviewed_reels = await query.to_list()
    
    # If no unviewed reels, resample from all reels (loop back)
    if not all_unviewed_reels:
        logger.info(f"User {current_user.id} has viewed all reels, resampling from all reels")
        all_unviewed_reels = await Reel.find(Reel.is_active == True).to_list()
        
        # If still no reels at all, return sample videos
        if not all_unviewed_reels:
            logger.info(f"No reels available in the system, returning sample videos")
            sample_reel_publics = [
                ReelPublic(
                    id=sample["id"],
                    user_id=sample["user_id"],
                    username=sample["username"],
                    user_avatar=None,
                    video_url=sample["video_url"],
                    thumbnail_url=sample["thumbnail_url"],
                    duration=sample["duration"],
                    caption=sample["caption"],
                    music_name=sample["music_name"],
                    music_artist=sample["music_artist"],
                    views_count=sample["views_count"],
                    likes_count=sample["likes_count"],
                    comments_count=sample["comments_count"],
                    shares_count=sample["shares_count"],
                    is_liked=False,
                    created_at=datetime.utcnow(),
                )
                for sample in SAMPLE_REELS
            ]
            return ReelFeedResponse(
                reels=sample_reel_publics,
                has_more=False,
            )
    
    # Randomize and limit
    random.shuffle(all_unviewed_reels)
    reels_to_return = all_unviewed_reels[:limit]
    
    # Get user info for each reel
    user_ids = list(set(reel.user_id for reel in reels_to_return))
    users_query = {"_id": {"$in": user_ids}}
    users = await User.find(users_query).to_list()
    user_map = {user.id: user for user in users}
    
    # Get like status for current user
    reel_ids = [reel.id for reel in reels_to_return]
    likes_query = {
        "user_id": current_user.id,
        "reel_id": {"$in": reel_ids}
    }
    user_likes = await ReelLike.find(likes_query).to_list()
    liked_reel_ids = {like.reel_id for like in user_likes}
    
    # Build response
    reel_publics = []
    for reel in reels_to_return:
        user = user_map.get(reel.user_id)
        reel_publics.append(
            ReelPublic(
                id=reel.id,
                user_id=reel.user_id,
                username=user.username if user else "Unknown",
                user_avatar=None,
                video_url=reel.video_url,
                thumbnail_url=reel.thumbnail_url,
                duration=reel.duration,
                caption=reel.caption,
                music_name=reel.music_name,
                music_artist=reel.music_artist,
                views_count=reel.views_count,
                likes_count=reel.likes_count,
                comments_count=reel.comments_count,
                shares_count=reel.shares_count,
                is_liked=reel.id in liked_reel_ids,
                created_at=reel.created_at,
            )
        )
    
    has_more = len(all_unviewed_reels) > limit
    
    logger.info(f"Returning {len(reel_publics)} reels to user {current_user.id}, has_more={has_more}")
    
    return ReelFeedResponse(
        reels=reel_publics,
        has_more=has_more,
    )


@router.post("/{reel_id}/view")
async def mark_reel_viewed(
    reel_id: str,
    view_data: ReelViewRequest,
    current_user: CurrentUser,
) -> Any:
    """
    Mark a reel as viewed by the current user.
    """
    # Check if reel exists
    reel = await Reel.find_one(Reel.id == reel_id)
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    
    # Check if already viewed
    existing_view = await ReelView.find_one(
        ReelView.user_id == current_user.id,
        ReelView.reel_id == reel_id,
    )
    
    if existing_view:
        # Update existing view
        existing_view.watched_duration = view_data.watched_duration
        existing_view.completed = view_data.completed
        await existing_view.save()
    else:
        # Create new view record
        view = ReelView(
            user_id=current_user.id,
            reel_id=reel_id,
            watched_duration=view_data.watched_duration,
            completed=view_data.completed,
        )
        await view.insert()
        
        # Increment views count
        reel.views_count += 1
        await reel.save()
    
    return {"success": True, "message": "Reel marked as viewed"}


@router.post("/{reel_id}/like")
async def like_reel(
    reel_id: str,
    current_user: CurrentUser,
) -> Any:
    """
    Like or unlike a reel.
    """
    # Check if reel exists
    reel = await Reel.find_one(Reel.id == reel_id)
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    
    # Check if already liked
    existing_like = await ReelLike.find_one(
        ReelLike.user_id == current_user.id,
        ReelLike.reel_id == reel_id,
    )
    
    if existing_like:
        # Unlike - remove like
        await existing_like.delete()
        reel.likes_count = max(0, reel.likes_count - 1)
        await reel.save()
        return {"success": True, "liked": False, "likes_count": reel.likes_count}
    else:
        # Like - add like
        like = ReelLike(
            user_id=current_user.id,
            reel_id=reel_id,
        )
        await like.insert()
        
        reel.likes_count += 1
        await reel.save()
        return {"success": True, "liked": True, "likes_count": reel.likes_count}


@router.post("/reset-views")
async def reset_viewed_reels(
    current_user: CurrentUser,
) -> Any:
    """
    Reset all viewed reels for current user (allow watching from beginning).
    """
    # Delete all view records for this user
    views = await ReelView.find(ReelView.user_id == current_user.id).to_list()
    
    for view in views:
        await view.delete()
    
    logger.info(f"Reset {len(views)} viewed reels for user {current_user.id}")
    
    return {
        "success": True,
        "message": f"Đã reset {len(views)} reels đã xem",
        "reset_count": len(views),
    }


@router.get("/{reel_id}", response_model=ReelPublic)
async def get_reel(
    reel_id: str,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific reel by ID.
    """
    reel = await Reel.find_one(Reel.id == reel_id)
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    
    # Get user info
    user = await User.find_one(User.id == reel.user_id)
    
    # Check if liked by current user
    like = await ReelLike.find_one(
        ReelLike.user_id == current_user.id,
        ReelLike.reel_id == reel_id,
    )
    
    return ReelPublic(
        id=reel.id,
        user_id=reel.user_id,
        username=user.username if user else "Unknown",
        user_avatar=None,
        video_url=reel.video_url,
        thumbnail_url=reel.thumbnail_url,
        duration=reel.duration,
        caption=reel.caption,
        music_name=reel.music_name,
        music_artist=reel.music_artist,
        views_count=reel.views_count,
        likes_count=reel.likes_count,
        comments_count=reel.comments_count,
        shares_count=reel.shares_count,
        is_liked=like is not None,
        created_at=reel.created_at,
    )


@router.delete("/{reel_id}")
async def delete_reel(
    reel_id: str,
    current_user: CurrentUser,
) -> Any:
    """
    Delete a reel (only owner can delete).
    """
    reel = await Reel.find_one(Reel.id == reel_id)
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    
    if reel.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this reel")
    
    await reel.delete()
    
    logger.info(f"Reel deleted: {reel_id} by user {current_user.id}")
    
    return {"success": True, "message": "Reel deleted successfully"}

