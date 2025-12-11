"""Image upload service using ImgBB API."""

import base64
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

IMGBB_API_URL = "https://api.imgbb.com/1/upload"


async def upload_image_to_imgbb(image_data: bytes, name: str | None = None) -> str:
    """
    Upload image to ImgBB and return the display URL.
    
    Args:
        image_data: Raw image bytes
        name: Optional name for the image
        
    Returns:
        The display URL of the uploaded image
        
    Raises:
        ValueError: If upload fails
    """
    try:
        # Convert bytes to base64
        image_base64 = base64.b64encode(image_data).decode("utf-8")
        
        data = {
            "key": settings.IMGBB_API_KEY,
            "image": image_base64,
        }
        
        if name:
            data["name"] = name
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(IMGBB_API_URL, data=data)
            result = response.json()
            
            if not result.get("success"):
                logger.error(f"ImgBB upload failed: {result}")
                raise ValueError("Image upload failed")
            
            return result["data"]["display_url"]
            
    except httpx.TimeoutException:
        logger.error("ImgBB upload timeout")
        raise ValueError("Image upload timed out")
    except Exception as e:
        logger.error(f"ImgBB upload error: {e}")
        raise ValueError(f"Image upload failed: {str(e)}")
