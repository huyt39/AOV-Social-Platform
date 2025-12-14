"""ClawCloud S3-compatible storage service for video uploads.

This module provides S3 service with:
- Path-style URLs (required by ClawCloud)
- Pre-signed URL generation for direct client uploads
- Dual endpoint support (internal for workers, external for clients)
"""

import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import quote

import aioboto3
from botocore.config import Config

from app.core.config import settings

logger = logging.getLogger(__name__)


class ClawCloudS3Service:
    """ClawCloud S3-compatible storage service."""
    
    def __init__(self):
        """Initialize S3 service with ClawCloud configuration."""
        self.access_key = settings.S3_ACCESS_KEY
        self.secret_key = settings.S3_SECRET_KEY
        self.region = settings.S3_REGION
        self.use_ssl = settings.S3_USE_SSL
        self.force_path_style = settings.S3_FORCE_PATH_STYLE
        self.internal_endpoint = settings.S3_INTERNAL_ENDPOINT
        self.external_endpoint = settings.S3_EXTERNAL_ENDPOINT
        self.raw_bucket = settings.S3_RAW_BUCKET
        self.processed_bucket = settings.S3_PROCESSED_BUCKET
        self.cdn_base_url = settings.CDN_BASE_URL
        
        # Boto3 config for path-style URLs
        self._config = Config(
            signature_version='s3v4',
            s3={'addressing_style': 'path'}
        )
    
    def _get_session(self) -> aioboto3.Session:
        """Create authenticated aioboto3 session."""
        return aioboto3.Session(
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region
        )
    
    def _get_endpoint_url(self, internal: bool = False) -> str:
        """Get the appropriate endpoint URL."""
        endpoint = self.internal_endpoint if internal else self.external_endpoint
        if not endpoint.startswith('http'):
            protocol = 'https' if self.use_ssl else 'http'
            endpoint = f"{protocol}://{endpoint}"
        return endpoint
    
    def generate_raw_key(self, video_id: str, filename: Optional[str] = None) -> str:
        """Generate S3 key for raw video upload."""
        ext = ".mp4"
        if filename:
            ext = f".{filename.rsplit('.', 1)[-1]}" if '.' in filename else ".mp4"
        return f"raw/{video_id}{ext}"
    
    def generate_processed_path(self, video_id: str) -> str:
        """Generate S3 path prefix for processed video files."""
        return f"{video_id}/"
    
    async def generate_presigned_put_url(
        self, 
        s3_key: str, 
        content_type: str = "video/mp4",
        expires_in: int = 3600
    ) -> str:
        """
        Generate pre-signed PUT URL for direct client upload.
        
        Args:
            s3_key: S3 key where the file will be uploaded
            content_type: MIME type of the file
            expires_in: URL expiration time in seconds (default 1 hour)
            
        Returns:
            Pre-signed PUT URL for direct upload
        """
        session = self._get_session()
        endpoint_url = self._get_endpoint_url(internal=False)
        
        async with session.client(
            's3',
            endpoint_url=endpoint_url,
            config=self._config
        ) as s3:
            url = await s3.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': self.raw_bucket,
                    'Key': s3_key,
                    'ContentType': content_type
                },
                ExpiresIn=expires_in
            )
            
        logger.info(f"Generated pre-signed PUT URL for key: {s3_key}")
        return url
    
    async def generate_presigned_get_url(
        self,
        bucket: str,
        s3_key: str,
        expires_in: int = 86400  # 24 hours
    ) -> str:
        """Generate pre-signed GET URL for downloading a file."""
        session = self._get_session()
        endpoint_url = self._get_endpoint_url(internal=False)
        
        async with session.client(
            's3',
            endpoint_url=endpoint_url,
            config=self._config
        ) as s3:
            url = await s3.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': bucket,
                    'Key': s3_key
                },
                ExpiresIn=expires_in
            )
            
        return url
    
    def get_public_url(self, bucket: str, s3_key: str) -> str:
        """
        Get public URL for a file (via CDN).
        
        For initial phase without Cloudflare, this uses the external S3 endpoint.
        When CDN is configured, CDN_BASE_URL will serve cached content.
        """
        # Path-style URL: https://endpoint/bucket/key
        return f"{self.cdn_base_url}/{bucket}/{s3_key}"
    
    def get_video_play_url(self, video_id: str) -> str:
        """Get HLS master playlist URL for a processed video."""
        return self.get_public_url(self.processed_bucket, f"{video_id}/master.m3u8")
    
    def get_video_thumbnail_url(self, video_id: str) -> str:
        """Get thumbnail URL for a processed video."""
        return self.get_public_url(self.processed_bucket, f"{video_id}/thumbnail.jpg")
    
    async def upload_file(
        self,
        bucket: str,
        s3_key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        internal: bool = False
    ) -> bool:
        """
        Upload file directly to S3.
        
        Args:
            bucket: Target bucket name
            s3_key: S3 key for the file
            data: File content as bytes
            content_type: MIME type
            internal: Use internal endpoint (for workers)
            
        Returns:
            True if successful
        """
        session = self._get_session()
        endpoint_url = self._get_endpoint_url(internal=internal)
        
        try:
            async with session.client(
                's3',
                endpoint_url=endpoint_url,
                config=self._config
            ) as s3:
                await s3.put_object(
                    Bucket=bucket,
                    Key=s3_key,
                    Body=data,
                    ContentType=content_type
                )
                
            logger.info(f"Uploaded file to s3://{bucket}/{s3_key}")
            return True
            
        except Exception as e:
            logger.error(f"S3 upload failed: {e}")
            return False
    
    async def download_file(
        self,
        bucket: str,
        s3_key: str,
        internal: bool = True
    ) -> Optional[bytes]:
        """
        Download file from S3.
        
        Args:
            bucket: Source bucket name
            s3_key: S3 key for the file
            internal: Use internal endpoint (for workers)
            
        Returns:
            File content as bytes, or None if failed
        """
        session = self._get_session()
        endpoint_url = self._get_endpoint_url(internal=internal)
        
        try:
            async with session.client(
                's3',
                endpoint_url=endpoint_url,
                config=self._config
            ) as s3:
                response = await s3.get_object(Bucket=bucket, Key=s3_key)
                data = await response['Body'].read()
                
            logger.info(f"Downloaded file from s3://{bucket}/{s3_key}")
            return data
            
        except Exception as e:
            logger.error(f"S3 download failed: {e}")
            return None
    
    async def check_file_exists(
        self,
        bucket: str,
        s3_key: str,
        internal: bool = False
    ) -> bool:
        """Check if a file exists in S3."""
        session = self._get_session()
        endpoint_url = self._get_endpoint_url(internal=internal)
        
        try:
            async with session.client(
                's3',
                endpoint_url=endpoint_url,
                config=self._config
            ) as s3:
                await s3.head_object(Bucket=bucket, Key=s3_key)
            return True
        except Exception:
            return False
    
    async def ensure_buckets_exist(self) -> None:
        """Ensure required buckets exist (create if not)."""
        session = self._get_session()
        endpoint_url = self._get_endpoint_url(internal=False)
        
        for bucket in [self.raw_bucket, self.processed_bucket]:
            try:
                async with session.client(
                    's3',
                    endpoint_url=endpoint_url,
                    config=self._config
                ) as s3:
                    try:
                        await s3.head_bucket(Bucket=bucket)
                        logger.info(f"Bucket exists: {bucket}")
                    except Exception:
                        await s3.create_bucket(Bucket=bucket)
                        logger.info(f"Created bucket: {bucket}")
            except Exception as e:
                logger.error(f"Failed to ensure bucket {bucket}: {e}")


# Singleton instance
clawcloud_s3 = ClawCloudS3Service()
