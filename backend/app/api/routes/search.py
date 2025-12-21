"""Global search API routes."""

import re
from typing import Any

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser
from app.models import User

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/users")
async def search_users(
    current_user: CurrentUser,
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(default=20, ge=1, le=50),
) -> dict[str, Any]:
    """
    Search all users by username.
    Returns users matching the query (global search, not limited to friends).
    """
    # Case-insensitive regex pattern
    escaped_query = re.escape(q)
    
    # Search all active users (excluding current user)
    users = await User.find(
        {
            "username": {"$regex": escaped_query, "$options": "i"},
            "id": {"$ne": current_user.id},
            "is_active": True,
        }
    ).limit(limit).to_list()
    
    results = []
    for user in users:
        results.append({
            "id": user.id,
            "username": user.username,
            "avatar_url": user.avatar_url,
            "rank": user.rank,
            "level": user.level,
        })
    
    return {
        "success": True,
        "data": results
    }
