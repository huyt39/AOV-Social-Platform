"""Notification API routes.

Provides REST endpoints for notification history, marking as read,
and getting unread counts.
"""

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser
from app.models import (
    Notification,
    NotificationActor,
    NotificationPublic,
    NotificationsResponse,
    UnreadCountResponse,
    User,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


async def enrich_notification(notification: Notification) -> NotificationPublic:
    """Add actor information to a notification."""
    actor = await User.find_one(User.id == notification.actor_id)
    
    if not actor:
        actor_info = NotificationActor(
            id=notification.actor_id,
            username="[Deleted User]",
        )
    else:
        actor_info = NotificationActor(
            id=actor.id,
            username=actor.username,
            avatar_url=actor.avatar_url,
        )
    
    return NotificationPublic(
        id=notification.id,
        user_id=notification.user_id,
        actor_id=notification.actor_id,
        actor=actor_info,
        type=notification.type,
        post_id=notification.post_id,
        comment_id=notification.comment_id,
        friendship_id=notification.friendship_id,
        team_id=notification.team_id,
        content=notification.content,
        is_read=notification.is_read,
        created_at=notification.created_at,
    )


@router.get("")
async def get_notifications(
    current_user: CurrentUser,
    cursor: Optional[str] = Query(default=None, description="Cursor (ISO datetime) for pagination"),
    limit: int = Query(default=20, ge=1, le=50, description="Number of notifications per page"),
    unread_only: bool = Query(default=False, description="Filter to unread notifications only"),
) -> NotificationsResponse:
    """
    Get notification history for the current user.
    
    Uses cursor-based pagination with newest first.
    """
    # Build base query
    query_conditions = [Notification.user_id == current_user.id]
    
    if unread_only:
        query_conditions.append(Notification.is_read == False)
    
    # Apply cursor if provided
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
            query_conditions.append(Notification.created_at < cursor_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor format")
    
    # Execute query
    notifications = await Notification.find(
        *query_conditions
    ).sort(-Notification.created_at).limit(limit + 1).to_list()
    
    # Determine if there are more
    has_more = len(notifications) > limit
    if has_more:
        notifications = notifications[:limit]
    
    # Get next cursor
    next_cursor = None
    if has_more and notifications:
        next_cursor = notifications[-1].created_at.isoformat()
    
    # Enrich with actor info
    enriched = []
    for notification in notifications:
        enriched.append(await enrich_notification(notification))
    
    # Get unread count
    unread_count = await Notification.find(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).count()
    
    return NotificationsResponse(
        data=enriched,
        next_cursor=next_cursor,
        has_more=has_more,
        unread_count=unread_count,
    )


@router.get("/unread-count")
async def get_unread_count(
    current_user: CurrentUser,
) -> UnreadCountResponse:
    """Get count of unread notifications."""
    count = await Notification.find(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).count()
    
    return UnreadCountResponse(unread_count=count)


@router.patch("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Mark a single notification as read."""
    notification = await Notification.find_one(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    )
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    if not notification.is_read:
        notification.is_read = True
        await notification.save()
    
    return {
        "success": True,
        "message": "Notification marked as read",
    }


@router.patch("/read-all")
async def mark_all_as_read(
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Mark all notifications as read for the current user."""
    # Update all unread notifications
    result = await Notification.find(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"$set": {"is_read": True}})
    
    modified_count = result.modified_count if hasattr(result, 'modified_count') else 0
    
    logger.info(f"Marked {modified_count} notifications as read for user {current_user.id}")
    
    return {
        "success": True,
        "message": f"Marked {modified_count} notifications as read",
        "count": modified_count,
    }


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Delete a notification."""
    notification = await Notification.find_one(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    )
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    await notification.delete()
    
    return {
        "success": True,
        "message": "Notification deleted",
    }


@router.delete("")
async def delete_all_notifications(
    current_user: CurrentUser,
    read_only: bool = Query(default=True, description="Delete only read notifications"),
) -> dict[str, Any]:
    """Delete notifications for the current user."""
    query_conditions = [Notification.user_id == current_user.id]
    
    if read_only:
        query_conditions.append(Notification.is_read == True)
    
    result = await Notification.find(*query_conditions).delete()
    deleted_count = result.deleted_count if hasattr(result, 'deleted_count') else 0
    
    logger.info(f"Deleted {deleted_count} notifications for user {current_user.id}")
    
    return {
        "success": True,
        "message": f"Deleted {deleted_count} notifications",
        "count": deleted_count,
    }
