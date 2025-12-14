"""Forum API routes for categories, threads, and comments."""

import logging
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser, OptionalUser, ModeratorUser, AdminUser
from app.models import (
    User, UserRole,
    # Forum models
    ForumCategory, ForumCategoryCreate, ForumCategoryUpdate, 
    ForumCategoryPublic, ForumCategoriesResponse,
    ForumThread, ForumThreadCreate, ForumThreadUpdate,
    ForumThreadPublic, ForumThreadListItem, ForumThreadsResponse,
    ForumThreadLike, ForumThreadAuthor,
    ForumComment, ForumCommentCreate, ForumCommentReply, ForumCommentUpdate,
    ForumCommentPublic, ForumCommentsResponse, ForumCommentLike, ForumCommentAuthor,
    ForumCommentStatus, ThreadStatus,
    Report, ReportCreate, ReportPublic, ReportTargetType,
    Message,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/forum", tags=["forum"])


# ============== HELPER FUNCTIONS ==============

async def get_thread_author(user_id: str) -> ForumThreadAuthor:
    """Get author info for a thread."""
    user = await User.get(user_id)
    if not user:
        return ForumThreadAuthor(id=user_id, username="[deleted]")
    return ForumThreadAuthor(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        rank=user.rank,
        level=user.level,
    )


async def get_comment_author(user_id: str) -> ForumCommentAuthor:
    """Get author info for a comment."""
    user = await User.get(user_id)
    if not user:
        return ForumCommentAuthor(id=user_id, username="[deleted]")
    return ForumCommentAuthor(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        rank=user.rank,
    )


async def build_thread_public(
    thread: ForumThread, 
    current_user_id: Optional[str] = None
) -> ForumThreadPublic:
    """Build public thread response with author info and like status."""
    author = await get_thread_author(thread.author_id)
    
    # Get category name
    category = await ForumCategory.get(thread.category_id)
    category_name = category.name if category else None
    
    # Check if current user liked
    is_liked = False
    if current_user_id:
        like = await ForumThreadLike.find_one(
            ForumThreadLike.thread_id == thread.id,
            ForumThreadLike.user_id == current_user_id
        )
        is_liked = like is not None
    
    return ForumThreadPublic(
        id=thread.id,
        title=thread.title,
        content=thread.content,
        author_id=thread.author_id,
        author=author,
        category_id=thread.category_id,
        category_name=category_name,
        status=thread.status,
        media_urls=thread.media_urls,
        view_count=thread.view_count,
        comment_count=thread.comment_count,
        like_count=thread.like_count,
        is_liked=is_liked,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        last_activity_at=thread.last_activity_at,
    )


async def build_comment_public(
    comment: ForumComment,
    current_user_id: Optional[str] = None,
    include_replies: bool = False  # Legacy param, not used in flat structure
) -> ForumCommentPublic:
    """Build public comment response. All comments are flat now."""
    author = await get_comment_author(comment.author_id)
    
    # Get reply_to username if exists
    reply_to_username = None
    if comment.reply_to_user_id:
        reply_user = await User.get(comment.reply_to_user_id)
        if reply_user:
            reply_to_username = reply_user.username
    
    # Check like status
    is_liked = False
    if current_user_id:
        like = await ForumCommentLike.find_one(
            ForumCommentLike.comment_id == comment.id,
            ForumCommentLike.user_id == current_user_id
        )
        is_liked = like is not None
    
    # Handle hidden/deleted content display
    content = comment.content
    quoted_content = getattr(comment, 'quoted_content', None)
    if comment.status == ForumCommentStatus.HIDDEN:
        content = "[Nội dung đã bị ẩn do vi phạm quy định cộng đồng]"
        quoted_content = None
    elif comment.status == ForumCommentStatus.DELETED:
        content = "[Bình luận đã bị xóa]"
        quoted_content = None
    
    return ForumCommentPublic(
        id=comment.id,
        thread_id=comment.thread_id,
        author_id=comment.author_id,
        author=author,
        content=content,
        parent_id=comment.parent_id,
        depth=comment.depth,
        reply_to_user_id=comment.reply_to_user_id,
        reply_to_username=reply_to_username,
        quoted_content=quoted_content,
        media_urls=comment.media_urls if comment.status == ForumCommentStatus.ACTIVE else [],
        like_count=comment.like_count,
        reply_count=comment.reply_count,
        is_liked=is_liked,
        status=comment.status,
        created_at=comment.created_at,
    )


# ============== CATEGORY ROUTES ==============

@router.get("/categories", response_model=ForumCategoriesResponse)
async def get_categories():
    """Get all active forum categories. Public access."""
    categories = await ForumCategory.find(
        ForumCategory.is_active == True
    ).sort("+display_order").to_list()
    
    return ForumCategoriesResponse(
        data=[
            ForumCategoryPublic(
                id=cat.id,
                name=cat.name,
                description=cat.description,
                icon=cat.icon,
                thread_count=cat.thread_count,
                display_order=cat.display_order,
                created_at=cat.created_at,
            )
            for cat in categories
        ],
        count=len(categories)
    )


@router.get("/categories/{category_id}", response_model=ForumCategoryPublic)
async def get_category(category_id: str):
    """Get a specific category by ID. Public access."""
    category = await ForumCategory.get(category_id)
    if not category or not category.is_active:
        raise HTTPException(status_code=404, detail="Category not found")
    
    return ForumCategoryPublic(
        id=category.id,
        name=category.name,
        description=category.description,
        icon=category.icon,
        thread_count=category.thread_count,
        display_order=category.display_order,
        created_at=category.created_at,
    )


# ============== THREAD ROUTES ==============

@router.get("/categories/{category_id}/threads", response_model=ForumThreadsResponse)
async def get_category_threads(
    category_id: str,
    current_user: OptionalUser,
    cursor: Optional[str] = Query(None, description="Cursor for pagination (datetime)"),
    limit: int = Query(20, ge=1, le=50),
    sort: str = Query("latest", regex="^(latest|activity|popular)$"),
):
    """Get threads in a category. Public access with optional auth for like status."""
    # Verify category exists
    category = await ForumCategory.get(category_id)
    if not category or not category.is_active:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Build query
    query = ForumThread.find(
        ForumThread.category_id == category_id,
        ForumThread.status != ThreadStatus.HIDDEN
    )
    
    # Apply cursor filter
    if cursor:
        cursor_dt = datetime.fromisoformat(cursor)
        if sort == "activity":
            query = query.find(ForumThread.last_activity_at < cursor_dt)
        else:
            query = query.find(ForumThread.created_at < cursor_dt)
    
    # Apply sorting
    if sort == "activity":
        query = query.sort("-last_activity_at")
    elif sort == "popular":
        query = query.sort("-like_count", "-created_at")
    else:  # latest
        query = query.sort("-created_at")
    
    threads = await query.limit(limit + 1).to_list()
    
    has_more = len(threads) > limit
    if has_more:
        threads = threads[:limit]
    
    # Build response
    current_user_id = current_user.id if current_user else None
    data = []
    for thread in threads:
        author = await get_thread_author(thread.author_id)
        data.append(ForumThreadListItem(
            id=thread.id,
            title=thread.title,
            content_preview=thread.content[:200] + "..." if len(thread.content) > 200 else thread.content,
            author=author,
            category_id=thread.category_id,
            status=thread.status,
            view_count=thread.view_count,
            comment_count=thread.comment_count,
            like_count=thread.like_count,
            created_at=thread.created_at,
            last_activity_at=thread.last_activity_at,
        ))
    
    next_cursor = None
    if has_more and threads:
        last = threads[-1]
        next_cursor = (last.last_activity_at if sort == "activity" else last.created_at).isoformat()
    
    return ForumThreadsResponse(data=data, next_cursor=next_cursor, has_more=has_more)


@router.post("/categories/{category_id}/threads", response_model=ForumThreadPublic)
async def create_thread(
    category_id: str,
    thread_in: ForumThreadCreate,
    current_user: CurrentUser,
):
    """Create a new thread in a category. Requires authentication."""
    # Verify category exists
    category = await ForumCategory.get(category_id)
    if not category or not category.is_active:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Create thread
    thread = ForumThread(
        title=thread_in.title,
        content=thread_in.content,
        author_id=current_user.id,
        category_id=category_id,
        media_urls=thread_in.media_urls,
    )
    await thread.insert()
    
    # Update category thread count
    category.thread_count += 1
    await category.save()
    
    logger.info(f"User {current_user.username} created thread: {thread.title}")
    
    return await build_thread_public(thread, current_user.id)


@router.get("/threads/{thread_id}", response_model=ForumThreadPublic)
async def get_thread(
    thread_id: str,
    current_user: OptionalUser,
):
    """Get thread detail. Public access."""
    thread = await ForumThread.get(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    if thread.status == ThreadStatus.HIDDEN:
        # Only author, mod, admin can see hidden threads
        if not current_user:
            raise HTTPException(status_code=404, detail="Thread not found")
        user_role = getattr(current_user, 'role', UserRole.USER)
        if current_user.id != thread.author_id and user_role not in [UserRole.MODERATOR, UserRole.ADMIN]:
            raise HTTPException(status_code=404, detail="Thread not found")
    
    # Increment view count
    thread.view_count += 1
    await thread.save()
    
    current_user_id = current_user.id if current_user else None
    return await build_thread_public(thread, current_user_id)


@router.put("/threads/{thread_id}", response_model=ForumThreadPublic)
async def update_thread(
    thread_id: str,
    thread_in: ForumThreadUpdate,
    current_user: CurrentUser,
):
    """Update a thread. Only owner can edit."""
    thread = await ForumThread.get(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Check ownership
    if thread.author_id != current_user.id:
        # Allow admins to edit
        user_role = getattr(current_user, 'role', UserRole.USER)
        if user_role != UserRole.ADMIN and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not authorized to edit this thread")
    
    # Apply updates
    if thread_in.title is not None:
        thread.title = thread_in.title
    if thread_in.content is not None:
        thread.content = thread_in.content
    if thread_in.media_urls is not None:
        thread.media_urls = thread_in.media_urls
    
    thread.updated_at = datetime.now(UTC)
    await thread.save()
    
    return await build_thread_public(thread, current_user.id)


@router.delete("/threads/{thread_id}", response_model=Message)
async def delete_thread(
    thread_id: str,
    current_user: CurrentUser,
):
    """Delete/hide a thread. Owner can delete own thread, Mods can hide."""
    thread = await ForumThread.get(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    user_role = getattr(current_user, 'role', UserRole.USER)
    is_owner = thread.author_id == current_user.id
    is_mod_or_admin = user_role in [UserRole.MODERATOR, UserRole.ADMIN] or current_user.is_superuser
    
    if not is_owner and not is_mod_or_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if is_owner and not is_mod_or_admin:
        # Owner can only soft delete by hiding
        thread.status = ThreadStatus.HIDDEN
        await thread.save()
        
        # Update category count
        category = await ForumCategory.get(thread.category_id)
        if category:
            category.thread_count = max(0, category.thread_count - 1)
            await category.save()
        
        return Message(message="Thread deleted")
    else:
        # Mods/admins hide the thread
        thread.status = ThreadStatus.HIDDEN
        await thread.save()
        return Message(message="Thread hidden by moderator")


@router.post("/threads/{thread_id}/lock", response_model=Message)
async def lock_thread(
    thread_id: str,
    current_user: ModeratorUser,
):
    """Lock a thread (disable comments). Moderator or Admin only."""
    thread = await ForumThread.get(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    thread.status = ThreadStatus.LOCKED
    await thread.save()
    
    logger.info(f"Thread {thread_id} locked by {current_user.username}")
    return Message(message="Thread locked")


@router.post("/threads/{thread_id}/like", response_model=dict)
async def toggle_thread_like(
    thread_id: str,
    current_user: CurrentUser,
):
    """Toggle like on a thread. Requires authentication."""
    thread = await ForumThread.get(thread_id)
    if not thread or thread.status == ThreadStatus.HIDDEN:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Check existing like
    existing = await ForumThreadLike.find_one(
        ForumThreadLike.thread_id == thread_id,
        ForumThreadLike.user_id == current_user.id
    )
    
    if existing:
        await existing.delete()
        thread.like_count = max(0, thread.like_count - 1)
        await thread.save()
        return {"liked": False, "like_count": thread.like_count}
    else:
        like = ForumThreadLike(thread_id=thread_id, user_id=current_user.id)
        await like.insert()
        thread.like_count += 1
        await thread.save()
        return {"liked": True, "like_count": thread.like_count}


# ============== COMMENT ROUTES ==============

@router.get("/threads/{thread_id}/comments", response_model=ForumCommentsResponse)
async def get_thread_comments(
    thread_id: str,
    current_user: OptionalUser,
    cursor: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=50),
):
    """Get comments for a thread. Public access. Returns flat list of all comments."""
    thread = await ForumThread.get(thread_id)
    if not thread or thread.status == ThreadStatus.HIDDEN:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    # Get all comments in flat list (sorted by creation time)
    query = ForumComment.find(
        ForumComment.thread_id == thread_id,
        ForumComment.status != ForumCommentStatus.DELETED
    )
    
    if cursor:
        cursor_dt = datetime.fromisoformat(cursor)
        # For oldest-first pagination, get comments after cursor
        query = query.find(ForumComment.created_at > cursor_dt)
    
    # Sort by oldest first (chronological order like forum)
    comments = await query.sort("+created_at").limit(limit + 1).to_list()
    
    has_more = len(comments) > limit
    if has_more:
        comments = comments[:limit]
    
    current_user_id = current_user.id if current_user else None
    data = [
        await build_comment_public(c, current_user_id)
        for c in comments
    ]
    
    next_cursor = None
    if has_more and comments:
        next_cursor = comments[-1].created_at.isoformat()
    
    return ForumCommentsResponse(data=data, next_cursor=next_cursor, has_more=has_more)


@router.post("/threads/{thread_id}/comments", response_model=ForumCommentPublic)
async def create_comment(
    thread_id: str,
    comment_in: ForumCommentCreate,
    current_user: CurrentUser,
):
    """Create a root comment on a thread. Requires authentication."""
    thread = await ForumThread.get(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    if thread.status == ThreadStatus.LOCKED:
        raise HTTPException(status_code=403, detail="Thread is locked")
    
    if thread.status == ThreadStatus.HIDDEN:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    comment = ForumComment(
        thread_id=thread_id,
        author_id=current_user.id,
        content=comment_in.content,
        media_urls=comment_in.media_urls,
        depth=0,
    )
    await comment.insert()
    
    # Update thread stats
    thread.comment_count += 1
    thread.last_activity_at = datetime.now(UTC)
    await thread.save()
    
    return await build_comment_public(comment, current_user.id)


@router.post("/comments/{comment_id}/reply", response_model=ForumCommentPublic)
async def reply_to_comment(
    comment_id: str,
    reply_in: ForumCommentReply,
    current_user: CurrentUser,
):
    """
    Reply to a comment. Creates a flat comment with quote info.
    All comments are the same level, but contain reference to the quoted comment.
    """
    parent = await ForumComment.get(comment_id)
    if not parent or parent.status == ForumCommentStatus.DELETED:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Verify thread is not locked
    thread = await ForumThread.get(parent.thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    if thread.status == ThreadStatus.LOCKED:
        raise HTTPException(status_code=403, detail="Thread is locked")
    
    # Create flat comment with quote reference (no depth hierarchy)
    reply = ForumComment(
        thread_id=parent.thread_id,
        author_id=current_user.id,
        content=reply_in.content,
        media_urls=reply_in.media_urls,
        parent_id=comment_id,  # Reference to quoted comment
        depth=0,  # All comments are flat (same level)
        reply_to_user_id=parent.author_id,
        # Store quote preview for display
        quoted_content=parent.content[:200] if parent.content else None,
    )
    await reply.insert()
    
    # Update thread stats
    thread.comment_count += 1
    thread.last_activity_at = datetime.now(UTC)
    await thread.save()
    
    return await build_comment_public(reply, current_user.id)


@router.post("/comments/{comment_id}/like", response_model=dict)
async def toggle_comment_like(
    comment_id: str,
    current_user: CurrentUser,
):
    """Toggle like on a comment."""
    comment = await ForumComment.get(comment_id)
    if not comment or comment.status == ForumCommentStatus.DELETED:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    existing = await ForumCommentLike.find_one(
        ForumCommentLike.comment_id == comment_id,
        ForumCommentLike.user_id == current_user.id
    )
    
    if existing:
        await existing.delete()
        comment.like_count = max(0, comment.like_count - 1)
        await comment.save()
        return {"liked": False, "like_count": comment.like_count}
    else:
        like = ForumCommentLike(comment_id=comment_id, user_id=current_user.id)
        await like.insert()
        comment.like_count += 1
        await comment.save()
        return {"liked": True, "like_count": comment.like_count}


@router.delete("/comments/{comment_id}", response_model=Message)
async def delete_comment(
    comment_id: str,
    current_user: CurrentUser,
):
    """Delete/hide a comment."""
    comment = await ForumComment.get(comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    user_role = getattr(current_user, 'role', UserRole.USER)
    is_owner = comment.author_id == current_user.id
    is_mod_or_admin = user_role in [UserRole.MODERATOR, UserRole.ADMIN] or current_user.is_superuser
    
    if not is_owner and not is_mod_or_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if is_mod_or_admin and not is_owner:
        comment.status = ForumCommentStatus.HIDDEN
        await comment.save()
        return Message(message="Comment hidden by moderator")
    else:
        comment.status = ForumCommentStatus.DELETED
        await comment.save()
        
        # Update thread comment count
        thread = await ForumThread.get(comment.thread_id)
        if thread:
            thread.comment_count = max(0, thread.comment_count - 1)
            await thread.save()
        
        # If it's a reply, update parent reply count
        if comment.parent_id:
            parent = await ForumComment.get(comment.parent_id)
            if parent:
                parent.reply_count = max(0, parent.reply_count - 1)
                await parent.save()
        
        return Message(message="Comment deleted")


# ============== REPORT ROUTES ==============

@router.post("/report", response_model=Message)
async def create_report(
    report_in: ReportCreate,
    current_user: CurrentUser,
):
    """Report content (thread, comment, or user)."""
    # Verify target exists
    if report_in.target_type == ReportTargetType.THREAD:
        target = await ForumThread.get(report_in.target_id)
    elif report_in.target_type == ReportTargetType.COMMENT:
        target = await ForumComment.get(report_in.target_id)
    elif report_in.target_type == ReportTargetType.USER:
        target = await User.get(report_in.target_id)
    else:
        target = None
    
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    # Create report
    report = Report(
        reporter_id=current_user.id,
        target_type=report_in.target_type,
        target_id=report_in.target_id,
        reason=report_in.reason,
    )
    await report.insert()
    
    logger.info(f"Report created by {current_user.username}: {report_in.target_type.value} {report_in.target_id}")
    
    return Message(message="Report submitted successfully")
