"""Upload services module using Factory Pattern.

This module provides image and video upload services with support for
multiple providers through the Factory Pattern.

Example usage:
    from app.services.upload import UploadServiceFactory
    
    # Upload image
    uploader = UploadServiceFactory.get_default_image_uploader()
    result = await uploader.upload(image_data, "my_image.jpg")
    
    # Upload video
    video_uploader = UploadServiceFactory.get_default_video_uploader()
    result = await video_uploader.upload(video_data, "my_video.mp4", "video/mp4")
"""

from .base import (
    BaseUploader,
    ImageUploader,
    VideoUploader,
    UploadResult,
    UploadType,
)
from .factory import (
    UploadServiceFactory,
    ImageUploaderFactory,
    VideoUploaderFactory,
    ImageProvider,
    VideoProvider,
)
from .imgbb import ImgBBUploader
from .s3 import S3VideoUploader


__all__ = [
    # Base classes
    "BaseUploader",
    "ImageUploader",
    "VideoUploader",
    "UploadResult",
    "UploadType",
    # Factory
    "UploadServiceFactory",
    "ImageUploaderFactory",
    "VideoUploaderFactory",
    "ImageProvider",
    "VideoProvider",
    # Implementations
    "ImgBBUploader",
    "S3VideoUploader",
]
