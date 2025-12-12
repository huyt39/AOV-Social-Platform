"""Upload service factory module."""

from enum import Enum
from typing import Union

from app.core.config import settings
from .base import ImageUploader, VideoUploader, UploadType
from .imgbb import ImgBBUploader
from .s3 import S3VideoUploader


class ImageProvider(str, Enum):
    """Available image upload providers."""
    IMGBB = "imgbb"
    # Future providers: CLOUDINARY, FIREBASE, etc.


class VideoProvider(str, Enum):
    """Available video upload providers."""
    S3 = "s3"
    # Future providers: CLOUDFLARE_STREAM, VIMEO, etc.


class UploadServiceFactory:
    """Factory for creating upload service instances."""
    
    @staticmethod
    def create_image_uploader(
        provider: ImageProvider = ImageProvider.IMGBB
    ) -> ImageUploader:
        """
        Create an image uploader instance.
        
        Args:
            provider: Image upload provider to use
            
        Returns:
            ImageUploader instance
            
        Raises:
            ValueError: If provider is not supported
        """
        if provider == ImageProvider.IMGBB:
            return ImgBBUploader()
        
        raise ValueError(f"Unknown image provider: {provider}")
    
    @staticmethod
    def create_video_uploader(
        provider: VideoProvider = VideoProvider.S3
    ) -> VideoUploader:
        """
        Create a video uploader instance.
        
        Args:
            provider: Video upload provider to use
            
        Returns:
            VideoUploader instance
            
        Raises:
            ValueError: If provider is not supported
        """
        if provider == VideoProvider.S3:
            return S3VideoUploader()
        
        raise ValueError(f"Unknown video provider: {provider}")
    
    @staticmethod
    def get_default_image_uploader() -> ImageUploader:
        """Get the default image uploader based on configuration."""
        return UploadServiceFactory.create_image_uploader(ImageProvider.IMGBB)
    
    @staticmethod
    def get_default_video_uploader() -> VideoUploader:
        """Get the default video uploader based on configuration."""
        return UploadServiceFactory.create_video_uploader(VideoProvider.S3)


# Convenience aliases
ImageUploaderFactory = UploadServiceFactory
VideoUploaderFactory = UploadServiceFactory
