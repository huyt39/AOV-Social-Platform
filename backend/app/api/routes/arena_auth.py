"""Arena-specific authentication routes for game platform."""

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.security import get_password_hash
from app.models import (
    ArenaUserRegister,
    Message,
    ProfileVerificationData,
    RankEnum,
    User,
)
from app.services.gemini import gemini_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["arena-auth"])


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
        # Game profile fields from verification
        rank=user_in.rank,
        main_role=user_in.main_role,
        level=user_in.level,
        win_rate=user_in.win_rate,
        total_matches=user_in.total_matches,
        credibility_score=user_in.credibility_score,
        profile_screenshot_url=user_in.profile_screenshot_url,
        profile_verified=True,
        profile_verified_at=datetime.now(UTC),
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
        },
    }


@router.post("/login")
async def login_arena_user(
    email: str,
    password: str,
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
    user = await User.find_one(User.email == email)

    if not user or not verify_password(password, user.hashed_password):
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
            "rank": user.rank.value if user.rank else None,
            "main_role": user.main_role.value if user.main_role else None,
        },
    }
