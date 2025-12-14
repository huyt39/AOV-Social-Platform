"""Helper module for S3 operations in video worker."""

import logging
import mimetypes
from typing import Optional

import boto3
from botocore.config import Config as BotoConfig

from config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class S3Client:
    """S3 client for video worker."""
    
    def __init__(self):
        """Initialize S3 client with ClawCloud configuration."""
        boto_config = BotoConfig(
            signature_version='s3v4',
            s3={'addressing_style': 'path'}
        )
        
        self.client = boto3.client(
            's3',
            endpoint_url=config.S3_ENDPOINT,
            aws_access_key_id=config.S3_ACCESS_KEY,
            aws_secret_access_key=config.S3_SECRET_KEY,
            region_name=config.S3_REGION,
            config=boto_config
        )
        
        self.raw_bucket = config.S3_RAW_BUCKET
        self.processed_bucket = config.S3_PROCESSED_BUCKET
        self.cdn_base_url = config.CDN_BASE_URL
    
    def download_raw_video(self, s3_key: str) -> Optional[bytes]:
        """Download raw video from S3."""
        try:
            response = self.client.get_object(
                Bucket=self.raw_bucket,
                Key=s3_key
            )
            data = response['Body'].read()
            logger.info(f"Downloaded raw video: {s3_key} ({len(data)} bytes)")
            return data
        except Exception as e:
            logger.error(f"Failed to download {s3_key}: {e}")
            return None
    
    def upload_processed_file(
        self, 
        local_path: str, 
        video_id: str, 
        relative_path: str
    ) -> Optional[str]:
        """Upload processed file to S3."""
        s3_key = f"{video_id}/{relative_path}"
        
        # Determine content type
        content_type, _ = mimetypes.guess_type(local_path)
        if content_type is None:
            if local_path.endswith('.m3u8'):
                content_type = 'application/vnd.apple.mpegurl'
            elif local_path.endswith('.ts'):
                content_type = 'video/MP2T'
            else:
                content_type = 'application/octet-stream'
        
        try:
            with open(local_path, 'rb') as f:
                self.client.put_object(
                    Bucket=self.processed_bucket,
                    Key=s3_key,
                    Body=f.read(),
                    ContentType=content_type
                )
            
            logger.info(f"Uploaded: {s3_key}")
            return self.get_public_url(s3_key)
        except Exception as e:
            logger.error(f"Failed to upload {s3_key}: {e}")
            return None
    
    def get_public_url(self, s3_key: str) -> str:
        """Get public URL for processed file."""
        return f"{self.cdn_base_url}/{self.processed_bucket}/{s3_key}"
    
    def get_play_url(self, video_id: str) -> str:
        """Get HLS master playlist URL."""
        return f"{self.cdn_base_url}/{self.processed_bucket}/{video_id}/master.m3u8"
    
    def get_thumbnail_url(self, video_id: str) -> str:
        """Get thumbnail URL."""
        return f"{self.cdn_base_url}/{self.processed_bucket}/{video_id}/thumbnail.jpg"


# Singleton instance
s3_client = S3Client()
