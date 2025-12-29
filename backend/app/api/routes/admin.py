"""Admin API routes for dashboard, user management, and moderation."""

import logging
from datetime import datetime, UTC, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import AdminUser, ModeratorUser
from app.models import (
    User, UserRole, UserPublic, UsersPublic,
    # Forum models
    ForumCategory, ForumCategoryCreate, ForumCategoryUpdate, ForumCategoryPublic,
    ForumThread, ForumComment, ForumCommentStatus, ThreadStatus,
    Report, ReportStatus, ReportPublic, ReportsResponse, ReportResolve,
    ReportTargetType, ReportAction,
    AdminStats,
    # Post model
    Post,
    # Notification models
    Notification, NotificationType,
)
from app.models.base import Message, RankEnum  # Simple response message + RankEnum

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ============== DASHBOARD STATS ==============

@router.get("/stats", response_model=AdminStats)
async def get_admin_stats(current_user: AdminUser):
    """Get admin dashboard statistics. Admin only."""
    # Get today's date for recent activity
    today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Count users by role
    total_users = await User.count()
    users_by_role = {}
    for role in UserRole:
        if role == UserRole.GUEST:
            continue
        count = await User.find(User.role == role).count()
        users_by_role[role.value] = count
    
    # Count forum content
    total_categories = await ForumCategory.count()
    total_threads = await ForumThread.count()
    total_forum_comments = await ForumComment.count()
    
    # Count pending reports
    pending_reports = await Report.find(Report.status == ReportStatus.PENDING).count()
    
    # Count new today
    new_users_today = await User.find(User.profile_verified_at >= today).count() if hasattr(User, 'profile_verified_at') else 0
    new_threads_today = await ForumThread.find(ForumThread.created_at >= today).count()
    new_comments_today = await ForumComment.find(ForumComment.created_at >= today).count()
    
    # === CHART DATA ===
    
    # Activity for last 7 days
    activity_last_7_days = []
    for i in range(6, -1, -1):  # From 6 days ago to today
        day_start = today - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        
        users_count = await User.find(
            User.profile_verified_at >= day_start,
            User.profile_verified_at < day_end
        ).count() if hasattr(User, 'profile_verified_at') else 0
        
        threads_count = await ForumThread.find(
            ForumThread.created_at >= day_start,
            ForumThread.created_at < day_end
        ).count()
        
        comments_count = await ForumComment.find(
            ForumComment.created_at >= day_start,
            ForumComment.created_at < day_end
        ).count()
        
        activity_last_7_days.append({
            "date": day_start.strftime("%Y-%m-%d"),
            "users": users_count,
            "threads": threads_count,
            "comments": comments_count,
        })
    
    # Reports by target type
    reports_by_type = {}
    for target_type in ReportTargetType:
        count = await Report.find(Report.target_type == target_type).count()
        if count > 0:  # Only include types with reports
            reports_by_type[target_type.value] = count
    
    # Users by rank
    users_by_rank = {}
    for rank in RankEnum:
        count = await User.find(User.rank == rank).count()
        users_by_rank[rank.value] = count
    
    return AdminStats(
        total_users=total_users,
        users_by_role=users_by_role,
        users_by_rank=users_by_rank,
        total_categories=total_categories,
        total_threads=total_threads,
        total_forum_comments=total_forum_comments,
        pending_reports=pending_reports,
        new_users_today=new_users_today,
        new_threads_today=new_threads_today,
        new_comments_today=new_comments_today,
        activity_last_7_days=activity_last_7_days,
        reports_by_type=reports_by_type,
    )


# ============== CATEGORY MANAGEMENT ==============

@router.post("/categories", response_model=ForumCategoryPublic)
async def create_category(
    category_in: ForumCategoryCreate,
    current_user: AdminUser,
):
    """Create a new forum category. Admin only."""
    # Check for duplicate name
    existing = await ForumCategory.find_one(ForumCategory.name == category_in.name)
    if existing:
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    category = ForumCategory(
        name=category_in.name,
        description=category_in.description,
        icon=category_in.icon,
        display_order=category_in.display_order,
        created_by_id=current_user.id,
    )
    await category.insert()
    
    logger.info(f"Admin {current_user.username} created category: {category.name}")
    
    return ForumCategoryPublic(
        id=category.id,
        name=category.name,
        description=category.description,
        icon=category.icon,
        thread_count=0,
        display_order=category.display_order,
        created_at=category.created_at,
    )


@router.put("/categories/{category_id}", response_model=ForumCategoryPublic)
async def update_category(
    category_id: str,
    category_in: ForumCategoryUpdate,
    current_user: AdminUser,
):
    """Update a forum category. Admin only."""
    category = await ForumCategory.get(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    if category_in.name is not None:
        # Check for duplicate name
        existing = await ForumCategory.find_one(
            ForumCategory.name == category_in.name,
            ForumCategory.id != category_id
        )
        if existing:
            raise HTTPException(status_code=400, detail="Category with this name already exists")
        category.name = category_in.name
    
    if category_in.description is not None:
        category.description = category_in.description
    if category_in.icon is not None:
        category.icon = category_in.icon
    if category_in.display_order is not None:
        category.display_order = category_in.display_order
    if category_in.is_active is not None:
        category.is_active = category_in.is_active
    
    category.updated_at = datetime.now(UTC)
    await category.save()
    
    return ForumCategoryPublic(
        id=category.id,
        name=category.name,
        description=category.description,
        icon=category.icon,
        thread_count=category.thread_count,
        display_order=category.display_order,
        created_at=category.created_at,
    )


@router.delete("/categories/{category_id}", response_model=Message)
async def delete_category(
    category_id: str,
    current_user: AdminUser,
):
    """Delete a forum category. Admin only. Soft deletes by setting is_active=False."""
    category = await ForumCategory.get(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    category.is_active = False
    await category.save()
    
    logger.info(f"Admin {current_user.username} deleted category: {category.name}")
    
    return Message(message="Category deleted")


# ============== USER MANAGEMENT ==============

@router.get("/users", response_model=UsersPublic)
async def get_users(
    current_user: AdminUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    role: Optional[UserRole] = None,
    search: Optional[str] = None,
):
    """Get list of users. Admin only."""
    query = User.find()
    
    if role:
        query = query.find(User.role == role)
    
    if search:
        query = query.find({
            "$or": [
                {"username": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
            ]
        })
    
    total = await query.count()
    users = await query.skip(skip).limit(limit).to_list()
    
    return UsersPublic(
        data=[UserPublic(**u.model_dump()) for u in users],
        count=total,
    )


@router.put("/users/{user_id}/role", response_model=Message)
async def update_user_role(
    user_id: str,
    role: UserRole,
    current_user: AdminUser,
):
    """Update a user's role. Admin only."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Cannot demote superusers
    if user.is_superuser and role != UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Cannot change role of superuser")
    
    old_role = user.role
    user.role = role
    await user.save()
    
    logger.info(f"Admin {current_user.username} changed {user.username}'s role from {old_role} to {role}")
    
    return Message(message=f"User role updated to {role.value}")



@router.post("/users/{user_id}/ban", response_model=Message)
async def ban_user(
    user_id: str,
    current_user: ModeratorUser,
    reason: str = Query(..., min_length=10),
    duration_hours: Optional[int] = Query(None, description="Ban duration in hours. None = permanent (Admin only)"),
):
    """
    Ban a user. 
    - Moderators can only do temporary bans (duration_hours required)
    - Admins can do permanent bans (duration_hours = None)
    """
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot ban yourself")
    
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Cannot ban superusers or admins (unless current user is superuser)
    user_role = getattr(current_user, 'role', UserRole.USER)
    target_role = getattr(user, 'role', UserRole.USER)
    
    if user.is_superuser:
        raise HTTPException(status_code=403, detail="Cannot ban a superuser")
    
    if target_role == UserRole.ADMIN and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only superusers can ban admins")
    
    # Moderators can only do temp bans
    if user_role == UserRole.MODERATOR and not current_user.is_superuser:
        if duration_hours is None:
            raise HTTPException(status_code=403, detail="Moderators can only issue temporary bans")
    
    # Apply ban by deactivating user
    user.is_active = False
    await user.save()
    
    ban_type = "permanently" if duration_hours is None else f"for {duration_hours} hours"
    logger.info(f"User {user.username} banned {ban_type} by {current_user.username}. Reason: {reason}")
    
    return Message(message=f"User banned {ban_type}")


@router.post("/users/{user_id}/unban", response_model=Message)
async def unban_user(
    user_id: str,
    current_user: ModeratorUser,
):
    """Unban a user by reactivating their account."""
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_active:
        raise HTTPException(status_code=400, detail="User is not banned")
    
    user.is_active = True
    await user.save()
    
    logger.info(f"User {user.username} unbanned by {current_user.username}")
    
    return Message(message="User unbanned")


# ============== REPORT MANAGEMENT ==============

@router.get("/reports", response_model=ReportsResponse)
async def get_reports(
    current_user: ModeratorUser,
    status: Optional[ReportStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    """Get list of reports. Moderator or Admin."""
    query = Report.find()
    
    if status:
        query = query.find(Report.status == status)
    
    total = await query.count()
    pending_count = await Report.find(Report.status == ReportStatus.PENDING).count()
    reports = await query.sort("-created_at").skip(skip).limit(limit).to_list()
    
    # Build response with preview
    data = []
    for report in reports:
        reporter = await User.get(report.reporter_id)
        
        # Get target preview and thread_id (for comments)
        target_preview = None
        thread_id = None
        if report.target_type == ReportTargetType.THREAD:
            thread = await ForumThread.get(report.target_id)
            if thread:
                target_preview = thread.title[:100]
        elif report.target_type == ReportTargetType.COMMENT:
            comment = await ForumComment.get(report.target_id)
            if comment:
                target_preview = comment.content[:100]
                thread_id = comment.thread_id  # Store thread_id for navigation
        elif report.target_type == ReportTargetType.USER:
            target_user = await User.get(report.target_id)
            if target_user:
                target_preview = f"@{target_user.username}"
        elif report.target_type == ReportTargetType.POST:
            post = await Post.get(report.target_id)
            if post:
                target_preview = (post.content[:100] if post.content else "[Bài viết không có nội dung]")
        
        data.append(ReportPublic(
            id=report.id,
            reporter_id=report.reporter_id,
            reporter_username=reporter.username if reporter else None,
            target_type=report.target_type,
            target_id=report.target_id,
            target_preview=target_preview,
            thread_id=thread_id,
            reason=report.reason,
            status=report.status,
            moderator_id=report.moderator_id,
            moderator_note=report.moderator_note,
            resolved_at=report.resolved_at,
            created_at=report.created_at,
        ))
    
    return ReportsResponse(data=data, count=total, pending_count=pending_count)


@router.put("/reports/{report_id}/resolve", response_model=Message)
async def resolve_report(
    report_id: str,
    resolve_in: ReportResolve,
    current_user: ModeratorUser,
):
    """Resolve or dismiss a report with action options."""
    report = await Report.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    if report.status != ReportStatus.PENDING:
        raise HTTPException(status_code=400, detail="Report already resolved")
    
    action_taken = "no action"
    content_owner_id = None  # Track content owner for notification
    
    # Execute the selected action if status is RESOLVED
    if resolve_in.status == ReportStatus.RESOLVED and resolve_in.action:
        if resolve_in.action == ReportAction.HIDE_CONTENT:
            # Hide the content
            if report.target_type == ReportTargetType.THREAD:
                thread = await ForumThread.get(report.target_id)
                if thread:
                    thread.status = ThreadStatus.HIDDEN
                    await thread.save()
                    action_taken = "content hidden"
                    content_owner_id = thread.author_id
            elif report.target_type == ReportTargetType.COMMENT:
                comment = await ForumComment.get(report.target_id)
                if comment:
                    comment.status = ForumCommentStatus.HIDDEN
                    await comment.save()
                    action_taken = "content hidden"
                    content_owner_id = comment.author_id
            elif report.target_type == ReportTargetType.POST:
                post = await Post.get(report.target_id)
                if post:
                    post.is_hidden = True
                    await post.save()
                    action_taken = "content hidden"
                    content_owner_id = post.author_id
                    
        elif resolve_in.action == ReportAction.DELETE_CONTENT:
            # Soft delete content
            if report.target_type == ReportTargetType.THREAD:
                thread = await ForumThread.get(report.target_id)
                if thread:
                    content_owner_id = thread.author_id
                    # Update category count
                    category = await ForumCategory.get(thread.category_id)
                    if category:
                        category.thread_count = max(0, category.thread_count - 1)
                        await category.save()
                    thread.status = ThreadStatus.HIDDEN
                    await thread.save()
                    action_taken = "content deleted"
            elif report.target_type == ReportTargetType.COMMENT:
                comment = await ForumComment.get(report.target_id)
                if comment:
                    content_owner_id = comment.author_id
                    comment.status = ForumCommentStatus.DELETED
                    await comment.save()
                    action_taken = "content deleted"
            elif report.target_type == ReportTargetType.POST:
                post = await Post.get(report.target_id)
                if post:
                    content_owner_id = post.author_id
                    await post.delete()
                    action_taken = "content deleted"
                    
        elif resolve_in.action == ReportAction.WARN_USER:
            # Get content owner for warning
            if report.target_type == ReportTargetType.THREAD:
                thread = await ForumThread.get(report.target_id)
                if thread:
                    content_owner_id = thread.author_id
            elif report.target_type == ReportTargetType.COMMENT:
                comment = await ForumComment.get(report.target_id)
                if comment:
                    content_owner_id = comment.author_id
            elif report.target_type == ReportTargetType.POST:
                post = await Post.get(report.target_id)
                if post:
                    content_owner_id = post.author_id
            action_taken = "user warned"
            
        elif resolve_in.action == ReportAction.IGNORE:
            action_taken = "ignored"
    
    # Send notification to content owner if action was taken
    if content_owner_id and resolve_in.action and resolve_in.action != ReportAction.IGNORE:
        target_type_labels = {
            ReportTargetType.THREAD: "bài viết",
            ReportTargetType.COMMENT: "bình luận",
            ReportTargetType.USER: "tài khoản",
            ReportTargetType.POST: "bài đăng",
        }
        target_label = target_type_labels.get(report.target_type, "nội dung")
        
        if resolve_in.action == ReportAction.WARN_USER:
            owner_notification = Notification(
                user_id=content_owner_id,
                actor_id=current_user.id,
                type=NotificationType.CONTENT_WARNING,
                report_id=report.id,
                content=f"Bạn nhận được cảnh cáo về {target_label} của mình do vi phạm quy định cộng đồng.",
            )
        else:  # HIDE_CONTENT or DELETE_CONTENT
            owner_notification = Notification(
                user_id=content_owner_id,
                actor_id=current_user.id,
                type=NotificationType.CONTENT_REMOVED,
                report_id=report.id,
                content=f"{target_label.capitalize()} của bạn đã bị xóa do vi phạm quy định cộng đồng.",
            )
        await owner_notification.insert()
    
    # Update the current report
    report.status = resolve_in.status
    report.moderator_id = current_user.id
    report.moderator_note = resolve_in.moderator_note
    report.resolved_at = datetime.now(UTC)
    await report.save()
    
    # Send notification to the reporter
    target_type_labels = {
        ReportTargetType.THREAD: "bài viết",
        ReportTargetType.COMMENT: "bình luận", 
        ReportTargetType.USER: "người dùng",
        ReportTargetType.POST: "bài đăng",
    }
    target_label = target_type_labels.get(report.target_type, "nội dung")
    
    if resolve_in.status == ReportStatus.RESOLVED:
        notification_content = f"Báo cáo {target_label} của bạn đã được xử lý. Cảm ơn bạn đã đóng góp!"
    else:
        notification_content = f"Báo cáo {target_label} của bạn đã được xem xét và bỏ qua."
    
    notification = Notification(
        user_id=report.reporter_id,
        actor_id=current_user.id,
        type=NotificationType.REPORT_RESOLVED,
        report_id=report.id,
        content=notification_content,
    )
    await notification.insert()
    
    # Auto-resolve other pending reports for the same target
    other_reports = await Report.find(
        Report.target_type == report.target_type,
        Report.target_id == report.target_id,
        Report.status == ReportStatus.PENDING,
        Report.id != report_id
    ).to_list()
    
    resolved_count = 0
    for other_report in other_reports:
        other_report.status = resolve_in.status
        other_report.moderator_id = current_user.id
        other_report.moderator_note = f"Auto-resolved: {resolve_in.moderator_note or 'Same target handled'}"
        other_report.resolved_at = datetime.now(UTC)
        await other_report.save()
        resolved_count += 1
        
        # Also notify other reporters
        other_notification = Notification(
            user_id=other_report.reporter_id,
            actor_id=current_user.id,
            type=NotificationType.REPORT_RESOLVED,
            report_id=other_report.id,
            content=notification_content,
        )
        await other_notification.insert()
    
    status_text = "resolved" if resolve_in.status == ReportStatus.RESOLVED else "dismissed"
    extra_msg = f" (+{resolved_count} related reports)" if resolved_count > 0 else ""
    action_msg = f" ({action_taken})" if action_taken != "no action" else ""
    
    logger.info(f"Report {report_id} {status_text} by {current_user.username}: {action_taken}{extra_msg}")
    
    return Message(message=f"Report {status_text}{action_msg}{extra_msg}")
