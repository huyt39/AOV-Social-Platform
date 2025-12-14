"""Authentication dependencies with RBAC support."""
from typing import Annotated, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError

from app.core import security
from app.core.config import settings
from app.models import TokenPayload, User, UserRole

# OAuth2 scheme - auto_error=False allows optional authentication
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=True
)

optional_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False  # Don't raise error if token is missing
)

TokenDep = Annotated[str, Depends(reusable_oauth2)]
OptionalTokenDep = Annotated[Optional[str], Depends(optional_oauth2)]


async def get_current_user(token: TokenDep) -> User:
    """Get current authenticated user. Raises 403 if not authenticated."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )

    # Find user by ID using Beanie
    user = await User.get(token_data.sub)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


async def get_current_user_optional(token: OptionalTokenDep) -> Optional[User]:
    """
    Get current user if authenticated, otherwise return None.
    Used for endpoints that support both authenticated and guest access.
    """
    if not token:
        return None
    
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        return None

    user = await User.get(token_data.sub)
    if not user or not user.is_active:
        return None
    
    return user


def get_current_active_superuser(current_user: "CurrentUser") -> User:
    """Legacy superuser check. Prefer using RequireAdmin for new code."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user


def require_role(*allowed_roles: UserRole):
    """
    Dependency factory to require specific user roles.
    
    Usage:
        @router.get("/admin-only")
        async def admin_endpoint(user: User = Depends(require_role(UserRole.ADMIN))):
            ...
    """
    async def role_checker(current_user: "CurrentUser") -> User:
        # is_superuser always has admin access
        if current_user.is_superuser:
            return current_user
        
        # Check if user has any of the allowed roles
        user_role = getattr(current_user, 'role', UserRole.USER)
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {[r.value for r in allowed_roles]}"
            )
        return current_user
    
    return role_checker


async def require_moderator(current_user: "CurrentUser") -> User:
    """Require MODERATOR or ADMIN role."""
    if current_user.is_superuser:
        return current_user
    
    user_role = getattr(current_user, 'role', UserRole.USER)
    if user_role not in [UserRole.MODERATOR, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Moderator or Admin privileges required"
        )
    return current_user


async def require_admin(current_user: "CurrentUser") -> User:
    """Require ADMIN role."""
    if current_user.is_superuser:
        return current_user
    
    user_role = getattr(current_user, 'role', UserRole.USER)
    if user_role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user


# Type aliases for dependency injection
CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[Optional[User], Depends(get_current_user_optional)]
ModeratorUser = Annotated[User, Depends(require_moderator)]
AdminUser = Annotated[User, Depends(require_admin)]
