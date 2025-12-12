"""Base classes for upload services using Factory Pattern."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class UploadType(str, Enum):
    """Supported upload types."""
    IMAGE = "image"
    VIDEO = "video"


@dataclass
class UploadResult:
    """Result of an upload operation."""
    success: bool
    url: Optional[str] = None
    error: Optional[str] = None
    provider: Optional[str] = None
    
    def __post_init__(self):
        if self.success and not self.url:
            raise ValueError("URL is required for successful uploads")


class BaseUploader(ABC):
    """Abstract base class for all upload services."""
    
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the name of the upload provider."""
        pass
    
    @property
    @abstractmethod
    def supported_types(self) -> list[UploadType]:
        """Return list of supported upload types."""
        pass
    
    def supports(self, upload_type: UploadType) -> bool:
        """Check if this uploader supports the given type."""
        return upload_type in self.supported_types


class ImageUploader(BaseUploader):
    """Abstract base class for image upload services."""
    
    @property
    def supported_types(self) -> list[UploadType]:
        return [UploadType.IMAGE]
    
    @abstractmethod
    async def upload(self, image_data: bytes, name: Optional[str] = None) -> UploadResult:
        """
        Upload image and return result.
        
        Args:
            image_data: Raw image bytes
            name: Optional name for the image
            
        Returns:
            UploadResult with success status and URL or error
        """
        pass


class VideoUploader(BaseUploader):
    """Abstract base class for video upload services."""
    
    @property
    def supported_types(self) -> list[UploadType]:
        return [UploadType.VIDEO]
    
    @abstractmethod
    async def upload(
        self, 
        video_data: bytes, 
        name: Optional[str] = None,
        content_type: Optional[str] = None
    ) -> UploadResult:
        """
        Upload video and return result.
        
        Args:
            video_data: Raw video bytes
            name: Optional name for the video
            content_type: MIME type of the video
            
        Returns:
            UploadResult with success status and URL or error
        """
        pass
