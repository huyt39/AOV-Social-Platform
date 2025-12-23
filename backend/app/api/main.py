from fastapi import APIRouter

from app.api.routes import admin, arena_auth, chatbot, comments, forum, friends, messages, notifications, posts, reels, search, teams, utils, videos, websocket
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(arena_auth.router)
api_router.include_router(comments.router)
api_router.include_router(friends.router)
api_router.include_router(posts.router)
api_router.include_router(forum.router)
api_router.include_router(teams.router)
api_router.include_router(search.router)
api_router.include_router(admin.router) 
api_router.include_router(utils.router)
api_router.include_router(videos.router)
api_router.include_router(reels.router)
api_router.include_router(notifications.router)
api_router.include_router(messages.router)
api_router.include_router(websocket.router)
api_router.include_router(chatbot.router)
