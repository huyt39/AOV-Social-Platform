"""Arena-specific authentication routes for game platform."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.security import get_password_hash
from pydantic import BaseModel, EmailStr, Field

from app.models import (
    ArenaUserRegister,
    Message,
    ProfileVerificationData,
    RankEnum,
    User,
    UserRole,
)
from app.services.gemini import gemini_service
from app.services.upload import UploadServiceFactory
from app.api.deps import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["arena-auth"])


class LoginRequest(BaseModel):
    """Request model for login endpoint."""
    email: EmailStr
    password: str


@router.post("/verify-profile")
async def verify_profile(
    profile_screenshot: UploadFile = File(...),
) -> dict[str, Any]:
    """
    Verify game profile using screenshot and Gemini Vision API.

    Extracts player information from Arena of Valor profile screenshot:
    - in_game_name
    - level
    - rank
    - total_matches
    - win_rate
    - credibility_score
    """
    # Validate file type
    if not profile_screenshot.content_type:
        raise HTTPException(
            status_code=400, detail="File type could not be determined"
        )

    allowed_types = ["image/jpeg", "image/jpg", "image/png"]
    if profile_screenshot.content_type.lower() not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only JPG and PNG images are allowed",
        )

    # Validate file size (5MB max)
    content = await profile_screenshot.read()
    max_size = 5 * 1024 * 1024  # 5MB

    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail="File size exceeds 5MB limit",
        )

    # TODO: Upload to cloud storage (S3/Cloudinary) and get URL
    # For now, we'll use a placeholder URL
    screenshot_url = f"https://storage.example.com/profiles/{uuid.uuid4()}.jpg"

    # Verify profile with Gemini Vision
    try:
        verified_data = await gemini_service.verify_profile_screenshot(content)
    except ValueError as e:
        logger.error(f"Gemini API error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Profile verification service is not available. Please check API configuration.",
        )

    if not verified_data:
        missing_fields = [
            "Rank",
            "Level",
            "Số trận",
            "Tỷ lệ thắng",
            "Uy tín",
        ]
        raise HTTPException(
            status_code=400,
            detail="Không nhận diện đủ thông tin hồ sơ. Vui lòng chụp rõ hơn các thông tin: "
            + ", ".join(missing_fields),
        )

    # Add screenshot URL to response
    verified_data["screenshot_url"] = screenshot_url

    return {
        "success": True,
        "data": verified_data,
    }

@router.post("/register")
async def register_arena_user(
    user_in: ArenaUserRegister,
) -> dict[str, Any]:
    """
    Register new Arena user with verified profile data.

    This endpoint creates a new user account with game profile information
    that has been verified through the profile screenshot verification process.
    """
    # Check if username already exists
    existing_user = await User.find_one(User.username == user_in.username)
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username already registered",
        )

    # Check if email already exists
    existing_user = await User.find_one(User.email == user_in.email)
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    # Create new user
    user = User(
        id=str(uuid.uuid4()),
        email=user_in.email,
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        is_active=True,
        is_superuser=False,
        role=UserRole.USER,
        # Game profile fields from verification
        rank=user_in.rank,
        main_role=user_in.main_role,
        level=user_in.level,
        win_rate=user_in.win_rate,
        total_matches=user_in.total_matches,
        credibility_score=user_in.credibility_score,
        profile_screenshot_url=user_in.profile_screenshot_url,
        profile_verified=True,
        profile_verified_at=datetime.now(timezone.utc),
    )

    await user.insert()

    logger.info(f"New Arena user registered: {user.username} ({user.email})")

    return {
        "success": True,
        "message": "User registered successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "rank": user.rank.value if user.rank else None,
            "main_role": user.main_role.value if user.main_role else None,
            "role": user.role.value if user.role else "USER",
            "is_superuser": user.is_superuser,
        },
    }


@router.post("/login")
async def login_arena_user(
    login_data: LoginRequest,
) -> dict[str, Any]:
    """
    Login for Arena users.

    Note: This is a simplified login endpoint. In production, use the OAuth2
    token-based authentication from /login/access-token
    """
    from datetime import timedelta

    from app.core import security
    from app.core.config import settings
    from app.core.security import verify_password

    # Find user by email
    user = await User.find_one(User.email == login_data.email)

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        user.id, expires_delta=access_token_expires
    )

    return {
        "success": True,
        "token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "avatar_url": user.avatar_url,
            "rank": user.rank.value if user.rank else None,
            "main_role": user.main_role.value if user.main_role else None,
            "level": user.level,
            "win_rate": user.win_rate,
            "total_matches": user.total_matches,
            "credibility_score": user.credibility_score,
            "role": user.role.value if user.role else "USER",
            "is_superuser": user.is_superuser,
        },
    }


@router.post("/upload-image")
async def upload_image(
    image: UploadFile = File(...),
) -> dict[str, Any]:
    """
    Upload image to ImgBB.
    
    This endpoint can be used for uploading any image (avatars, posts, etc.).
    Returns the URL of the uploaded image.
    """
    # Validate file type
    if not image.content_type:
        raise HTTPException(
            status_code=400, detail="File type could not be determined"
        )

    allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
    if image.content_type.lower() not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG, GIF and WebP images are allowed",
        )

    content = await image.read()
    max_size = 5 * 1024 * 1024  # 5MB

    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail="File size exceeds 5MB limit",
        )

    try:
        uploader = UploadServiceFactory.get_default_image_uploader()
        result = await uploader.upload(content, image.filename)
        
        if not result.success:
            raise ValueError(result.error)
        
        return {
            "success": True,
            "url": result.url,
            "provider": result.provider,
        }
    except ValueError as e:
        logger.error(f"Image upload failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Image upload failed. Please try again.",
        )


@router.post("/upload-video")
async def upload_video_deprecated() -> dict[str, Any]:
    """
    DEPRECATED: Use /videos/upload-request for pre-signed URL upload.
    
    The new flow is:
    1. POST /videos/upload-request -> get pre-signed URL
    2. PUT to pre-signed URL -> upload directly to S3
    3. POST /videos/{video_id}/complete -> trigger processing
    """
    raise HTTPException(
        status_code=410,
        detail="This endpoint is deprecated. Use /videos/upload-request for video uploads with pre-signed URLs."
    )

@router.get("/me")
async def get_current_profile(
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Get current authenticated user's profile.
    """
    return {
        "success": True,
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "avatar_url": current_user.avatar_url,
            "rank": current_user.rank.value if current_user.rank else None,
            "main_role": current_user.main_role.value if current_user.main_role else None,
            "level": current_user.level,
            "win_rate": current_user.win_rate,
            "total_matches": current_user.total_matches,
            "credibility_score": current_user.credibility_score,
            "profile_verified": current_user.profile_verified,
            "role": current_user.role.value if current_user.role else "USER",
            "is_superuser": current_user.is_superuser,
        },
    }


@router.get("/users/{user_id}")
async def get_user_profile(
    user_id: str,
) -> dict[str, Any]:
    """
    Get public profile of a user by ID.
    """
    user = await User.find_one(User.id == user_id)
    
    if not user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại")
    
    return {
        "success": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "avatar_url": user.avatar_url,
            "rank": user.rank.value if user.rank else None,
            "main_role": user.main_role.value if user.main_role else None,
            "level": user.level,
            "win_rate": user.win_rate,
            "total_matches": user.total_matches,
            "credibility_score": user.credibility_score,
        },
    }


class AvatarUpdate(BaseModel):
    """Request model for avatar update."""
    avatar_url: str


@router.patch("/me/avatar")
async def update_avatar(
    avatar_data: AvatarUpdate,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Update current user's avatar URL.
    """
    current_user.avatar_url = avatar_data.avatar_url
    await current_user.save()
    
    logger.info(f"User {current_user.username} updated avatar")
    
    return {
        "success": True,
        "avatar_url": current_user.avatar_url,
    }


class ProfileUpdate(BaseModel):
    """Request model for profile update."""
    username: Optional[str] = Field(default=None, min_length=3, max_length=50)
    main_role: Optional[str] = None


@router.patch("/me/profile")
async def update_profile(
    profile_data: ProfileUpdate,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Update current user's profile information.
    
    Allows updating:
    - username (must be unique)
    - main_role (game position)
    """
    from app.models.base import GameRoleEnum
    
    # Track what was updated
    updated_fields = []
    
    # Update username if provided
    if profile_data.username and profile_data.username != current_user.username:
        # Check if username already exists
        existing_user = await User.find_one(User.username == profile_data.username)
        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="Tên người dùng đã tồn tại",
            )
        current_user.username = profile_data.username
        updated_fields.append("username")
    
    # Update main_role if provided
    if profile_data.main_role:
        try:
            current_user.main_role = GameRoleEnum(profile_data.main_role)
            updated_fields.append("main_role")
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Vị trí không hợp lệ: {profile_data.main_role}",
            )
    
    if updated_fields:
        await current_user.save()
        logger.info(f"User {current_user.id} updated profile: {', '.join(updated_fields)}")
    
    return {
        "success": True,
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "avatar_url": current_user.avatar_url,
            "rank": current_user.rank.value if current_user.rank else None,
            "main_role": current_user.main_role.value if current_user.main_role else None,
            "level": current_user.level,
            "win_rate": current_user.win_rate,
            "total_matches": current_user.total_matches,
            "credibility_score": current_user.credibility_score,
            "profile_verified": current_user.profile_verified,
            "role": current_user.role.value if current_user.role else "USER",
            "is_superuser": current_user.is_superuser,
        },
    }

