"""AWS S3 video upload implementation."""

import logging
import uuid
from typing import Optional

import aioboto3

from app.core.config import settings
from .base import VideoUploader, UploadResult

logger = logging.getLogger(__name__)


class S3VideoUploader(VideoUploader):
    """AWS S3 video upload service implementation."""
    
    def __init__(
        self,
        bucket_name: Optional[str] = None,
        region: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
    ):
        """
        Initialize S3 video uploader.
        
        Args:
            bucket_name: S3 bucket name. If not provided, uses settings.AWS_S3_BUCKET
            region: AWS region. If not provided, uses settings.AWS_REGION
            access_key: AWS access key. If not provided, uses settings.AWS_ACCESS_KEY_ID
            secret_key: AWS secret key. If not provided, uses settings.AWS_SECRET_ACCESS_KEY
        """
        self.bucket_name = bucket_name or getattr(settings, 'AWS_S3_BUCKET', None)
        self.region = region or getattr(settings, 'AWS_REGION', 'ap-southeast-1')
        self.access_key = access_key or getattr(settings, 'AWS_ACCESS_KEY_ID', None)
        self.secret_key = secret_key or getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)
        
        if not self.bucket_name:
            raise ValueError("S3 bucket name is required")
        if not self.access_key or not self.secret_key:
            raise ValueError("AWS credentials are required")
    
    @property
    def provider_name(self) -> str:
        return "s3"
    
    def _generate_key(self, name: Optional[str], content_type: Optional[str]) -> str:
        """Generate unique S3 key for the video."""
        ext = ".mp4"  # Default extension
        if content_type:
            ext_map = {
                "video/mp4": ".mp4",
                "video/webm": ".webm",
                "video/quicktime": ".mov",
                "video/x-msvideo": ".avi",
                "video/x-matroska": ".mkv",
            }
            ext = ext_map.get(content_type, ".mp4")
        
        if name:
            # Sanitize name
            safe_name = "".join(c for c in name if c.isalnum() or c in "._-")
            return f"videos/{uuid.uuid4().hex[:8]}_{safe_name}{ext}"
        
        return f"videos/{uuid.uuid4().hex}{ext}"
    
    def _get_public_url(self, key: str) -> str:
        """Generate public URL for the uploaded video."""
        return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{key}"
    
    async def upload(
        self,
        video_data: bytes,
        name: Optional[str] = None,
        content_type: Optional[str] = None
    ) -> UploadResult:
        """
        Upload video to S3 and return the public URL.
        
        Args:
            video_data: Raw video bytes
            name: Optional name for the video
            content_type: MIME type of the video
            
        Returns:
            UploadResult with success status and URL or error
        """
        try:
            key = self._generate_key(name, content_type)
            
            session = aioboto3.Session(
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region
            )
            
            async with session.client('s3') as s3:
                await s3.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=video_data,
                    ContentType=content_type or "video/mp4",
                    ACL="public-read"  # Make video publicly accessible
                )
            
            url = self._get_public_url(key)
            logger.info(f"Video uploaded to S3: {key}")
            
            return UploadResult(
                success=True,
                url=url,
                provider=self.provider_name
            )
            
        except Exception as e:
            logger.error(f"S3 video upload error: {e}")
            return UploadResult(
                success=False,
                error=f"Video upload failed: {str(e)}",
                provider=self.provider_name
            )
