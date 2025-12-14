"""Item models and schemas."""
import uuid
from typing import Optional

from beanie import Document, Link
from pydantic import BaseModel, Field

from .user import User


# Shared properties
class ItemBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=255)


# Database model for MongoDB
class Item(Document, ItemBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    owner_id: str
    owner: Optional[Link[User]] = None

    class Settings:
        name = "items"  # MongoDB collection name
        use_state_management = True


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: str
    owner_id: str


class ItemsPublic(BaseModel):
    data: list[ItemPublic]
    count: int
