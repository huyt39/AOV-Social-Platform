"""Champion models and schemas for Arena of Valor champions."""
import uuid
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field

from .base import GameRoleEnum, RankEnum


# Schema for champion data
class ChampionBase(BaseModel):
    """Base schema for champion data."""
    ten_tuong: str = Field(..., description="Tên tướng", max_length=100)
    vi_tri: str = Field(..., description="Vị trí chơi (lane)", max_length=50)
    lane: GameRoleEnum = Field(..., description="Lane chính của tướng")
    cach_danh: str = Field(..., description="Cách đánh/định vị tướng (AD, AP, Tank, Assassin, Support)", max_length=100)
    rank_phu_hop: str = Field(..., description="Rank phù hợp để chơi tướng này", max_length=200)
    do_kho: str = Field(..., description="Độ khó điều khiển (dễ, trung bình, khó)", max_length=50)
    ky_nang_chinh: str = Field(..., description="Mô tả kỹ năng chính và combo", max_length=1000)
    build_info: str = Field(..., description="Thông tin build trang bị và phù hiệu", max_length=1000)
    cach_choi: str = Field(..., description="Hướng dẫn cách chơi, lối chơi, giai đoạn game", max_length=2000)
    dac_diem: Optional[str] = Field(default=None, description="Đặc điểm nổi bật của tướng", max_length=500)
    diem_manh: Optional[str] = Field(default=None, description="Điểm mạnh", max_length=500)
    diem_yeu: Optional[str] = Field(default=None, description="Điểm yếu", max_length=500)


# Database model for MongoDB
class Champion(Document, ChampionBase):
    """Champion document model for MongoDB."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")

    class Settings:
        name = "tuong_info"  # MongoDB collection name
        use_state_management = True


# Properties to return via API
class ChampionPublic(ChampionBase):
    """Public schema for champion data."""
    id: str


class ChampionsPublic(BaseModel):
    """Response schema for list of champions."""
    data: list[ChampionPublic]
    count: int
