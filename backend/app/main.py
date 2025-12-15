import sentry_sdk
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.core.db import close_mongodb_connection, connect_to_mongodb


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    # Startup
    await connect_to_mongodb()
    
    # Connect to Redis
    try:
        from app.services.redis_client import redis_service
        await redis_service.connect()
        print("✅ Redis connected")
    except Exception as e:
        print(f"⚠️ Redis connection failed: {e}")
    
    # Start notification consumer
    try:
        from app.services.notification_consumer import notification_consumer
        await notification_consumer.start()
        print("✅ Notification consumer started")
    except Exception as e:
        print(f"⚠️ Notification consumer failed to start: {e}")
    
    # Ensure S3 buckets exist
    try:
        from app.services.clawcloud_s3 import clawcloud_s3
        await clawcloud_s3.ensure_buckets_exist()
        print("✅ S3 buckets checked/created")
    except Exception as e:
        print(f"⚠️ S3 bucket setup skipped: {e}")
    
    yield
    
    # Shutdown
    # Stop notification consumer
    try:
        from app.services.notification_consumer import notification_consumer
        await notification_consumer.stop()
        print("❌ Notification consumer stopped")
    except Exception as e:
        print(f"⚠️ Error stopping notification consumer: {e}")
    
    # Disconnect Redis
    try:
        from app.services.redis_client import redis_service
        await redis_service.disconnect()
        print("❌ Redis disconnected")
    except Exception as e:
        print(f"⚠️ Error disconnecting Redis: {e}")
    
    await close_mongodb_connection()


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan,
)

# Set all CORS enabled origins
cors_origins = settings.all_cors_origins or [
    "http://localhost:5173",
    "http://localhost:3000", 
    "http://localhost",
    "http://localhost:8000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)
