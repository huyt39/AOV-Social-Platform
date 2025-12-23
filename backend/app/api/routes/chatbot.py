"""Chatbot API routes."""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import CurrentUser
from app.models import ChatRequest, ChatResponse, ConversationPublic, Message
from app.services.chatbot_service import chatbot_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chatbot", tags=["chatbot"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: CurrentUser,
) -> ChatResponse:
    """
    Send a message to the chatbot and get a response.
    
    The chatbot uses RAG to retrieve relevant champions based on:
    - User's rank and main role
    - Semantic similarity with the query
    - Champion difficulty matching user's rank
    """
    logger.info(f"Chatbot request from user: {current_user.id}, message: {request.message[:50]}")
    try:
        response = await chatbot_service.chat(user=current_user, request=request)
        return response
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Có lỗi xảy ra khi xử lý tin nhắn. Vui lòng thử lại.",
        ) from e


@router.get("/conversation/{conversation_id}", response_model=ConversationPublic)
async def get_conversation(
    conversation_id: str,
    current_user: CurrentUser,
) -> ConversationPublic:
    """Get conversation history by ID."""
    conversation = await chatbot_service.get_conversation(
        user_id=current_user.id,
        conversation_id=conversation_id,
    )
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    return ConversationPublic(
        id=conversation.id,
        user_id=conversation.user_id,
        messages=conversation.messages,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.delete("/conversation/{conversation_id}", response_model=Message)
async def delete_conversation(
    conversation_id: str,
    current_user: CurrentUser,
) -> Message:
    """Delete a conversation."""
    success = await chatbot_service.delete_conversation(
        user_id=current_user.id,
        conversation_id=conversation_id,
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    return Message(message="Đã xóa lịch sử hội thoại thành công")
