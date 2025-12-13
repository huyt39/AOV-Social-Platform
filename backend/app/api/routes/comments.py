"""Comments routes with nested replies and mentions support."""

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser
from app.models import (
    Comment,
    CommentAuthor,
    CommentCreate,
    CommentLike,
    CommentPublic,
    CommentsResponse,
    Post,
    User,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["comments"])


async def enrich_comment_with_author(
    comment: Comment, 
    current_user_id: Optional[str] = None
) -> CommentPublic:
    """Add author information and like status to a comment."""
    author = await User.find_one(User.id == comment.author_id)
    
    if not author:
        author_info = CommentAuthor(
            id=comment.author_id,
            username="[Deleted User]",
        )
    else:
        author_info = CommentAuthor(
            id=author.id,
            username=author.username,
            avatar_url=author.avatar_url,
        )
    
    # Check if current user has liked this comment
    is_liked = False
    if current_user_id:
        like = await CommentLike.find_one(
            CommentLike.comment_id == comment.id,
            CommentLike.user_id == current_user_id
        )
        is_liked = like is not None
    
    # Get reply_to_username if replying to someone
    reply_to_username = None
    if comment.reply_to_user_id:
        reply_to_user = await User.find_one(User.id == comment.reply_to_user_id)
        if reply_to_user:
            reply_to_username = reply_to_user.username
    
    return CommentPublic(
        id=comment.id,
        post_id=comment.post_id,
        author_id=comment.author_id,
        author=author_info,
        content=comment.content,
        mentions=comment.mentions,
        parent_id=comment.parent_id,
        reply_to_user_id=comment.reply_to_user_id,
        reply_to_username=reply_to_username,
        like_count=comment.like_count,
        reply_count=comment.reply_count,
        is_liked=is_liked,
        created_at=comment.created_at,
    )


@router.post("/posts/{post_id}/comments")
async def create_comment(
    post_id: str,
    comment_in: CommentCreate,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Create a new comment on a post.
    
    - Root comment: parent_id is None
    - Reply to root: parent_id is the root comment ID
    - Reply to reply: parent_id should be the ROOT comment ID (flatten to 2 levels)
    """
    # Check post exists
    post = await Post.find_one(Post.id == post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Bài viết không tồn tại")
    
    # Determine parent_id for 2-level structure
    actual_parent_id = None
    reply_to_user_id = comment_in.reply_to_user_id
    
    if comment_in.parent_id:
        parent_comment = await Comment.find_one(Comment.id == comment_in.parent_id)
        if not parent_comment:
            raise HTTPException(status_code=404, detail="Bình luận gốc không tồn tại")
        
        # If replying to a reply, use the root comment's ID
        if parent_comment.parent_id:
            actual_parent_id = parent_comment.parent_id
            # If no explicit reply_to_user_id, set it to the parent comment's author
            if not reply_to_user_id:
                reply_to_user_id = parent_comment.author_id
        else:
            actual_parent_id = comment_in.parent_id
            # If no explicit reply_to_user_id, set it to the parent comment's author
            if not reply_to_user_id:
                reply_to_user_id = parent_comment.author_id
        
        # Increment reply_count on root comment
        root_comment = await Comment.find_one(Comment.id == actual_parent_id)
        if root_comment:
            root_comment.reply_count += 1
            await root_comment.save()
    
    # Create comment
    comment = Comment(
        post_id=post_id,
        author_id=current_user.id,
        content=comment_in.content,
        mentions=comment_in.mentions,
        parent_id=actual_parent_id,
        reply_to_user_id=reply_to_user_id,
    )
    await comment.insert()
    
    # Increment comment_count on post
    post.comment_count += 1
    await post.save()
    
    logger.info(f"New comment on post {post_id} by {current_user.username}: {comment.id}")
    
    # Return enriched comment
    comment_public = await enrich_comment_with_author(comment, current_user.id)
    
    return {
        "success": True,
        "message": "Đã bình luận",
        "data": comment_public.model_dump(),
    }


@router.get("/posts/{post_id}/comments")
async def get_post_comments(
    post_id: str,
    current_user: CurrentUser,
    cursor: Optional[str] = Query(default=None, description="Cursor (ISO datetime) for pagination"),
    limit: int = Query(default=10, ge=1, le=50, description="Number of comments per page"),
) -> CommentsResponse:
    """
    Get root comments for a post with cursor-based pagination.
    """
    # Check post exists
    post = await Post.find_one(Post.id == post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Bài viết không tồn tại")
    
    # Build query for root comments (parent_id is None)
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
            comments = await Comment.find(
                Comment.post_id == post_id,
                Comment.parent_id == None,
                Comment.created_at < cursor_dt
            ).sort(-Comment.created_at).limit(limit + 1).to_list()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor format")
    else:
        comments = await Comment.find(
            Comment.post_id == post_id,
            Comment.parent_id == None
        ).sort(-Comment.created_at).limit(limit + 1).to_list()
    
    # Determine if there are more comments
    has_more = len(comments) > limit
    if has_more:
        comments = comments[:limit]
    
    # Get next cursor
    next_cursor = None
    if has_more and comments:
        next_cursor = comments[-1].created_at.isoformat()
    
    # Enrich comments with author info
    enriched_comments = []
    for comment in comments:
        enriched_comments.append(await enrich_comment_with_author(comment, current_user.id))
    
    return CommentsResponse(
        data=enriched_comments,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/comments/{comment_id}/replies")
async def get_comment_replies(
    comment_id: str,
    current_user: CurrentUser,
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
) -> CommentsResponse:
    """
    Get replies to a root comment.
    """
    # Check parent comment exists
    parent_comment = await Comment.find_one(Comment.id == comment_id)
    if not parent_comment:
        raise HTTPException(status_code=404, detail="Bình luận không tồn tại")
    
    # Build query for replies
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
            replies = await Comment.find(
                Comment.parent_id == comment_id,
                Comment.created_at < cursor_dt
            ).sort(-Comment.created_at).limit(limit + 1).to_list()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor format")
    else:
        replies = await Comment.find(
            Comment.parent_id == comment_id
        ).sort(-Comment.created_at).limit(limit + 1).to_list()
    
    has_more = len(replies) > limit
    if has_more:
        replies = replies[:limit]
    
    next_cursor = replies[-1].created_at.isoformat() if has_more and replies else None
    
    enriched_replies = []
    for reply in replies:
        enriched_replies.append(await enrich_comment_with_author(reply, current_user.id))
    
    return CommentsResponse(
        data=enriched_replies,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.post("/comments/{comment_id}/like")
async def like_comment(
    comment_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Like a comment."""
    comment = await Comment.find_one(Comment.id == comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Bình luận không tồn tại")
    
    # Check if already liked
    existing_like = await CommentLike.find_one(
        CommentLike.comment_id == comment_id,
        CommentLike.user_id == current_user.id
    )
    
    if existing_like:
        return {
            "success": True,
            "message": "Đã thích bình luận",
            "like_count": comment.like_count,
            "is_liked": True,
        }
    
    # Create like
    like = CommentLike(
        comment_id=comment_id,
        user_id=current_user.id,
    )
    await like.insert()
    
    # Increment like count
    comment.like_count += 1
    await comment.save()
    
    return {
        "success": True,
        "message": "Đã thích bình luận",
        "like_count": comment.like_count,
        "is_liked": True,
    }


@router.delete("/comments/{comment_id}/like")
async def unlike_comment(
    comment_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Unlike a comment."""
    comment = await Comment.find_one(Comment.id == comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Bình luận không tồn tại")
    
    existing_like = await CommentLike.find_one(
        CommentLike.comment_id == comment_id,
        CommentLike.user_id == current_user.id
    )
    
    if not existing_like:
        return {
            "success": True,
            "message": "Chưa thích bình luận",
            "like_count": comment.like_count,
            "is_liked": False,
        }
    
    await existing_like.delete()
    
    comment.like_count = max(0, comment.like_count - 1)
    await comment.save()
    
    return {
        "success": True,
        "message": "Đã bỏ thích bình luận",
        "like_count": comment.like_count,
        "is_liked": False,
    }


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Delete a comment. Only the author can delete.
    If deleting a root comment, all replies are also deleted.
    """
    comment = await Comment.find_one(Comment.id == comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Bình luận không tồn tại")
    
    if comment.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Không có quyền xóa bình luận này")
    
    # Get post to update comment_count
    post = await Post.find_one(Post.id == comment.post_id)
    
    deleted_count = 1
    
    if comment.parent_id is None:
        # Root comment - delete all replies too
        replies = await Comment.find(Comment.parent_id == comment_id).to_list()
        deleted_count += len(replies)
        
        # Delete reply likes
        for reply in replies:
            await CommentLike.find(CommentLike.comment_id == reply.id).delete()
            await reply.delete()
    else:
        # Reply - decrement parent's reply_count
        parent = await Comment.find_one(Comment.id == comment.parent_id)
        if parent:
            parent.reply_count = max(0, parent.reply_count - 1)
            await parent.save()
    
    # Delete comment likes
    await CommentLike.find(CommentLike.comment_id == comment_id).delete()
    
    # Delete the comment
    await comment.delete()
    
    # Update post comment_count
    if post:
        post.comment_count = max(0, post.comment_count - deleted_count)
        await post.save()
    
    logger.info(f"Comment deleted: {comment_id} by {current_user.username}")
    
    return {
        "success": True,
        "message": "Đã xóa bình luận",
    }
