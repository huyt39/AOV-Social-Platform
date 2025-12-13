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
    PostLike,
    PostPublic,
    PostUpdate,
    SharedPostInfo,
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


async def enrich_post_with_author(post: Post, current_user_id: Optional[str] = None) -> PostPublic:
    """Add author information, like status, and shared post info to a post."""
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
    
    # Check if current user has liked this post
    is_liked = False
    if current_user_id:
        like = await PostLike.find_one(
            PostLike.post_id == post.id,
            PostLike.user_id == current_user_id
        )
        is_liked = like is not None
    
    # Fetch shared post info if this is a share
    shared_post_info = None
    if post.shared_post_id:
        shared_post = await Post.find_one(Post.id == post.shared_post_id)
        if shared_post:
            shared_author = await User.find_one(User.id == shared_post.author_id)
            shared_author_info = PostAuthor(
                id=shared_post.author_id,
                username=shared_author.username if shared_author else "[Deleted User]",
                avatar_url=shared_author.avatar_url if shared_author else None,
                rank=shared_author.rank if shared_author else None,
                level=shared_author.level if shared_author else None,
            )
            shared_post_info = SharedPostInfo(
                id=shared_post.id,
                author=shared_author_info,
                content=shared_post.content,
                media=shared_post.media,
                created_at=shared_post.created_at,
            )
    
    return PostPublic(
        id=post.id,
        author_id=post.author_id,
        author=author_info,
        content=post.content,
        media=post.media,
        like_count=post.like_count,
        comment_count=post.comment_count,
        share_count=post.share_count,
        is_liked=is_liked,
        shared_post=shared_post_info,
        created_at=post.created_at,
    )


@router.post("")
async def create_post(
    post_in: PostCreate,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Create a new post or share an existing post.
    
    Post can contain text content and optionally images/videos.
    If shared_post_id is provided, this creates a share of that post.
    Sharing a shared post will share the original post instead.
    """
    # Validate media count (max 10 items)
    if len(post_in.media) > 10:
        raise HTTPException(
            status_code=400,
            detail="Maximum 10 media items per post",
        )

    # Handle sharing
    final_shared_post_id = None
    if post_in.shared_post_id:
        # Fetch the post being shared
        shared_post = await Post.find_one(Post.id == post_in.shared_post_id)
        if not shared_post:
            raise HTTPException(
                status_code=404,
                detail="Post to share not found",
            )
        
        # If sharing a shared post, share the original instead
        if shared_post.shared_post_id:
            final_shared_post_id = shared_post.shared_post_id
            # Increment share count on the original post
            original_post = await Post.find_one(Post.id == shared_post.shared_post_id)
            if original_post:
                original_post.share_count += 1
                await original_post.save()
        else:
            final_shared_post_id = shared_post.id
            # Increment share count on this post
            shared_post.share_count += 1
            await shared_post.save()

    post = Post(
        author_id=current_user.id,
        content=post_in.content,
        media=post_in.media,
        shared_post_id=final_shared_post_id,
    )
    await post.insert()

    action = "shared" if final_shared_post_id else "created"
    logger.info(f"Post {action} by {current_user.username}: {post.id}")

    # Return enriched post
    post_public = await enrich_post_with_author(post, current_user.id)

    return {
        "success": True,
        "message": "Đã chia sẻ bài viết" if final_shared_post_id else "Đã đăng bài viết",
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
        enriched_posts.append(await enrich_post_with_author(post, current_user.id))

    return FeedResponse(
        data=enriched_posts,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/user/{user_id}")
async def get_user_posts(
    user_id: str,
    current_user: CurrentUser,
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

    # Enrich with author - pass current_user_id for is_liked check
    enriched_posts = []
    for post in posts:
        enriched_posts.append(await enrich_post_with_author(post, current_user.id))

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

    # Delete all likes for this post
    await PostLike.find(PostLike.post_id == post_id).delete()
    
    await post.delete()

    logger.info(f"Post deleted: {post_id} by {current_user.username}")

    return {
        "success": True,
        "message": "Đã xóa bài viết",
    }


@router.post("/{post_id}/like")
async def like_post(
    post_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Like a post. If already liked, returns current like count.
    """
    post = await Post.find_one(Post.id == post_id)
    
    if not post:
        raise HTTPException(status_code=404, detail="Bài viết không tồn tại")

    # Check if already liked
    existing_like = await PostLike.find_one(
        PostLike.post_id == post_id,
        PostLike.user_id == current_user.id
    )
    
    if existing_like:
        # Already liked
        return {
            "success": True,
            "message": "Đã thích bài viết",
            "like_count": post.like_count,
            "is_liked": True,
        }

    # Create like
    like = PostLike(
        post_id=post_id,
        user_id=current_user.id,
    )
    await like.insert()

    # Increment like count
    post.like_count += 1
    await post.save()

    logger.info(f"Post {post_id} liked by {current_user.username}")

    return {
        "success": True,
        "message": "Đã thích bài viết",
        "like_count": post.like_count,
        "is_liked": True,
    }


@router.delete("/{post_id}/like")
async def unlike_post(
    post_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Unlike a post. If not liked, returns current like count.
    """
    post = await Post.find_one(Post.id == post_id)
    
    if not post:
        raise HTTPException(status_code=404, detail="Bài viết không tồn tại")

    # Check if liked
    existing_like = await PostLike.find_one(
        PostLike.post_id == post_id,
        PostLike.user_id == current_user.id
    )
    
    if not existing_like:
        # Not liked
        return {
            "success": True,
            "message": "Chưa thích bài viết",
            "like_count": post.like_count,
            "is_liked": False,
        }

    # Delete like
    await existing_like.delete()

    # Decrement like count (ensure not negative)
    post.like_count = max(0, post.like_count - 1)
    await post.save()

    logger.info(f"Post {post_id} unliked by {current_user.username}")

    return {
        "success": True,
        "message": "Đã bỏ thích bài viết",
        "like_count": post.like_count,
        "is_liked": False,
    }
