"""Pydantic schemas for LLM structured output extraction."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ProfileExtraction(BaseModel):
    """Schema for Arena of Valor profile data extraction."""

    level: int = Field(description="Player level")
    rank: Literal[
        "BRONZE",
        "SILVER",
        "GOLD",
        "PLATINUM",
        "DIAMOND",
        "VETERAN",
        "MASTER",
        "CONQUEROR",
    ] = Field(description="Current rank")
    total_matches: int = Field(description="Total matches played")
    win_rate: float = Field(description="Win rate percentage (without % symbol)")
    credibility_score: int = Field(description="Credibility score")
    is_valid: bool = Field(
        default=True,
        description="Whether the screenshot is a valid Arena of Valor profile",
    )
    error: Optional[str] = Field(
        default=None, description="Error message if extraction failed"
    )
