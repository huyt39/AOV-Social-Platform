from fastapi import APIRouter

from app.api.routes import arena_auth, friends, posts, utils  # items, login, private, users
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(arena_auth.router)
api_router.include_router(friends.router)
api_router.include_router(posts.router)
# api_router.include_router(login.router)  # TODO: Update for MongoDB
# api_router.include_router(users.router)  # TODO: Update for MongoDB
api_router.include_router(utils.router)
# api_router.include_router(items.router)  # TODO: Update for MongoDB


# if settings.ENVIRONMENT == "local":
#     api_router.include_router(private.router)  # TODO: Update for MongoDB
