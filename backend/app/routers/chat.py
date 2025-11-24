from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from app.database import get_db
from app.models import ChatMessage, Net, User
from app.schemas import ChatMessageCreate, ChatMessageResponse
from app.dependencies import get_current_user

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/nets/{net_id}/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    net_id: int,
    message: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a chat message to a net"""
    # Verify net exists
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Create message
    chat_message = ChatMessage(
        net_id=net_id,
        user_id=current_user.id,
        message=message.message
    )
    
    db.add(chat_message)
    await db.commit()
    await db.refresh(chat_message)
    
    # Load user relationship for response
    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.id == chat_message.id)
    )
    chat_message = result.scalar_one()
    
    # Broadcast chat message via WebSocket
    from app.main import manager
    import datetime
    await manager.broadcast({
        "type": "chat_message",
        "data": {
            "id": chat_message.id,
            "net_id": chat_message.net_id,
            "user_id": chat_message.user_id,
            "callsign": chat_message.user.callsign if chat_message.user else "",
            "message": chat_message.message,
            "created_at": chat_message.created_at.isoformat() if hasattr(chat_message.created_at, 'isoformat') else str(chat_message.created_at)
        },
        "timestamp": datetime.datetime.utcnow().isoformat()
    }, net_id)
    return ChatMessageResponse.from_orm(chat_message)


@router.get("/nets/{net_id}/messages", response_model=List[ChatMessageResponse])
async def get_messages(
    net_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get all chat messages for a net"""
    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.net_id == net_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = result.scalars().all()
    
    return [ChatMessageResponse.from_orm(msg) for msg in messages]


@router.delete("/nets/{net_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    net_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a chat message (own messages only, or admin)"""
    result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.id == message_id,
            ChatMessage.net_id == net_id
        )
    )
    message = result.scalar_one_or_none()
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Only allow deleting own messages or if admin
    if message.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this message")
    
    await db.delete(message)
    await db.commit()
    
    return None
