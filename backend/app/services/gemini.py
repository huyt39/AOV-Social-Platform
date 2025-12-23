"""LangChain Vision API service for profile verification using trustcall."""

import base64
import logging
from datetime import UTC, datetime
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_core.prompts import (
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate,
)
from langchain_google_genai import ChatGoogleGenerativeAI
from trustcall import create_extractor

from app.core.config import settings
from app.llm.prompts import (
    PROFILE_EXTRACTION_HUMAN_PROMPT,
    PROFILE_EXTRACTION_SYSTEM_PROMPT,
)
from app.llm.schemas import ProfileExtraction

logger = logging.getLogger(__name__)


class GeminiVisionService:
    """Service for interacting with Google Gemini Vision API via LangChain."""

    def __init__(self) -> None:
        """Initialize Gemini Vision service with LangChain and trustcall."""
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not set in environment variables")

        # Initialize LLM
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-flash-latest",
            google_api_key=settings.GEMINI_API_KEY,
            temperature=0,
            max_retries=2,
        )

        # Create extraction prompt template
        self.extraction_prompt = ChatPromptTemplate.from_messages([
            SystemMessagePromptTemplate.from_template(PROFILE_EXTRACTION_SYSTEM_PROMPT),
            HumanMessagePromptTemplate.from_template(PROFILE_EXTRACTION_HUMAN_PROMPT),
        ])

        # Create extraction chain using trustcall
        self.extraction_chain = self.extraction_prompt | create_extractor(
            self.llm,
            tools=[ProfileExtraction],
            tool_choice="ProfileExtraction",
        )

        logger.info("GeminiVisionService initialized with LangChain extraction chain")

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

            # Create message with image for vision model
            message = HumanMessage(
                content=[
                    {"type": "text", "text": PROFILE_EXTRACTION_HUMAN_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": f"data:image/jpeg;base64,{image_base64}",
                    },
                ]
            )

            extractor = create_extractor(
                self.llm,
                tools=[ProfileExtraction],
                tool_choice="ProfileExtraction",
            )

            result = await extractor.ainvoke([message])

            if not result.get("responses"):
                logger.error("No responses from extraction chain")
                return None

            extraction: ProfileExtraction = result["responses"][0]

            if not extraction.is_valid:
                logger.warning(f"Profile extraction invalid: {extraction.error}")
                return None

            data = {
                "level": extraction.level,
                "rank": extraction.rank,
                "total_matches": extraction.total_matches,
                "win_rate": extraction.win_rate,
                "credibility_score": extraction.credibility_score,
                "verified_at": datetime.now(UTC).isoformat(),
            }

            logger.info(
                f"Successfully verified profile: Rank {data['rank']}, Level {data['level']}"
            )
            return data

        except Exception as e:
            logger.error(f"Error verifying profile screenshot: {e!s}")
            return None


# Global instance
gemini_service = GeminiVisionService()
