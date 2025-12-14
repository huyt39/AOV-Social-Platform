"""MongoDB database connection and initialization."""

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.models import (
    Comment, CommentLike, Friendship, Item, Post, PostLike, User,
    ForumCategory, ForumThread, ForumThreadLike, 
    ForumComment, ForumCommentLike, Report
)

# Global MongoDB client
mongodb_client: AsyncIOMotorClient | None = None


async def connect_to_mongodb() -> None:
    """
    Connect to MongoDB and initialize Beanie.

    This function should be called on application startup.
    """
    global mongodb_client

    # Create MongoDB client
    mongodb_client = AsyncIOMotorClient(settings.MONGODB_URL)

    # Initialize Beanie with document models
    await init_beanie(
        database=mongodb_client[settings.MONGODB_DB_NAME],
        document_models=[
            User, Item, Friendship, Post, PostLike, Comment, CommentLike,
            ForumCategory, ForumThread, ForumThreadLike, 
            ForumComment, ForumCommentLike, Report
        ],
    )

    print(f"✅ Connected to MongoDB: {settings.MONGODB_DB_NAME}")


async def close_mongodb_connection() -> None:
    """
    Close MongoDB connection.

    This function should be called on application shutdown.
    """
    global mongodb_client

    if mongodb_client:
        mongodb_client.close()
        print("❌ MongoDB connection closed")


async def get_database():
    """Get MongoDB database instance."""
    if mongodb_client is None:
        raise RuntimeError("MongoDB client is not initialized")
    return mongodb_client[settings.MONGODB_DB_NAME]


async def init_db() -> None:
    """
    Initialize database with first superuser.

    This function creates the first superuser if it doesn't exist.
    """
    from app import crud
    from app.models import UserCreate, UserRole

    # Check if superuser exists
    user = await User.find_one(User.email == settings.FIRST_SUPERUSER)

    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
            username="admin",
            role=UserRole.ADMIN,  
        )
        await crud.create_user(user_create=user_in)
        print(f"✅ Created first superuser: {settings.FIRST_SUPERUSER}")
