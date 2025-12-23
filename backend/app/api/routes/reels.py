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
    ReelComment,
    ReelCommentLike,
    ReelCommentCreate,
    ReelCommentAuthor,
    ReelCommentPublic,
    ReelCommentsResponse,
    User,
    Video,
    VideoStatus,
)
from app.services.clawcloud_s3 import clawcloud_s3
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reels", tags=["reels"])





@router.post("", response_model=ReelPublic)
async def create_reel(
    reel_data: ReelCreateRequest,
    current_user: CurrentUser,
) -> Any:
    """
    Create a new reel from an uploaded video.
    
    Allows creating reels with videos that are still PROCESSING.
    Raw video URL is used as fallback until processing completes.
    """
    # Verify video exists and belongs to user
    video = await Video.find_one(Video.id == reel_data.video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    if video.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to use this video")
    
    # Allow PROCESSING or READY status
    if video.status not in [VideoStatus.PROCESSING, VideoStatus.READY]:
        raise HTTPException(status_code=400, detail="Video is not ready yet")
    
    # Determine URLs based on video status
    video_processed = video.status == VideoStatus.READY
    if video_processed:
        video_url = video.play_url or ""
        video_raw_url = None
        thumbnail_url = video.thumbnail_url or ""
    else:
        # Video is still processing - use raw URL
        video_raw_url = clawcloud_s3.get_public_url(
            settings.S3_RAW_BUCKET, 
            video.raw_key
        )
        video_url = video_raw_url  # Temp use raw as main URL
        thumbnail_url = ""  # No thumbnail yet
    
    # Create reel
    reel = Reel(
        user_id=current_user.id,
        video_id=reel_data.video_id,
        caption=reel_data.caption,
        music_name=reel_data.music_name,
        music_artist=reel_data.music_artist,
        video_url=video_url,
        video_raw_url=video_raw_url,
        thumbnail_url=thumbnail_url,
        duration=video.duration or 0,
        video_processed=video_processed,
    )
    
    await reel.insert()
    
    logger.info(f"Reel created: {reel.id} by user {current_user.id} (processed: {video_processed})")
    
    return ReelPublic(
        id=reel.id,
        user_id=reel.user_id,
        username=current_user.username,
        user_avatar=current_user.avatar_url,
        video_url=reel.video_url,
        video_raw_url=reel.video_raw_url,
        thumbnail_url=reel.thumbnail_url,
        duration=reel.duration,
        video_processed=reel.video_processed,
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
    if viewed_reel_ids:
        query = Reel.find(
            Reel.is_active == True,
            {"_id": {"$nin": viewed_reel_ids}}
        )
    else:
        query = Reel.find(Reel.is_active == True)
    
    all_unviewed_reels = await query.to_list()
    
    # If no unviewed reels, resample from all reels (loop back)
    if not all_unviewed_reels:
        logger.info(f"User {current_user.id} has viewed all reels, resampling from all reels")
        all_unviewed_reels = await Reel.find(Reel.is_active == True).to_list()
        
        # If still no reels at all, return empty list
        if not all_unviewed_reels:
            logger.info(f"No reels available in the system")
            return ReelFeedResponse(
                reels=[],
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
                user_avatar=user.avatar_url if user else None,
                video_url=reel.video_url,
                video_raw_url=reel.video_raw_url,
                thumbnail_url=reel.thumbnail_url,
                duration=reel.duration,
                video_processed=reel.video_processed,
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


@router.get("/user/{user_id}", response_model=ReelFeedResponse)
async def get_user_reels(
    user_id: str,
    current_user: CurrentUser,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
) -> Any:
    """
    Get all reels created by a specific user.
    """
    # Check if user exists
    target_user = await User.find_one(User.id == user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Query reels by user
    total_reels = await Reel.find(
        Reel.user_id == user_id,
        Reel.is_active == True,
    ).count()
    
    reels = await Reel.find(
        Reel.user_id == user_id,
        Reel.is_active == True,
    ).sort(-Reel.created_at).skip(offset).limit(limit).to_list()
    
    # Get like status for current user
    reel_ids = [reel.id for reel in reels]
    if reel_ids:
        likes_query = {
            "user_id": current_user.id,
            "reel_id": {"$in": reel_ids}
        }
        user_likes = await ReelLike.find(likes_query).to_list()
        liked_reel_ids = {like.reel_id for like in user_likes}
    else:
        liked_reel_ids = set()
    
    # Build response
    reel_publics = []
    for reel in reels:
        reel_publics.append(
            ReelPublic(
                id=reel.id,
                user_id=reel.user_id,
                username=target_user.username,
                user_avatar=target_user.avatar_url,
                video_url=reel.video_url,
                video_raw_url=reel.video_raw_url,
                thumbnail_url=reel.thumbnail_url,
                duration=reel.duration,
                video_processed=reel.video_processed,
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
    
    has_more = (offset + limit) < total_reels
    
    logger.info(f"Returning {len(reel_publics)} reels for user {user_id}")
    
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
        user_avatar=user.avatar_url if user else None,
        video_url=reel.video_url,
        video_raw_url=reel.video_raw_url,
        thumbnail_url=reel.thumbnail_url,
        duration=reel.duration,
        video_processed=reel.video_processed,
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


# ============== REEL COMMENTS ==============

async def enrich_comment_with_author(
    comment: ReelComment, 
    current_user_id: str
) -> ReelCommentPublic:
    """Add author info and like status to comment."""
    author = await User.find_one(User.id == comment.author_id)
    
    # Check if liked by current user
    like = await ReelCommentLike.find_one(
        ReelCommentLike.comment_id == comment.id,
        ReelCommentLike.user_id == current_user_id,
    )
    
    # Get reply_to username if applicable
    reply_to_username = None
    if comment.reply_to_user_id:
        reply_to_user = await User.find_one(User.id == comment.reply_to_user_id)
        if reply_to_user:
            reply_to_username = reply_to_user.username
    
    return ReelCommentPublic(
        id=comment.id,
        reel_id=comment.reel_id,
        author_id=comment.author_id,
        author=ReelCommentAuthor(
            id=author.id if author else comment.author_id,
            username=author.username if author else "Unknown",
            avatar_url=author.avatar_url if author else None,
        ),
        content=comment.content,
        parent_id=comment.parent_id,
        reply_to_user_id=comment.reply_to_user_id,
        reply_to_username=reply_to_username,
        like_count=comment.like_count,
        reply_count=comment.reply_count,
        is_liked=like is not None,
        created_at=comment.created_at,
    )


@router.post("/{reel_id}/comments", response_model=ReelCommentPublic)
async def create_reel_comment(
    reel_id: str,
    comment_in: ReelCommentCreate,
    current_user: CurrentUser,
) -> Any:
    """Create a new comment on a reel."""
    # Check reel exists
    reel = await Reel.find_one(Reel.id == reel_id)
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    
    # If replying, verify parent exists
    if comment_in.parent_id:
        parent = await ReelComment.find_one(ReelComment.id == comment_in.parent_id)
        if not parent or parent.reel_id != reel_id:
            raise HTTPException(status_code=404, detail="Parent comment not found")
        
        # Increment reply count on parent
        parent.reply_count += 1
        await parent.save()
    
    # Create comment
    comment = ReelComment(
        reel_id=reel_id,
        author_id=current_user.id,
        content=comment_in.content,
        parent_id=comment_in.parent_id,
        reply_to_user_id=comment_in.reply_to_user_id,
    )
    await comment.insert()
    
    # Update reel comment count
    reel.comments_count += 1
    await reel.save()
    
    logger.info(f"Comment created on reel {reel_id} by user {current_user.id}")
    
    return await enrich_comment_with_author(comment, current_user.id)


@router.get("/{reel_id}/comments", response_model=ReelCommentsResponse)
async def get_reel_comments(
    reel_id: str,
    current_user: CurrentUser,
    cursor: str = Query(default=None, description="Cursor (ISO datetime) for pagination"),
    limit: int = Query(default=20, ge=1, le=50),
) -> Any:
    """Get root comments for a reel with cursor-based pagination."""
    # Check reel exists
    reel = await Reel.find_one(Reel.id == reel_id)
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    
    # Build query for root comments (no parent)
    query = {
        "reel_id": reel_id,
        "parent_id": None,
    }
    
    if cursor:
        try:
            cursor_time = datetime.fromisoformat(cursor.replace('Z', '+00:00'))
            query["created_at"] = {"$lt": cursor_time}
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor format")
    
    # Fetch comments
    comments = await ReelComment.find(query).sort(-ReelComment.created_at).limit(limit + 1).to_list()
    
    has_more = len(comments) > limit
    if has_more:
        comments = comments[:limit]
    
    # Enrich comments
    enriched = []
    for comment in comments:
        enriched.append(await enrich_comment_with_author(comment, current_user.id))
    
    next_cursor = None
    if has_more and comments:
        next_cursor = comments[-1].created_at.isoformat()
    
    return ReelCommentsResponse(
        data=enriched,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/comments/{comment_id}/replies", response_model=ReelCommentsResponse)
async def get_comment_replies(
    comment_id: str,
    current_user: CurrentUser,
    cursor: str = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
) -> Any:
    """Get replies to a comment."""
    # Check parent exists
    parent = await ReelComment.find_one(ReelComment.id == comment_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    query = {"parent_id": comment_id}
    
    if cursor:
        try:
            cursor_time = datetime.fromisoformat(cursor.replace('Z', '+00:00'))
            query["created_at"] = {"$lt": cursor_time}
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor format")
    
    replies = await ReelComment.find(query).sort(-ReelComment.created_at).limit(limit + 1).to_list()
    
    has_more = len(replies) > limit
    if has_more:
        replies = replies[:limit]
    
    enriched = []
    for reply in replies:
        enriched.append(await enrich_comment_with_author(reply, current_user.id))
    
    next_cursor = None
    if has_more and replies:
        next_cursor = replies[-1].created_at.isoformat()
    
    return ReelCommentsResponse(
        data=enriched,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.post("/comments/{comment_id}/like")
async def like_reel_comment(
    comment_id: str,
    current_user: CurrentUser,
) -> Any:
    """Like or unlike a reel comment."""
    comment = await ReelComment.find_one(ReelComment.id == comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Check if already liked
    existing = await ReelCommentLike.find_one(
        ReelCommentLike.comment_id == comment_id,
        ReelCommentLike.user_id == current_user.id,
    )
    
    if existing:
        # Unlike
        await existing.delete()
        comment.like_count = max(0, comment.like_count - 1)
        await comment.save()
        return {"success": True, "is_liked": False, "like_count": comment.like_count}
    else:
        # Like
        like = ReelCommentLike(
            comment_id=comment_id,
            user_id=current_user.id,
        )
        await like.insert()
        comment.like_count += 1
        await comment.save()
        return {"success": True, "is_liked": True, "like_count": comment.like_count}


@router.delete("/comments/{comment_id}")
async def delete_reel_comment(
    comment_id: str,
    current_user: CurrentUser,
) -> Any:
    """Delete a reel comment (only author can delete)."""
    comment = await ReelComment.find_one(ReelComment.id == comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    if comment.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment")
    
    # Get reel to update count
    reel = await Reel.find_one(Reel.id == comment.reel_id)
    
    # If root comment, delete all replies too
    deleted_count = 1
    if comment.parent_id is None:
        replies = await ReelComment.find(ReelComment.parent_id == comment_id).to_list()
        for reply in replies:
            await reply.delete()
            deleted_count += 1
    else:
        # Update parent reply count
        parent = await ReelComment.find_one(ReelComment.id == comment.parent_id)
        if parent:
            parent.reply_count = max(0, parent.reply_count - 1)
            await parent.save()
    
    await comment.delete()
    
    # Update reel comment count
    if reel:
        reel.comments_count = max(0, reel.comments_count - deleted_count)
        await reel.save()
    
    logger.info(f"Comment {comment_id} deleted by user {current_user.id}")
    
    return {"success": True, "message": "Comment deleted successfully"}
