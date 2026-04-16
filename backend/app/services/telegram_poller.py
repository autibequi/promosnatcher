"""Worker de discovery via polling — roda a cada 30s se tg_enabled=True."""
import logging
from sqlmodel import Session, select
from datetime import datetime
from ..database import engine
from ..models import AppConfig, TelegramChat, Group
from .whatsapp.factory import get_tg_adapter

logger = logging.getLogger(__name__)


async def tg_poll_updates():
    """Roda a cada 30s via APScheduler se tg_enabled=True."""
    with Session(engine) as session:
        config = session.get(AppConfig, 1)
        if not config or not config.tg_enabled or not config.tg_bot_token:
            return

        adapter = get_tg_adapter(config)
        if not adapter:
            return

        offset = (config.tg_last_update_id or 0) + 1
        updates = await adapter.get_updates(offset=offset, timeout=25)
        max_id = config.tg_last_update_id or 0

        for u in updates:
            max_id = max(max_id, u.update_id)
            chat = None
            is_admin = False

            if u.my_chat_member:
                chat = u.my_chat_member.chat
                new_status = u.my_chat_member.new_chat_member.status
                is_admin = new_status in ("administrator", "creator")
                if new_status in ("left", "kicked"):
                    # bot saiu/foi removido — desvincula
                    existing = session.get(TelegramChat, str(chat.id))
                    if existing:
                        session.delete(existing)
                        session.commit()
                    continue
            elif u.message and u.message.chat.type in ("group", "supergroup", "channel"):
                chat = u.message.chat
            elif u.channel_post:
                chat = u.channel_post.chat

            if chat:
                cid = str(chat.id)
                existing = session.get(TelegramChat, cid)
                if existing:
                    existing.title = chat.title or existing.title
                    existing.last_seen_at = datetime.utcnow()
                    if is_admin:
                        existing.is_admin = True
                    session.add(existing)
                else:
                    session.add(TelegramChat(
                        chat_id=cid,
                        type=chat.type,
                        title=chat.title or "Sem título",
                        username=chat.username,
                        is_admin=is_admin,
                    ))

        if max_id > (config.tg_last_update_id or 0):
            config.tg_last_update_id = max_id
            session.add(config)
        session.commit()
