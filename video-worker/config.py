"""Configuration for video worker service."""

import os
from pathlib import Path

# Load .env file from video-worker directory or parent
from dotenv import load_dotenv

# Try to load from video-worker/.env first, then parent .env
env_path = Path(__file__).parent / ".env"
if not env_path.exists():
    env_path = Path(__file__).parent.parent / "backend" / ".env"
load_dotenv(env_path)


class Config:
    """Video worker configuration from environment variables."""
    
    # RabbitMQ - use localhost for local dev, Docker overrides with env var
    RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
    VIDEO_TRANSCODE_QUEUE = "video.transcode"
    
    # S3 Configuration - loaded from .env
    S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "")
    S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "")
    S3_REGION = os.getenv("S3_REGION", "ap-southeast-1")
    S3_FORCE_PATH_STYLE = os.getenv("S3_FORCE_PATH_STYLE", "true").lower() == "true"
    S3_USE_SSL = os.getenv("S3_USE_SSL", "true").lower() == "true"
    
    # Use external endpoint for local dev, Docker can override with S3_INTERNAL_ENDPOINT
    S3_ENDPOINT = os.getenv("S3_ENDPOINT", "https://objectstorageapi.ap-southeast-1.clawcloudrun.com")
    S3_RAW_BUCKET = os.getenv("S3_RAW_BUCKET", "xfwyb01b-raw-videos")
    S3_PROCESSED_BUCKET = os.getenv("S3_PROCESSED_BUCKET", "xfwyb01b-processed-videos")
    
    # CDN base URL for generating play URLs
    CDN_BASE_URL = os.getenv("CDN_BASE_URL", "https://objectstorageapi.ap-southeast-1.clawcloudrun.com")
    
    # Backend API for callbacks - use localhost for local dev, Docker overrides
    BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
    INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "internal-worker-token")
    
    # Processing settings
    TEMP_DIR = "/tmp/video-worker"
    
    # FFmpeg output resolutions
    RESOLUTIONS = {
        "480p": {"width": 854, "height": 480, "bitrate": "1000k"},
        "720p": {"width": 1280, "height": 720, "bitrate": "2500k"},
        "1080p": {"width": 1920, "height": 1080, "bitrate": "5000k"},
    }


config = Config()
