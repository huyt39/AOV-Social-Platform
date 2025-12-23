"""Chatbot service with RAG for champion recommendations."""
import logging
from typing import Any, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.config import settings
from app.models import (
    Champion,
    ChatRequest,
    ChatResponse,
    ChampionSuggestion,
    ChatbotConversation,
    ConversationMessage,
    User,
)
from app.models.base import utc_now

logger = logging.getLogger(__name__)


# Prompts for chatbot
CHATBOT_SYSTEM_PROMPT = """Bạn là trợ lý AI chuyên tư vấn về Liên Quân Mobile (Arena of Valor).

Nhiệm vụ của bạn là:
1. Gợi ý tướng phù hợp dựa trên rank, vị trí và câu hỏi của người chơi
2. Hướng dẫn cách chơi, build trang bị, combo kỹ năng
3. Tư vấn lối chơi, chiến thuật cho từng giai đoạn game
    4. Trả lời thân thiện, chi tiết bằng tiếng Việt

SỬ DỤNG HÌNH ẢNH TRỰC QUAN:
- Với những thứ TỐT, NÊN LÀM, hoặc ƯU ĐIỂM: Sử dụng hình ảnh ![Good](https://i.ibb.co/5X2ZmyB1/image.png) (Dùng tối đa 1 lần trong toàn bộ câu trả lời)
- Với những thứ KHÔNG TỐT, KHÔNG NÊN LÀM, hoặc NHƯỢC ĐIỂM: Sử dụng hình ảnh ![Bad](https://i.ibb.co/7tC7prGG/image.png) (Dùng tối đa 1 lần trong toàn bộ câu trả lời)
Hãy chèn các hình ảnh này một cách hợp lý vào trong câu trả lời của bạn.

THÔNG TIN NGƯỜI CHƠI:
- Rank: {rank}
- Vị trí chính: {main_role}  
- Level: {level}

TƯỚNG PHÙ HỢP TỪ DATABASE:
{champion_context}

Hãy phân tích và đưa ra gợi ý cụ thể dựa trên thông tin trên."""


CHATBOT_USER_TEMPLATE = """Câu hỏi: {question}

Lịch sử hội thoại gần đây:
{history}

Hãy trả lời chi tiết và đưa ra 1-3 gợi ý tướng phù hợp nhất (nếu có)."""


class ChatbotService:
    """Service for chatbot with RAG capabilities."""

    def __init__(self) -> None:
        """Initialize chatbot service."""
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not set in environment variables")

        # Initialize LLM - using stable model to avoid rate limits
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-flash-latest",  # Stable model with better rate limits
            google_api_key=settings.GEMINI_API_KEY,
            temperature=0.7,
            max_retries=2,
        )

        # Create prompt template
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", CHATBOT_SYSTEM_PROMPT),
            ("user", CHATBOT_USER_TEMPLATE),
        ])

        logger.info("ChatbotService initialized")



    async def _retrieve_relevant_champions(
        self,
        user: User,
        query: str,
        top_k: int = 5,
    ) -> list[Champion]:
        """Retrieve relevant champions using rule-based scoring."""
        # Get all champions
        all_champions = await Champion.find_all().to_list()
        
        if not all_champions:
            logger.warning("No champions found in database")
            return []

        # Normalize query for keyword matching
        query_lower = query.lower()

        # Calculate scores for each champion
        scored_champions: list[tuple[Champion, float]] = []
        
        for champion in all_champions:
            score = 0.0
            
            # 1. Keyword matching (40% weight)
            # Check if champion name or related terms are in query
            if champion.ten_tuong.lower() in query_lower:
                score += 0.4
            elif champion.vi_tri.lower() in query_lower:
                score += 0.2
            elif champion.cach_danh.lower() in query_lower:
                score += 0.15

            # 2. Lane/Role match (40% weight)
            if user.main_role and champion.lane == user.main_role:
                score += 0.4

            # 3. Rank compatibility (20% weight)
            if user.rank:
                rank_str = user.rank.value
                if rank_str in champion.rank_phu_hop:
                    score += 0.2
                # Bonus for difficulty matching rank
                if rank_str in ["BRONZE", "SILVER"] and champion.do_kho == "dễ":
                    score += 0.1
                elif rank_str in ["PLATINUM", "DIAMOND"] and champion.do_kho in ["trung bình", "khó"]:
                    score += 0.1
                elif rank_str in ["MASTER", "CONQUEROR"] and champion.do_kho == "khó":
                    score += 0.1

            scored_champions.append((champion, score))

        # Sort by score and return top K
        scored_champions.sort(key=lambda x: x[1], reverse=True)
        top_champions = [champ for champ, _ in scored_champions[:top_k]]

        logger.info(f"Retrieved {len(top_champions)} champions for query: {query[:50]}")
        return top_champions

    async def _format_champion_context(self, champions: list[Champion]) -> str:
        """Format champions as context for prompt."""
        if not champions:
            return "Không tìm thấy tướng phù hợp trong database."

        context_parts = []
        for i, champ in enumerate(champions, 1):
            # Shortened context to reduce tokens
            context = f"""{i}. {champ.ten_tuong} - {champ.vi_tri} ({champ.cach_danh})
   Độ khó: {champ.do_kho} | Rank: {champ.rank_phu_hop}
   Đặc điểm: {champ.dac_diem or 'N/A'}
   Điểm mạnh: {champ.diem_manh[:100] if champ.diem_manh else 'N/A'}...""".strip()
            context_parts.append(context)

        return "\n\n".join(context_parts)

    async def _get_conversation_history(
        self,
        user_id: str,
        conversation_id: Optional[str] = None,
        limit: int = 5,
    ) -> str:
        """Get conversation history."""
        if not conversation_id:
            return "Chưa có lịch sử hội thoại."

        conversation = await ChatbotConversation.get(conversation_id)
        if not conversation or conversation.user_id != user_id:
            return "Chưa có lịch sử hội thoại."

        # Get last N messages
        recent_messages = conversation.messages[-limit * 2:] if len(conversation.messages) > limit * 2 else conversation.messages
        
        if not recent_messages:
            return "Chưa có lịch sử hội thoại."

        history_parts = []
        for msg in recent_messages:
            role_display = "Bạn" if msg.role == "user" else "Trợ lý"
            history_parts.append(f"{role_display}: {msg.content[:150]}")

        return "\n".join(history_parts)

    async def _parse_response_for_suggestions(
        self,
        response_text: str,
        retrieved_champions: list[Champion],
    ) -> list[ChampionSuggestion]:
        """Parse response to extract champion suggestions."""
        suggestions = []
        
        # Simple heuristic: look for champion names mentioned in response
        for champion in retrieved_champions[:3]:  # Top 3
            if champion.ten_tuong.lower() in response_text.lower():
                # Extract a reason (simplified)
                suggestion = ChampionSuggestion(
                    ten_tuong=champion.ten_tuong,
                    ly_do=f"Phù hợp với {champion.vi_tri}, {champion.cach_danh}",
                    cach_choi_tom_tat=champion.cach_choi[:200] + "..." if len(champion.cach_choi) > 200 else champion.cach_choi,
                )
                suggestions.append(suggestion)

        return suggestions

    async def chat(
        self,
        user: User,
        request: ChatRequest,
    ) -> ChatResponse:
        """Process chat request and return response."""
        try:
            # 1. Retrieve relevant champions using RAG
            retrieved_champions = await self._retrieve_relevant_champions(
                user=user,
                query=request.message,
                top_k=5,
            )

            # 2. Format champion context
            champion_context = await self._format_champion_context(retrieved_champions)

            # 3. Get conversation history
            history = await self._get_conversation_history(
                user_id=user.id,
                conversation_id=request.conversation_id,
                limit=3,
            )

            # 4. Prepare prompt
            rank_display = user.rank.value if user.rank else "Chưa xác định"
            role_display = user.main_role.value if user.main_role else "Chưa xác định"
            level_display = user.level or "Chưa xác định"

            # 5. Generate response
            chain = self.prompt | self.llm
            response = await chain.ainvoke({
                "rank": rank_display,
                "main_role": role_display,
                "level": level_display,
                "champion_context": champion_context,
                "question": request.message,
                "history": history,
            })

            # Extract text from response (handle both string and list)
            if isinstance(response.content, list):
                # If content is a list, join all text parts
                response_text = " ".join(
                    part.get("text", str(part)) if isinstance(part, dict) else str(part)
                    for part in response.content
                )
            else:
                response_text = str(response.content)

            # 6. Parse suggestions
            suggestions = await self._parse_response_for_suggestions(
                response_text,
                retrieved_champions,
            )

            # 7. Save to conversation
            conversation_id = await self._save_conversation(
                user_id=user.id,
                conversation_id=request.conversation_id,
                user_message=request.message,
                assistant_message=response_text,
            )

            # 8. Return response
            return ChatResponse(
                message=response_text,
                suggestions=suggestions,
                sources=[c.ten_tuong for c in retrieved_champions[:5]],
                conversation_id=conversation_id,
            )

        except Exception as e:
            logger.error(f"Error in chatbot.chat: {e}", exc_info=True)
            # Return fallback response
            return ChatResponse(
                message="Xin lỗi, tôi gặp lỗi khi xử lý câu hỏi của bạn. Vui lòng thử lại.",
                suggestions=[],
                sources=[],
                conversation_id=request.conversation_id or "",
            )

    async def _save_conversation(
        self,
        user_id: str,
        conversation_id: Optional[str],
        user_message: str,
        assistant_message: str,
    ) -> str:
        """Save conversation to database."""
        # Get or create conversation
        conversation: Optional[ChatbotConversation] = None
        
        if conversation_id:
            conversation = await ChatbotConversation.get(conversation_id)
            if conversation and conversation.user_id != user_id:
                conversation = None  # Security check

        if not conversation:
            # Create new conversation
            conversation = ChatbotConversation(
                user_id=user_id,
                messages=[],
                created_at=utc_now(),
                updated_at=utc_now(),
            )
            await conversation.insert()

        # Add messages
        conversation.messages.append(ConversationMessage(
            role="user",
            content=user_message,
            timestamp=utc_now(),
        ))
        conversation.messages.append(ConversationMessage(
            role="assistant",
            content=assistant_message,
            timestamp=utc_now(),
        ))
        conversation.updated_at = utc_now()

        # Save
        await conversation.save()

        return conversation.id

    async def get_conversation(
        self,
        user_id: str,
        conversation_id: str,
    ) -> Optional[ChatbotConversation]:
        """Get conversation by ID."""
        conversation = await ChatbotConversation.get(conversation_id)
        if conversation and conversation.user_id == user_id:
            return conversation
        return None

    async def delete_conversation(
        self,
        user_id: str,
        conversation_id: str,
    ) -> bool:
        """Delete conversation."""
        conversation = await ChatbotConversation.get(conversation_id)
        if conversation and conversation.user_id == user_id:
            await conversation.delete()
            return True
        return False


# Global instance
chatbot_service = ChatbotService()
