from fastapi import APIRouter

from app.api.routes import admin, arena_auth, comments, forum, friends, posts, utils
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(arena_auth.router)
api_router.include_router(comments.router)
api_router.include_router(friends.router)
api_router.include_router(posts.router)
api_router.include_router(forum.router)
api_router.include_router(admin.router) 
api_router.include_router(utils.router)
