"""LangChain Vision API service for profile verification."""

import base64
import json
import logging
from datetime import UTC, datetime
from io import BytesIO
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)


class GeminiVisionService:
    """Service for interacting with Google Gemini Vision API via LangChain."""

    def __init__(self) -> None:
        """Initialize Gemini Vision service with LangChain."""
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not set in environment variables")

        self.model = ChatGoogleGenerativeAI(
            model="gemini-2.5-pro",
            google_api_key=settings.GEMINI_API_KEY,
            temperature=0,
        )

    async def verify_profile_screenshot(
        self, image_bytes: bytes
    ) -> dict[str, Any] | None:
        """
        Verify and extract information from Arena of Valor profile screenshot.

        Args:
            image_bytes: Raw image bytes

        Returns:
            Dictionary containing extracted profile data or None if verification failed

        Expected return format:
        {
            "level": int,
            "rank": str,
            "total_matches": int,
            "win_rate": float,
            "credibility_score": int
        }
        """
        try:
            # Encode image to base64
            image_base64 = base64.b64encode(image_bytes).decode("utf-8")

            # Prepare prompt for Gemini
            prompt = """
Phân tích ảnh màn hình hồ sơ game Liên Quân Mobile (Arena of Valor) này và trích xuất CHÍNH XÁC các thông tin sau dưới dạng JSON.

Các trường bắt buộc:
- level (integer): Cấp độ của người chơi
- rank (string): Rank hiện tại (phải là một trong: BRONZE, SILVER, GOLD, PLATINUM, DIAMOND, VETERAN, MASTER, CONQUEROR)
- total_matches (integer): Tổng số trận đã chơi
- win_rate (float): Tỷ lệ thắng (%) - chỉ số, không có ký hiệu %
- credibility_score (integer): Điểm uy tín

QUAN TRỌNG:
1. Chỉ trả về JSON thuần túy, không có markdown, không có giải thích
2. Nếu THIẾU BẤT KỲ trường nào, trả về: {"error": "Không đủ thông tin"}
3. Rank phải chính xác là một trong các giá trị: BRONZE, SILVER, GOLD, PLATINUM, DIAMOND, VETERAN, MASTER, CONQUEROR
4. Tất cả các số phải là số thực/nguyên, không có đơn vị hoặc ký hiệu

Ví dụ output hợp lệ:
{"level": 30, "rank": "DIAMOND", "total_matches": 1234, "win_rate": 52.5, "credibility_score": 95}
"""

            # Create message with image using LangChain format
            message = HumanMessage(
                content=[
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": f"data:image/jpeg;base64,{image_base64}",
                    },
                ]
            )

            # Generate content with image via LangChain
            response = await self.model.ainvoke([message])

            # Parse response from LangChain
            response_text = response.content.strip()

            # Remove markdown code blocks if present
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()

            # Parse JSON
            try:
                data = json.loads(response_text)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse JSON from Gemini response: {response_text}")
                return None

            # Check for error
            if "error" in data:
                logger.warning(f"Gemini returned error: {data['error']}")
                return None

            # Validate required fields
            required_fields = [
                "level",
                "rank",
                "total_matches",
                "win_rate",
                "credibility_score",
            ]

            for field in required_fields:
                if field not in data:
                    logger.error(f"Missing required field: {field}")
                    return None

            # Validate rank
            valid_ranks = [
                "BRONZE",
                "SILVER",
                "GOLD",
                "PLATINUM",
                "DIAMOND",
                "VETERAN",
                "MASTER",
                "CONQUEROR",
            ]
            if data["rank"].upper() not in valid_ranks:
                logger.error(f"Invalid rank: {data['rank']}")
                return None

            # Normalize rank to uppercase
            data["rank"] = data["rank"].upper()

            # Type conversion
            data["level"] = int(data["level"])
            data["total_matches"] = int(data["total_matches"])
            data["win_rate"] = float(data["win_rate"])
            data["credibility_score"] = int(data["credibility_score"])

            # Add verification timestamp
            data["verified_at"] = datetime.now(UTC).isoformat()

            logger.info(f"Successfully verified profile: Rank {data['rank']}, Level {data['level']}")
            return data

        except Exception as e:
            logger.error(f"Error verifying profile screenshot: {e!s}")
            return None


# Global instance
gemini_service = GeminiVisionService()
