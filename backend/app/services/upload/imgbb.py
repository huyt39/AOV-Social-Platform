"""ImgBB image upload implementation."""

import base64
import logging
from typing import Optional

import httpx

from app.core.config import settings
from .base import ImageUploader, UploadResult

logger = logging.getLogger(__name__)


class ImgBBUploader(ImageUploader):
    """ImgBB image upload service implementation."""
    
    API_URL = "https://api.imgbb.com/1/upload"
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize ImgBB uploader.
        
        Args:
            api_key: ImgBB API key. If not provided, uses settings.IMGBB_API_KEY
        """
        self.api_key = api_key or settings.IMGBB_API_KEY
        if not self.api_key:
            raise ValueError("ImgBB API key is required")
    
    @property
    def provider_name(self) -> str:
        return "imgbb"
    
    async def upload(self, image_data: bytes, name: Optional[str] = None) -> UploadResult:
        """
        Upload image to ImgBB and return the display URL.
        
        Args:
            image_data: Raw image bytes
            name: Optional name for the image
            
        Returns:
            UploadResult with success status and URL or error
        """
        try:
            # Convert bytes to base64
            image_base64 = base64.b64encode(image_data).decode("utf-8")
            
            data = {
                "key": self.api_key,
                "image": image_base64,
            }
            
            if name:
                data["name"] = name
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(self.API_URL, data=data)
                result = response.json()
                
                if not result.get("success"):
                    logger.error(f"ImgBB upload failed: {result}")
                    return UploadResult(
                        success=False,
                        error="Image upload failed",
                        provider=self.provider_name
                    )
                
                return UploadResult(
                    success=True,
                    url=result["data"]["display_url"],
                    provider=self.provider_name
                )
                
        except httpx.TimeoutException:
            logger.error("ImgBB upload timeout")
            return UploadResult(
                success=False,
                error="Image upload timed out",
                provider=self.provider_name
            )
        except Exception as e:
            logger.error(f"ImgBB upload error: {e}")
            return UploadResult(
                success=False,
                error=f"Image upload failed: {str(e)}",
                provider=self.provider_name
            )
