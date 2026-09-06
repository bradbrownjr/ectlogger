from datetime import datetime, timedelta, UTC
from io import BytesIO
import json
from pathlib import Path
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from PIL import Image

from app.database import get_db
from app.models import ChatMessage, ChatReaction, ChatImage, CheckIn, Net, User
from app.schemas import (
    ChatMessageCreate,
    ChatMessageEdit,
    ChatMessageResponse,
    ChatImageUploadResponse,
    build_reply_preview,
    decode_mentioned_user_ids,
)
from app.dependencies import get_current_user, get_current_user_optional

router = APIRouter(prefix="/chat", tags=["chat"])


CHAT_IMAGE_PREFIX = "__CHAT_IMAGE__"
ALLOWED_IMAGE_MIME = {"image/png", "image/jpeg", "image/webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_IMAGE_DIM = 1600
MAX_THUMB_DIM = 400
UPLOADS_DIR = Path(__file__).resolve().parents[2] / "data" / "chat_images"


def _get_marker_payload(message_text: str) -> dict | None:
    if not message_text.startswith(CHAT_IMAGE_PREFIX):
        return None
    try:
        payload = json.loads(message_text[len(CHAT_IMAGE_PREFIX):])
        return payload if isinstance(payload, dict) else None
    except json.JSONDecodeError:
        return None


def _mime_to_format_and_ext(mime_type: str) -> tuple[str, str]:
    if mime_type == "image/png":
        return "PNG", "png"
    if mime_type == "image/webp":
        return "WEBP", "webp"
    return "JPEG", "jpg"


# Callsigns carry digits and, for portable/mobile operation, a slash suffix
# (W1ABC/M, KC1JMH/P), so the token has to run past those to match the roster
# entry exactly. A hyphen is allowed for the same reason on tactical calls.
MENTION_TOKEN_PATTERN = re.compile(r'@([A-Za-z0-9/_-]+)')

# Eager loads every chat serialization needs: the author (callsign/avatar),
# reactions, images, and the quoted message plus its own author for the reply
# preview. Lazy-loading any of these blows up under async SQLAlchemy.
CHAT_MESSAGE_LOADS = (
    selectinload(ChatMessage.user),
    selectinload(ChatMessage.reactions),
    selectinload(ChatMessage.images),
    selectinload(ChatMessage.reply_to).selectinload(ChatMessage.user),
)


async def _resolve_mentions(
    db: AsyncSession,
    net_id: int,
    text: str,
    author_id: Optional[int],
    reply_parent: Optional[ChatMessage],
) -> list[int]:
    """Resolve @CALLSIGN tokens against this net's checked-in roster, plus the
    author of any message being replied to (replying to someone always tags
    them, so they see the answer even if the reply doesn't name them).

    Only stations actually checked into this net with an account are matched:
    an @ followed by anything else stays plain text rather than erroring, and a
    guest/paper check-in has no user to highlight. The author is never included
    -- nobody needs their own message flashing back at them."""
    tokens = {match.group(1).upper() for match in MENTION_TOKEN_PATTERN.finditer(text or '')}
    mentioned: list[int] = []

    if tokens:
        result = await db.execute(
            select(CheckIn.user_id, CheckIn.callsign).where(
                CheckIn.net_id == net_id,
                CheckIn.user_id.is_not(None),
            )
        )
        for user_id, callsign in result.all():
            if callsign and callsign.upper() in tokens and user_id not in mentioned:
                mentioned.append(user_id)

    if reply_parent is not None and reply_parent.user_id and reply_parent.user_id not in mentioned:
        mentioned.append(reply_parent.user_id)

    return [user_id for user_id in mentioned if user_id != author_id]


async def _load_chat_message(db: AsyncSession, message_id: int) -> ChatMessage:
    """Reload a message with every relationship the response/broadcast needs."""
    result = await db.execute(
        select(ChatMessage).options(*CHAT_MESSAGE_LOADS).where(ChatMessage.id == message_id)
    )
    return result.scalar_one()


async def _broadcast_chat_message(net_id: int, chat_message: ChatMessage, event_type: str) -> None:
    """Broadcast a new (`chat_message`) or edited (`chat_message_edited`)
    message. Guest connections (WS allows anonymous viewers) get a redacted
    copy of the message text and of any quoted preview -- same rule as the REST
    GET below -- so a live guest can't see contact info arrive in real time
    that the REST list would have scrubbed. Edits go through the identical path
    on purpose: an edit that reintroduced an email address would otherwise
    reach guests unredacted."""
    from app.main import manager
    from app.utils import get_avatar_url, redact_contact_info

    avatar_url = None
    if chat_message.user:
        avatar_url = get_avatar_url(
            getattr(chat_message.user, 'email', None),
            getattr(chat_message.user, 'avatar_url', None),
        )
    base_data = {
        "id": chat_message.id,
        "net_id": chat_message.net_id,
        "user_id": chat_message.user_id,
        "callsign": chat_message.user.callsign if chat_message.user else "",
        "avatar_url": avatar_url,
        "created_at": chat_message.created_at.isoformat() if hasattr(chat_message.created_at, 'isoformat') else str(chat_message.created_at),
        "edited_at": chat_message.edited_at.isoformat() if chat_message.edited_at else None,
        "mentioned_user_ids": decode_mentioned_user_ids(chat_message.mentioned_user_ids),
        "reply_to_message_id": chat_message.reply_to_message_id,
    }
    timestamp = datetime.now(UTC).isoformat()
    await manager.broadcast(
        {
            "type": event_type,
            "data": {
                **base_data,
                "message": chat_message.message,
                "reply_to": build_reply_preview(chat_message.reply_to),
            },
            "timestamp": timestamp,
        },
        net_id,
        guest_message={
            "type": event_type,
            "data": {
                **base_data,
                "message": redact_contact_info(chat_message.message),
                "reply_to": build_reply_preview(chat_message.reply_to, redact=True),
            },
            "timestamp": timestamp,
        },
    )


@router.post("/nets/{net_id}/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    net_id: int,
    message: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a chat message to a net.

    Body: `message` (required), `reply_to_message_id` (optional, must be
    another message in this same net). Returns the created ChatMessageResponse
    and broadcasts it as `chat_message`."""
    # Verify net exists
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    # A reply may only quote a message from the same net, or one net's chat
    # could quote another's into its log.
    reply_parent = None
    if message.reply_to_message_id is not None:
        parent_result = await db.execute(
            select(ChatMessage).where(
                ChatMessage.id == message.reply_to_message_id,
                ChatMessage.net_id == net_id,
            )
        )
        reply_parent = parent_result.scalar_one_or_none()
        if not reply_parent:
            raise HTTPException(status_code=404, detail="Replied-to message not found")

    mentioned = await _resolve_mentions(db, net_id, message.message, current_user.id, reply_parent)

    # Create message
    chat_message = ChatMessage(
        net_id=net_id,
        user_id=current_user.id,
        message=message.message,
        mentioned_user_ids=json.dumps(mentioned) if mentioned else None,
        reply_to_message_id=reply_parent.id if reply_parent else None,
    )

    db.add(chat_message)
    await db.commit()
    await db.refresh(chat_message)
    
    # If this is an uploaded image marker message, attach the image row.
    marker_payload = _get_marker_payload(message.message)
    if marker_payload and isinstance(marker_payload.get("id"), int):
        image_result = await db.execute(
            select(ChatImage).where(
                ChatImage.id == marker_payload["id"],
                ChatImage.net_id == net_id,
                ChatImage.user_id == current_user.id,
                ChatImage.message_id.is_(None),
            )
        )
        image_row = image_result.scalar_one_or_none()
        if image_row:
            image_row.message_id = chat_message.id
            await db.commit()

    # Load user + reactions + reply relationships for response
    chat_message = await _load_chat_message(db, chat_message.id)

    await _broadcast_chat_message(net_id, chat_message, "chat_message")
    return ChatMessageResponse.from_orm(chat_message)


@router.put("/nets/{net_id}/messages/{message_id}", response_model=ChatMessageResponse)
async def edit_message(
    net_id: int,
    message_id: int,
    body: ChatMessageEdit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Edit a chat message in place (own messages only, no time limit).

    Body: `message` (the replacement text). Overwrites the text, stamps
    `edited_at`, re-resolves @mentions against the new wording, and broadcasts
    the whole updated message as `chat_message_edited` so every client can
    replace it by id.

    Deliberately narrower than delete, which admins may also perform: an admin
    rewriting someone else's words would leave that station credited in the net
    log with wording they never sent. Removing a message doesn't misattribute
    anything; changing one does."""
    result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.id == message_id,
            ChatMessage.net_id == net_id,
        )
    )
    message = result.scalar_one_or_none()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this message")

    reply_parent = None
    if message.reply_to_message_id is not None:
        parent_result = await db.execute(
            select(ChatMessage).where(ChatMessage.id == message.reply_to_message_id)
        )
        reply_parent = parent_result.scalar_one_or_none()

    message.message = body.message
    message.edited_at = datetime.now(UTC)
    mentioned = await _resolve_mentions(db, net_id, body.message, current_user.id, reply_parent)
    message.mentioned_user_ids = json.dumps(mentioned) if mentioned else None
    await db.commit()

    message = await _load_chat_message(db, message_id)

    await _broadcast_chat_message(net_id, message, "chat_message_edited")
    return ChatMessageResponse.from_orm(message)


@router.get("/nets/{net_id}/messages", response_model=List[ChatMessageResponse])
async def get_messages(
    net_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Get all chat messages for a net. Guests (no current_user) get
    messages scrubbed of anything that looks like an email or phone number --
    see redact_contact_info."""
    result = await db.execute(
        select(ChatMessage)
        .options(*CHAT_MESSAGE_LOADS)
        .where(ChatMessage.net_id == net_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = result.scalars().all()

    redact = current_user is None
    return [ChatMessageResponse.from_orm(msg, redact=redact) for msg in messages]


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


ALLOWED_EMOJIS = {'👍', '🙂', '🤣', '🙁', '❤️', '✅'}


async def _get_message_reactions(db: AsyncSession, message_id: int) -> dict:
    """Return emoji->list[user_id] dict for a message."""
    result = await db.execute(
        select(ChatReaction).where(ChatReaction.message_id == message_id)
    )
    reactions: dict = {}
    for r in result.scalars().all():
        reactions.setdefault(r.emoji, [])
        reactions[r.emoji].append(r.user_id)
    return reactions


@router.post("/nets/{net_id}/messages/{message_id}/reactions", status_code=status.HTTP_204_NO_CONTENT)
async def add_reaction(
    net_id: int,
    message_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Toggle a reaction emoji on a chat message."""
    emoji = body.get('emoji', '')
    if emoji not in ALLOWED_EMOJIS:
        raise HTTPException(status_code=400, detail="Emoji not allowed")

    # Verify message belongs to net
    result = await db.execute(
        select(ChatMessage).where(ChatMessage.id == message_id, ChatMessage.net_id == net_id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # Users cannot react to their own messages
    if msg.user_id == current_user.id:
        raise HTTPException(status_code=403, detail="Cannot react to your own message")

    # Upsert: if reaction already exists, remove it (toggle off)
    existing = await db.execute(
        select(ChatReaction).where(
            ChatReaction.message_id == message_id,
            ChatReaction.user_id == current_user.id,
            ChatReaction.emoji == emoji
        )
    )
    existing_row = existing.scalar_one_or_none()

    if existing_row:
        await db.delete(existing_row)
    else:
        db.add(ChatReaction(message_id=message_id, user_id=current_user.id, emoji=emoji))

    await db.commit()

    # Broadcast updated reactions for this message
    from app.main import manager
    reactions = await _get_message_reactions(db, message_id)
    await manager.broadcast({
        "type": "chat_reaction",
        "data": {"message_id": message_id, "reactions": reactions},
        "timestamp": datetime.now(UTC).isoformat()
    }, net_id)
    return None


@router.post("/nets/{net_id}/images", response_model=ChatImageUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_chat_image(
    net_id: int,
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload a pasted chat image, generate thumbnail, and return marker payload."""
    # Verify net exists
    result = await db.execute(select(Net).where(Net.id == net_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Net not found")

    if image.content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    # Basic per-user rate limit: max 5 images per minute
    cutoff = datetime.now(UTC) - timedelta(minutes=1)
    recent_result = await db.execute(
        select(ChatImage).where(
            ChatImage.net_id == net_id,
            ChatImage.user_id == current_user.id,
            ChatImage.created_at >= cutoff,
        )
    )
    if len(recent_result.scalars().all()) >= 5:
        raise HTTPException(status_code=429, detail="Image upload rate limit exceeded (5/min)")

    file_bytes = await image.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 5MB)")

    try:
        pil_image = Image.open(BytesIO(file_bytes))
        pil_image.load()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image") from exc

    save_format, ext = _mime_to_format_and_ext(image.content_type or "image/jpeg")

    # Normalize mode for lossy formats.
    if save_format in {"JPEG", "WEBP"} and pil_image.mode in {"RGBA", "LA", "P"}:
        pil_image = pil_image.convert("RGB")

    full_image = pil_image.copy()
    full_image.thumbnail((MAX_IMAGE_DIM, MAX_IMAGE_DIM), Image.Resampling.LANCZOS)
    width, height = full_image.size

    thumb_image = full_image.copy()
    thumb_image.thumbnail((MAX_THUMB_DIM, MAX_THUMB_DIM), Image.Resampling.LANCZOS)

    net_dir = UPLOADS_DIR / str(net_id)
    net_dir.mkdir(parents=True, exist_ok=True)
    file_token = uuid.uuid4().hex
    image_filename = f"{file_token}.{ext}"
    thumb_filename = f"{file_token}_thumb.webp"
    image_rel_path = f"{net_id}/{image_filename}"
    thumb_rel_path = f"{net_id}/{thumb_filename}"
    image_path = net_dir / image_filename
    thumb_path = net_dir / thumb_filename

    save_kwargs = {}
    if save_format == "JPEG":
        save_kwargs = {"quality": 90, "optimize": True}
    elif save_format == "WEBP":
        save_kwargs = {"quality": 90, "method": 6}

    full_image.save(image_path, format=save_format, **save_kwargs)
    thumb_image.save(thumb_path, format="WEBP", quality=85, method=6)

    row = ChatImage(
        net_id=net_id,
        user_id=current_user.id,
        image_path=image_rel_path,
        thumb_path=thumb_rel_path,
        mime_type=image.content_type or "image/jpeg",
        width=width,
        height=height,
        size_bytes=len(file_bytes),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    image_url = f"/api/chat-images/{row.image_path}"
    thumb_url = f"/api/chat-images/{row.thumb_path}"
    marker_payload = {
        "type": "chat_image",
        "id": row.id,
        "image_url": image_url,
        "thumb_url": thumb_url,
        "width": row.width,
        "height": row.height,
    }
    marker = CHAT_IMAGE_PREFIX + json.dumps(marker_payload, separators=(",", ":"))

    return ChatImageUploadResponse(
        id=row.id,
        image_url=image_url,
        thumb_url=thumb_url,
        width=row.width,
        height=row.height,
        size_bytes=row.size_bytes,
        marker=marker,
    )
