import sentry_sdk
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.core.db import close_mongodb_connection, connect_to_mongodb
from app.core.exceptions import BaseAppException
from app.core.logger import get_logger, log_exception

logger = get_logger(__name__)


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
    
    # Start message consumer
    try:
        from app.services.message_consumer import message_consumer
        await message_consumer.start()
        print("✅ Message consumer started")
    except Exception as e:
        print(f"⚠️ Message consumer failed to start: {e}")
    
    # Ensure S3 buckets exist
    try:
        from app.services.clawcloud_s3 import clawcloud_s3
        await clawcloud_s3.ensure_buckets_exist()
        print("✅ S3 buckets checked/created")
    except Exception as e:
        print(f"⚠️ S3 bucket setup skipped: {e}")
    
    yield
    
    # Shutdown
    # Stop message consumer
    try:
        from app.services.message_consumer import message_consumer
        await message_consumer.stop()
        print("❌ Message consumer stopped")
    except Exception as e:
        print(f"⚠️ Error stopping message consumer: {e}")
    
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


# Exception handlers for standardized error responses
@app.exception_handler(BaseAppException)
async def base_app_exception_handler(request: Request, exc: BaseAppException):
    """Handle all custom application exceptions."""
    log_exception(logger, exc)
    return JSONResponse(
        status_code=exc.http_status_code,
        content={
            "success": False,
            "error": exc.message,
            "error_code": exc.error_code,
            "detail": exc.to_dict(),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle FastAPI HTTPException with standardized format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
            "error_code": f"HTTP_{exc.status_code}",
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors with user-friendly messages."""
    errors = exc.errors()
    
    # Build field-specific error messages
    field_errors = {}
    messages = []
    
    for error in errors:
        field = ".".join(str(loc) for loc in error["loc"] if loc != "body")
        msg = error["msg"]
        
        # Translate common validation messages to Vietnamese
        if "String should have at least" in msg:
            msg = msg.replace("String should have at least", "Phải có ít nhất")
            msg = msg.replace("characters", "ký tự")
        elif "value is not a valid email address" in msg:
            msg = "Email không hợp lệ"
        elif "Field required" in msg:
            msg = "Trường này là bắt buộc"
        
        field_errors[field] = msg
        messages.append(f"{field}: {msg}")
    
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": messages[0] if len(messages) == 1 else "Dữ liệu không hợp lệ",
            "error_code": "VALIDATION_ERROR",
            "field_errors": field_errors,
            "details": errors,
        },
    )


app.include_router(api_router, prefix=settings.API_V1_STR)
