"""Posts routes with feed functionality and cursor pagination."""

import logging
from datetime import datetime
from typing import Any, Optional

from beanie.operators import Or, And, In
from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser
from app.models import (
    FeedResponse,
    Friendship,
    FriendshipStatus,
    Post,
    PostAuthor,
    PostCreate,
    PostPublic,
    PostUpdate,
    User,
    UserPostsResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/posts", tags=["posts"])


async def get_friend_ids(user_id: str) -> list[str]:
    """Get list of friend user IDs for a given user."""
    friendships = await Friendship.find(
        Friendship.status == FriendshipStatus.ACCEPTED,
        Or(
            Friendship.requester_id == user_id,
            Friendship.addressee_id == user_id,
        ),
    ).to_list()

    friend_ids = []
    for f in friendships:
        if f.requester_id == user_id:
            friend_ids.append(f.addressee_id)
        else:
            friend_ids.append(f.requester_id)

    return friend_ids


async def enrich_post_with_author(post: Post) -> PostPublic:
    """Add author information to a post."""
    author = await User.find_one(User.id == post.author_id)
    
    if not author:
        author_info = PostAuthor(
            id=post.author_id,
            username="[Deleted User]",
        )
    else:
        author_info = PostAuthor(
            id=author.id,
            username=author.username,
            avatar_url=author.avatar_url,
            rank=author.rank,
            level=author.level,
        )
    
    return PostPublic(
        id=post.id,
        author_id=post.author_id,
        author=author_info,
        content=post.content,
        media=post.media,
        created_at=post.created_at,
    )


@router.post("")
async def create_post(
    post_in: PostCreate,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Create a new post.
    
    Post can contain text content and optionally images/videos.
    """
    # Validate media count (max 10 items)
    if len(post_in.media) > 10:
        raise HTTPException(
            status_code=400,
            detail="Maximum 10 media items per post",
        )

    post = Post(
        author_id=current_user.id,
        content=post_in.content,
        media=post_in.media,
    )
    await post.insert()

    logger.info(f"New post created by {current_user.username}: {post.id}")

    # Return enriched post
    post_public = await enrich_post_with_author(post)

    return {
        "success": True,
        "message": "Đã đăng bài viết",
        "data": post_public.model_dump(),
    }


@router.get("/feed")
async def get_feed(
    current_user: CurrentUser,
    cursor: Optional[str] = Query(default=None, description="Cursor (ISO datetime) for pagination"),
    limit: int = Query(default=10, ge=1, le=50, description="Number of posts per page"),
) -> FeedResponse:
    """
    Get feed with posts from friends and self.
    
    Uses cursor-based pagination for efficient scrolling.
    The cursor is an ISO datetime string of the last post's created_at.
    """
    # Get friend IDs
    friend_ids = await get_friend_ids(current_user.id)
    
    # Include own posts in feed
    author_ids = [current_user.id] + friend_ids

    # Build base query with In operator
    base_query = In(Post.author_id, author_ids)
    
    # Apply cursor if provided
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
            # Use raw find with MongoDB query
            posts = await Post.find(
                base_query,
                Post.created_at < cursor_dt
            ).sort(-Post.created_at).limit(limit + 1).to_list()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor format")
    else:
        # No cursor, just filter by author
        posts = await Post.find(
            base_query
        ).sort(-Post.created_at).limit(limit + 1).to_list()

    # Determine if there are more posts
    has_more = len(posts) > limit
    if has_more:
        posts = posts[:limit]

    # Get next cursor
    next_cursor = None
    if has_more and posts:
        next_cursor = posts[-1].created_at.isoformat()

    # Enrich posts with author info
    enriched_posts = []
    for post in posts:
        enriched_posts.append(await enrich_post_with_author(post))

    return FeedResponse(
        data=enriched_posts,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/user/{user_id}")
async def get_user_posts(
    user_id: str,
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
) -> UserPostsResponse:
    """
    Get posts by a specific user.
    
    Uses cursor-based pagination.
    """
    # Check if user exists
    user = await User.find_one(User.id == user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại")

    # Build query
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
            posts = await Post.find(
                Post.author_id == user_id,
                Post.created_at < cursor_dt
            ).sort(-Post.created_at).limit(limit + 1).to_list()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor format")
    else:
        posts = await Post.find(
            Post.author_id == user_id
        ).sort(-Post.created_at).limit(limit + 1).to_list()

    has_more = len(posts) > limit
    if has_more:
        posts = posts[:limit]

    next_cursor = posts[-1].created_at.isoformat() if has_more and posts else None

    # Enrich with author
    enriched_posts = []
    for post in posts:
        enriched_posts.append(await enrich_post_with_author(post))

    return UserPostsResponse(
        data=enriched_posts,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/{post_id}")
async def get_post(
    post_id: str,
) -> dict[str, Any]:
    """
    Get a single post by ID.
    """
    post = await Post.find_one(Post.id == post_id)
    
    if not post:
        raise HTTPException(status_code=404, detail="Bài viết không tồn tại")

    post_public = await enrich_post_with_author(post)

    return {
        "success": True,
        "data": post_public.model_dump(),
    }


@router.patch("/{post_id}")
async def update_post(
    post_id: str,
    post_update: PostUpdate,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Update a post. Only the author can update.
    """
    post = await Post.find_one(Post.id == post_id)
    
    if not post:
        raise HTTPException(status_code=404, detail="Bài viết không tồn tại")

    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Không có quyền chỉnh sửa bài viết này")

    if post_update.content:
        post.content = post_update.content
        post.updated_at = datetime.utcnow()
        await post.save()

    post_public = await enrich_post_with_author(post)

    return {
        "success": True,
        "message": "Đã cập nhật bài viết",
        "data": post_public.model_dump(),
    }


@router.delete("/{post_id}")
async def delete_post(
    post_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Delete a post. Only the author can delete.
    """
    post = await Post.find_one(Post.id == post_id)
    
    if not post:
        raise HTTPException(status_code=404, detail="Bài viết không tồn tại")

    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Không có quyền xóa bài viết này")

    await post.delete()

    logger.info(f"Post deleted: {post_id} by {current_user.username}")

    return {
        "success": True,
        "message": "Đã xóa bài viết",
    }
