import logging
import livekit.api as api
from app.core.config import settings

logger = logging.getLogger(__name__)

class LiveKitService:
    def __init__(self):
        self.api_key = settings.LIVEKIT_API_KEY
        self.api_secret = settings.LIVEKIT_API_SECRET
        self.url = settings.LIVEKIT_URL

    def generate_token(self, room_name: str, identity: str, name: str, metadata: str = None) -> str:
        """
        Generate a join token for a LiveKit room.
        Room is created if it doesn't exist.
        """
        try:
            token = api.AccessToken(self.api_key, self.api_secret) \
                .with_identity(identity) \
                .with_name(name) \
                .with_metadata(metadata or "") \
                .with_grants(api.VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=True,
                    can_subscribe=True,
                    can_publish_data=True,
                    # No video needed as per user request
                    can_publish_sources=["microphone"]
                ))
            
            return token.to_jwt()
        except Exception as e:
            logger.error(f"Error generating LiveKit token: {e}")
            raise

livekit_service = LiveKitService()
